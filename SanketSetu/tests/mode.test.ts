import test from 'node:test';
import assert from 'node:assert/strict';
import { demoStats } from '../src/store/demoRuntime';
import { useMeshStore } from '../src/store/useMeshStore';

// In node there is no Capacitor native platform, so REAL mode runs on NullTransport. The point of
// this test is what REAL mode must NOT do: build the simulator world or seed fixture traffic.

test('28. REAL mode constructs no SimTransport, builds no demo world and runs no seeding; data starts empty', async () => {
  const before = { ...demoStats };
  await useMeshStore.getState().setAppMode('real');
  const s = useMeshStore.getState();

  assert.equal(s.appMode, 'real');
  assert.equal(s.initialized, true);
  assert.deepEqual(demoStats, before, 'real mode must not touch the demo runtime');
  assert.equal(s.peers.length, 0, 'no peers without a radio');
  assert.equal(s.alerts.length, 0, 'no alerts');
  assert.equal(s.hazards.length, 0, 'no hazards');
  assert.equal(s.messages.length, 0, 'no messages');
  assert.equal(s.simNodes.length, 0, 'no simulated nodes registered');
  assert.equal(s.realRadioPeerCount, 0);
  assert.ok(!JSON.stringify(s.circles).includes('Ward 14'));
});

test('29. DEMO mode is the only place the simulator world and fixtures are created', async () => {
  const before = { ...demoStats };
  await useMeshStore.getState().setAppMode('demo');
  const s = useMeshStore.getState();

  assert.equal(s.appMode, 'demo');
  assert.equal(demoStats.worldsBuilt, before.worldsBuilt + 1);
  assert.equal(demoStats.seedRuns, before.seedRuns + 1);
  assert.equal(demoStats.simTransportsCreated, before.simTransportsCreated + 4); // user + 3 virtual phones
  assert.ok(s.peers.length > 0, 'demo has simulated phones');

  await useMeshStore.getState().setAppMode('real'); // leave the engine stopped and clean
  assert.equal(useMeshStore.getState().peers.length, 0, 'switching back to real drops every simulated phone');
});
