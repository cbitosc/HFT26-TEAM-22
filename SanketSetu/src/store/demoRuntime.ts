/**
 * Demo-only runtime (src/store/demoRuntime.ts). This is the ONLY module that constructs SimTransport
 * nodes or seeds fixture traffic (RELAY-B/C, MEDIC-D, the flood SOS, the hazard, the circle
 * check-in). REAL mode never imports it, and `demoStats` lets tests prove that.
 */

import { generateNodeIdentity, NodeIdentity } from '../crypto/identity';
import {
  issueResponderCertificate,
  ResponderCertificate,
} from '../crypto/responderCert';
import { MeshEngine } from '../mesh/engine';
import { SimNetworkController, SimTransport } from '../transport/SimTransport';

export interface VirtualPeerInstance {
  identity: NodeIdentity;
  transport: SimTransport;
  engine: MeshEngine;
}

/** Counters used by tests to assert REAL mode never touches the simulator. */
export const demoStats = { simTransportsCreated: 0, worldsBuilt: 0, seedRuns: 0 };

export function createSimTransport(
  nodeId: string,
  displayName: string,
  controller: SimNetworkController,
  x: number,
  y: number
): SimTransport {
  demoStats.simTransportsCreated += 1;
  return new SimTransport(nodeId, displayName, controller, x, y);
}

const VIRTUAL_SPECS = [
  { name: 'RELAY-B (North Ridge)', x: 360, y: 220, battery: 82, isVerifiedMedic: false },
  { name: 'RELAY-C (Bridge Post)', x: 590, y: 350, battery: 64, isVerifiedMedic: false },
  { name: 'MEDIC-D (Field Base)', x: 820, y: 240, battery: 91, isVerifiedMedic: true },
] as const;

/** Builds the user's simulated transport plus three simulated phones in a line (A-B-C-D). */
export function buildDemoWorld(
  userIdentity: NodeIdentity,
  controller: SimNetworkController
): { userTransport: SimTransport; virtuals: VirtualPeerInstance[] } {
  demoStats.worldsBuilt += 1;
  // Radio range 290: A-B, B-C and C-D are in range; A-C and A-D are not (so messages must hop).
  controller.setRadioRange(290);
  const userTransport = createSimTransport(userIdentity.nodeId, userIdentity.displayName, controller, 130, 300);

  const virtuals: VirtualPeerInstance[] = VIRTUAL_SPECS.map((spec) => {
    const identity = generateNodeIdentity(spec.name);
    const transport = createSimTransport(identity.nodeId, identity.displayName, controller, spec.x, spec.y);
    const cert: ResponderCertificate | null = spec.isVerifiedMedic
      ? issueResponderCertificate({
          subjectNodeId: identity.nodeId,
          subjectSignPubB64: identity.signPublicKeyB64,
          subjectDisplayName: identity.displayName,
          role: 'NDRF_MEDIC',
          organizationName: 'NDRF Field Medical Unit 04 (DEMO AUTHORITY)',
        })
      : null;
    const engine = new MeshEngine({
      identity,
      transport,
      responderCert: cert,
      relayJitterMs: 15,
      initialBatteryPct: spec.battery,
    });
    return { identity, transport, engine };
  });
  return { userTransport, virtuals };
}

/** Lets the simulated phones know each other's keys so the demo can message 3 hops away at once. */
export function crossRegisterDemoContacts(local: MeshEngine, virtuals: VirtualPeerInstance[]): void {
  const all = [local, ...virtuals.map((v) => v.engine)];
  for (const a of all) {
    for (const b of all) {
      if (a.identity.nodeId === b.identity.nodeId) continue;
      a.registerContactPublicKey(
        b.identity.nodeId,
        b.identity.displayName,
        b.identity.signPublicKeyB64,
        b.identity.boxPublicKeyB64,
        b.identity.displayName.startsWith('MEDIC-D')
      );
    }
  }
}

/** Fixture traffic for the demo only: a DM, a flood SOS with a responder ack, a hazard, a check-in. */
export async function seedDemoTraffic(
  userIdentity: NodeIdentity,
  virtuals: VirtualPeerInstance[]
): Promise<void> {
  demoStats.seedRuns += 1;
  const [relayB, relayC, medicD] = virtuals;
  if (!relayB || !relayC || !medicD) return;
  await medicD.engine.sendDirectMessage(
    userIdentity.nodeId,
    'Field Base D online. Multi-hop route via Relay-C and Relay-B verified with Ed25519.',
    2
  );
  const sos = await relayC.engine.broadcastSOS({
    category: 'flood',
    text: 'Water rising at Sector 4 Bridge Post. 3 civilians awaiting high-clearance extraction.',
    headcount: 3,
    locationPrecision: 'precise',
    lat: 12.97159,
    lng: 77.59456,
    pictogramId: 'trapped_flood',
  });
  await medicD.engine.sendSosAck(sos.id, 'RESPONDING', 'NDRF Zodiac boat dispatched from Field Base D — ETA 11 mins.');
  await relayB.engine.broadcastHazardReport({
    category: 'flood',
    title: 'Submerged Causeway — North Ridge',
    description: '1.4m fast-moving water over NH-48 underpass. Impassable for wheeled vehicles.',
    lat: 12.9742,
    lng: 77.5918,
    ttlMinutes: 180,
  });
  await medicD.engine.broadcastSafetyCheck({
    circleId: 'circle-demo-family',
    circleName: 'Demo family circle',
    status: 'SAFE',
    note: 'Stationed at high-ground relief camp, generator running.',
  });
}
