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


