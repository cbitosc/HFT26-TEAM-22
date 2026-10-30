import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getSceneWeights,
  computeSpiralCardTransform,
  computeHeroUnfoldState,
  dampValue,
  resolveInitialTheme,
  readCssThemePalette,
  computeOrbGuideState,
  getSectionTintHex,
} from './scroll';
import { selectMockResultForInput } from './demoData';
import { SECTION_REGISTRY, PRODUCT_SCENARIOS, siteContent } from '../content';
import {
  getScenarioStore,
  setSelectedScenario,
  consumePendingAutoRun,
} from './scenarioStore';

test('SECTION_REGISTRY defines the exact 8-section product story order and syncs nav & counter', () => {
  assert.equal(SECTION_REGISTRY.length, 8);
  assert.equal(siteContent.chrome.totalSectionsCount, '08');
  assert.deepEqual(
    SECTION_REGISTRY.map((s) => `${s.counterIndex} ${s.sectionName}`),
    [
      '01 home',
      '02 problem',
      '03 how it works',
      '04 intelligence',
      '05 technology',
      '06 use cases',
      '07 live demo',
      '08 finale',
    ]
  );

  // Floating top nav has USE CASES between TECHNOLOGY and LIVE DEMO
  const navLabels = siteContent.nav.items.map((n) => n.label);
  const techIdx = navLabels.indexOf('TECHNOLOGY');
  const useCasesIdx = navLabels.indexOf('USE CASES');
  const demoIdx = navLabels.indexOf('LIVE DEMO');
  assert.ok(techIdx >= 0 && useCasesIdx === techIdx + 1 && demoIdx === useCasesIdx + 1);
});

test('PRODUCT_SCENARIOS defines 8 product scenarios with zero portfolio leftovers', () => {
  assert.equal(PRODUCT_SCENARIOS.length, 8);
  for (const sc of PRODUCT_SCENARIOS) {
    assert.ok(sc.summary.length <= 110, `Scenario ${sc.id} summary exceeds 110 chars`);
    assert.ok(sc.sampleInput.length > 20);
  }

  const serialized = JSON.stringify(siteContent).toLowerCase();
  assert.equal(serialized.includes('selected works'), false);
  assert.equal(serialized.includes('teenage lab'), false);
  assert.equal(serialized.includes('kinetix'), false);
  assert.equal(serialized.includes('showreel'), false);
});

test('getSceneWeights maps scroll progress 0..1 across all 5 active scenes and 4 story beats', () => {
  const s1 = getSceneWeights(0.05);
  assert.equal(s1.activeScene, 1);
  assert.ok(s1.scene1Orb > 0.9);

  const s2 = getSceneWeights(0.30);
  assert.equal(s2.activeScene, 2);
  assert.ok(s2.scene2Spiral > 0.9);

  const s3Beat0 = getSceneWeights(0.50);
  assert.equal(s3Beat0.activeScene, 3);
  assert.equal(s3Beat0.heroBeatIndex, 0);

  const s3Beat3 = getSceneWeights(0.70);
  assert.equal(s3Beat3.activeScene, 3);
  assert.equal(s3Beat3.heroBeatIndex, 3);

  const s4 = getSceneWeights(0.80);
  assert.equal(s4.activeScene, 4);
  assert.ok(s4.scene4Stats > 0.8);

  const s5 = getSceneWeights(0.95);
  assert.equal(s5.activeScene, 5);
  assert.ok(s5.scene5Outro > 0.9);
});

test('computeSpiralCardTransform keeps front face oriented toward camera and interpolates spiral <-> list', () => {
  const spiralMode = computeSpiralCardTransform(0, 8, 0, 0);
  assert.equal(spiralMode.bend, 0.16);
  assert.equal(spiralMode.x, 0);
  assert.ok(spiralMode.backAlpha > 0.9);

  // Even for cards around the back of the helix, rotY remains front-facing (|rotY| < 0.5 rad)
  for (let i = 0; i < 8; i++) {
    const t = computeSpiralCardTransform(i, 8, 0.25, 0);
    assert.ok(Math.abs(t.rotY) < 0.5, `rotY ${t.rotY} should stay front-facing`);
  }

  const listMode = computeSpiralCardTransform(0, 8, 0, 1);
  assert.equal(listMode.bend, 0);
  assert.equal(listMode.x, -1.65);
});

test('computeHeroUnfoldState opens hinge angle as local progress advances', () => {
  const closed = computeHeroUnfoldState(0);
  assert.equal(closed.hingeAngleRad, 0);
  assert.ok(closed.entryY > 2);

  const opened = computeHeroUnfoldState(0.9);
  assert.ok(opened.hingeAngleRad > 1.9);
  assert.equal(opened.entryY, 0);
});

test('dampValue smoothly approaches target without overshooting', () => {
  const next = dampValue(0, 10, 8, 0.016);
  assert.ok(next > 0 && next < 10);
});

test('resolveInitialTheme and readCssThemePalette default to warm off-white light theme tokens', () => {
  assert.equal(resolveInitialTheme(), 'light');
  const palette = readCssThemePalette();
  assert.equal(palette.bg, '#F6F4EF');
  assert.equal(palette.fg, '#0B0B0B');
  assert.equal(palette.green, '#C6FF3D');
  assert.equal(palette.lilac, '#B79CFF');
  assert.equal(palette.blue, '#2D5BFF');
  assert.equal(palette.coral, '#FF6A4D');
});

test('computeOrbGuideState updates position, scale, ringSpeed, and expression per section including use-cases corner-small', () => {
  const homeGuide = computeOrbGuideState('home', 0, 0, 'idle', false);
  assert.equal(homeGuide.expression, 'neutral');
  assert.equal(homeGuide.x, 0);

  const problemGuide = computeOrbGuideState('problem', 0, 0, 'idle', false);
  assert.equal(problemGuide.expression, 'worried');
  assert.ok(problemGuide.x > 1);

  const useCasesGuide = computeOrbGuideState('use-cases', 0, 0, 'idle', false);
  assert.equal(useCasesGuide.expression, 'happy');
  assert.ok(useCasesGuide.x > 2.5 && useCasesGuide.y > 1.2 && useCasesGuide.scale <= 0.25);

  const demoRunning = computeOrbGuideState('live-demo', 0, 0, 'running', false);
  assert.equal(demoRunning.expression, 'thinking');
  assert.ok(demoRunning.ringSpeed >= 3.5);

  const demoSuccess = computeOrbGuideState('live-demo', 0, 0, 'success', false);
  assert.equal(demoSuccess.expression, 'happy');
});

test('getSectionTintHex returns harmonious tints in light mode and #0A0A0A in outro', () => {
  assert.equal(getSectionTintHex('home', 'light'), '#F6F4EF');
  assert.equal(getSectionTintHex('problem', 'light'), '#F2EEFA');
  assert.equal(getSectionTintHex('how-it-works', 'light'), '#F1F6E6');
  assert.equal(getSectionTintHex('use-cases', 'light'), '#F6F4EF');
  assert.equal(getSectionTintHex('outro', 'light'), '#0A0A0A');
});

test('selectMockResultForInput and scenarioStore synchronize all 8 product scenarios', () => {
  for (const sc of PRODUCT_SCENARIOS) {
    const res = selectMockResultForInput(sc.sampleInput, sc.id);
    assert.ok(res.score >= 94);
    assert.equal(res.meta.scenarioId, sc.id);
  }

  setSelectedScenario('fraud-screening', { triggerAutoRun: true });
  assert.equal(getScenarioStore().selectedScenarioId, 'fraud-screening');
  assert.equal(getScenarioStore().pendingAutoRun, true);
  assert.equal(consumePendingAutoRun(), true);
  assert.equal(getScenarioStore().pendingAutoRun, false);
});
