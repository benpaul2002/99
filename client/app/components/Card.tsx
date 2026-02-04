'use client';

import type { Card as CardType } from '@shared/types';

function cx(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(' ');
}

type Size = 'sm' | 'md' | 'lg';

function normalizeSuit(suit: string): 'hearts' | 'diamonds' | 'clubs' | 'spades' {
  const s = suit.toLowerCase();
  if (s.startsWith('h') || s === '♥') return 'hearts';
  if (s.startsWith('d') || s === '♦') return 'diamonds';
  if (s.startsWith('c') || s === '♣') return 'clubs';
  return 'spades';
}

function suitSymbol(suit: string): string {
  const s = normalizeSuit(suit);
  return s === 'hearts' ? '♥' : s === 'diamonds' ? '♦' : s === 'clubs' ? '♣' : '♠';
}

function suitColorClasses(suit: string): string {
  const s = normalizeSuit(suit);
  return s === 'hearts' || s === 'diamonds' ? 'text-rose-500' : 'text-black';
}

function sizeClasses(size: Size) {
  switch (size) {
    case 'sm':
      return {
        root: 'h-24 w-16',
        rank: 'text-sm',
        symbol: 'text-xl',
        center: 'text-3xl',
      };
    case 'lg':
      return {
        root: 'h-48 w-32',
        rank: 'text-xl',
        symbol: 'text-3xl',
        center: 'text-6xl',
      };
    case 'md':
    default:
      return {
        root: 'h-36 w-24',
        rank: 'text-base',
        symbol: 'text-2xl',
        center: 'text-5xl',
      };
  }
}

export function Card({ card, size = 'md', faceDown = false, onClick, disabled = false }: { card: CardType; size?: Size; faceDown?: boolean; onClick?: () => void; disabled?: boolean }) {
  const sizes = sizeClasses(size);
  const symbol = suitSymbol(card.suit);
  const color = suitColorClasses(card.suit);

  if (faceDown) {
    return (
      <div
        className={cx(
          'select-none rounded-xl border border-white/20 bg-gradient-to-br from-slate-600 to-slate-800 shadow-xl ring-1 ring-black/10',
          sizes.root
        )}
      >
        <div className="flex h-full w-full items-center justify-center">
          <div className="h-[85%] w-[85%] rounded-lg border border-white/10 bg-slate-700/40 backdrop-blur" />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cx(
        'select-none rounded-xl border border-white/20 bg-white text-slate-900 shadow-xl ring-1 ring-black/10 transition-transform duration-150',
        disabled ? 'opacity-40 cursor-default' : onClick ? 'cursor-pointer hover:-translate-y-6 hover:shadow-2xl' : '',
        'dark:bg-white/90 dark:text-slate-900',
        sizes.root
      )}
      onClick={disabled ? undefined : onClick}
    >
      <div className="relative h-full w-full p-2">
        <div className={cx('absolute left-2 top-2 flex flex-col items-center', color)}>
          <span className={cx('font-bold leading-none', sizes.rank)}>{card.rank}</span>
          <span className={cx('leading-none', sizes.symbol)}>{symbol}</span>
        </div>
        <div className={cx('absolute bottom-2 right-2 rotate-180 flex flex-col items-center', color)}>
          <span className={cx('font-bold leading-none', sizes.rank)}>{card.rank}</span>
          <span className={cx('leading-none', sizes.symbol)}>{symbol}</span>
        </div>
        <div className={cx('flex h-full w-full items-center justify-center', color)}>
          <span className={cx('opacity-80', sizes.center)}>{symbol}</span>
        </div>
      </div>
    </div>
  );
}


