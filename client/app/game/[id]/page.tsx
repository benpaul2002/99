'use client';

import { use, useEffect, useMemo, useState } from 'react';
import { useSocket } from '../../providers/SocketProvider';
import { Hand } from '../../components/Hand';
import type { Card as CardType } from '@shared/types';
import { Card } from '../../components/Card';

export default function GamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: gameId } = use(params);
  const { socket, sendJson, clientId } = useSocket();
  type UIPlayer = { clientId: string; name?: string; status?: 'lobby' | 'playing' | 'dead' };
  const [players, setPlayers] = useState<UIPlayer[]>([]);
  const [status, setStatus] = useState<'lobby' | 'playing' | 'finished'>('lobby');
  const [leaderClientId, setLeaderClientId] = useState<string | null>(null);
  const [myHand, setMyHand] = useState<CardType[]>([]);
  const [score, setScore] = useState<number>(0);
  const [lastCard, setLastCard] = useState<CardType | null>(null);
  const [choiceModal, setChoiceModal] = useState<{
    card: CardType;
    type: 'ace' | 'queen';
  } | null>(null);
  const [currentPlayerIdx, setCurrentPlayerIdx] = useState<number>(0);
  const isMyTurn = useMemo(() => {
    const current = players[currentPlayerIdx];
    return !!current && current.clientId === clientId;
  }, [players, currentPlayerIdx, clientId]);

  const getCardOptionDeltas = (card: CardType): number[] => {
    const r = String(card.rank).toUpperCase();
    if (r === 'A') return [1, 11];
    if (r === 'Q') return [-20, 20];
    if (r === 'J') return [0];
    if (r === 'K') return [0];
    const n = parseInt(r, 10);
    return Number.isFinite(n) ? [n] : [0];
  };

  const isOptionValid = (delta: number): boolean => {
    if (delta === -20 && score < 20) return false;
    return score + delta <= 99;
  };

  const isCardPlayable = (card: CardType): boolean => {
    const deltas = getCardOptionDeltas(card);
    return deltas.some(isOptionValid);
  };

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
      if ((response.method === 'getGame' || response.method === 'joinGame' || response.method === 'startGame' || response.method === 'playCard') && response.game?.id === gameId) {
        setPlayers(Array.isArray(response.game.players) ? response.game.players : []);
        if (response.game?.status) {
          setStatus(response.game.status);
        }
        if (response.game?.leaderClientId) {
          setLeaderClientId(response.game.leaderClientId);
        }
        if (clientId && Array.isArray(response.game?.players)) {
          const me = response.game.players.find((p: any) => p.clientId === clientId);
          if (me?.hand) setMyHand(me.hand as CardType[]);
        }
        if (typeof response.game?.score === 'number') {
          setScore(response.game.score);
        }
        if (typeof response.game?.currentPlayerIdx === 'number') {
          setCurrentPlayerIdx(response.game.currentPlayerIdx);
        }
        if (Array.isArray(response.game?.discardPile) && response.game.discardPile.length > 0) {
          setLastCard(response.game.discardPile[response.game.discardPile.length - 1] as CardType);
        } else {
          setLastCard(null);
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
    <>
    <div className="relative min-h-dvh overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/60" />
        <div className="absolute -top-40 left-1/2 h-[60rem] w-[60rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(99,102,241,0.18),rgba(16,185,129,0.06),transparent)] blur-3xl" />
      </div>

      <main className="mx-auto flex min-h-dvh w-full max-w-7xl flex-col px-6 text-white/80">
        <div className="mb-4 flex items-center justify-between pt-6">
          <div />
          <code className="rounded-md bg-black/40 px-2 py-1 text-xs text-white/80">ID: {gameId}</code>
        </div>

        <div className="flex-1 rounded-xl border border-white/10 bg-black/20 p-6 text-white/80">
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
              <div className="grid min-h-[75vh] grid-rows-[auto_1fr_auto] gap-4">
                <div className="mt-2 text-center text-2xl font-bold text-white/90">
                  Score: {score}
                </div>
                <div className="flex items-center justify-center">
                  {lastCard ? (
                    <div className="flex flex-col items-center gap-3">
                      <div className="text-xs text-white/60">Last played</div>
                      <Card card={lastCard} size="lg" />
                    </div>
                  ) : (
                    <div className="text-sm text-white/50">No cards played yet</div>
                  )}
                </div>
                <div className="border-t border-white/10 pt-4">
                  <div className="mb-2 text-sm text-white/70">Your hand</div>
                  <Hand
                    cards={myHand}
                    size="md"
                    scale={isMyTurn ? 1.25 : 1}
                    origin={isMyTurn ? 'bottom' : 'top'}
                    offsetY={28}
                    isDisabled={(card) => (isMyTurn ? !isCardPlayable(card) : false)}
                    onCardClick={
                      isMyTurn
                        ? (card) => {
                            const rank = card.rank.toUpperCase();
                            if (rank === 'A') {
                              setChoiceModal({ card, type: 'ace' });
                              return;
                            }
                            if (rank === 'Q') {
                              setChoiceModal({ card, type: 'queen' });
                              return;
                            }
                            sendJson({
                              method: 'playCard',
                              gameId,
                              clientId,
                              cardId: card.id,
                            });
                          }
                        : undefined
                    }
                  />
                </div>
              </div>
            )}
            {status === 'finished' && (
              <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 text-center">
                <div className="text-3xl font-extrabold text-white/90">
                  Winner:{' '}
                  <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">
                    {(players.find(p => p.status !== 'dead')?.name?.trim()) || players.find(p => p.status !== 'dead')?.clientId.slice(0,8) || '—'}
                  </span>
                </div>
                <div className="text-white/60">Final score: {score}</div>
                <div className="mt-2">
                  <button
                    className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-6 py-3 font-semibold text-emerald-200 ring-1 ring-inset ring-emerald-400/20 transition hover:bg-emerald-500/15 disabled:opacity-40 disabled:cursor-not-allowed"
                    onClick={() => {
                      if (clientId && gameId) {
                        sendJson({ method: 'restartGame', clientId, gameId });
                      }
                    }}
                    disabled={clientId !== leaderClientId}
                    title={clientId === leaderClientId ? 'Start again' : `Waiting for ${leaderName} to start again`}
                  >
                    Start Game Again
                  </button>
                </div>
              </div>
            )}
          </div>
      </main>
    </div>
    {choiceModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
        <div className="w-full max-w-sm rounded-xl border border-white/10 bg-white/10 p-4 text-white/90 backdrop-blur">
          <div className="mb-3 text-center text-sm text-white/70">
            {choiceModal.type === 'ace' ? 'Play Ace as:' : 'Play Queen as:'}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {choiceModal.type === 'ace' ? (
              <>
                <button
                  className="rounded-lg border border-white/10 px-3 py-2 text-center hover:bg-white/15 disabled:opacity-40 disabled:cursor-not-allowed bg-white/10"
                  disabled={!isOptionValid(1)}
                  onClick={() => {
                    if (!isOptionValid(1)) return;
                    sendJson({ method: 'playCard', gameId, clientId, cardId: choiceModal.card.id, aceValue: 1 });
                    setChoiceModal(null);
                  }}
                >
                  1
                </button>
                <button
                  className="rounded-lg border border-white/10 px-3 py-2 text-center hover:bg-white/15 disabled:opacity-40 disabled:cursor-not-allowed bg-white/10"
                  disabled={!isOptionValid(11)}
                  onClick={() => {
                    if (!isOptionValid(11)) return;
                    sendJson({ method: 'playCard', gameId, clientId, cardId: choiceModal.card.id, aceValue: 11 });
                    setChoiceModal(null);
                  }}
                >
                  11
                </button>
              </>
            ) : (
              <>
                <button
                  className="rounded-lg border border-white/10 px-3 py-2 text-center hover:bg-white/15 disabled:opacity-40 disabled:cursor-not-allowed bg-white/10"
                  disabled={!isOptionValid(-20)}
                  onClick={() => {
                    if (!isOptionValid(-20)) return;
                    sendJson({ method: 'playCard', gameId, clientId, cardId: choiceModal.card.id, queenDelta: -20 });
                    setChoiceModal(null);
                  }}
                >
                  -20
                </button>
                <button
                  className="rounded-lg border border-white/10 px-3 py-2 text-center hover:bg-white/15 disabled:opacity-40 disabled:cursor-not-allowed bg-white/10"
                  disabled={!isOptionValid(20)}
                  onClick={() => {
                    if (!isOptionValid(20)) return;
                    sendJson({ method: 'playCard', gameId, clientId, cardId: choiceModal.card.id, queenDelta: 20 });
                    setChoiceModal(null);
                  }}
                >
                  +20
                </button>
              </>
            )}
          </div>
          <div className="mt-4 text-center">
            <button
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60 hover:bg-white/10"
              onClick={() => setChoiceModal(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    )}
    {/* Players list sidebar (outside main game box) */}
    <aside className="pointer-events-auto fixed right-6 top-28 z-40 w-64 rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="mb-3 text-sm font-semibold text-white/80">Players</div>
      <ul className="space-y-2">
        {players.map((p, idx) => {
          const isTurn = idx === currentPlayerIdx;
          const isLeader = p.clientId === leaderClientId;
          return (
            <li key={p.clientId} className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-2">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${isTurn ? 'bg-emerald-400' : 'bg-white/30'}`} />
                <span className="text-white/90">{p.name?.trim() || p.clientId.slice(0, 8)}</span>
                {isLeader && <span className="text-yellow-300" title="Leader" aria-label="Leader">★</span>}
              </div>
              {isTurn && <span className="text-xs text-emerald-300">Turn</span>}
            </li>
          );
        })}
      </ul>
    </aside>
    </>
  );
}


