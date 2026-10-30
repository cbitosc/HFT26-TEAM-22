import test from 'node:test';
import assert from 'node:assert/strict';
import { generateNodeIdentity } from '../src/crypto/identity';
import { issueResponderCertificate } from '../src/crypto/responderCert';
import { MeshEngine } from '../src/mesh/engine';
import { NearbyTransport } from '../src/transport/NearbyTransport';
import { connect, disconnect, FakeBridge, waitFor } from './fakeNative';

/** Two (or three) real MeshEngines over NearbyTransport, joined by a fake native bridge. */
async function phone(name: string, opts: { cert?: boolean } = {}) {
  const id = generateNodeIdentity(name);
  const bridge = new FakeBridge(id.nodeId, id.displayName);
  const cert = opts.cert
    ? issueResponderCertificate({ subjectNodeId: id.nodeId, subjectSignPubB64: id.signPublicKeyB64, subjectDisplayName: id.displayName })
    : null;
  const transport = new NearbyTransport(id.nodeId, id.displayName, bridge);
  const engine = new MeshEngine({ identity: id, transport, relayJitterMs: 0, responderCert: cert, retryTickMs: 20 });
  await engine.start();
  return { id, bridge, transport, engine };
}

test('30. Real-radio path: HELLO exchange creates contacts and marks them direct (endpoint ids are not node ids)', async () => {
  const a = await phone('Asha');
  const b = await phone('Bala');
  assert.equal(a.bridge.startCalls, 1, 'radio start was requested');

  connect(a.bridge, b.bridge);
  await waitFor(() => a.engine.getPeer(b.id.nodeId)?.boxPub !== undefined && b.engine.getPeer(a.id.nodeId)?.boxPub !== undefined, 1500, 'both sides to learn each other');

  const pb = a.engine.getPeer(b.id.nodeId)!;
  assert.equal(pb.isDirectNeighbor, true);
  assert.equal(pb.displayName, 'Bala');
  assert.equal(pb.hopsAway, 1);
  assert.equal(b.engine.getPeer(a.id.nodeId)?.isDirectNeighbor, true);
  assert.equal(a.engine.getPeers().length, 1, 'exactly one real contact, nothing else');
  await a.engine.stop(); await b.engine.stop();
});

test('31. Race: first HELLO arrives before the other phone has its own peerFound; contacts still form', async () => {
  const a = await phone('Asha');
  const b = await phone('Bala');
  connect(a.bridge, b.bridge, 40); // B is told about the link 40 ms late
  await waitFor(() => b.engine.getPeer(a.id.nodeId)?.isDirectNeighbor === true && a.engine.getPeer(b.id.nodeId)?.isDirectNeighbor === true, 1500, 'direct contacts');
  await a.engine.stop(); await b.engine.stop();
});

test('32. "Everyone nearby" broadcast needs no contacts and reaches the other phone', async () => {
  const a = await phone('Asha');
  const b = await phone('Bala');
  connect(a.bridge, b.bridge);
  await waitFor(() => a.transport.getPeers().length === 1 && b.transport.getPeers().length === 1);

  const sent = await a.engine.sendBroadcastMessage('Anyone hurt at the bridge?');
  assert.equal(sent.deliveryState, 'SENT');
  await waitFor(() => b.engine.getMessages().some((m) => m.conversationId === 'BROADCAST' && m.text === 'Anyone hurt at the bridge?'), 1500, 'broadcast at B');
  const got = b.engine.getMessages().find((m) => m.id === sent.id)!;
  assert.equal(got.senderName, 'Asha');
  assert.equal(got.direction, 'inbound');
  await a.engine.stop(); await b.engine.stop();
});

test('33. Private message delivers; DELIVERED appears only after the signed end-to-end ACK', async () => {
  const a = await phone('Asha');
  const b = await phone('Bala');
  connect(a.bridge, b.bridge);
  await waitFor(() => a.engine.getPeer(b.id.nodeId)?.boxPub !== undefined, 1500, 'A to know B keys');

  const msg = await a.engine.sendDirectMessage(b.id.nodeId, 'Meet at the school gate', 2);
  assert.notEqual(msg.deliveryState, 'DELIVERED', 'never delivered at send time');
  await waitFor(() => b.engine.getMessages().some((m) => m.id === msg.id && m.text === 'Meet at the school gate'), 1500, 'DM at B');
  await waitFor(() => a.engine.getMessages().find((m) => m.id === msg.id)?.deliveryState === 'DELIVERED', 1500, 'ACK back at A');
  await a.engine.stop(); await b.engine.stop();
});

test('34. SOS reaches the other phone once, fires one incoming-alert event, and the sender counts real receipts', async () => {
  const a = await phone('Asha');
  const b = await phone('Bala');
  let events = 0;
  b.engine.onIncomingAlert(() => (events += 1));
  connect(a.bridge, b.bridge);
  await waitFor(() => a.transport.getPeers().length === 1 && b.transport.getPeers().length === 1);

  const alert = await a.engine.broadcastSOS({ category: 'medical', text: 'Need a medic', headcount: 2, locationPrecision: 'disabled' });
  assert.equal(alert.reachedNodeIds.length, 0, 'nobody has confirmed receipt yet');
  await waitFor(() => b.engine.getAlerts().some((x) => x.id === alert.id), 1500, 'SOS at B');
  await waitFor(() => (a.engine.getAlerts().find((x) => x.id === alert.id)?.reachedNodeIds.length ?? 0) === 1, 1500, 'receipt back at A');
  assert.equal(events, 1);
  await new Promise((r) => setTimeout(r, 120)); // retries / repeats must not create more events
  assert.equal(events, 1, 'repeats update, they do not re-alert');
  assert.equal(b.engine.getAlerts().length, 1);
  await a.engine.stop(); await b.engine.stop();
});

test('35. A valid-certificate ACK closes the SOS loop; an unverified ACK does not', async () => {
  const a = await phone('Asha');
  const plain = await phone('Neighbour');
  const medic = await phone('Medic', { cert: true });
  connect(a.bridge, plain.bridge);
  connect(a.bridge, medic.bridge);
  await waitFor(() => a.transport.getPeers().length === 2);

  const alert = await a.engine.broadcastSOS({ category: 'fire', text: 'Fire on floor 2', headcount: 1, locationPrecision: 'disabled' });
  await waitFor(() => plain.engine.getAlerts().length === 1 && medic.engine.getAlerts().length === 1, 1500, 'SOS at both');

  await plain.engine.sendSosAck(alert.id, 'ACKNOWLEDGED', 'I see it');
  await waitFor(() => (a.engine.getAlerts()[0].responderAcks.length) === 1, 1500, 'plain ack at A');
  const plainAck = a.engine.getAlerts()[0].responderAcks[0];
  assert.equal(plainAck.verifiedCert, false);
  assert.ok(a.engine.outbox.get(alert.id), 'unverified ACK must not stop the SOS');

  await medic.engine.sendSosAck(alert.id, 'RESPONDING', 'On my way');
  await waitFor(() => a.engine.getAlerts()[0].responderAcks.some((r) => r.verifiedCert), 1500, 'verified ack at A');
  assert.equal(a.engine.outbox.get(alert.id), undefined, 'verified responder ACK closes the loop');
  await a.engine.stop(); await plain.engine.stop(); await medic.engine.stop();
});

test('36. Offline queue: broadcast, SOS and a private message sent with no phone connected go out when one connects', async () => {
  const a = await phone('Asha');
  const b = await phone('Bala');
  // first meet so A knows B's keys, then separate
  connect(a.bridge, b.bridge);
  await waitFor(() => a.engine.getPeer(b.id.nodeId)?.boxPub !== undefined, 1500, 'keys');
  disconnect(a.bridge, b.bridge);
  await waitFor(() => a.transport.getPeers().length === 0 && b.transport.getPeers().length === 0);
  assert.equal(a.engine.getPeer(b.id.nodeId)?.isDirectNeighbor, false);

  const dm = await a.engine.sendDirectMessage(b.id.nodeId, 'queued private', 2);
  const bc = await a.engine.sendBroadcastMessage('queued broadcast');
  const sos = await a.engine.broadcastSOS({ category: 'trapped', text: 'queued sos', headcount: 1, locationPrecision: 'disabled' });
  assert.equal(dm.deliveryState, 'PENDING');
  assert.equal(bc.deliveryState, 'PENDING');
  assert.ok(a.engine.outbox.size() >= 3);

  connect(a.bridge, b.bridge);
  await waitFor(() => b.engine.getMessages().some((m) => m.id === dm.id) && b.engine.getMessages().some((m) => m.id === bc.id) && b.engine.getAlerts().some((x) => x.id === sos.id), 2000, 'all three at B');
  await waitFor(() => a.engine.getMessages().find((m) => m.id === dm.id)?.deliveryState === 'DELIVERED', 2000, 'DM delivered');
  assert.equal(a.engine.getMessages().find((m) => m.id === bc.id)?.deliveryState, 'SENT');
  assert.equal(a.engine.outbox.get(bc.id), undefined, 'broadcast leaves the outbox after being handed over');
  await a.engine.stop(); await b.engine.stop();
});

test('37. Radio start failure is reported, not swallowed, and can be retried once permissions arrive', async () => {
  const id = generateNodeIdentity('NoPerms');
  const bridge = new FakeBridge(id.nodeId, id.displayName);
  bridge.permissionsGranted = false;
  const transport = new NearbyTransport(id.nodeId, id.displayName, bridge);
  await transport.start();
  const d1 = await transport.getDiagnostics().catch(() => null);
  assert.ok(d1);
  assert.match(d1.js.lastStartError ?? '', /permission/i);
  assert.equal(transport.isRadioRunning(), false);

  bridge.permissionsGranted = true;
  const res = await transport.startRadio();
  assert.equal(res?.advertising, true);
  assert.equal(transport.isRadioRunning(), true);
  assert.equal(bridge.startCalls, 2);
  const listenerSets = [...(bridge as unknown as { listeners: Map<string, Set<unknown>> }).listeners.values()];
  assert.ok(listenerSets.every((s) => s.size === 1), 'listeners attached exactly once, not duplicated on retry');
});
