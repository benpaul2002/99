'use client';

import { useState, useEffect, useRef } from "react";
import { Game } from "@shared/types";

const WS_URL = 'ws://localhost:8080';

export default function Home() {
  const [clientId, setClientId] = useState<string>('');
  const [gameId, setGameId] = useState<string>('');
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
        case 'joinGame':
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

  const handleJoinGame = () => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      const payLoad = {
        method: 'joinGame',
        clientId: clientId,
        gameId: game?.id ? game.id : gameId,
      };
      ws.send(JSON.stringify(payLoad));
    }
    else {
      console.error('WebSocket not open');
    }
  }


  return (
    <div>
      Hello 99
      <div>{clientId}</div>
      <div>
        <button onClick={handleCreateGame}>Create Game</button>
      </div>
      <div>
        <input type="text" placeholder="Game ID" value={gameId} onChange={(e) => setGameId(e.target.value)} />
        <button onClick={handleJoinGame}>Join Game</button>
      </div>
      {
        (gameId || game?.id) && (
          <div>
            <div>Game ID: {gameId || game?.id}</div>
            <div>Players: {game?.players.length}</div>
            <div>
              {game?.players.map(player => (
                <div key={player.clientId}>{player.clientId}</div>
              ))}
            </div>
          </div>
        )
      }
    </div>
  );
}
