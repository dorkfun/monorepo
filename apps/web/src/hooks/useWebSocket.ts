import { useEffect, useRef, useState, useCallback } from "react";

type MessageHandler = (data: unknown) => void;

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY_MS = 2000;

export function useWebSocket(url: string | null) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const handlersRef = useRef<Map<string, MessageHandler[]>>(new Map());
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intentionalCloseRef = useRef(false);
  const urlRef = useRef(url);
  urlRef.current = url;

  const connect = useCallback((targetUrl: string) => {
    const ws = new WebSocket(targetUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectAttemptsRef.current = 0;
      setConnected(true);
    };

    ws.onclose = () => {
      setConnected(false);
      if (!intentionalCloseRef.current && urlRef.current) {
        tryReconnect();
      }
    };

    ws.onerror = () => {
      // onclose will fire after onerror, which handles reconnection
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        const handlers = handlersRef.current.get(msg.type) || [];
        handlers.forEach((h) => h(msg));
        const allHandlers = handlersRef.current.get("*") || [];
        allHandlers.forEach((h) => h(msg));
      } catch {
        // Ignore parse errors
      }
    };
  }, []);

  const tryReconnect = useCallback(() => {
    if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) return;
    if (!urlRef.current) return;

    reconnectAttemptsRef.current++;
    const delay = RECONNECT_BASE_DELAY_MS * Math.pow(2, reconnectAttemptsRef.current - 1);

    reconnectTimerRef.current = setTimeout(() => {
      if (urlRef.current && !intentionalCloseRef.current) {
        connect(urlRef.current);
      }
    }, delay);
  }, [connect]);

  useEffect(() => {
    if (!url) return;

    intentionalCloseRef.current = false;
    reconnectAttemptsRef.current = 0;
    connect(url);

    return () => {
      intentionalCloseRef.current = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setConnected(false);
    };
  }, [url, connect]);

  const on = useCallback((type: string, handler: MessageHandler) => {
    if (!handlersRef.current.has(type)) {
      handlersRef.current.set(type, []);
    }
    handlersRef.current.get(type)!.push(handler);

    return () => {
      const handlers = handlersRef.current.get(type) || [];
      const idx = handlers.indexOf(handler);
      if (idx >= 0) handlers.splice(idx, 1);
    };
  }, []);

  const send = useCallback((data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  return { connected, on, send };
}
