import { demoApi } from '../services/demo/demoApi.ts';

export function useDemoControls() {
  return {
    runSeed: demoApi.seed,
    runGodMode: demoApi.godMode,
    runReset: demoApi.reset
  };
}
