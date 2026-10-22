import React, { useState } from 'react';
import { X, Zap, Shield, Flame, Check, ArrowUpCircle, Heart, Crosshair } from 'lucide-react';
import { BrawlerId, PlayerProfile } from '../types/game';
import { BRAWLERS, BRAWLER_LIST } from '../data/brawlers';
import { UPGRADE_COSTS } from '../utils/storage';
import { sound } from '../utils/audio';

interface BrawlerSelectModalProps {
  profile: PlayerProfile;
  onSelectBrawler: (id: BrawlerId) => void;
  onUpdateProfile: (updater: (prev: PlayerProfile) => PlayerProfile) => void;
  onClose: () => void;
}

export const BrawlerSelectModal: React.FC<BrawlerSelectModalProps> = ({
  profile,
  onSelectBrawler,
  onUpdateProfile,
  onClose,
}) => {
  const [selectedId, setSelectedId] = useState<BrawlerId>(profile.selectedBrawler);

  const currentBrawler = BRAWLERS[selectedId];
  const brawlerData = profile.brawlers[selectedId] || { level: 1, powerPoints: 0, unlocked: true, trophies: 0 };
  const nextLevel = brawlerData.level + 1;
  const upgradeCost = UPGRADE_COSTS[brawlerData.level] || { powerPoints: 999, coins: 9999 };
  const canUpgrade =
    brawlerData.level < 10 &&
    brawlerData.powerPoints >= upgradeCost.powerPoints &&
    profile.coins >= upgradeCost.coins;

  const handleUpgrade = () => {
    if (!canUpgrade) return;
    sound.playVictory();

    onUpdateProfile((prev) => {
      const b = prev.brawlers[selectedId];
      return {
        ...prev,
        coins: prev.coins - upgradeCost.coins,
        brawlers: {
          ...prev.brawlers,
          [selectedId]: {
            ...b,
            level: b.level + 1,
            powerPoints: b.powerPoints - upgradeCost.powerPoints,
          },
        },
      };
    });
  };

  const isCurrentActive = profile.selectedBrawler === selectedId;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
      <div className="relative w-full max-w-4xl h-[92vh] max-h-[640px] rounded-3xl bg-slate-900 border-4 border-indigo-500 shadow-2xl p-4 sm:p-6 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div>
            <h2 className="text-2xl font-black text-white font-game tracking-wide">
              I TUOI CLASHERS (5/5)
            </h2>
            <p className="text-xs text-slate-400">
              Seleziona un eroe, visualizza abilità attive/passive e potenzia le statistiche
            </p>
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

        {/* Content: Left roster list, Right detailed inspector */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-4 mt-3 overflow-y-auto">
          {/* Left: 5 Brawler Cards */}
          <div className="md:col-span-5 flex md:flex-col gap-2.5 overflow-x-auto md:overflow-y-auto pr-1">
            {BRAWLER_LIST.map((b) => {
              const bProg = profile.brawlers[b.id] || { level: 1, powerPoints: 0, unlocked: true };
              const isSelected = selectedId === b.id;
              const isActive = profile.selectedBrawler === b.id;

              return (
                <button
                  key={b.id}
                  onClick={() => {
                    sound.playClick();
                    setSelectedId(b.id);
                  }}
                  className={`flex-shrink-0 w-36 md:w-full p-3 rounded-2xl border-2 transition-all text-left flex items-center justify-between active:scale-98 ${
                    isSelected
                      ? 'bg-indigo-950/80 border-amber-400 shadow-lg ring-2 ring-amber-400/30'
                      : 'bg-slate-800/60 border-slate-700 hover:border-slate-500'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-11 h-11 rounded-full flex items-center justify-center text-xl border-2 border-white/60 shadow"
                      style={{ backgroundColor: b.color }}
                    >
                      {b.avatarEmoji}
                    </div>
                    <div>
                      <div className="font-black text-sm text-white flex items-center gap-1.5">
                        <span>{b.name}</span>
                        {isActive && (
                          <span className="px-1.5 py-0.2 rounded bg-emerald-500 text-slate-950 font-black text-[9px]">
                            SELEZIONATO
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400">Liv. {bProg.level}</div>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] font-bold text-amber-300">
                      ⚡ {bProg.powerPoints}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Right: Detailed Card Inspector */}
          <div className="md:col-span-7 bg-slate-950/80 rounded-2xl border border-slate-800 p-4 sm:p-5 flex flex-col justify-between overflow-y-auto">
            {/* Top Identity */}
            <div>
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-amber-400">
                    {currentBrawler.role}
                  </div>
                  <h3 className="text-2xl font-black text-white font-game flex items-center gap-2">
                    {currentBrawler.name}
                    <span className="text-sm font-semibold text-slate-400 font-normal">
                      "{currentBrawler.title}"
                    </span>
                  </h3>
                  <p className="text-xs text-slate-300 mt-1 italic">{currentBrawler.quote}</p>
                </div>

                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl border-2 border-white shadow-xl"
                  style={{ backgroundColor: currentBrawler.color }}
                >
                  {currentBrawler.avatarEmoji}
                </div>
              </div>

              {/* Stats Bar (HP & Damage with level bonus) */}
              <div className="grid grid-cols-2 gap-2 mt-4">
                <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center gap-2.5">
                  <Heart className="w-5 h-5 text-red-500" />
                  <div>
                    <div className="text-[10px] text-slate-400 font-bold uppercase">Punti Vita (HP)</div>
                    <div className="text-base font-extrabold text-white">
                      {Math.round(currentBrawler.baseHp * (1 + (brawlerData.level - 1) * 0.06))}
                    </div>
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center gap-2.5">
                  <Crosshair className="w-5 h-5 text-amber-500" />
                  <div>
                    <div className="text-[10px] text-slate-400 font-bold uppercase">Danno Base</div>
                    <div className="text-base font-extrabold text-white">
                      {Math.round(currentBrawler.attackDamage * (1 + (brawlerData.level - 1) * 0.06))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Abilities Showcase: Super, Star Power (Passive), Gadget (Active) */}
              <div className="space-y-2 mt-4 text-xs">
                {/* Super */}
                <div className="p-2.5 rounded-xl bg-amber-950/40 border border-amber-600/50">
                  <div className="font-extrabold text-amber-400 flex items-center gap-1.5">
                    <Zap className="w-4 h-4 text-amber-400" />
                    <span>SUPER: {currentBrawler.superName}</span>
                  </div>
                  <p className="text-slate-300 mt-0.5">{currentBrawler.superDesc}</p>
                </div>

                {/* Passive Star Power */}
                <div className="p-2.5 rounded-xl bg-purple-950/40 border border-purple-600/50">
                  <div className="font-extrabold text-purple-400 flex items-center gap-1.5">
                    <Flame className="w-4 h-4 text-purple-400" />
                    <span>ABILITÀ PASSIVA: {currentBrawler.passiveName}</span>
                  </div>
                  <p className="text-slate-300 mt-0.5">{currentBrawler.passiveDesc}</p>
                </div>

                {/* Active Gadget */}
                <div className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-600/50">
                  <div className="font-extrabold text-emerald-400 flex items-center gap-1.5">
                    <Shield className="w-4 h-4 text-emerald-400" />
                    <span>GADGET ATTIVO (3/3): {currentBrawler.gadgetName}</span>
                  </div>
                  <p className="text-slate-300 mt-0.5">{currentBrawler.gadgetDesc}</p>
                </div>
              </div>
            </div>

            {/* Bottom Actions: Upgrade Button & Choose Brawler */}
            <div className="pt-3 border-t border-slate-800 flex flex-col sm:flex-row items-center gap-3">
              {/* Upgrade Button */}
              {brawlerData.level < 10 ? (
                <button
                  onClick={handleUpgrade}
                  disabled={!canUpgrade}
                  className={`flex-1 w-full py-2.5 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 border-2 transition active:scale-95 ${
                    canUpgrade
                      ? 'brawl-btn-green text-white shadow-lg'
                      : 'bg-slate-800 text-slate-500 border-slate-700 opacity-60'
                  }`}
                >
                  <ArrowUpCircle className="w-4 h-4" />
                  <span>
                    POTENZIA A LIV. {nextLevel} ({brawlerData.powerPoints}/{upgradeCost.powerPoints} ⚡ - {upgradeCost.coins} 💰)
                  </span>
                </button>
              ) : (
                <div className="flex-1 text-center py-2 text-xs font-black text-amber-400">
                  LIVELLO MASSIMO!
                </div>
              )}

              {/* Select as Active */}
              <button
                onClick={() => {
                  sound.playClick();
                  onSelectBrawler(selectedId);
                  onClose();
                }}
                disabled={isCurrentActive}
                className={`py-2.5 px-6 rounded-2xl font-black text-xs border-2 shadow-lg transition active:scale-95 w-full sm:w-auto ${
                  isCurrentActive
                    ? 'bg-slate-800 text-slate-400 border-slate-700'
                    : 'brawl-btn-yellow text-slate-950'
                }`}
              >
                {isCurrentActive ? 'SELEZIONATO' : 'SELEZIONA CLASHER'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
