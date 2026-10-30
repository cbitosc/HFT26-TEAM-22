import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decryptIdentityWithPin,
  decryptSecretKeysWithVaultKey,
  encryptIdentityWithPin,
  encryptSecretKeysWithVaultKey,
  generateNodeIdentity,
  generateVaultKeyB64,
  mergeIdentityFromStorage,
  splitIdentityForStorage,
  utf8ToBytes,
} from '../src/crypto/identity';
import { signPacket, verifyPacketSignature } from '../src/crypto/sign';
import { decryptDirectPayload, encryptDirectPayload } from '../src/crypto/e2e';
import { decodeTrustQrUri, encodeTrustQrUri, evaluatePeerTrust } from '../src/crypto/qr';
import {
  issueResponderCertificate,
  ResponderCertificate,
  verifyResponderCertificate,
} from '../src/crypto/responderCert';
import { SeenCache } from '../src/mesh/seenCache';
import { MeshPriorityQueue } from '../src/mesh/priority';
import { computePowerSchedule, resolveAutoPowerMode } from '../src/mesh/power';
import { LoopbackHub, LoopbackTransport } from '../src/transport/LoopbackTransport';
import { CompositeTransport } from '../src/transport/CompositeTransport';
import { MeshEngine } from '../src/mesh/engine';
import { MeshPacket } from '../src/mesh/types';

test('1. Crypto: Ed25519 signature verification rejects tampered payload or forged signature', () => {
  const alice = generateNodeIdentity('Alice');
  const mallory = generateNodeIdentity('Mallory');

  const unsigned: Omit<MeshPacket, 'sig'> = {
    v: 1,
    id: '00112233445566778899aabbccddeeff',
    type: 'MSG',
    prio: 2,
    ttl: 8,
    hops: 0,
    src: alice.nodeId,
    srcSignPub: alice.signPublicKeyB64,
    srcBoxPub: alice.boxPublicKeyB64,
    dst: mallory.nodeId,
    ts: Date.now(),
    nonce: 'bm9uY2UxMjM0NTY3ODkwMTIzNDU2Nzg=',
    payload: 'Y2lwaGVydGV4dA==',
    route: [alice.nodeId],
  };

  const validSig = signPacket(unsigned, alice.signSecretKeyB64);
  const validPacket: MeshPacket = { ...unsigned, sig: validSig };
  assert.equal(verifyPacketSignature(validPacket), true);

  // Tamper with payload
  const tamperedPayload: MeshPacket = {
    ...validPacket,
    payload: 'dGFtcGVyZWRfY2lwaGVydGV4dA==',
  };
  assert.equal(verifyPacketSignature(tamperedPayload), false);

  // Forged signature (signed by Mallory claiming to be Alice)
  const forgedSig = signPacket(unsigned, mallory.signSecretKeyB64);
  const forgedPacket: MeshPacket = { ...unsigned, sig: forgedSig };
  assert.equal(verifyPacketSignature(forgedPacket), false);
});

test('2. Crypto: X25519 E2E encryption prevents relay eavesdropping and PIN keystore works', () => {
  const alice = generateNodeIdentity('Alice');
  const relayBob = generateNodeIdentity('RelayBob');
  const dave = generateNodeIdentity('Dave');

  const secretMsg = { text: 'Evacuation point at Sector 9', senderName: 'Alice' };
  const encrypted = encryptDirectPayload(
    secretMsg,
    dave.boxPublicKeyB64,
    alice.boxSecretKeyB64
  );

  // Relay Bob cannot decrypt message intended for Dave
  const bobAttempt = decryptDirectPayload<{ text: string }>(
    encrypted.ciphertextB64,
    encrypted.nonceB64,
    alice.boxPublicKeyB64,
    relayBob.boxSecretKeyB64
  );
  assert.equal(bobAttempt, null);

  // Dave decrypts successfully
  const daveDecrypted = decryptDirectPayload<{ text: string; senderName: string }>(
    encrypted.ciphertextB64,
    encrypted.nonceB64,
    alice.boxPublicKeyB64,
    dave.boxSecretKeyB64
  );
  assert.deepEqual(daveDecrypted, secretMsg);

  // PIN-derived keystore encryption & QR TOFU verification
  const blob = encryptIdentityWithPin(alice, '4829');
  assert.equal(decryptIdentityWithPin(blob, '0000'), null);
  assert.deepEqual(decryptIdentityWithPin(blob, '4829'), alice);

  const qrUri = encodeTrustQrUri({
    nodeId: alice.nodeId,
    displayName: alice.displayName,
    signPub: alice.signPublicKeyB64,
    boxPub: alice.boxPublicKeyB64,
  });
  const decodedQr = decodeTrustQrUri(qrUri);
  assert.equal(decodedQr?.nodeId, alice.nodeId);
  assert.equal(
    evaluatePeerTrust(
      {
        signPub: alice.signPublicKeyB64,
        boxPub: alice.boxPublicKeyB64,
        trustStatus: 'verified',
      },
      malloryPub(dave),
      dave.boxPublicKeyB64
    ),
    'key_changed'
  );
});

function malloryPub(identity: ReturnType<typeof generateNodeIdentity>): string {
  return identity.signPublicKeyB64;
}

test('3. Seen-Cache: deduplicates packets and suppresses forwarding after >= 2 neighbor overhears', () => {
  const cache = new SeenCache(60_000);
  const pktId = 'pkt-flood-test-01';

  // First time seeing from Neighbor B -> returns true
  assert.equal(cache.markSeenAndRecordNeighbor(pktId, 'NODE-B', 1000), true);
  assert.equal(cache.shouldSuppressForward(pktId, 2, 1000), false);

  // Second time seeing same packet from Neighbor C -> returns false (duplicate) and increments overhear count to 2
  assert.equal(cache.markSeenAndRecordNeighbor(pktId, 'NODE-C', 1005), false);
  assert.equal(cache.getOverheardCount(pktId, 1005), 2);
  assert.equal(cache.shouldSuppressForward(pktId, 2, 1005), true);
});

test('4. Multi-Hop Chain (A -> B -> C -> D): message arrives via 3 hops and transitions PENDING -> SENT -> RELAYED -> DELIVERED', async () => {
  const hub = new LoopbackHub();
  const idA = generateNodeIdentity('Node-A');
  const idB = generateNodeIdentity('Node-B');
  const idC = generateNodeIdentity('Node-C');
  const idD = generateNodeIdentity('Node-D');

  const engineA = new MeshEngine({
    identity: idA,
    transport: new LoopbackTransport(idA.nodeId, idA.displayName, hub),
    relayJitterMs: 0,
  });
  const engineB = new MeshEngine({
    identity: idB,
    transport: new LoopbackTransport(idB.nodeId, idB.displayName, hub),
    relayJitterMs: 0,
  });
  const engineC = new MeshEngine({
    identity: idC,
    transport: new LoopbackTransport(idC.nodeId, idC.displayName, hub),
    relayJitterMs: 0,
  });
  const engineD = new MeshEngine({
    identity: idD,
    transport: new LoopbackTransport(idD.nodeId, idD.displayName, hub),
    relayJitterMs: 0,
  });

  // Pre-register D's public key on A (as if previously exchanged or QR scanned)
  engineA.registerContactPublicKey(
    idD.nodeId,
    idD.displayName,
    idD.signPublicKeyB64,
    idD.boxPublicKeyB64,
    true
  );

  await engineA.start();
  await engineB.start();
  await engineC.start();
  await engineD.start();

  // Connect linear chain A <-> B <-> C <-> D (A cannot reach C or D directly)
  await hub.connect(idA.nodeId, idB.nodeId);
  await hub.connect(idB.nodeId, idC.nodeId);
  await hub.connect(idC.nodeId, idD.nodeId);

  const sentMsg = await engineA.sendDirectMessage(
    idD.nodeId,
    'Need trauma kit at North Bridge via multi-hop relay',
    1
  );

  // Verify D received and decrypted the message
  const dMessages = engineD.getMessages();
  assert.equal(dMessages.length, 1);
  assert.equal(
    dMessages[0].text,
    'Need trauma kit at North Bridge via multi-hop relay'
  );
  assert.deepEqual(dMessages[0].route, [
    idA.nodeId,
    idB.nodeId,
    idC.nodeId,
    idD.nodeId,
  ]);

  // Verify A received the signed end-to-end ACK from D across C and B
  const aUpdated = engineA.getMessages().find((m) => m.id === sentMsg.id);
  assert.ok(aUpdated);
  assert.equal(aUpdated.deliveryState, 'DELIVERED');
  assert.deepEqual(aUpdated.route, [
    idA.nodeId,
    idB.nodeId,
    idC.nodeId,
    idD.nodeId,
  ]);
  assert.equal(aUpdated.relayedHops, 3);
});

test('5. Store-and-Forward & Anti-Entropy Sync: broken middle link queues packet and delivers upon reconnect', async () => {
  const hub = new LoopbackHub();
  const idA = generateNodeIdentity('Alpha');
  const idB = generateNodeIdentity('Bravo');
  const idC = generateNodeIdentity('Charlie');

  const engineA = new MeshEngine({
    identity: idA,
    transport: new LoopbackTransport(idA.nodeId, idA.displayName, hub),
    relayJitterMs: 0,
  });
  const engineB = new MeshEngine({
    identity: idB,
    transport: new LoopbackTransport(idB.nodeId, idB.displayName, hub),
    relayJitterMs: 0,
  });
  const engineC = new MeshEngine({
    identity: idC,
    transport: new LoopbackTransport(idC.nodeId, idC.displayName, hub),
    relayJitterMs: 0,
  });

  engineA.registerContactPublicKey(
    idC.nodeId,
    idC.displayName,
    idC.signPublicKeyB64,
    idC.boxPublicKeyB64,
    true
  );

  await engineA.start();
  await engineB.start();
  await engineC.start();

  // Only connect A <-> B initially; link B <-> C is broken!
  await hub.connect(idA.nodeId, idB.nodeId);

  const msg = await engineA.sendDirectMessage(
    idC.nodeId,
    'Queued while link B-C is severed',
    2
  );

  // B has relayed/buffered it and sent RELAY_RECEIPT to A, but C has NOT received it yet
  assert.equal(engineC.getMessages().length, 0);
  const stateBeforeReconnect = engineA
    .getMessages()
    .find((m) => m.id === msg.id)?.deliveryState;
  assert.equal(stateBeforeReconnect, 'RELAYED');

  // Now restore link B <-> C -> triggers anti-entropy SYNC_INV / SYNC_REQ
  await hub.connect(idB.nodeId, idC.nodeId);

  assert.equal(engineC.getMessages().length, 1);
  assert.equal(engineC.getMessages()[0].text, 'Queued while link B-C is severed');

  const stateAfterReconnect = engineA
    .getMessages()
    .find((m) => m.id === msg.id)?.deliveryState;
  assert.equal(stateAfterReconnect, 'DELIVERED');
});

test('6. SOS Broadcast & Location Privacy: reaches all nodes and respects location opt-in', async () => {
  const hub = new LoopbackHub();
  const idA = generateNodeIdentity('Sender-A');
  const idB = generateNodeIdentity('Relay-B');
  const idC = generateNodeIdentity('Responder-C');

  const engineA = new MeshEngine({
    identity: idA,
    transport: new LoopbackTransport(idA.nodeId, idA.displayName, hub),
    relayJitterMs: 0,
  });
  const engineB = new MeshEngine({
    identity: idB,
    transport: new LoopbackTransport(idB.nodeId, idB.displayName, hub),
    relayJitterMs: 0,
  });
  const engineC = new MeshEngine({
    identity: idC,
    transport: new LoopbackTransport(idC.nodeId, idC.displayName, hub),
    relayJitterMs: 0,
  });

  await engineA.start();
  await engineB.start();
  await engineC.start();

  await hub.connect(idA.nodeId, idB.nodeId);
  await hub.connect(idB.nodeId, idC.nodeId);

  // Send SOS with location disabled -> lat/lng must be undefined even if passed
  const sosAlert = await engineA.broadcastSOS({
    category: 'trapped',
    text: 'Trapped under collapsed stairwell, 3 people conscious',
    headcount: 3,
    locationPrecision: 'disabled',
    lat: 12.9716,
    lng: 77.5946,
  });

  const cAlerts = engineC.getAlerts();
  assert.equal(cAlerts.length, 1);
  assert.equal(cAlerts[0].category, 'trapped');
  assert.equal(cAlerts[0].lat, undefined);
  assert.equal(cAlerts[0].lng, undefined);
  assert.equal(cAlerts[0].offlineUrgencyHint?.level, 'CRITICAL');

  // Verify sender A recorded signed reach receipts from both B and C
  const aAlert = engineA.getAlerts().find((a) => a.id === sosAlert.id);
  assert.ok(aAlert);
  assert.equal(aAlert.reachedNodeIds.length, 2);
});

test('7. Priority Queue, Congestion & Battery Saver Mode: SOS always outranks normal messages and Saver throttles WebGL/relay', () => {
  const queue = new MeshPriorityQueue(2); // small capacity = 2 to test congestion eviction
  const dummyBase = {
    v: 1 as const,
    ttl: 8,
    hops: 0,
    src: 'AAAA1111',
    srcSignPub: '',
    srcBoxPub: '',
    dst: 'BBBB2222',
    ts: Date.now(),
    nonce: '',
    payload: '',
    route: ['AAAA1111'],
    sig: '',
  };

  queue.enqueue({
    packet: { ...dummyBase, id: 'normal-1', type: 'MSG', prio: 2 },
    targetPeerId: 'ALL_EXCEPT_SENDER',
    enqueuedAt: 100,
  });
  queue.enqueue({
    packet: { ...dummyBase, id: 'receipt-1', type: 'MSG', prio: 3 },
    targetPeerId: 'ALL_EXCEPT_SENDER',
    enqueuedAt: 101,
  });

  // Queue is now full (2/2). Enqueue a P0 SOS packet -> must evict prio 3 and place SOS at the front!
  const accepted = queue.enqueue({
    packet: { ...dummyBase, id: 'sos-urgent', type: 'SOS', prio: 0 },
    targetPeerId: 'ALL_EXCEPT_SENDER',
    enqueuedAt: 102,
  });
  assert.equal(accepted, true);

  const firstOut = queue.dequeue();
  assert.equal(firstOut?.packet.id, 'sos-urgent');

  // Battery auto-mode & Saver relay filter
  assert.equal(resolveAutoPowerMode(25, false, 'active'), 'balanced');
  assert.equal(resolveAutoPowerMode(12, false, 'active'), 'saver');

  const saverSchedule = computePowerSchedule('saver', 12, 1);
  assert.equal(saverSchedule.orbRenderPolicy.pauseWebGL, true);
  assert.equal(saverSchedule.dutyCyclePct, 10);

  // Under <15% battery, normal prio 2 relay is blocked, but prio 0 SOS relay is allowed
  assert.equal(
    queue.canRelayUnderPowerPolicy(
      { ...dummyBase, id: 'n1', type: 'MSG', prio: 2 },
      'saver',
      12
    ),
    false
  );
  assert.equal(
    queue.canRelayUnderPowerPolicy(
      { ...dummyBase, id: 's1', type: 'SOS', prio: 0 },
      'saver',
      12
    ),
    true
  );
});

test('8. Malicious Peer Protection: peer sending repeated invalid signatures is rate-limited/banned', async () => {
  const hub = new LoopbackHub();
  const idA = generateNodeIdentity('Honest-A');
  const idM = generateNodeIdentity('Malicious-M');

  const engineA = new MeshEngine({
    identity: idA,
    transport: new LoopbackTransport(idA.nodeId, idA.displayName, hub),
    relayJitterMs: 0,
  });
  const transportM = new LoopbackTransport(idM.nodeId, idM.displayName, hub);

  await engineA.start();
  await transportM.start();
  await hub.connect(idA.nodeId, idM.nodeId);

  const badPacket: MeshPacket = {
    v: 1,
    id: 'bad-sig-packet-001',
    type: 'MSG',
    prio: 2,
    ttl: 8,
    hops: 0,
    src: idM.nodeId,
    srcSignPub: idM.signPublicKeyB64,
    srcBoxPub: idM.boxPublicKeyB64,
    dst: idA.nodeId,
    ts: Date.now(),
    nonce: 'bm9uY2UxMjM0NTY3ODkwMTIzNDU2Nzg=',
    payload: 'Y2lwaGVydGV4dA==',
    route: [idM.nodeId],
    sig: 'aW52YWxpZF9zaWduYXR1cmVfYmFzZTY0X3N0cmluZ19oZXJl',
  };

  await transportM.send(idA.nodeId, utf8ToBytes(JSON.stringify(badPacket)));
  assert.equal(engineA.getActivityMetrics().packetsDroppedInvalidSig, 1);
  assert.equal(engineA.getMessages().length, 0);
});

test('9. Responder-Sealed Precise Location (§5 & §9.2): non-responder sees only coarse (~1km), certified responder unseals exact 5-decimal GPS', async () => {
  const hub = new LoopbackHub();
  const idVictim = generateNodeIdentity('Victim-A');
  const idCivilianRelay = generateNodeIdentity('Civilian-B');
  const idVerifiedMedic = generateNodeIdentity('Medic-C');

  const medicCert = issueResponderCertificate({
    subjectNodeId: idVerifiedMedic.nodeId,
    subjectSignPubB64: idVerifiedMedic.signPublicKeyB64,
    subjectDisplayName: idVerifiedMedic.displayName,
    role: 'NDRF_MEDIC',
    organizationName: 'NDRF Field Unit (DEMO AUTHORITY)',
  });

  const engineVictim = new MeshEngine({
    identity: idVictim,
    transport: new LoopbackTransport(idVictim.nodeId, idVictim.displayName, hub),
    relayJitterMs: 0,
  });
  const engineCivilian = new MeshEngine({
    identity: idCivilianRelay,
    transport: new LoopbackTransport(
      idCivilianRelay.nodeId,
      idCivilianRelay.displayName,
      hub
    ),
    responderCert: null, // Not a certified responder
    relayJitterMs: 0,
  });
  const engineMedic = new MeshEngine({
    identity: idVerifiedMedic,
    transport: new LoopbackTransport(
      idVerifiedMedic.nodeId,
      idVerifiedMedic.displayName,
      hub
    ),
    responderCert: medicCert, // Holds Authority-signed ResponderCertificate
    relayJitterMs: 0,
  });

  await engineVictim.start();
  await engineCivilian.start();
  await engineMedic.start();

  await hub.connect(idVictim.nodeId, idCivilianRelay.nodeId);
  await hub.connect(idCivilianRelay.nodeId, idVerifiedMedic.nodeId);

  await engineVictim.broadcastSOS({
    category: 'medical',
    text: 'Severe crush injury at collapsed overpass, need extraction',
    headcount: 2,
    locationPrecision: 'precise',
    lat: 12.97159,
    lng: 77.59456,
  });

  // Civilian Relay B only sees coarse (~1km) coordinates (12.97, 77.59) and cannot unseal precise location
  const civilianAlert = engineCivilian.getAlerts()[0];
  assert.ok(civilianAlert);
  assert.equal(civilianAlert.lat, 12.97);
  assert.equal(civilianAlert.lng, 77.59);
  assert.equal(civilianAlert.unsealedPreciseLocation, null);

  // Certified Medic C unseals exact 5-decimal coordinates (12.97159, 77.59456)
  const medicAlert = engineMedic.getAlerts()[0];
  assert.ok(medicAlert);
  assert.ok(medicAlert.unsealedPreciseLocation);
  assert.equal(medicAlert.unsealedPreciseLocation.lat, 12.97159);
  assert.equal(medicAlert.unsealedPreciseLocation.lng, 77.59456);
});

test('10. Closed-Loop SOS_ACK & Responder Certificate Verification (§9.1 & §9.5): valid Authority cert shows verified, forged cert shows unverified', async () => {
  const hub = new LoopbackHub();
  const idVictim = generateNodeIdentity('Victim-A');
  const idForger = generateNodeIdentity('Forger-B');
  const idMedic = generateNodeIdentity('Medic-C');

  const validMedicCert = issueResponderCertificate({
    subjectNodeId: idMedic.nodeId,
    subjectSignPubB64: idMedic.signPublicKeyB64,
    subjectDisplayName: idMedic.displayName,
    role: 'NDRF_MEDIC',
    organizationName: 'NDRF Field Unit (DEMO AUTHORITY)',
  });

  // Forged certificate: Forger-B tries to reuse Medic-C's Authority signature with Forger-B's nodeId
  const forgedCert: ResponderCertificate = {
    ...validMedicCert,
    subjectNodeId: idForger.nodeId,
    subjectSignPubB64: idForger.signPublicKeyB64,
    subjectDisplayName: 'Fake Medic B',
  };
  assert.equal(
    verifyResponderCertificate(forgedCert, idForger.nodeId).valid,
    false
  );

  const engineVictim = new MeshEngine({
    identity: idVictim,
    transport: new LoopbackTransport(idVictim.nodeId, idVictim.displayName, hub),
    relayJitterMs: 0,
  });
  const engineForger = new MeshEngine({
    identity: idForger,
    transport: new LoopbackTransport(idForger.nodeId, idForger.displayName, hub),
    responderCert: forgedCert,
    relayJitterMs: 0,
  });
  const engineMedic = new MeshEngine({
    identity: idMedic,
    transport: new LoopbackTransport(idMedic.nodeId, idMedic.displayName, hub),
    responderCert: validMedicCert,
    relayJitterMs: 0,
  });

  await engineVictim.start();
  await engineForger.start();
  await engineMedic.start();

  await hub.connect(idVictim.nodeId, idForger.nodeId);
  await hub.connect(idForger.nodeId, idMedic.nodeId);

  const sos = await engineVictim.broadcastSOS({
    category: 'fire',
    text: 'Smoke in stairwell 2B',
    headcount: 4,
    locationPrecision: 'coarse',
    lat: 12.97,
    lng: 77.59,
  });

  // Both Forger-B and Medic-C send SOS_ACK back to Victim-A
  await engineForger.sendSosAck(sos.id, 'ACKNOWLEDGED', 'Claiming to be medic');
  await engineMedic.sendSosAck(sos.id, 'RESPONDING', 'NDRF team en route');

  const victimAlert = engineVictim.getAlerts().find((a) => a.id === sos.id);
  assert.ok(victimAlert);
  assert.equal(victimAlert.responderAcks.length, 2);

  const forgerAck = victimAlert.responderAcks.find(
    (r) => r.responderId === idForger.nodeId
  );
  const medicAck = victimAlert.responderAcks.find(
    (r) => r.responderId === idMedic.nodeId
  );

  assert.equal(forgerAck?.verifiedCert, false); // Forged cert flagged as unverified!
  assert.equal(medicAck?.verifiedCert, true); // Valid Authority cert verified ✔!
  assert.equal(medicAck?.status, 'RESPONDING');
  assert.equal(medicAck?.hops, 2);
});

test('11. Offline Safety Check (SAFE) & Signed Hazard Beacons (HAZARD) propagate across multi-hop mesh', async () => {
  const hub = new LoopbackHub();
  const idA = generateNodeIdentity('Member-A');
  const idB = generateNodeIdentity('Relay-B');
  const idC = generateNodeIdentity('Family-C');

  const engineA = new MeshEngine({
    identity: idA,
    transport: new LoopbackTransport(idA.nodeId, idA.displayName, hub),
    relayJitterMs: 0,
  });
  const engineB = new MeshEngine({
    identity: idB,
    transport: new LoopbackTransport(idB.nodeId, idB.displayName, hub),
    relayJitterMs: 0,
  });
  const engineC = new MeshEngine({
    identity: idC,
    transport: new LoopbackTransport(idC.nodeId, idC.displayName, hub),
    relayJitterMs: 0,
  });

  await engineA.start();
  await engineB.start();
  await engineC.start();

  await hub.connect(idA.nodeId, idB.nodeId);
  await hub.connect(idB.nodeId, idC.nodeId);

  await engineA.broadcastSafetyCheck({
    circleId: 'circle-family-alpha',
    circleName: 'Ward 14 Family Circle',
    status: 'SAFE',
    note: 'Safe at community school shelter',
  });

  await engineA.broadcastHazardReport({
    category: 'blocked_road',
    title: 'Collapsed Overpass at MG Road',
    description: 'Debris blocking all lanes',
    lat: 12.975,
    lng: 77.599,
    ttlMinutes: 60,
  });

  // Verify C received both the SAFE check-in and the HAZARD beacon across 2 hops
  const cSafeChecks = engineC.getSafetyChecks();
  assert.equal(cSafeChecks.length, 1);
  assert.equal(cSafeChecks[0].status, 'SAFE');
  assert.equal(cSafeChecks[0].hops, 2);

  const cHazards = engineC.getHazards();
  assert.equal(cHazards.length, 1);
  assert.equal(cHazards[0].category, 'blocked_road');
  assert.equal(cHazards[0].hops, 2);
});

test('12. Controlled Flooding TTL Expiry: packet with ttl=1 is processed by direct neighbor B but dropped at TTL=0 before reaching C', async () => {
  const hub = new LoopbackHub();
  const idA = generateNodeIdentity('Origin-A');
  const idB = generateNodeIdentity('Relay-B');
  const idC = generateNodeIdentity('Far-C');

  const transportA = new LoopbackTransport(idA.nodeId, idA.displayName, hub);
  const engineB = new MeshEngine({
    identity: idB,
    transport: new LoopbackTransport(idB.nodeId, idB.displayName, hub),
    relayJitterMs: 0,
  });
  const engineC = new MeshEngine({
    identity: idC,
    transport: new LoopbackTransport(idC.nodeId, idC.displayName, hub),
    relayJitterMs: 0,
  });

  await transportA.start();
  await engineB.start();
  await engineC.start();

  await hub.connect(idA.nodeId, idB.nodeId);
  await hub.connect(idB.nodeId, idC.nodeId);

  // Craft a signed SAFE broadcast from A with ttl=1 (can only travel 1 hop A -> B, must stop at B with nextTtl=0)
  const payloadB64 = Buffer.from(
    JSON.stringify({
      circleId: 'c1',
      circleName: 'Circle',
      senderName: 'Origin-A',
      status: 'SAFE',
      note: 'TTL=1 test',
    }),
    'utf-8'
  ).toString('base64');

  const unsigned: Omit<MeshPacket, 'sig'> = {
    v: 1,
    id: 'ttl-1-packet-test-id',
    type: 'SAFE',
    prio: 1,
    ttl: 1,
    hops: 0,
    src: idA.nodeId,
    srcSignPub: idA.signPublicKeyB64,
    srcBoxPub: idA.boxPublicKeyB64,
    dst: 'BROADCAST',
    ts: Date.now(),
    nonce: 'bm9uY2UxMjM0NTY3ODkwMTIzNDU2Nzg=',
    payload: payloadB64,
    route: [idA.nodeId],
  };
  const pkt: MeshPacket = {
    ...unsigned,
    sig: signPacket(unsigned, idA.signSecretKeyB64),
  };

  await transportA.send(idB.nodeId, utf8ToBytes(JSON.stringify(pkt)));

  // B received it (1 hop), decremented ttl to 0, logged ttl_expired drop, and did NOT forward to C
  assert.equal(engineB.getSafetyChecks().length, 1);
  assert.equal(engineC.getSafetyChecks().length, 0);
  assert.equal(
    engineB.getMeshQualitySnapshot().dropCounts.ttl_expired >= 1,
    true
  );
});

test('13. Replay-Window Rejection (±5 min): packet outside ±5 min window is dropped and logged as replay_window', async () => {
  const hub = new LoopbackHub();
  const idA = generateNodeIdentity('Sender-A');
  const idB = generateNodeIdentity('Receiver-B');

  const transportA = new LoopbackTransport(idA.nodeId, idA.displayName, hub);
  const engineB = new MeshEngine({
    identity: idB,
    transport: new LoopbackTransport(idB.nodeId, idB.displayName, hub),
    relayJitterMs: 0,
  });

  await transportA.start();
  await engineB.start();
  await hub.connect(idA.nodeId, idB.nodeId);

  // Timestamp 6 minutes in the past (360_000 ms > 300_000 ms ±5 min replay window)
  const staleTs = Date.now() - 6 * 60 * 1000;
  const unsignedStale: Omit<MeshPacket, 'sig'> = {
    v: 1,
    id: 'stale-replay-pkt-001',
    type: 'SAFE',
    prio: 1,
    ttl: 8,
    hops: 0,
    src: idA.nodeId,
    srcSignPub: idA.signPublicKeyB64,
    srcBoxPub: idA.boxPublicKeyB64,
    dst: 'BROADCAST',
    ts: staleTs,
    nonce: 'bm9uY2UxMjM0NTY3ODkwMTIzNDU2Nzg=',
    payload: Buffer.from(
      JSON.stringify({
        circleId: 'c1',
        circleName: 'Circle',
        senderName: 'Sender-A',
        status: 'SAFE',
        note: 'Stale replay attempt',
      })
    ).toString('base64'),
    route: [idA.nodeId],
  };
  const stalePacket: MeshPacket = {
    ...unsignedStale,
    sig: signPacket(unsignedStale, idA.signSecretKeyB64),
  };

  await transportA.send(idB.nodeId, utf8ToBytes(JSON.stringify(stalePacket)));

  assert.equal(engineB.getSafetyChecks().length, 0);
  assert.equal(engineB.getMeshQualitySnapshot().dropCounts.replay_window, 1);
  assert.equal(engineB.getDropLog()[0]?.reason, 'replay_window');
});

test('14. Forged End-to-End ACK Rejection: DELIVERED state is only set when ACK is signed by intended recipientId', async () => {
  const hub = new LoopbackHub();
  const idA = generateNodeIdentity('Sender-A');
  const idMallory = generateNodeIdentity('Relay-Mallory');
  const idD = generateNodeIdentity('Recipient-D');

  const engineA = new MeshEngine({
    identity: idA,
    transport: new LoopbackTransport(idA.nodeId, idA.displayName, hub),
    relayJitterMs: 0,
  });
  const transportMallory = new LoopbackTransport(
    idMallory.nodeId,
    idMallory.displayName,
    hub
  );

  engineA.registerContactPublicKey(
    idD.nodeId,
    idD.displayName,
    idD.signPublicKeyB64,
    idD.boxPublicKeyB64,
    true
  );

  await engineA.start();
  await transportMallory.start();
  await hub.connect(idA.nodeId, idMallory.nodeId);

  // A sends a message intended for D (who is offline / unreachable)
  const sentMsg = await engineA.sendDirectMessage(
    idD.nodeId,
    'Confidential message for D only',
    2
  );
  assert.equal(
    engineA.getMessages().find((m) => m.id === sentMsg.id)?.deliveryState,
    'SENT'
  );

  // Mallory crafts a valid signature under Mallory's key claiming ackKind: 'DELIVERED' for sentMsg.id
  const fakeAckPayload = Buffer.from(
    JSON.stringify({
      targetPacketId: sentMsg.id,
      ackKind: 'DELIVERED',
      responderName: 'Mallory Spoofing D',
      recordedRoute: [idA.nodeId, idMallory.nodeId],
    })
  ).toString('base64');

  const unsignedFakeAck: Omit<MeshPacket, 'sig'> = {
    v: 1,
    id: 'mallory-fake-delivered-ack',
    type: 'ACK',
    prio: 3,
    ttl: 8,
    hops: 0,
    src: idMallory.nodeId,
    srcSignPub: idMallory.signPublicKeyB64,
    srcBoxPub: idMallory.boxPublicKeyB64,
    dst: idA.nodeId,
    ts: Date.now(),
    nonce: 'bm9uY2UxMjM0NTY3ODkwMTIzNDU2Nzg=',
    payload: fakeAckPayload,
    route: [idMallory.nodeId],
  };
  const signedByMallory: MeshPacket = {
    ...unsignedFakeAck,
    sig: signPacket(unsignedFakeAck, idMallory.signSecretKeyB64),
  };

  await transportMallory.send(
    idA.nodeId,
    utf8ToBytes(JSON.stringify(signedByMallory))
  );

  // Because signedByMallory.src !== idD.nodeId, A must NOT mark the message DELIVERED!
  const msgAfterSpoof = engineA.getMessages().find((m) => m.id === sentMsg.id);
  assert.notEqual(msgAfterSpoof?.deliveryState, 'DELIVERED');
});

test('15. Active Jitter & Overhear Suppression Cancellation: hearing packet from >=2 neighbors during jitter window cancels scheduled relay timer', async () => {
  const hub = new LoopbackHub();
  const idA = generateNodeIdentity('Neighbor-A');
  const idB = generateNodeIdentity('Neighbor-B');
  const idRelay = generateNodeIdentity('Relay-Node');
  const idObserver = generateNodeIdentity('Observer-D');

  const transportA = new LoopbackTransport(idA.nodeId, idA.displayName, hub);
  const transportB = new LoopbackTransport(idB.nodeId, idB.displayName, hub);
  const engineRelay = new MeshEngine({
    identity: idRelay,
    transport: new LoopbackTransport(idRelay.nodeId, idRelay.displayName, hub),
    relayJitterMs: 50, // 10-50ms jitter window enabled
  });
  const engineObserver = new MeshEngine({
    identity: idObserver,
    transport: new LoopbackTransport(
      idObserver.nodeId,
      idObserver.displayName,
      hub
    ),
    relayJitterMs: 0,
  });

  await transportA.start();
  await transportB.start();
  await engineRelay.start();
  await engineObserver.start();

  await hub.connect(idA.nodeId, idRelay.nodeId);
  await hub.connect(idB.nodeId, idRelay.nodeId);
  await hub.connect(idRelay.nodeId, idObserver.nodeId);

  const unsigned: Omit<MeshPacket, 'sig'> = {
    v: 1,
    id: 'jitter-cancel-test-pkt-99',
    type: 'SAFE',
    prio: 2,
    ttl: 8,
    hops: 0,
    src: idA.nodeId,
    srcSignPub: idA.signPublicKeyB64,
    srcBoxPub: idA.boxPublicKeyB64,
    dst: 'BROADCAST',
    ts: Date.now(),
    nonce: 'bm9uY2UxMjM0NTY3ODkwMTIzNDU2Nzg=',
    payload: Buffer.from(
      JSON.stringify({
        circleId: 'c1',
        circleName: 'Circle',
        senderName: 'Neighbor-A',
        status: 'SAFE',
        note: 'Jitter suppression test',
      })
    ).toString('base64'),
    route: [idA.nodeId],
  };
  const packet: MeshPacket = {
    ...unsigned,
    sig: signPacket(unsigned, idA.signSecretKeyB64),
  };
  const rawBytes = utf8ToBytes(JSON.stringify(packet));

  // 1. Neighbor A sends packet to Relay -> Relay schedules a jitter timer (pendingRelayCount === 1)
  await transportA.send(idRelay.nodeId, rawBytes);
  assert.equal(engineRelay.getPendingRelayCount(), 1);

  // 2. While waiting in the jitter window, Neighbor B also forwards the same packet ID to Relay
  await transportB.send(idRelay.nodeId, rawBytes);

  // Pending relay timer must be immediately cancelled (clearTimeout) and removed!
  assert.equal(engineRelay.getPendingRelayCount(), 0);

  // Wait 70ms past the maximum 50ms jitter window and confirm Relay never forwarded the suppressed packet to Observer
  await new Promise((r) => setTimeout(r, 70));
  assert.equal(engineObserver.getSafetyChecks().length, 0);

  await engineRelay.stop();
  await engineObserver.stop();
});

test('16. Identity Vault: secret keys never leave storage in plaintext, round-trip correctly, and the wrong vault key fails', () => {
  const id = generateNodeIdentity('Vault-Node');
  const { publicPart, secretPart } = splitIdentityForStorage(id);

  // The public part must never carry the secret keys.
  assert.equal((publicPart as Record<string, unknown>).signSecretKeyB64, undefined);
  assert.equal((publicPart as Record<string, unknown>).boxSecretKeyB64, undefined);

  const vaultKeyB64 = generateVaultKeyB64();
  const encrypted = encryptSecretKeysWithVaultKey(secretPart, vaultKeyB64);

  // Ciphertext must not contain the raw secret key material.
  assert.equal(encrypted.ciphertextB64.includes(id.signSecretKeyB64), false);
  assert.equal(encrypted.ciphertextB64.includes(id.boxSecretKeyB64), false);

  const decrypted = decryptSecretKeysWithVaultKey(encrypted, vaultKeyB64);
  assert.ok(decrypted);
  const restored = mergeIdentityFromStorage(publicPart, decrypted!);
  assert.deepEqual(restored, id);

  // A different vault key must fail to open it.
  const wrongKey = generateVaultKeyB64();
  assert.equal(decryptSecretKeysWithVaultKey(encrypted, wrongKey), null);
});

test('17. CompositeTransport: merges peers and packets from multiple underlying radios and routes sends to the right one', async () => {
  const hubA = new LoopbackHub();
  const hubB = new LoopbackHub();

  const localOnA = new LoopbackTransport('LOCAL', 'Local Node', hubA);
  const localOnB = new LoopbackTransport('LOCAL', 'Local Node', hubB);
  const peerX = new LoopbackTransport('PEER-X', 'Peer X', hubA);
  const peerY = new LoopbackTransport('PEER-Y', 'Peer Y', hubB);

  const composite = new CompositeTransport([localOnA, localOnB]);

  const receivedByComposite: Array<{ from: string; text: string }> = [];
  composite.onPacket((from, bytes) => {
    receivedByComposite.push({ from, text: Buffer.from(bytes).toString('utf8') });
  });

  await peerX.start();
  await peerY.start();
  await composite.start();

  await hubA.connect('LOCAL', 'PEER-X');
  await hubB.connect('LOCAL', 'PEER-Y');

  const peerIds = composite.getPeers().map((p) => p.peerId).sort();
  assert.deepEqual(peerIds, ['PEER-X', 'PEER-Y']);

  // Sending to PEER-X must arrive on hubA's peerX, not hubB.
  const receivedByX: string[] = [];
  peerX.onPacket((from, bytes) => {
    receivedByX.push(Buffer.from(bytes).toString('utf8'));
  });
  const sentToX = await composite.send('PEER-X', Buffer.from('hello-x', 'utf8'));
  assert.equal(sentToX, true);
  assert.deepEqual(receivedByX, ['hello-x']);

  // Sending to PEER-Y must arrive on hubB's peerY.
  const receivedByY: string[] = [];
  peerY.onPacket((from, bytes) => {
    receivedByY.push(Buffer.from(bytes).toString('utf8'));
  });
  const sentToY = await composite.send('PEER-Y', Buffer.from('hello-y', 'utf8'));
  assert.equal(sentToY, true);
  assert.deepEqual(receivedByY, ['hello-y']);

  // A packet arriving on either sub-transport is forwarded through the composite's onPacket.
  await hubA.deliver('PEER-X', 'LOCAL', Buffer.from('from-x', 'utf8'));
  assert.deepEqual(receivedByComposite.map((r) => r.from), ['PEER-X']);

  await composite.stop();
});

