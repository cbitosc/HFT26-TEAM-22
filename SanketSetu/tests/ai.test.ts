import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyEmergencyOffline } from '../src/ai/fallbackClassifier';
import {
  classifyUrgencyWithAI,
  rankAlertsWithAI,
  summarizeEmergencyText,
  translateEmergencyText,
} from '../src/ai/featherless';
import { StoredSOSAlert } from '../src/mesh/types';

// node:test has no `navigator` global, so isBrowserOnline() in src/ai/featherless.ts is false
// here by construction — every call below genuinely exercises the "offline" code path without
// needing to fake fetch or navigator.onLine.

test('19. Offline Classifier: tiers keywords correctly and always labels itself rule-based', () => {
  const critical = classifyEmergencyOffline('Person trapped and not breathing under collapsed roof');
  assert.equal(critical.level, 'CRITICAL');
  assert.equal(critical.isOfflineRuleBased, true);
  assert.ok(critical.matchedKeywords.includes('trapped'));

  const high = classifyEmergencyOffline('Elderly woman needs insulin, flood rising near rooftop');
  assert.equal(high.level, 'HIGH');

  const medium = classifyEmergencyOffline('Running low on food and blankets, need supplies');
  assert.equal(medium.level, 'MEDIUM');

  const low = classifyEmergencyOffline('Just checking in, everyone here is fine');
  assert.equal(low.level, 'LOW');
  assert.deepEqual(low.matchedKeywords, []);
});

test('20. AI client offline behavior: every Featherless function falls back without throwing', async () => {
  const config = { apiKey: '', model: 'test-model' };

  const summary = await summarizeEmergencyText('Trapped under debris, need extraction now.', config);
  assert.equal(summary.source, 'offline-fallback');
  assert.ok(summary.result.summary.length > 0);

  const urgency = await classifyUrgencyWithAI('Trapped under debris, need extraction now.', config);
  assert.equal(urgency.source, 'offline-fallback');
  assert.equal(urgency.result.level, 'CRITICAL');

  const alerts: StoredSOSAlert[] = [];
  const ranking = await rankAlertsWithAI(alerts, config);
  assert.equal(ranking.source, 'offline-fallback');
  assert.deepEqual(ranking.result.rankedAlertIds, []);

  // translateEmergencyText has no offline rule-based fallback (no local translator), so it must
  // resolve with an explicit "unavailable" source rather than throwing.
  const translation = await translateEmergencyText('Help needed', 'hi', config);
  assert.equal(translation.source, 'unavailable');
});
