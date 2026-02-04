'use client';

import { useState, useEffect } from "react";
import type { Game } from "@shared/types";
import { useSocket } from "./providers/SocketProvider";
import { useRouter } from "next/navigation";

export default function Home() {
  const [clientId, setClientId] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [gameId, setGameId] = useState<string>('');
  const [game, setGame] = useState<Game | null>(null);
  const { socket, sendJson } = useSocket();
  const isConnected = typeof window !== 'undefined' && socket?.readyState === WebSocket.OPEN;
  const router = useRouter();

  console.log('WEB_ORIGIN=', process.env.WEB_ORIGIN);
  console.log('NEXT_PUBLIC_WS_URL=', process.env.NEXT_PUBLIC_WS_URL);
  console.log('NEXT_PUBLIC_SESSION_URL=', process.env.NEXT_PUBLIC_SESSION_URL);
  console.log('REDIS_URL=', process.env.REDIS_URL);
  console.log('NODE_ENV=', process.env.NODE_ENV);

  useEffect(() => {
    if (!socket) return;
    const handler = (message: MessageEvent) => {
      const response = JSON.parse(message.data);
      switch (response.method) {
        case 'connect':
          setClientId(response.clientId);
          break;
        case 'createGame':
          setGame(response.game);
          if (response.game?.id) {
            router.push(`/game/${response.game.id}`);
          }
          break;
        case 'joinGame':
          setGame(response.game);
          if (response.game?.id) {
            router.push(`/game/${response.game.id}`);
          }
          break;
      }
    };
    socket.addEventListener('message', handler);
    return () => {
      socket.removeEventListener('message', handler);
    };
  }, [socket, clientId, name, router, sendJson]);

  const handleCreateGame = () => {
      const payLoad = {
        method: 'createGame',
        clientId: clientId,
      name: name || 'Player',
    };
    sendJson(payLoad);
  };

  const handleJoinGame = () => {
      const payLoad = {
        method: 'joinGame',
        clientId: clientId,
        gameId: game?.id ? game.id : gameId,
      name: name || 'Player',
    };
    sendJson(payLoad);
  }


  return (
    <div className="relative min-h-dvh overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/60" />
        <div className="absolute -top-40 left-1/2 h-[60rem] w-[60rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(99,102,241,0.18),rgba(16,185,129,0.06),transparent)] blur-3xl" />
      </div>

      <main className="mx-auto flex min-h-dvh max-w-2xl items-center justify-center px-6">
        <div className="w-full rounded-2xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur">
          <div className="mb-6" />

          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 ring-1 ring-white/10 transition-all duration-150 focus-within:ring-emerald-300/30">
              <input
                type="text"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-transparent px-2 py-1 text-sm outline-none placeholder:text-white/40"
              />
      </div>
            <div>
              <button
                onClick={handleCreateGame}
                className="inline-flex w-full items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-5 py-3 font-semibold text-emerald-200 ring-1 ring-inset ring-emerald-400/20 transition hover:cursor-pointer hover:scale-[1.01] hover:bg-emerald-500/15 hover:text-emerald-100 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!isConnected || !name.trim()}
              >
                Create Game
              </button>
            </div>

            <div className="my-2 flex items-center justify-center gap-3">
              <div className="h-px w-10 sm:w-16 bg-white/10" />
              <span className="text-[10px] sm:text-xs uppercase tracking-widest text-white/40">or</span>
              <div className="h-px w-10 sm:w-16 bg-white/10" />
            </div>

            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 ring-1 ring-white/10 transition-all duration-150 focus-within:ring-emerald-300/30">
              <input
                type="text"
                placeholder="Enter Game ID"
                value={gameId}
                onChange={(e) => setGameId(e.target.value)}
                className="w-full bg-transparent px-2 py-1 text-sm outline-none placeholder:text-white/40"
              />
              <button
                onClick={handleJoinGame}
                className="inline-flex items-center justify-center rounded-lg bg-white/10 px-3 py-1.5 text-sm font-semibold text-white ring-1 ring-inset ring-white/10 transition-all duration-200 ease-out hover:-translate-y-0.5 active:translate-y-0 hover:bg-white/15 hover:shadow-lg hover:shadow-white/10 hover:cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!isConnected || !name.trim() || (!gameId && !game?.id)}
              >
                Join
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
