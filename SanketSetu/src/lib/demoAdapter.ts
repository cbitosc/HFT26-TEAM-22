/**
 * Single Demo Adapter (src/lib/demoAdapter.ts)
 * -----------------------------------------------------------------------------
 * ALL Live Demo executions go through runDemo(input, scenarioId?).
 *
 * HOW TO CONNECT YOUR REAL API TOMORROW:
 * Replace the body of `runDemo(input, scenarioId)` below with your own fetch() call:
 *
 *   const res = await fetch('/api/synthesize', {
 *     method: 'POST',
 *     headers: { 'Content-Type': 'application/json' },
 *     body: JSON.stringify({ prompt: input, scenarioId }),
 *   });
 *   if (!res.ok) throw new Error(`API error: ${res.status}`);
 *   return (await res.json()) as DemoResult;
 */

import { DemoResult, selectMockResultForInput } from './demoData';

export type { DemoResult, DemoActionItem, DemoChartPoint } from './demoData';

export async function runDemo(
  input: string,
  scenarioId?: string
): Promise<DemoResult> {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('Please provide a telemetry prompt or select a scenario chip.');
  }

  // Simulated realistic reasoning latency (650ms – 950ms)
  const delayMs = 650 + (trimmed.length % 300);
  await new Promise((resolve) => setTimeout(resolve, delayMs));

  // Allow testing the error + retry flow when the user clicks the fault chip
  // or types "SIMULATE_ERROR"
  if (trimmed.toUpperCase().includes('SIMULATE_ERROR')) {
    throw new Error(
      'Upstream telemetry stream timed out (504 Gateway Fault on shard-04). Click retry to re-route via standby quorum.'
    );
  }

  return selectMockResultForInput(trimmed, scenarioId);
}
