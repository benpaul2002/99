'use client';

import { use, useEffect, useMemo, useState } from 'react';
import { useSocket } from '../../providers/SocketProvider';

export default function GamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: gameId } = use(params);
  const { socket, sendJson, clientId } = useSocket();
  const [players, setPlayers] = useState<Array<{ clientId: string; name?: string }>>([]);
  const [status, setStatus] = useState<'lobby' | 'playing' | 'finished'>('lobby');
  const [leaderClientId, setLeaderClientId] = useState<string | null>(null);

  const canStart = useMemo(() => {
    const isLeader = leaderClientId && clientId && leaderClientId === clientId;
    return status === 'lobby' && players.length >= 2 && players.length <= 10 && !!isLeader;
  }, [status, players.length, leaderClientId, clientId]);

  const leaderName = useMemo(() => {
    const leader = players.find(p => p.clientId === leaderClientId);
    return leader ? (leader.name?.trim() || leader.clientId.slice(0, 8)) : 'leader';
  }, [players, leaderClientId]);
  const isLeader = useMemo(() => {
    return !!(leaderClientId && clientId && leaderClientId === clientId);
  }, [leaderClientId, clientId]);

  useEffect(() => {
    if (!socket) return;
    const handler = (message: MessageEvent) => {
      const response = JSON.parse(message.data);
      if ((response.method === 'getGame' || response.method === 'joinGame' || response.method === 'startGame') && response.game?.id === gameId) {
        setPlayers(Array.isArray(response.game.players) ? response.game.players : []);
        if (response.game?.status) {
          setStatus(response.game.status);
        }
        if (response.game?.leaderClientId) {
          setLeaderClientId(response.game.leaderClientId);
        }
      }
    };
    socket.addEventListener('message', handler);
    // fetch current game state on mount
    sendJson({ method: 'getGame', gameId });
    return () => socket.removeEventListener('message', handler);
  }, [socket, gameId, sendJson]);

  const handleStartGame = () => {
    if (!canStart) return;
    sendJson({ method: 'startGame', gameId, clientId });
  };

  return (
    <div className="relative min-h-dvh overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/60" />
        <div className="absolute -top-40 left-1/2 h-[60rem] w-[60rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(99,102,241,0.18),rgba(16,185,129,0.06),transparent)] blur-3xl" />
      </div>

      <main className="mx-auto flex min-h-dvh max-w-4xl items-center justify-center px-6">
        <div className="w-full rounded-2xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur">
          <div className="mb-4 flex items-center justify-end">
            <code className="rounded-md bg-black/40 px-2 py-1 text-xs text-white/80">ID: {gameId}</code>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/20 p-6 text-white/70">
            {status === 'lobby' && (
              <>
                <div className="mb-4">
                  <h2 className="text-lg font-semibold text-white/90">Lobby</h2>
                </div>
                <ul className="space-y-2">
                  {players.map((p) => (
                    <li key={p.clientId} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-white/90">{p.name?.trim() || p.clientId.slice(0, 8)}</span>
                        {leaderClientId === p.clientId && (
                          <span className="text-yellow-300" title="Leader" aria-label="Leader">★</span>
                        )}
                      </div>
                    </li>
                  ))}
                  {players.length === 0 && (
                    <li className="text-sm text-white/50">No players yet.</li>
                  )}
                </ul>
                <div className="mt-6">
                  <button
                    onClick={handleStartGame}
                    disabled={!canStart}
                    className="inline-flex w-full items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-5 py-3 font-semibold text-emerald-200 ring-1 ring-inset ring-emerald-400/20 transition hover:cursor-pointer hover:scale-[1.01] hover:bg-emerald-500/15 hover:text-emerald-100 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Start Game
                  </button>
                  <p className="mt-2 text-center text-xs text-white/50">
                    {players.length < 2
                      ? 'Need at least 2 players'
                      : players.length > 10
                      ? 'Max 10 players allowed'
                      : isLeader
                      ? 'Ready to start'
                      : `Waiting for ${leaderName} to start game`}
                  </p>
                </div>
              </>
            )}
            {status === 'playing' && (
              <div className="text-sm text-white/80">Game started! (UI coming soon)</div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}


