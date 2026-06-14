import { useEffect, useRef, useCallback } from 'react';
import { useSessionStore } from '@/context/sessionStore';

// ==========================================================================
// useGlobalWs — single persistent WebSocket connection for the whole app.
// Handles auth, unread count updates, and reconnection.
// Components can subscribe to specific message types via the event system.
// ==========================================================================

const WS_URL = (import.meta.env.VITE_API_BASE_URL ?? '')
  .replace('/v1', '')
  .replace('https://', 'wss://')
  .replace('http://', 'ws://') + '/ws';

type WsHandler = (msg: Record<string, unknown>) => void;

// Global singleton so multiple components share one connection
let globalWs: WebSocket | null = null;
let globalHandlers = new Map<string, Set<WsHandler>>();
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let isConnecting = false;

function addHandler(type: string, handler: WsHandler) {
  if (!globalHandlers.has(type)) globalHandlers.set(type, new Set());
  globalHandlers.get(type)!.add(handler);
}

function removeHandler(type: string, handler: WsHandler) {
  globalHandlers.get(type)?.delete(handler);
}

function dispatch(msg: Record<string, unknown>) {
  const type = msg.type as string;
  globalHandlers.get(type)?.forEach(h => h(msg));
  globalHandlers.get('*')?.forEach(h => h(msg));
}

function send(data: Record<string, unknown>) {
  if (globalWs?.readyState === WebSocket.OPEN) {
    globalWs.send(JSON.stringify(data));
  }
}

function connect(initData: string, onUnread: (count: number) => void) {
  if (isConnecting || (globalWs && globalWs.readyState === WebSocket.OPEN)) return;
  if (!initData) return;

  isConnecting = true;
  globalWs = new WebSocket(WS_URL);

  globalWs.onopen = () => {
    isConnecting = false;
    globalWs!.send(JSON.stringify({ type: 'auth', initData }));
  };

  globalWs.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.type === 'unread_count') {
        onUnread(msg.count);
      }
      dispatch(msg);
    } catch {}
  };

  globalWs.onclose = () => {
    isConnecting = false;
    globalWs = null;
    // Reconnect after 3s
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => connect(initData, onUnread), 3000);
  };

  globalWs.onerror = () => globalWs?.close();
}

// Public API
export const wsClient = { send, addHandler, removeHandler };

export function useGlobalWs() {
  const { setTotalUnread } = useSessionStore();
  const initDataRef = useRef('');

  useEffect(() => {
    const initData = window.Telegram?.WebApp?.initData || '';
    if (!initData) return;
    initDataRef.current = initData;

    connect(initData, (count) => setTotalUnread(count));

    return () => {
      // Don't disconnect on unmount — we want a persistent connection
    };
  }, [setTotalUnread]);

  const sendMessage = useCallback((data: Record<string, unknown>) => send(data), []);

  return { send: sendMessage };
}
