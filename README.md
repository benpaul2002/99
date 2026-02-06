# 99 - A Multiplayer Card Game

### Rules
- Each card has an associated "score"
    - Number cards have score equal to their number (2 is worth 2, 3 is 3, etc.)
    - Jacks have 0 score - essentially a skip turn
    - Queens can be either + or - 20 (players can choose)
    - Aces can be either 1 or 11
    - Kings also have 0 score. They are kill cards. More explained in the King Challenge section
- Each player is dealt 2 cards
- Each player must play a card during their turn, and then pick a card from the deck.
- If the score goes over 99, the player is out
- King Challenge
    - If a player plays a king, they can choose any other player to eliminate
    - The targeted player can defend by playing either a king or a 4.
    - If the targeted player plays a king, the original (attacking) player is eliminated instead.
    - If the targeted player plays a 4, the attack is neutralized, and both players survive.
    - If the targeted player has no king or 4, they are eliminated.
