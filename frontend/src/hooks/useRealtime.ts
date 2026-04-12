import { useMemo } from 'react';
import { createSocketClient } from '../services/realtime/socketClient.ts';

export function useRealtime() {
  return useMemo(() => createSocketClient(), []);
}
