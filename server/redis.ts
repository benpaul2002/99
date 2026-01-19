import type { Game, KingChallenge } from '@shared/types.js';
import { Redis } from 'ioredis';

export const redis = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379');

redis.on('error', (err: unknown) => {
    console.error('Redis error:', err);
});

export async function loadGame(gameId: string): Promise<Game | null> {
    const game = await redis.get(`game:${gameId}`);
    return game ? (JSON.parse(game) as Game) : null;
}

export async function saveGame(game: Game): Promise<void> {
    await redis.set(`game:${game.id}`, JSON.stringify(game));
}

export async function deleteGame(gameId: string): Promise<void> {
    await redis.del(`game:${gameId}`);
}

export async function markClientAbsent(clientId: string): Promise<void> {
    const games = await redis.keys(`game:*`);
    if(games.length === 0) {
        return;
    }
    const gameData = await redis.mget(games);
    for (const game of gameData) {
        if (game) {
            const gameData = JSON.parse(game) as Game;
            if (gameData.players.some(p => p.clientId === clientId)) {
                await redis
				.multi()
				.sadd(`dc:${gameData.id}`, clientId)                 // track who is disconnected
				.set(`absent:${gameData.id}:${clientId}`, '1', 'EX', 300) // 5-min grace
				.exec();
            }
        }   
    }
}

export async function clearClientAbsence(gameId: string, clientId: string): Promise<void> {
	await redis.multi()
		.del(`absent:${gameId}:${clientId}`)
		.srem(`dc:${gameId}`, clientId)
		.exec();
}

export async function reapExpiredAbsences(game: Game): Promise<boolean> {
	let changed = false;
	const dc = await redis.smembers(`dc:${game.id}`);
	for (const pid of dc) {
		const stillAbsent = await redis.exists(`absent:${game.id}:${pid}`);
		if (!stillAbsent) {
			const idx = game.players.findIndex(p => p.clientId === pid);
			if (idx !== -1) {
				game.players.splice(idx, 1);
				await redis.srem(`dc:${game.id}`, pid);
				changed = true;
			}
		}
	}
	return changed;
}

export async function retrieveAllGames(): Promise<Game[]> {
    const games = await redis.keys('game:*');
    if (games.length === 0) {
        return [];
    }
    const gamesData = await redis.mget(games);
    return gamesData.filter(Boolean).map(game => JSON.parse(game!) as Game);
}

export async function loadKingChallenge(gameId: string): Promise<KingChallenge | null> {
    const kc = await redis.get(`kc:${gameId}`);
    return kc ? (JSON.parse(kc) as KingChallenge) : null;
}

export async function saveKingChallenge(gameId: string, kc: KingChallenge): Promise<void> {
    await redis.set(`kc:${gameId}`, JSON.stringify(kc));
}

export async function deleteKingChallenge(gameId: string): Promise<void> {
    await redis.del(`kc:${gameId}`);
}