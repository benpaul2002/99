'use client';

import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';

type SocketContextValue = {
  socket: WebSocket | null;
  sendJson: (payload: unknown) => void;
  clientId: string | null;
};

const SocketContext = createContext<SocketContextValue | undefined>(undefined);

const WS_URL = 'ws://localhost:8080';

export function SocketProvider({ children }: { children: ReactNode }) {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    setSocket(ws);
    const onMessage = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (data?.method === 'connect' && typeof data.clientId === 'string') {
          setClientId(data.clientId);
        }
      } catch {}
    };
    ws.addEventListener('message', onMessage);
    return () => {
      ws.removeEventListener('message', onMessage);
      ws.close();
    };
  }, []);

  const sendJson = (payload: unknown) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    } else {
      console.error('WebSocket not open');
    }
  };

  return (
    <SocketContext.Provider value={{ socket, sendJson, clientId }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) {
    throw new Error('useSocket must be used within SocketProvider');
  }
  return ctx;
}


