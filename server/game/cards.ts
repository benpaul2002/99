import type { Card } from '@shared/types.js';

export function createStandardDeck(): Card[] {
    const suits = ['spades', 'hearts', 'diamonds', 'clubs'] as const;
    const ranks = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'] as const;
    const valueForRank = (rank: string): number => {
        // Base values; some are chosen at play time:
        // - Ace: 1 or 11 (store 1 by default; pick 11 at play time)
        // - Queen: +20 or -20 (store +20 by default; sign chosen at play time)
        // - Jack: 0
        // - King: 0 (special action handled elsewhere)
        if (rank === 'A') return 1;
        if (rank === 'J') return 0;
        if (rank === 'Q') return 20;
        if (rank === 'K') return 0;
        return parseInt(rank, 10);
    };
    return suits.flatMap(suit =>
        ranks.map<Card>(rank => ({
            id: `${rank}-of-${suit}`,
            rank,
            suit,
            value: valueForRank(rank),
        }))
    );
}

export function shuffleInPlace<T>(array: T[]): void {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const xi = array[i]!;
        const xj = array[j]!;
        array[i] = xj;
        array[j] = xi;
    }
}


