'use client';

import { Card as CardType } from '@shared/types';
import { Card } from './Card';

export function Hand({ cards }: { cards: CardType[] }) {
  const count = cards.length;
  const angleStep = count > 1 ? 10 / (count - 1) : 0; // total spread ~10deg
  const startAngle = -((count - 1) * angleStep) / 2;

  return (
    <div className="mx-auto flex w-full max-w-3xl justify-center py-2">
      <div className="relative flex">
        {cards.map((c, i) => {
          const angle = startAngle + i * angleStep;
          return (
            <div
              key={`${c.suit}-${c.rank}-${i}`}
              style={{
                marginLeft: i === 0 ? 0 : -28,
                transform: `rotate(${angle}deg)`,
                transformOrigin: '50% 90%',
              }}
            >
              <Card card={c} size="md" />
            </div>
          );
        })}
      </div>
    </div>
  );
}


