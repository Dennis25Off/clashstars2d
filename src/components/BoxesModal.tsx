import React, { useState } from 'react';
import { X, Gift, Zap, Coins, Gem, Sparkles } from 'lucide-react';
import { BrawlerId, PlayerProfile } from '../types/game';
import { BRAWLERS } from '../data/brawlers';
import { UnboxAnimation, UnboxRewardItem } from './UnboxAnimation';
import { sound } from '../utils/audio';

interface BoxesModalProps {
  profile: PlayerProfile;
  onUpdateProfile: (updater: (prev: PlayerProfile) => PlayerProfile) => void;
  onClose: () => void;
}

export const BoxesModal: React.FC<BoxesModalProps> = ({ profile, onUpdateProfile, onClose }) => {
  const [openingBox, setOpeningBox] = useState<{ type: 'brawl' | 'big' | 'mega'; items: UnboxRewardItem[] } | null>(null);

  const brawlerKeys: BrawlerId[] = ['blaze', 'viper', 'titan', 'raven', 'harmony'];

  const openBox = (type: 'brawl' | 'big' | 'mega') => {
    sound.playClick();
    const items: UnboxRewardItem[] = [];

    // Calculate items based on box type
    if (type === 'brawl') {
      if (profile.tokens < 100) return;

      // Coins
      const coins = Math.floor(Math.random() * 60) + 40;
      items.push({ type: 'coins', amount: coins, name: 'Monete d\'Oro' });

      // Power Points for 1 random brawler
      const randomBrawler = brawlerKeys[Math.floor(Math.random() * brawlerKeys.length)];
      const pp = Math.floor(Math.random() * 20) + 15;
      items.push({
        type: 'power_points',
        amount: pp,
        brawlerId: randomBrawler,
        name: `Punti Energia per ${BRAWLERS[randomBrawler].name}`,
      });

      // 30% chance for Gems
      if (Math.random() < 0.3) {
        const gems = Math.floor(Math.random() * 8) + 3;
        items.push({ type: 'gems', amount: gems, name: 'Gemme Preziose' });
      }

      // Deduct 100 tokens
      onUpdateProfile((p) => ({
        ...p,
        tokens: p.tokens - 100,
        stats: { ...p.stats, boxesOpened: p.stats.boxesOpened + 1 },
      }));
    } else if (type === 'big') {
      if (profile.gems < 30) return;

      const coins = Math.floor(Math.random() * 150) + 120;
      items.push({ type: 'coins', amount: coins, name: 'Monete d\'Oro' });

      // Power Points for 2 brawlers
      const b1 = brawlerKeys[Math.floor(Math.random() * brawlerKeys.length)];
      let b2 = brawlerKeys[Math.floor(Math.random() * brawlerKeys.length)];
      if (b2 === b1) b2 = 'viper';

      items.push({
        type: 'power_points',
        amount: Math.floor(Math.random() * 35) + 25,
        brawlerId: b1,
        name: `Punti Energia per ${BRAWLERS[b1].name}`,
      });
      items.push({
        type: 'power_points',
        amount: Math.floor(Math.random() * 35) + 25,
        brawlerId: b2,
        name: `Punti Energia per ${BRAWLERS[b2].name}`,
      });

      // Gems
      items.push({ type: 'gems', amount: 10, name: 'Gemme Preziose' });

      onUpdateProfile((p) => ({
        ...p,
        gems: p.gems - 30,
        stats: { ...p.stats, boxesOpened: p.stats.boxesOpened + 1 },
      }));
    } else if (type === 'mega') {
      if (profile.gems < 80) return;

      const coins = Math.floor(Math.random() * 350) + 300;
      items.push({ type: 'coins', amount: coins, name: 'Monete d\'Oro' });

      // 4 Power point rewards
      brawlerKeys.forEach((bId) => {
        items.push({
          type: 'power_points',
          amount: Math.floor(Math.random() * 50) + 30,
          brawlerId: bId,
          name: `Punti Energia per ${BRAWLERS[bId].name}`,
        });
      });

      // Gems
      items.push({ type: 'gems', amount: 25, name: 'Gemme Preziose' });

      onUpdateProfile((p) => ({
        ...p,
        gems: p.gems - 80,
        stats: { ...p.stats, boxesOpened: p.stats.boxesOpened + 1 },
      }));
    }

    setOpeningBox({ type, items });
  };

  const handleFinishUnbox = () => {
    if (!openingBox) return;

    // Apply reward items to profile
    onUpdateProfile((prev) => {
      let newCoins = prev.coins;
      let newGems = prev.gems;
      const newBrawlers = { ...prev.brawlers };

      openingBox.items.forEach((item) => {
        if (item.type === 'coins') newCoins += item.amount;
        if (item.type === 'gems') newGems += item.amount;
        if (item.type === 'power_points' && item.brawlerId) {
          const currentB = newBrawlers[item.brawlerId] || { level: 1, powerPoints: 0, unlocked: true, trophies: 0 };
          newBrawlers[item.brawlerId] = {
            ...currentB,
            powerPoints: currentB.powerPoints + item.amount,
          };
        }
      });

      return {
        ...prev,
        coins: newCoins,
        gems: newGems,
        brawlers: newBrawlers,
      };
    });

    setOpeningBox(null);
  };

  return (
    <>
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
        <div className="relative w-full max-w-3xl rounded-3xl bg-slate-900 border-4 border-amber-500 shadow-2xl p-6 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-amber-500/20 text-amber-400">
                <Gift className="w-7 h-7" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-white font-game tracking-wide">
                  CASSE STELLE & PREMI
                </h2>
                <p className="text-xs text-slate-400">
                  Guadagna gettoni nei match Battle Royale per aprire casse e potenziare i tuoi clashers!
                </p>
              </div>
            </div>

            <button
              onClick={() => {
                sound.playClick();
                onClose();
              }}
              className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tokens status */}
          <div className="flex items-center justify-between bg-slate-950/70 p-3 rounded-2xl border border-slate-800 mt-4">
            <div className="flex items-center gap-2">
              <span className="text-xl">🎟️</span>
              <div>
                <div className="text-xs text-slate-400">I tuoi Gettoni Battaglia</div>
                <div className="font-extrabold text-base text-amber-400">
                  {profile.tokens} <span className="text-xs text-slate-300">/ 100 per Cassa Clash</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5 text-sm font-bold text-amber-300">
                <Coins className="w-4 h-4" />
                <span>{profile.coins}</span>
              </div>
              <div className="flex items-center gap-1.5 text-sm font-bold text-emerald-400">
                <Gem className="w-4 h-4" />
                <span>{profile.gems}</span>
              </div>
            </div>
          </div>

          {/* 3 Box Tiers */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5">
            {/* 1. Cassa Brawl */}
            <div className="rounded-3xl bg-slate-800/80 border-2 border-sky-400 p-5 flex flex-col items-center justify-between text-center shadow-lg">
              <div className="text-5xl mb-2 animate-bounce">📦</div>
              <h3 className="font-black text-lg text-white font-game">CASSA CLASH</h3>
              <p className="text-xs text-slate-300 mt-1 mb-4">
                Monete, Punti Energia clashers e possibili gemme bonus!
              </p>
              <button
                onClick={() => openBox('brawl')}
                disabled={profile.tokens < 100}
                className={`w-full py-2.5 rounded-2xl font-black text-sm border-2 shadow-lg transition active:scale-95 ${
                  profile.tokens >= 100
                    ? 'brawl-btn-yellow text-slate-950'
                    : 'bg-slate-700 text-slate-400 border-slate-600 opacity-60'
                }`}
              >
                100 GETTONI
              </button>
            </div>

            {/* 2. Cassa Grande */}
            <div className="rounded-3xl bg-slate-800/80 border-2 border-purple-400 p-5 flex flex-col items-center justify-between text-center shadow-lg">
              <div className="text-5xl mb-2 animate-bounce">🎁</div>
              <h3 className="font-black text-lg text-purple-300 font-game">CASSA MEDIA</h3>
              <p className="text-xs text-slate-300 mt-1 mb-4">
                3x ricompense! Grandi scorte di monete e potenziamenti.
              </p>
              <button
                onClick={() => openBox('big')}
                disabled={profile.gems < 30}
                className={`w-full py-2.5 rounded-2xl font-black text-sm border-2 shadow-lg transition active:scale-95 ${
                  profile.gems >= 30
                    ? 'brawl-btn-purple text-white'
                    : 'bg-slate-700 text-slate-400 border-slate-600 opacity-60'
                }`}
              >
                30 GEMME
              </button>
            </div>

            {/* 3. Mega Cassa */}
            <div className="rounded-3xl bg-slate-800/80 border-2 border-amber-400 p-5 flex flex-col items-center justify-between text-center shadow-lg relative overflow-hidden">
              <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-red-600 text-white font-black text-[9px]">
                10x PREMI
              </div>
              <div className="text-5xl mb-2 animate-bounce">🌟</div>
              <h3 className="font-black text-lg text-amber-300 font-game">CRAZY CASSA</h3>
              <p className="text-xs text-slate-300 mt-1 mb-4">
                L'apertura definitiva: fino a 7 oggetti tra monete, gemme e quintali di punti energia!
              </p>
              <button
                onClick={() => openBox('mega')}
                disabled={profile.gems < 80}
                className={`w-full py-2.5 rounded-2xl font-black text-sm border-2 shadow-lg transition active:scale-95 ${
                  profile.gems >= 80
                    ? 'brawl-btn-yellow text-slate-950 animate-pulse'
                    : 'bg-slate-700 text-slate-400 border-slate-600 opacity-60'
                }`}
              >
                80 GEMME
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Unboxing full-screen modal */}
      {openingBox && (
        <UnboxAnimation
          boxType={openingBox.type}
          items={openingBox.items}
          onFinish={handleFinishUnbox}
        />
      )}
    </>
  );
};
