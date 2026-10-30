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

import { distanceMeters, withinRadius } from '../src/lib/geo';

test('26. Geo: 200 m incident radius separates nearby and far reports; missing coordinates never cluster', () => {
  assert.ok(Math.abs(distanceMeters(12.97, 77.59, 12.97, 77.59)) < 0.001);
  const base = { lat: 12.9716, lng: 77.5946 };
  assert.equal(withinRadius(base, { lat: 12.9724, lng: 77.5946 }), true); // ~89 m
  assert.equal(withinRadius(base, { lat: 12.9745, lng: 77.5946 }), false); // ~320 m
  assert.equal(withinRadius(base, { lat: undefined, lng: undefined }), false);
});

import { percentile, summarizeLatencies } from '../src/mesh/metrics';

test('27. Benchmark stats: nearest-rank p50/p95, empty input gives null, unarrived packets are counted not invented', () => {
  const samples = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  assert.equal(percentile(samples, 50), 50);
  assert.equal(percentile(samples, 95), 100);
  assert.equal(percentile([], 50), null);
  assert.deepEqual(summarizeLatencies(5, [30, 10, 20]), { sent: 5, arrived: 3, p50Ms: 20, p95Ms: 30 });
  assert.deepEqual(summarizeLatencies(3, []), { sent: 3, arrived: 0, p50Ms: null, p95Ms: null });
});
