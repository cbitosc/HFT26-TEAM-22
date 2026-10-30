import { useEffect, useState } from 'react';

/**
 * Shared Scenario Store (src/lib/scenarioStore.ts)
 * -----------------------------------------------------------------------------
 * Synchronizes the active scenario selection between the 06 USE CASES
 * (3D Spiral / List gallery) section and the 07 LIVE DEMO section.
 * Also coordinates the one-click "run in live demo" auto-execution handoff.
 */

export interface ScenarioStoreState {
  selectedScenarioId: string;
  pendingAutoRun: boolean;
  autoRunTimestamp: number;
}

const state: ScenarioStoreState = {
  selectedScenarioId: 'incident-triage',
  pendingAutoRun: false,
  autoRunTimestamp: 0,
};

type Listener = () => void;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((fn) => fn());
}

export function getScenarioStore(): ScenarioStoreState {
  return state;
}

export function setSelectedScenario(
  scenarioId: string,
  options?: { triggerAutoRun?: boolean }
): void {
  const triggerAutoRun = Boolean(options?.triggerAutoRun);
  const changed =
    state.selectedScenarioId !== scenarioId ||
    state.pendingAutoRun !== triggerAutoRun ||
    triggerAutoRun;

  state.selectedScenarioId = scenarioId;
  if (triggerAutoRun) {
    state.pendingAutoRun = true;
    state.autoRunTimestamp = Date.now();
  }
  if (changed) {
    emit();
  }
}

export function consumePendingAutoRun(): boolean {
  if (!state.pendingAutoRun) return false;
  state.pendingAutoRun = false;
  emit();
  return true;
}

export function subscribeScenarioStore(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useScenarioStore(): ScenarioStoreState {
  const [snapshot, setSnapshot] = useState<ScenarioStoreState>(() => ({
    ...state,
  }));

  useEffect(() => {
    return subscribeScenarioStore(() => {
      setSnapshot({ ...state });
    });
  }, []);

  return snapshot;
}
