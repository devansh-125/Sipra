export type RealtimeEventHandler = (payload: unknown) => void;

export function createSocketClient() {
  const handlers = new Map<string, Set<RealtimeEventHandler>>();

  return {
    on(eventName: string, handler: RealtimeEventHandler) {
      const current = handlers.get(eventName) || new Set<RealtimeEventHandler>();
      current.add(handler);
      handlers.set(eventName, current);
    },
    off(eventName: string, handler: RealtimeEventHandler) {
      const current = handlers.get(eventName);
      current?.delete(handler);
    },
    emitLocal(eventName: string, payload: unknown) {
      handlers.get(eventName)?.forEach((handler) => handler(payload));
    }
  };
}
