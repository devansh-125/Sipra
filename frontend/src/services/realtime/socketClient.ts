export type RealtimeEventHandler = (payload: unknown) => void;

export type RealtimeSocketClient = {
  on: (eventName: string, handler: RealtimeEventHandler) => () => void;
  once: (eventName: string, handler: RealtimeEventHandler) => () => void;
  off: (eventName: string, handler: RealtimeEventHandler) => void;
  offAll: (eventName?: string) => void;
  emitLocal: (eventName: string, payload: unknown) => void;
  listenerCount: (eventName: string) => number;
  eventNames: () => string[];
  clear: () => void;
};

function safeInvoke(handler: RealtimeEventHandler, payload: unknown): void {
  try {
    handler(payload);
  } catch {
    // Swallow handler exceptions so one subscriber cannot break the event fanout.
  }
}

export function createSocketClient(): RealtimeSocketClient {
  const handlers = new Map<string, Set<RealtimeEventHandler>>();

  function ensureSet(eventName: string): Set<RealtimeEventHandler> {
    const current = handlers.get(eventName);
    if (current) {
      return current;
    }

    const next = new Set<RealtimeEventHandler>();
    handlers.set(eventName, next);
    return next;
  }

  function removeIfEmpty(eventName: string): void {
    const current = handlers.get(eventName);
    if (current && current.size === 0) {
      handlers.delete(eventName);
    }
  }

  return {
    on(eventName: string, handler: RealtimeEventHandler) {
      const current = ensureSet(eventName);
      current.add(handler);

      return () => {
        current.delete(handler);
        removeIfEmpty(eventName);
      };
    },
    once(eventName: string, handler: RealtimeEventHandler) {
      const wrapped: RealtimeEventHandler = (payload) => {
        this.off(eventName, wrapped);
        safeInvoke(handler, payload);
      };

      return this.on(eventName, wrapped);
    },
    off(eventName: string, handler: RealtimeEventHandler) {
      const current = handlers.get(eventName);
      current?.delete(handler);
      removeIfEmpty(eventName);
    },
    offAll(eventName?: string) {
      if (eventName) {
        handlers.delete(eventName);
        return;
      }

      handlers.clear();
    },
    emitLocal(eventName: string, payload: unknown) {
      const current = handlers.get(eventName);
      if (!current || current.size === 0) {
        return;
      }

      // Snapshot to avoid iteration issues when handlers unsubscribe while processing.
      const snapshot = Array.from(current);
      for (const handler of snapshot) {
        safeInvoke(handler, payload);
      }
    },
    listenerCount(eventName: string) {
      return handlers.get(eventName)?.size || 0;
    },
    eventNames() {
      return Array.from(handlers.keys());
    },
    clear() {
      handlers.clear();
    }
  };
}
