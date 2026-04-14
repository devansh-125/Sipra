import type { RealtimeEventHandler, RealtimeEventName, RealtimeSocketClient } from '../../types/realtime.ts';

export type { RealtimeEventHandler, RealtimeSocketClient };

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
    on(eventName: RealtimeEventName, handler: RealtimeEventHandler) {
      const current = ensureSet(eventName);
      current.add(handler);

      return () => {
        current.delete(handler);
        removeIfEmpty(eventName);
      };
    },
    once(eventName: RealtimeEventName, handler: RealtimeEventHandler) {
      const wrapped: RealtimeEventHandler = (payload) => {
        this.off(eventName, wrapped);
        safeInvoke(handler, payload);
      };

      return this.on(eventName, wrapped);
    },
    off(eventName: RealtimeEventName, handler: RealtimeEventHandler) {
      const current = handlers.get(eventName);
      current?.delete(handler);
      removeIfEmpty(eventName);
    },
    offAll(eventName?: RealtimeEventName) {
      if (eventName) {
        handlers.delete(eventName);
        return;
      }

      handlers.clear();
    },
    emitLocal(eventName: RealtimeEventName, payload: unknown) {
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
    listenerCount(eventName: RealtimeEventName) {
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
