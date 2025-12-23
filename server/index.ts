import http from 'http';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { Game } from '@shared/types.js';
import { canStartGame, startGame as engineStartGame, applyPlay, eliminateChainIfNeeded, advanceToNextAlive, discardPlayerHandNotOnTop } from './game/engine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 8080;

const app = express();
const httpServer = http.createServer(app);

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

interface Client {
    id: string;
    connection: WebSocket;
}

const clients: Map<string, Client> = new Map();

const games: Map<string, Game> = new Map();
const kingChallenges: Map<string, { returnIdx: number; challengerId: string; targetId?: string }> = new Map();

function redactedGameFor(game: Game, viewerClientId: string): Game {
    // Deep-ish clone minimal fields; players array cloned with hand redaction
    return {
        id: game.id,
        leaderClientId: game.leaderClientId,
        players: game.players.map(p => {
            if (p.clientId === viewerClientId) return { ...p };
            return { ...p, hand: [] };
        }),
        discardPile: [...game.discardPile],
        drawPile: [], // do not expose draw pile contents
        currentPlayerIdx: game.currentPlayerIdx,
        score: game.score,
        status: game.status,
    };
}

httpServer.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (connection) => {
    const clientId = uuidv4();
    const client: Client = {
        id: clientId,
        connection: connection,
    };
    clients.set(client.id, client);
    console.log(`Client ${clientId} connected. Total clients: ${clients.size}`);
    
    connection.on('message', (message: RawData) => {
        try {
            const result = JSON.parse(message.toString());
            console.log('Message from client:', result);
            switch (result.method) {
                case 'createGame': {
                    const gameId = uuidv4();
                    const game: Game = {
                        id: gameId,
                        leaderClientId: result.clientId,
                        players: [],
                        discardPile: [],
                        drawPile: [],
                        currentPlayerIdx: 0,
                        score: 0,
                        status: 'lobby',
                    };
                    // Add creator as the first player
                    game.players.push({
                        clientId: result.clientId,
                        name: result.name,
                        hand: [],
                        status: 'lobby',
                    });
                    games.set(game.id, game);
                    {
                        const payLoad = {
                            method: 'createGame',
                            game: redactedGameFor(game, client.id),
                        };
                        connection.send(JSON.stringify(payLoad));
                    }
                    console.log(`Game ${gameId} created. Total games: ${games.size}`);
                    break;
                }
                case 'joinGame': {
                    const gameId = result.gameId;
                    const clientId = result.clientId;
                    const game = games.get(gameId);
                    if (game) {
                        // Prevent joining games that are already in progress or finished
                        if (game.status !== 'lobby') {
                            const payLoad = {
                                method: 'joinDenied',
                                gameId,
                                reason: game.status === 'playing' ? 'Game is already in progress' : 'Game is finished',
                            };
                            connection.send(JSON.stringify(payLoad));
                            console.log(`Client ${clientId} denied join for game ${gameId} (status=${game.status})`);
                            break;
                        }
                        const alreadyIn = game.players.some(p => p.clientId === clientId);
                        if (!alreadyIn) {
                            game.players.push({
                                clientId: clientId,
                                name: result.name,
                                hand: [],
                                status: 'lobby',
                            });
                        }
                        game.players.forEach(player => {
                            const viewerId = player.clientId;
                            const payLoad = {
                                method: 'joinGame',
                                game: redactedGameFor(game, viewerId),
                            };
                            clients.get(viewerId)?.connection.send(JSON.stringify(payLoad));
                        });
                        console.log(`Client ${clientId} joined game ${gameId}. Total players: ${game.players.length}`);
                    }
                    else {
                        console.error(`Game ${gameId} not found`);
                    }
                    break;
                }
                case 'getGame': {
                    const gameId = result.gameId;
                    const game = games.get(gameId);
                    if (!game) {
                        const payLoad = { method: 'getGame', game: null };
                        connection.send(JSON.stringify(payLoad));
                    } else {
                        const isViewerInGame = game.players.some(p => p.clientId === client.id);
                        if (!isViewerInGame && game.status !== 'lobby') {
                            // For non-members when game is not in lobby, only expose minimal info
                            const payLoad = {
                                method: 'getGame',
                                game: {
                                    id: game.id,
                                    status: game.status,
                                },
                            };
                            connection.send(JSON.stringify(payLoad));
                        } else {
                            const payLoad = {
                                method: 'getGame',
                                game: redactedGameFor(game, client.id),
                            };
                            connection.send(JSON.stringify(payLoad));
                        }
                    }
                    break;
                }
                case 'startGame': {
                    const gameId = result.gameId;
                    const game = games.get(gameId);
                    if (!game) {
                        console.error(`Game ${gameId} not found`);
                        break;
                    }
                    const numPlayers = game.players.length;
                    if (result.clientId !== game.leaderClientId) {
                        console.warn(`Client ${result.clientId} is not leader for game ${gameId}`);
                        break;
                    }
                    if (canStartGame(game)) {
                        engineStartGame(game);
                        game.players.forEach(player => {
                            const viewerId = player.clientId;
                            const payLoad = {
                                method: 'startGame',
                                game: redactedGameFor(game, viewerId),
                            };
                            clients.get(viewerId)?.connection.send(JSON.stringify(payLoad));
                        });
                        console.log(`Game ${gameId} started with ${numPlayers} players`);
                    } else {
                        console.warn(`Cannot start game ${gameId}. Status=${game.status}, Players=${numPlayers}`);
                    }
                    break;
                }
                case 'playCard': {
                    const gameId = result.gameId;
                    const game = games.get(gameId);
                    if (!game) {
                        console.error(`Game ${gameId} not found`);
                        break;
                    }
                    // If a king challenge is active and the target is playing, restrict to K or 4
                    const kstatePre = kingChallenges.get(gameId);
                    if (kstatePre && kstatePre.targetId === result.clientId) {
                        const targetIdx = game.players.findIndex(p => p.clientId === result.clientId);
                        const target = targetIdx !== -1 ? game.players[targetIdx] : undefined;
                        const card = target?.hand.find(c => c.id === result.cardId);
                        const r = card ? String(card.rank).toUpperCase() : '';
                        if (r !== 'K' && r !== '4') {
                            // eliminate target immediately
                            if (target) {
                                // move target's hand into discard (not on top) before marking dead
                                discardPlayerHandNotOnTop(game, targetIdx);
                                target.status = 'dead';
                            }
                            // restore turn to returnIdx
                            game.currentPlayerIdx = kstatePre.returnIdx;
                            // ensure alive
                            if (game.players[game.currentPlayerIdx]?.status === 'dead') {
                                advanceToNextAlive(game);
                            }
                            kingChallenges.delete(gameId);
                            // broadcast state
                            game.players.forEach(player => {
                                const viewerId = player.clientId;
                                const payLoad = {
                                    method: 'playCard',
                                    game: redactedGameFor(game, viewerId),
                                };
                                clients.get(viewerId)?.connection.send(JSON.stringify(payLoad));
                            });
                            break;
                        }
                    }
                    const playRes = applyPlay(game, result.clientId, result.cardId, {
                        aceValue: result.aceValue,
                        queenDelta: result.queenDelta,
                        fourAsZero: !!(kstatePre && kstatePre.targetId === result.clientId),
                    });
                    if (!playRes.ok) {
                        console.warn(`playCard rejected: ${playRes.reason}`);
                        break;
                    }
                    const last = game.discardPile[game.discardPile.length - 1];
                    const playedKing = last && String(last.rank).toUpperCase() === 'K';
                    let challengeJustStarted = false;
                    if (playedKing && !kstatePre) {
                        const challengerIdx = game.players.findIndex(p => p.clientId === result.clientId);
                        if (challengerIdx !== -1) {
                            // keep turn on challenger and store return index (next alive after challenger)
                            game.currentPlayerIdx = challengerIdx;
                            const returnIdx = (challengerIdx + 1) % game.players.length;
                            kingChallenges.set(gameId, { returnIdx, challengerId: result.clientId });
                            challengeJustStarted = true;
                        }
                    } else {
                        // If we are in king response and the responder just played, return turn to stored returnIdx
                        const state = kstatePre || kingChallenges.get(gameId);
                        if (state && state.targetId === result.clientId) {
                            // If responder played a King, eliminate challenger
                            const r = String(last?.rank || '').toUpperCase();
                            if (r === 'K') {
                                const chIdx = game.players.findIndex(p => p.clientId === state.challengerId);
                                if (chIdx !== -1) {
                                    // discard challenger hand and eliminate
                                    discardPlayerHandNotOnTop(game, chIdx);
                                    game.players[chIdx]!.status = 'dead';
                                }
                            }
                            game.currentPlayerIdx = state.returnIdx;
                            // ensure current points to alive player
                            if (game.players[game.currentPlayerIdx]?.status === 'dead') {
                                advanceToNextAlive(game);
                            }
                            kingChallenges.delete(gameId);
                            // After resolving king response, run elimination chain if next cannot move
                            eliminateChainIfNeeded(game);
                        }
                    }
                    // broadcast individualized state
                    game.players.forEach(player => {
                        const viewerId = player.clientId;
                        const payLoad: any = {
                            method: 'playCard',
                            game: redactedGameFor(game, viewerId),
                        };
                        // Only hint the challenger when they initiate a king challenge
                        if (challengeJustStarted && viewerId === result.clientId) {
                            payLoad.kingPlayed = true;
                        }
                        clients.get(viewerId)?.connection.send(JSON.stringify(payLoad));
                    });
                    break;
                }
                case 'kingSelectTarget': {
                    const gameId = result.gameId;
                    const game = games.get(gameId);
                    if (!game) {
                        console.error(`Game ${gameId} not found`);
                        break;
                    }
                    const state = kingChallenges.get(gameId);
                    if (!state || state.challengerId !== result.clientId) {
                        console.warn(`Invalid kingSelectTarget from ${result.clientId}`);
                        break;
                    }
                    const targetId: string = result.targetClientId;
                    const targetIdx = game.players.findIndex(p => p.clientId === targetId);
                    if (targetIdx === -1 || game.players[targetIdx]?.status === 'dead') {
                        console.warn(`Invalid king target ${targetId}`);
                        break;
                    }
                    state.targetId = targetId;
                    // If target has neither King nor 4, eliminate immediately and return turn
                    const targetHasKing = !!game.players[targetIdx]?.hand.some(c => String(c.rank).toUpperCase() === 'K');
                    const targetHasFour = !!game.players[targetIdx]?.hand.some(c => String(c.rank) === '4');
                    if (!targetHasKing && !targetHasFour) {
                        // discard target's hand (do not place on top) and eliminate
                        discardPlayerHandNotOnTop(game, targetIdx);
                        game.players[targetIdx]!.status = 'dead';
                        game.currentPlayerIdx = state.returnIdx;
                        // ensure alive
                        if (game.players[game.currentPlayerIdx]?.status === 'dead') {
                            advanceToNextAlive(game);
                        }
                        kingChallenges.delete(gameId);
                        // After instant elimination, run elimination chain if next cannot move
                        eliminateChainIfNeeded(game);
                        // broadcast update (regular state)
                        game.players.forEach(player => {
                            const viewerId = player.clientId;
                            const payLoad = {
                                method: 'playCard',
                                game: redactedGameFor(game, viewerId),
                            };
                            clients.get(viewerId)?.connection.send(JSON.stringify(payLoad));
                        });
                    } else {
                        // give target the temporary turn
                        game.currentPlayerIdx = targetIdx;
                        game.players.forEach(player => {
                            const viewerId = player.clientId;
                            const payLoad = {
                                method: 'kingTurn',
                                game: redactedGameFor(game, viewerId),
                            };
                            clients.get(viewerId)?.connection.send(JSON.stringify(payLoad));
                        });
                    }
                    break;
                }
                case 'restartGame': {
                    const gameId = result.gameId;
                    const game = games.get(gameId);
                    if (!game) {
                        console.error(`Game ${gameId} not found`);
                        break;
                    }
                    if (result.clientId !== game.leaderClientId) {
                        console.warn(`Client ${result.clientId} is not leader for restart in game ${gameId}`);
                        break;
                    }
                    // Reset game to lobby baseline
                    game.score = 0;
                    game.status = 'lobby';
                    game.currentPlayerIdx = 0;
                    game.discardPile = [];
                    game.drawPile = [];
                    game.players.forEach(p => {
                        p.status = 'lobby';
                        p.hand = [];
                    });
                    // Start immediately
                    if (canStartGame(game)) {
                        engineStartGame(game);
                        game.players.forEach(player => {
                            const viewerId = player.clientId;
                            const payLoad = {
                                method: 'startGame',
                                game: redactedGameFor(game, viewerId),
                            };
                            clients.get(viewerId)?.connection.send(JSON.stringify(payLoad));
                        });
                    } else {
                        // Not enough players; broadcast lobby state
                        game.players.forEach(player => {
                            const viewerId = player.clientId;
                            const payLoad = {
                                method: 'getGame',
                                game: redactedGameFor(game, viewerId),
                            };
                            clients.get(viewerId)?.connection.send(JSON.stringify(payLoad));
                        });
                    }
                    break;
                }
                default:
                    console.error('Unknown method:', result.method);
                    break;
                }
        } catch (error) {
            console.error('Error parsing message:', error);
        }
    });
    connection.on('close', () => {
        console.log(`Client ${client.id} disconnected. Total clients: ${clients.size}`);
        clients.delete(client.id);
        games.forEach(game => {
            const idx = game.players.findIndex(player => player.clientId === client.id);
            if (idx !== -1) {
                game.players.splice(idx, 1);
                if (game.players.length === 0) {
                    games.delete(game.id);
                }
            }
        });
    });

    const payLoad = {
        method: 'connect',
        clientId: client.id,
    };
    connection.send(JSON.stringify(payLoad));
});

wss.on('error', (error) => {
    console.error('WebSocket error:', error);
});
