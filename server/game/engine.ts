import type { Game } from '@shared/types.js';
import { createStandardDeck, shuffleInPlace } from './cards.js';

export function canStartGame(game: Game): boolean {
    const numPlayers = game.players.length;
    return game.status === 'lobby' && numPlayers >= 2 && numPlayers <= 10;
}

export function startGame(game: Game): void {
    const deck = createStandardDeck();
    shuffleInPlace(deck);

    // Reset player hands and set status
    game.players.forEach(p => { p.hand = []; p.status = 'playing'; });

    // Deal two cards to each player
    for (let r = 0; r < 2; r++) {
        game.players.forEach(p => {
            const next = deck.pop();
            if (next) {
                p.hand.push(next);
            }
        });
    }

    // Update piles and game status
    game.drawPile = deck;
    game.discardPile = [];
    game.status = 'playing';
    game.currentPlayerIdx = 0;
}

type PlayOptions = {
    aceValue?: 1 | 11;
    queenDelta?: -20 | 20;
    fourAsZero?: boolean;
};

export function computePlayDelta(rank: string, opts: PlayOptions = {}): number {
    const r = rank.toUpperCase();
    if (r === 'A') return opts.aceValue === 11 ? 11 : 1;
    if (r === 'J') return 0;
    if (r === 'Q') return opts.queenDelta === -20 ? -20 : 20;
    if (r === 'K') return 0; // special effect later
    // numeric
    const n = parseInt(r, 10);
    return Number.isFinite(n) ? n : 0;
}

function minDeltaForRank(rank: string): number {
    const r = rank.toUpperCase();
    if (r === 'A') return 1;
    if (r === 'J') return 0;
    if (r === 'Q') return -20;
    if (r === 'K') return 0;
    const n = parseInt(r, 10);
    return Number.isFinite(n) ? n : 0;
}

export function hasLegalMove(game: Game, playerIdx: number): boolean {
    const player = game.players[playerIdx];
    if (!player) return false;
    return player.hand.some(card => game.score + minDeltaForRank(card.rank) <= 99);
}

export function advanceToNextAlive(game: Game): void {
    if (game.players.length === 0) return;
    let attempts = 0;
    do {
        game.currentPlayerIdx = (game.currentPlayerIdx + 1) % game.players.length;
        attempts++;
        if (attempts > game.players.length + 1) break;
    } while (game.players[game.currentPlayerIdx]?.status === 'dead');
}

export function eliminateChainIfNeeded(game: Game): void {
    if (game.status !== 'playing') return;
    let safety = 0;
    while (!hasLegalMove(game, game.currentPlayerIdx) && game.status === 'playing') {
        const cur = game.players[game.currentPlayerIdx];
        if (!cur) break;
        // move eliminated player's hand to discard pile (not on top)
        discardPlayerHandNotOnTop(game, game.currentPlayerIdx);
        cur.status = 'dead';
        const aliveCount = game.players.filter(p => p.status !== 'dead').length;
        if (aliveCount <= 1) {
            game.status = 'finished';
            break;
        }
        advanceToNextAlive(game);
        safety++;
        if (safety > 100) break;
    }
}

export function discardPlayerHandNotOnTop(game: Game, playerIdx: number): void {
    const player = game.players[playerIdx];
    if (!player) return;
    if (!Array.isArray(player.hand) || player.hand.length === 0) return;
    // Place cards at the bottom of discard pile so they don't appear as the last played
    // Preserve order by adding from first to last at the start
    const cardsToDiscard = player.hand.splice(0, player.hand.length);
    // unshift places at the start; to preserve original order, iterate in reverse
    for (let i = cardsToDiscard.length - 1; i >= 0; i--) {
        game.discardPile.unshift(cardsToDiscard[i]!);
    }
}

export function applyPlay(game: Game, playerClientId: string, cardId: string, opts: PlayOptions = {}): { ok: true } | { ok: false; reason: string } {
    if (game.status !== 'playing') return { ok: false, reason: 'Game not in playing state' };
    const current = game.players[game.currentPlayerIdx];
    if (!current) return { ok: false, reason: 'Invalid current player' };
    if (current.clientId !== playerClientId) return { ok: false, reason: 'Not your turn' };
    const idxInHand = current.hand.findIndex(c => c.id === cardId);
    if (idxInHand === -1) return { ok: false, reason: 'Card not in hand' };

    const card = current.hand[idxInHand]!;
    let delta = computePlayDelta(card.rank, opts);
    if (opts.fourAsZero && String(card.rank).toUpperCase() === '4') {
        delta = 0;
    }
    const playedKing = String(card.rank).toUpperCase() === 'K';

    // If this play would exceed 99, check if any legal move exists.
    if (game.score + delta > 99) {
        if (hasLegalMove(game, game.currentPlayerIdx)) {
            // Player has at least one legal option (maybe with different card/choice) -> reject play
            return { ok: false, reason: 'Play exceeds 99' };
        } else {
            // No legal moves: eliminate player immediately
            discardPlayerHandNotOnTop(game, game.currentPlayerIdx);
            current.status = 'dead';
            // Advance to next alive player
            advanceToNextAlive(game);
            // If only one alive remains, finish
            const aliveCount = game.players.filter(p => p.status !== 'dead').length;
            if (aliveCount <= 1) {
                game.status = 'finished';
            }
            return { ok: true };
        }
    }

    game.score += delta;

    // move to discard
    current.hand.splice(idxInHand, 1);
    game.discardPile.push(card);

    // If score is exactly 99 after the play, end the game immediately.
    // Declare the current player as the winner by marking all others as dead.
    if (game.score === 99) {
        game.status = 'finished';
        for (let i = 0; i < game.players.length; i++) {
            if (i !== game.currentPlayerIdx && game.players[i]) {
                if (game.players[i]!.status !== 'dead') {
                    game.players[i]!.status = 'dead';
                }
            }
        }
        return { ok: true };
    }

    // draw replacement
    // If draw pile is empty, recycle discard pile except the top card
    if (game.drawPile.length === 0 && game.discardPile.length > 1) {
        const top = game.discardPile.pop()!;
        const recycle = game.discardPile.splice(0, game.discardPile.length);
        shuffleInPlace(recycle);
        game.drawPile.push(...recycle);
        game.discardPile.push(top);
    }
    const next = game.drawPile.pop();
    if (next) current.hand.push(next);

    // If King was played, keep the turn on the same player (special handling later)
    if (!playedKing) {
        // advance turn (simple round-robin)
        advanceToNextAlive(game);
    }

    // Auto-eliminate chain if next players have no legal moves (skip when king holds turn)
    if (!playedKing) {
        eliminateChainIfNeeded(game);
    }
    return { ok: true };
}


