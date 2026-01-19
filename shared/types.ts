export interface Card {
    id: string;
    rank: string;
    suit: string;
    value: number;
}

export interface Game {
    id: string;
    players: Player[];
    leaderClientId: string;
    discardPile: Card[];
    drawPile: Card[];
    currentPlayerIdx: number;
    score: number;
    status: 'lobby' | 'playing' | 'finished';
}

export interface Player {
    clientId: string;
    name: string;
    hand: Card[];
    status: 'lobby' | 'playing' | 'dead';
}

export interface KingChallenge {
    returnIdx: number;
    challengerId: string;
    targetId?: string;
}