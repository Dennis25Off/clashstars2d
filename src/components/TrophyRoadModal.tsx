import React from 'react';
import { X, Trophy, Check, Gift } from 'lucide-react';
import { PlayerProfile } from '../types/game';
import { TROPHY_ROAD } from '../utils/storage';
import { sound } from '../utils/audio';

interface TrophyRoadModalProps {
  profile: PlayerProfile;
  onUpdateProfile: (updater: (prev: PlayerProfile) => PlayerProfile) => void;
  onClose: () => void;
}

export const TrophyRoadModal: React.FC<TrophyRoadModalProps> = ({ profile, onUpdateProfile, onClose }) => {
  const handleClaim = (trophyReq: number, rewardType: string, amount: number) => {
    sound.playVictory();
    onUpdateProfile((prev) => {
      let newCoins = prev.coins;
      let newGems = prev.gems;
      let newTokens = prev.tokens;

      if (rewardType === 'coins') newCoins += amount;
      if (rewardType === 'gems') newGems += amount;
      if (rewardType === 'tokens') newTokens += amount;
      if (rewardType === 'box') newTokens += 100 * amount;

      return {
        ...prev,
        coins: newCoins,
        gems: newGems,
        tokens: newTokens,
        claimedTrophyRoad: [...prev.claimedTrophyRoad, trophyReq],
      };
    });
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
      <div className="relative w-full max-w-2xl h-[85vh] max-h-[580px] rounded-3xl bg-slate-900 border-4 border-amber-500 shadow-2xl p-6 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/20 text-amber-400">
              <Trophy className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-white font-game tracking-wide">
                CAMMINO DEI TROFEI
              </h2>
              <p className="text-xs text-slate-400">
                I tuoi trofei attuali: <strong className="text-amber-300">{profile.trophies} 🏆</strong>
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

        {/* Milestone List */}
        <div className="flex-1 overflow-y-auto space-y-3 mt-4 pr-1">
          {TROPHY_ROAD.map((m) => {
            const isReached = profile.trophies >= m.trophies;
            const isClaimed = profile.claimedTrophyRoad.includes(m.trophies);

            return (
              <div
                key={m.trophies}
                className={`p-4 rounded-2xl border-2 flex items-center justify-between transition ${
                  isReached
                    ? 'bg-slate-800/90 border-amber-400/80'
                    : 'bg-slate-950/60 border-slate-800 opacity-60'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-sm border-2 ${
                      isReached
                        ? 'bg-amber-500 text-slate-950 border-white'
                        : 'bg-slate-800 text-slate-500 border-slate-700'
                    }`}
                  >
                    {m.trophies}🏆
                  </div>
                  <div>
                    <div className="font-black text-sm text-white">{m.name}</div>
                    <div className="text-xs text-slate-400">
                      {isReached
                        ? isClaimed
                          ? 'Completato'
                          : 'Pronto da riscattare!'
                        : `Mancano ${m.trophies - profile.trophies} trofei`}
                    </div>
                  </div>
                </div>

                <div>
                  {isClaimed ? (
                    <span className="flex items-center gap-1 text-xs font-bold text-emerald-400 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                      <Check className="w-4 h-4" /> Riscosso
                    </span>
                  ) : isReached ? (
                    <button
                      onClick={() => handleClaim(m.trophies, m.rewardType, m.amount)}
                      className="px-4 py-2 rounded-xl brawl-btn-yellow text-slate-950 font-black text-xs border border-white shadow-lg active:scale-95 transition"
                    >
                      RISCATTA
                    </button>
                  ) : (
                    <span className="text-xs font-bold text-slate-500">Bloccato</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
