'use client';

import { useState, useEffect, useRef } from "react";
import { Game } from "@shared/types";

const WS_URL = 'ws://localhost:8080';

export default function Home() {
  const [clientId, setClientId] = useState<string>('');
  const [game, setGame] = useState<Game | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onmessage = (message) => {
      const response = JSON.parse(message.data);
      switch (response.method) {
        case 'connect':
          setClientId(response.clientId);
          break;
        case 'createGame':
          setGame(response.game);
          break;
      }
    };

    return () => ws.close();
  }, []);

  const handleCreateGame = () => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      const payLoad = {
        method: 'createGame',
        clientId: clientId,
      };
      ws.send(JSON.stringify(payLoad));
    }
    else {
      console.error('WebSocket not open');
    }
  };

  return (
    <div>
      Hello 99
      <div>{clientId}</div>
      <div>
        <button onClick={handleCreateGame}>Create Game</button>
      </div>
      <div>{game?.id}</div>
    </div>
  );
}
