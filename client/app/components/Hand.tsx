'use client';

import { Card as CardType } from '@shared/types';
import { Card } from './Card';

type Size = 'sm' | 'md' | 'lg';

export function Hand({
  cards,
  onCardClick,
  size = 'md',
  scale = 1,
  origin = 'top',
  offsetY = 0,
  isDisabled,
}: {
  cards: CardType[];
  onCardClick?: (card: CardType) => void;
  size?: Size;
  scale?: number;
  origin?: 'top' | 'bottom';
  offsetY?: number;
  isDisabled?: (card: CardType) => boolean;
}) {
  const count = cards.length;
  const angleStep = count > 1 ? 10 / (count - 1) : 0; // total spread ~10deg
  const startAngle = -((count - 1) * angleStep) / 2;
  const overlap = -28;

  return (
    <div className="mx-auto flex w-full max-w-3xl justify-center py-2 overflow-visible">
      <div className="relative flex overflow-visible">
        {cards.map((c, i) => {
          const angle = startAngle + i * angleStep;
          const disabled = isDisabled ? isDisabled(c) : false;
          return (
            <div
              key={`${c.suit}-${c.rank}-${i}`}
              style={{
                marginLeft: i === 0 ? 0 : overlap,
                transform: `translateY(${offsetY}px) rotate(${angle}deg) scale(${scale})`,
                transformOrigin: origin === 'bottom' ? '50% 100%' : '50% 0%',
              }}
            >
              <Card card={c} size={size} disabled={disabled} onClick={!disabled && onCardClick ? () => onCardClick(c) : undefined} />
            </div>
          );
        })}
      </div>
    </div>
  );
}


