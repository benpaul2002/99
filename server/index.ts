import http from 'http';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { Game } from '@shared/types.js';

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
                        deck: [],
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
                    const payLoad = {
                        method: 'createGame',
                        game: games.get(gameId),
                    };
                    connection.send(JSON.stringify(payLoad));
                    console.log(`Game ${gameId} created. Total games: ${games.size}`);
                    break;
                }
                case 'joinGame': {
                    const gameId = result.gameId;
                    const clientId = result.clientId;
                    const game = games.get(gameId);
                    if (game) {
                        const alreadyIn = game.players.some(p => p.clientId === clientId);
                        if (!alreadyIn) {
                            game.players.push({
                                clientId: clientId,
                                name: result.name,
                                hand: [],
                                status: 'lobby',
                            });
                        }
                        const payLoad = {
                            method: 'joinGame',
                            game: game,
                        };
                        game.players.forEach(player => {
                            clients.get(player.clientId)?.connection.send(JSON.stringify(payLoad));
                        })
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
                    const payLoad = {
                        method: 'getGame',
                        game: game ?? null,
                    };
                    connection.send(JSON.stringify(payLoad));
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
                    if (game.status === 'lobby' && numPlayers >= 2 && numPlayers <= 10 && result.clientId === game.leaderClientId) {
                        game.status = 'playing';
                        game.currentPlayerIdx = 0;
                        const payLoad = {
                            method: 'startGame',
                            game: game,
                        };
                        game.players.forEach(player => {
                            clients.get(player.clientId)?.connection.send(JSON.stringify(payLoad));
                        });
                        console.log(`Game ${gameId} started with ${numPlayers} players`);
                    } else {
                        console.warn(`Cannot start game ${gameId}. Status=${game.status}, Players=${numPlayers}`);
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
