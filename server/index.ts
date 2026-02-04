import 'dotenv/config';
import http from 'http';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import express, { Request, Response } from 'express';
import path from 'path';
import type { Game } from '@shared/types.js';
import { canStartGame, startGame as engineStartGame, applyPlay, eliminateChainIfNeeded, advanceToNextAlive, discardPlayerHandNotOnTop } from './game/engine.js';
import { loadGame, saveGame, loadKingChallenge, saveKingChallenge, deleteKingChallenge, markClientAbsent, clearClientAbsence, reapExpiredAbsences } from './redis.js';

const PORT = Number(process.env.PORT) || 8080;

const app = express();
const httpServer = http.createServer(app);

function ensureSidCookie(req: Request, res: Response): string {
	const cookie = req.headers.cookie ?? '';
	const map = Object.fromEntries(
		cookie.split(';').map(p => p.trim()).filter(Boolean).map(p => {
			const i = p.indexOf('=');
			return i === -1 ? [p, ''] : [p.slice(0, i), decodeURIComponent(p.slice(i + 1))];
		})
	);
	let sid = map.sid;
	if (!sid) {
		sid = uuidv4();
		const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
		res.setHeader('Set-Cookie', `sid=${encodeURIComponent(sid)}; Path=/; HttpOnly; SameSite=Lax${secure}`);
	}
	return sid;
}

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://localhost:3000';

app.get('/', (req: Request, res: Response) => {
    res.redirect(WEB_ORIGIN);
});

app.get('/session', (req: Request, res: Response) => {
    res.setHeader('Access-Control-Allow-Origin', WEB_ORIGIN);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    ensureSidCookie(req, res);
    res.status(204).end();
  });

app.options('/session', (req: Request, res: Response) => {
    res.setHeader('Access-Control-Allow-Origin', WEB_ORIGIN);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'content-type');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.status(204).end();
});

interface Client {
    id: string;
    connection: WebSocket;
}

const clients: Map<string, Client> = new Map();

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

httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Listening on 0.0.0.0:${PORT}`);
});

const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (connection, request) => {
    const cookie = request.headers.cookie ?? '';
    const map = Object.fromEntries(
        cookie.split(';').map(p => p.trim()).filter(Boolean).map(p => {
            const i = p.indexOf('=');
            return i === -1 ? [p, ''] : [p.slice(0, i), decodeURIComponent(p.slice(i + 1))];
        })
    );
    const sid = map.sid;

    const clientId = sid || uuidv4();
    console.log('WS connect sid=', sid, 'clientId=', clientId);
    const client: Client = {
        id: clientId,
        connection: connection,
    };
    clients.set(client.id, client);
    console.log(`Client ${clientId} connected. Total clients: ${clients.size}`);
    
    connection.on('message', async (message: RawData) => {
        try {
            const result = JSON.parse(message.toString());
            console.log('Message from client:', result);
            switch (result.method) {
                case 'createGame': {
                    const gameId = uuidv4();
                    const game: Game = {
                        id: gameId,
                        leaderClientId: client.id,
                        players: [],
                        discardPile: [],
                        drawPile: [],
                        currentPlayerIdx: 0,
                        score: 0,
                        status: 'lobby',
                    };
                    // Add creator as the first player
                    game.players.push({
                        clientId: client.id,
                        name: result.name,
                        hand: [],
                        status: 'lobby',
                    });
                    await saveGame(game);
                    console.log(`Game ${gameId} created.`);
                    const payLoad = {
                        method: 'createGame', 
                        game: redactedGameFor(game, client.id),
                    };
                    connection.send(JSON.stringify(payLoad));
                    break;
                }
                case 'joinGame': {
                    const gameId = result.gameId;
                    const clientId = client.id;
                    const game = await loadGame(gameId);
                    if (game) {
                        const reaped = await reapExpiredAbsences(game);
                        if (reaped) {
                            await saveGame(game);
                        }
                        // Prevent joining games that are already in progress or finished
                        const alreadyIn = game.players.some(p => p.clientId === clientId);
                        console.log('joinGame', { gameId, clientId, status: game.status, alreadyIn, players: game.players.map(p=>p.clientId) });
                        if (game.status !== 'lobby' && !alreadyIn) {
                            const payLoad = {
                                method: 'joinDenied',
                                gameId,
                                reason: game.status === 'playing' ? 'Game is already in progress' : 'Game is finished',
                            };
                            connection.send(JSON.stringify(payLoad));
                            console.log(`Client ${clientId} denied join for game ${gameId} (status=${game.status})`);
                            break;
                        }
                        if (!alreadyIn) {
                            game.players.push({
                                clientId: client.id,
                                name: result.name,
                                hand: [],
                                status: 'lobby',
                            });
                        }
                        await clearClientAbsence(gameId, clientId);
                        await saveGame(game);
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
                    const game = await loadGame(gameId);
                    if (!game) {
                        const payLoad = { method: 'getGame', game: null };
                        connection.send(JSON.stringify(payLoad));
                    } else {
                        const reaped = await reapExpiredAbsences(game);
                        if (reaped) {
                            await saveGame(game);
                        }
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
                    const game = await loadGame(gameId);
                    if (!game) {
                        console.error(`Game ${gameId} not found`);
                        break;
                    }
                    const reaped = await reapExpiredAbsences(game);
                    if (reaped) {
                        await saveGame(game);
                    }
                    const numPlayers = game.players.length;
                    if (client.id !== game.leaderClientId) {
                        console.warn(`Client ${result.clientId} is not leader for game ${gameId}`);
                        break;
                    }
                    if (canStartGame(game)) {
                        engineStartGame(game);
                        await saveGame(game);
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
                    const game = await loadGame(gameId);
                    if (!game) {
                        console.error(`Game ${gameId} not found`);
                        break;
                    }
                    const reaped = await reapExpiredAbsences(game);
                    if (reaped) {
                        await saveGame(game);
                    }
                    // If a king challenge is active and the target is playing, restrict to K or 4
                    const kstatePre = await loadKingChallenge(gameId);
                    if (kstatePre && kstatePre.targetId === client.id) {
                        const targetIdx = game.players.findIndex(p => p.clientId === client.id);
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
                            await deleteKingChallenge(gameId);

                            await saveGame(game);
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
                    const playRes = applyPlay(game, client.id, result.cardId, {
                        aceValue: result.aceValue,
                        queenDelta: result.queenDelta,
                        fourAsZero: !!(kstatePre && kstatePre.targetId === client.id),
                    });
                    if (!playRes.ok) {
                        console.warn(`playCard rejected: ${playRes.reason}`);
                        break;
                    }
                    const last = game.discardPile[game.discardPile.length - 1];
                    const playedKing = last && String(last.rank).toUpperCase() === 'K';
                    let challengeJustStarted = false;
                    if (playedKing && !kstatePre) {
                        const challengerIdx = game.players.findIndex(p => p.clientId === client.id);
                        if (challengerIdx !== -1) {
                            // keep turn on challenger and store return index (next alive after challenger)
                            game.currentPlayerIdx = challengerIdx;
                            const returnIdx = (challengerIdx + 1) % game.players.length;
                            await saveKingChallenge(gameId, { returnIdx, challengerId: client.id });
                            challengeJustStarted = true;
                        }
                    } else {
                        // If we are in king response and the responder just played, return turn to stored returnIdx
                        const state = kstatePre || await loadKingChallenge(gameId);
                        if (state && state.targetId === client.id) {
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
                            await deleteKingChallenge(gameId);
                            // After resolving king response, run elimination chain if next cannot move
                            eliminateChainIfNeeded(game);
                        }
                    }
                    await saveGame(game);
                    // broadcast individualized state
                    game.players.forEach(player => {
                        const viewerId = player.clientId;
                        const payLoad: any = {
                            method: 'playCard',
                            game: redactedGameFor(game, viewerId),
                        };
                        // Only hint the challenger when they initiate a king challenge
                        if (challengeJustStarted && viewerId === client.id) {
                            payLoad.kingPlayed = true;
                        }
                        clients.get(viewerId)?.connection.send(JSON.stringify(payLoad));
                    });
                    break;
                }
                case 'kingSelectTarget': {
                    const gameId = result.gameId;
                    const game = await loadGame(gameId);
                    if (!game) {
                        console.error(`Game ${gameId} not found`);
                        break;
                    }
                    const reaped = await reapExpiredAbsences(game);
                    if (reaped) {
                        await saveGame(game);
                    }
                    const state = await loadKingChallenge(gameId);
                    if (!state || state.challengerId !== client.id) {
                        console.warn(`Invalid kingSelectTarget from ${client.id}`);
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
                        await deleteKingChallenge(gameId);
                        // After instant elimination, run elimination chain if next cannot move
                        eliminateChainIfNeeded(game);

                        await saveGame(game);
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
                        await saveGame(game);
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
                    const game = await loadGame(gameId);
                    if (!game) {
                        console.error(`Game ${gameId} not found`);
                        break;
                    }
                    const reaped = await reapExpiredAbsences(game);
                    if (reaped) {
                        await saveGame(game);
                    }
                    if (client.id !== game.leaderClientId) {
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
                        await saveGame(game);
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
                        await saveGame(game);
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
    connection.on('close', async () => {
        console.log(`Client ${client.id} disconnected. Total clients: ${clients.size}`);
        clients.delete(client.id);
        await markClientAbsent(client.id);
        // const games = await retrieveAllGames();
        // for (const game of games) {
        //     const idx = game.players.findIndex(player => player.clientId === client.id);
        //     if (idx !== -1) {
        //         game.players.splice(idx, 1);
        //         if (game.players.length === 0) {
        //             await deleteGame(game.id);
        //         } else {
        //             await saveGame(game);
        //         }
        //     }
        // }
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
