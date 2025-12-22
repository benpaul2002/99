export interface Game {
    id: string;
    players: Player[];
}

export interface Player {
    clientId: string;
}
