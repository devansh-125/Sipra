import { useCallback, useEffect, useMemo, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { createSocketClient, type RealtimeEventHandler } from '../services/realtime/socketClient.ts';

export type RealtimeConnectionState = 'connected' | 'reconnecting' | 'disconnected';

type UseRealtimeOptions = {
  autoConnect?: boolean;
  namespace?: string;
};

type BridgeSocket = Socket & {
  __copilotBridgeAttached?: boolean;
};

const sharedClient = createSocketClient();
let sharedSocket: Socket | null = null;

function getSocketOrigin(): string {
  const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

  try {
    return new URL(apiBase).origin;
  } catch {
    return 'http://localhost:3001';
  }
}

function getSocketUrl(namespace: string): string {
  const origin = getSocketOrigin();

  if (!namespace || namespace === '/') {
    return origin;
  }

  return `${origin}${namespace.startsWith('/') ? namespace : `/${namespace}`}`;
}

function ensureSharedSocket(namespace: string): Socket {
  if (!sharedSocket) {
    sharedSocket = io(getSocketUrl(namespace), {
      autoConnect: false,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000,
      transports: ['websocket', 'polling']
    });
  }

  return sharedSocket;
}

function attachBridge(socket: Socket): void {
  const bridgeSocket = socket as BridgeSocket;
  if (bridgeSocket.__copilotBridgeAttached) {
    return;
  }

  socket.onAny((eventName: string, payload: unknown) => {
    sharedClient.emitLocal(eventName, payload);
  });

  socket.on('connect', () => {
    sharedClient.emitLocal('socket:connect', { id: socket.id });
  });

  socket.on('disconnect', (reason) => {
    sharedClient.emitLocal('socket:disconnect', { reason });
  });

  socket.on('connect_error', (error: Error) => {
    sharedClient.emitLocal('socket:connect_error', { message: error.message });
  });

  bridgeSocket.__copilotBridgeAttached = true;
}

function parseSocketError(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'Realtime connection error';
  }

  return error.message || 'Realtime connection error';
}

export function useRealtime(options: UseRealtimeOptions = {}) {
  const { autoConnect = true, namespace = '/' } = options;

  const socket = useMemo(() => ensureSharedSocket(namespace), [namespace]);

  const [connectionState, setConnectionState] = useState<RealtimeConnectionState>(() =>
    socket.connected ? 'connected' : 'disconnected'
  );
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastEventName, setLastEventName] = useState<string | null>(null);
  const [lastEventAt, setLastEventAt] = useState<string | null>(null);

  useEffect(() => {
    attachBridge(socket);

    function onConnect() {
      setConnectionState('connected');
      setLastError(null);
    }

    function onDisconnect() {
      setConnectionState('disconnected');
    }

    function onConnectError(error: Error) {
      setConnectionState('reconnecting');
      setLastError(parseSocketError(error));
    }

    function onReconnectAttempt() {
      setConnectionState('reconnecting');
    }

    function onReconnectSuccess() {
      setConnectionState('connected');
      setLastError(null);
    }

    function onReconnectFailed() {
      setConnectionState('disconnected');
    }

    function onAnyEvent(eventName: string) {
      setLastEventName(eventName);
      setLastEventAt(new Date().toISOString());
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.onAny(onAnyEvent);

    socket.io.on('reconnect_attempt', onReconnectAttempt);
    socket.io.on('reconnect', onReconnectSuccess);
    socket.io.on('reconnect_failed', onReconnectFailed);

    if (autoConnect && !socket.connected) {
      socket.connect();
      setConnectionState('reconnecting');
    }

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.offAny(onAnyEvent);

      socket.io.off('reconnect_attempt', onReconnectAttempt);
      socket.io.off('reconnect', onReconnectSuccess);
      socket.io.off('reconnect_failed', onReconnectFailed);
    };
  }, [autoConnect, socket]);

  const on = useCallback((eventName: string, handler: RealtimeEventHandler) => {
    sharedClient.on(eventName, handler);
  }, []);

  const off = useCallback((eventName: string, handler: RealtimeEventHandler) => {
    sharedClient.off(eventName, handler);
  }, []);

  const emitLocal = useCallback((eventName: string, payload: unknown) => {
    sharedClient.emitLocal(eventName, payload);
  }, []);

  const emit = useCallback(
    (eventName: string, payload: unknown) => {
      if (!socket.connected && autoConnect) {
        socket.connect();
        setConnectionState('reconnecting');
      }

      socket.emit(eventName, payload);
    },
    [autoConnect, socket]
  );

  const connect = useCallback(() => {
    if (!socket.connected) {
      setConnectionState('reconnecting');
      socket.connect();
    }
  }, [socket]);

  const disconnect = useCallback(() => {
    socket.disconnect();
    setConnectionState('disconnected');
  }, [socket]);

  const reconnect = useCallback(() => {
    setConnectionState('reconnecting');
    socket.disconnect();
    socket.connect();
  }, [socket]);

  return {
    on,
    off,
    emitLocal,
    emit,
    connect,
    disconnect,
    reconnect,
    connectionState,
    isConnected: socket.connected,
    socketId: socket.id || null,
    transport: socket.io.engine?.transport?.name || null,
    lastEventName,
    lastEventAt,
    lastError
  };
}
