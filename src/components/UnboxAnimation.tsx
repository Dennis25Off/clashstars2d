import React, { useState } from 'react';
import confetti from 'canvas-confetti';
import { Sparkles, Coins, Gem, Zap, Check } from 'lucide-react';
import { BrawlerId } from '../types/game';
import { BRAWLERS } from '../data/brawlers';
import { sound } from '../utils/audio';

export interface UnboxRewardItem {
  type: 'coins' | 'gems' | 'power_points';
  amount: number;
  brawlerId?: BrawlerId;
  name: string;
}

interface UnboxAnimationProps {
  boxType: 'brawl' | 'big' | 'mega';
  items: UnboxRewardItem[];
  onFinish: () => void;
}

export const UnboxAnimation: React.FC<UnboxAnimationProps> = ({ boxType, items, onFinish }) => {
  const [currentIndex, setCurrentIndex] = useState(-1); // -1 = Box closed, >= 0 = showing items
  const [isRevealed, setIsRevealed] = useState(false);

  const boxName = boxType === 'mega' ? 'CRAZY CASSA' : boxType === 'big' ? 'CASSA MEDIA' : 'CASSA CLASH';
  const boxThemeColor =
    boxType === 'mega'
      ? 'from-red-600 via-amber-500 to-indigo-600'
      : boxType === 'big'
      ? 'from-purple-600 via-pink-500 to-indigo-600'
      : 'from-blue-600 via-sky-500 to-cyan-500';

  const handleBoxTap = () => {
    if (currentIndex === -1) {
      // First tap opens the box!
      sound.playBoxTap();
      setCurrentIndex(0);
      setIsRevealed(true);
      if (boxType === 'mega') {
        confetti({ particleCount: 70, spread: 80, origin: { y: 0.6 } });
      }
    } else if (currentIndex < items.length - 1) {
      // Next item!
      sound.playBoxTap();
      setCurrentIndex(currentIndex + 1);
      if (items[currentIndex + 1]?.type === 'gems') {
        sound.playUnlockJingle();
      }
    } else {
      // All items revealed!
      sound.playVictory();
      confetti({ particleCount: 120, spread: 100, origin: { y: 0.5 } });
      onFinish();
    }
  };

  const currentItem = currentIndex >= 0 ? items[currentIndex] : null;
  const remainingCount = items.length - currentIndex;

  return (
    <div
      onClick={handleBoxTap}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 backdrop-blur-lg select-none cursor-pointer p-4"
    >
      {/* Background radial rays */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(234,179,8,0.15)_0%,_transparent_70%)] pointer-events-none animate-pulse" />

      {/* Header */}
      <div className="relative z-10 flex flex-col items-center mb-6">
        <h2 className="text-3xl sm:text-4xl font-black text-amber-300 font-game tracking-wider drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)]">
          {boxName}
        </h2>
        <p className="text-xs text-slate-300 mt-1">
          {currentIndex === -1 ? 'Tocca per aprire la cassa!' : 'Tocca lo schermo per continuare'}
        </p>
      </div>

      {/* Main Display: Closed Crate or Revealed Item Card */}
      <div className="relative z-10 w-72 sm:w-80 h-80 flex flex-col items-center justify-center">
        {currentIndex === -1 ? (
          /* Closed Box with Jiggle Animation */
          <div className="flex flex-col items-center animate-bounce">
            <div
              className={`w-44 h-44 rounded-3xl bg-gradient-to-tr ${boxThemeColor} border-4 border-yellow-300 shadow-[0_0_50px_rgba(234,179,8,0.5)] flex items-center justify-center text-7xl transform transition active:scale-95`}
            >
              🎁
            </div>
            {boxType === 'mega' && (
              <div className="mt-4 px-4 py-1 rounded-full bg-amber-400 text-slate-950 font-black text-sm border-2 border-white shadow-xl animate-pulse">
                {items.length} RICOMPENSE IN ARRIVO!
              </div>
            )}
          </div>
        ) : (
          /* Revealed Card Item */
          currentItem && (
            <div className="w-full h-full rounded-3xl bg-gradient-to-b from-slate-800 to-slate-900 border-4 border-amber-400 shadow-[0_0_40px_rgba(234,179,8,0.4)] p-6 flex flex-col items-center justify-between animate-fade-in">
              {/* Top counter for Mega Box */}
              <div className="w-full flex items-center justify-between text-xs font-bold text-amber-300">
                <span>OGGETTO {currentIndex + 1} DI {items.length}</span>
                {remainingCount > 1 && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-400">
                    +{remainingCount - 1} rimasti
                  </span>
                )}
              </div>

              {/* Item Graphic */}
              <div className="my-auto flex flex-col items-center">
                {currentItem.type === 'coins' && (
                  <div className="w-24 h-24 rounded-full bg-amber-500/20 border-4 border-amber-400 flex items-center justify-center text-amber-400 mb-3 shadow-lg">
                    <Coins className="w-14 h-14" />
                  </div>
                )}

                {currentItem.type === 'gems' && (
                  <div className="w-24 h-24 rounded-full bg-emerald-500/20 border-4 border-emerald-400 flex items-center justify-center text-emerald-400 mb-3 shadow-lg">
                    <Gem className="w-14 h-14" />
                  </div>
                )}

                {currentItem.type === 'power_points' && (
                  <div className="w-24 h-24 rounded-full bg-purple-500/20 border-4 border-purple-400 flex items-center justify-center text-purple-400 mb-3 shadow-lg relative">
                    <Zap className="w-12 h-12" />
                    {currentItem.brawlerId && (
                      <span className="absolute -bottom-1 -right-1 text-2xl">
                        {BRAWLERS[currentItem.brawlerId]?.avatarEmoji}
                      </span>
                    )}
                  </div>
                )}

                <div className="text-3xl font-black text-white font-game tracking-wider">
                  +{currentItem.amount}
                </div>
                <div className="text-sm font-bold text-amber-300 mt-1">
                  {currentItem.name}
                </div>
              </div>

              {/* Tap to continue prompt */}
              <div className="text-xs text-slate-400 flex items-center gap-1 font-semibold">
                <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                <span>{currentIndex === items.length - 1 ? 'Tocca per ritirare tutto!' : 'Tocca per il prossimo'}</span>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
};
