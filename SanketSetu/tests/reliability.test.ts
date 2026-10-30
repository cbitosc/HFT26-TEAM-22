import test from 'node:test';
import assert from 'node:assert/strict';
import { generateNodeIdentity } from '../src/crypto/identity';
import { issueResponderCertificate } from '../src/crypto/responderCert';
import { MeshEngine } from '../src/mesh/engine';
import { MeshPriorityQueue } from '../src/mesh/priority';
import { StoreAndForwardOutbox } from '../src/mesh/outbox';
import { LoopbackHub, LoopbackTransport } from '../src/transport/LoopbackTransport';
import { MeshPacket } from '../src/mesh/types';

function makePacket(id: string, type: MeshPacket['type'], prio: MeshPacket['prio']): MeshPacket {
  return {
    v: 1, id, type, prio, ttl: 8, hops: 0, src: 'AAAA0000', srcSignPub: '', srcBoxPub: '',
    dst: 'BROADCAST', ts: Date.now(), nonce: '', payload: '', route: [], sig: '',
  };
}

test('21. SOS stays in the outbox until a VERIFIED responder ACK; an unverified ACK does not stop it', async () => {
  const hub = new LoopbackHub();
  const victim = generateNodeIdentity('Victim');
  const fake = generateNodeIdentity('Fake');
  const medic = generateNodeIdentity('Medic');
  const cert = issueResponderCertificate({
    subjectNodeId: medic.nodeId,
    subjectSignPubB64: medic.signPublicKeyB64,
    subjectDisplayName: medic.displayName,
  });
  const mk = (id: typeof victim, extra = {}) =>
    new MeshEngine({ identity: id, transport: new LoopbackTransport(id.nodeId, id.displayName, hub), relayJitterMs: 0, ...extra });
  const eVictim = mk(victim);
  const eFake = mk(fake);
  const eMedic = mk(medic, { responderCert: cert });
  await eVictim.start(); await eFake.start(); await eMedic.start();
  await hub.connect(victim.nodeId, fake.nodeId);
  await hub.connect(fake.nodeId, medic.nodeId);

  const sos = await eVictim.broadcastSOS({ category: 'fire', text: 'Smoke', headcount: 1, locationPrecision: 'disabled' });
  assert.ok(eVictim.outbox.get(sos.id), 'SOS queued for re-send');

  await eFake.sendSosAck(sos.id, 'ACKNOWLEDGED'); // no certificate -> unverified
  assert.ok(eVictim.outbox.get(sos.id), 'unverified ACK must not stop the SOS');

  await eMedic.sendSosAck(sos.id, 'RESPONDING');
  assert.equal(eVictim.outbox.get(sos.id), undefined, 'verified ACK closes the loop');
  await eVictim.stop(); await eFake.stop(); await eMedic.stop();
});

test('22a. Queued message is delivered automatically when the peer appears (no manual action)', async () => {
  const hub = new LoopbackHub();
  const a = generateNodeIdentity('A');
  const b = generateNodeIdentity('B');
  const eA = new MeshEngine({ identity: a, transport: new LoopbackTransport(a.nodeId, a.displayName, hub), relayJitterMs: 0 });
  const eB = new MeshEngine({ identity: b, transport: new LoopbackTransport(b.nodeId, b.displayName, hub), relayJitterMs: 0 });
  await eA.start(); await eB.start();
  eA.registerContactPublicKey(b.nodeId, b.displayName, b.signPublicKeyB64, b.boxPublicKeyB64);

  const msg = await eA.sendDirectMessage(b.nodeId, 'hello', 2);
  assert.equal(msg.deliveryState, 'PENDING');

  await hub.connect(a.nodeId, b.nodeId);
  await new Promise((r) => setTimeout(r, 150));
  assert.ok(eB.getMessages().some((m) => m.id === msg.id));
  assert.equal(eA.getMessages().find((m) => m.id === msg.id)?.deliveryState, 'DELIVERED');
  await eA.stop(); await eB.stop();
});

test('22b. Retry loop (retryTickMs) re-attempts a due outbox entry by itself and counts attempts', async () => {
  const hub = new LoopbackHub();
  const a = generateNodeIdentity('Lonely');
  const b = generateNodeIdentity('Absent');
  const eA = new MeshEngine({ identity: a, transport: new LoopbackTransport(a.nodeId, a.displayName, hub), relayJitterMs: 0, retryTickMs: 20 });
  await eA.start();
  eA.registerContactPublicKey(b.nodeId, b.displayName, b.signPublicKeyB64, b.boxPublicKeyB64);
  const msg = await eA.sendDirectMessage(b.nodeId, 'anyone there?', 2);
  eA.outbox.get(msg.id)!.nextRetryAt = Date.now();
  await new Promise((r) => setTimeout(r, 120));
  assert.ok(eA.outbox.get(msg.id)!.attempts >= 1, 'loop ticked without a manual call');
  await eA.stop();
});

test('23. restoreState: persisted outbox becomes due immediately and its packet id is marked seen', () => {
  const id = generateNodeIdentity('Restorer');
  const hub = new LoopbackHub();
  const engine = new MeshEngine({ identity: id, transport: new LoopbackTransport(id.nodeId, id.displayName, hub) });
  const pkt = makePacket('ab'.repeat(16), 'SOS', 0);
  engine.restoreState({
    outbox: [{ packet: pkt, createdAt: Date.now() - 5000, lastAttemptAt: 0, attempts: 3, nextRetryAt: Date.now() + 60_000, maxWindowMs: 3_600_000, acknowledgedBy: [] }],
  });
  const restored = engine.outbox.get(pkt.id)!;
  assert.ok(restored.nextRetryAt <= Date.now());
  assert.equal(engine.outbox.getDueForRetry().length, 1);
  assert.equal(engine.seenCache.hasSeen(pkt.id), true);
});

test('24. Outbox backoff doubles 1s -> 30s cap', () => {
  const o = new StoreAndForwardOutbox();
  assert.deepEqual([1, 2, 3, 4, 5, 6, 9].map((n) => o.computeBackoffMs(n)), [1000, 2000, 4000, 8000, 16000, 30000, 30000]);
});

test('25. P0 SOS dequeues before a flood of P2/P3 and is never evicted at capacity', () => {
  const q = new MeshPriorityQueue(8);
  for (let i = 0; i < 20; i++) {
    q.enqueue({ packet: makePacket(`m${i}`.padEnd(32, '0'), 'MSG', 2), targetPeerId: 'ALL_EXCEPT_SENDER', enqueuedAt: i });
    q.enqueue({ packet: makePacket(`a${i}`.padEnd(32, '0'), 'ACK', 3), targetPeerId: 'ALL_EXCEPT_SENDER', enqueuedAt: i });
  }
  assert.equal(q.enqueue({ packet: makePacket('s'.padEnd(32, '0'), 'SOS', 0), targetPeerId: 'ALL_EXCEPT_SENDER', enqueuedAt: 99 }), true);
  assert.equal(q.dequeue()?.packet.type, 'SOS');
});
