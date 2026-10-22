import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { Trophy, Skull, Zap, Play, Home } from 'lucide-react';
import { sound } from '../utils/audio';

interface GameOverModalProps {
  placement: number;
  kills: number;
  powerCubes: number;
  onPlayAgain: () => void;
  onExitToMenu: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  placement,
  kills,
  powerCubes,
  onPlayAgain,
  onExitToMenu,
}) => {
  const isVictory = placement === 1;

  // Calculate trophies and tokens earned based on placement
  let trophyDelta = 0;
  let tokensEarned = 8;

  if (placement === 1) {
    trophyDelta = 10;
    tokensEarned = 34;
  } else if (placement === 2) {
    trophyDelta = 8;
    tokensEarned = 26;
  } else if (placement === 3) {
    trophyDelta = 6;
    tokensEarned = 20;
  } else if (placement === 4) {
    trophyDelta = 4;
    tokensEarned = 16;
  } else if (placement === 5) {
    trophyDelta = 2;
    tokensEarned = 12;
  } else if (placement === 6) {
    trophyDelta = 0;
    tokensEarned = 8;
  } else if (placement === 7) {
    trophyDelta = -1;
    tokensEarned = 7;
  } else if (placement === 8) {
    trophyDelta = -2;
    tokensEarned = 6;
  } else {
    trophyDelta = -3;
    tokensEarned = 6;
  }

  useEffect(() => {
    if (isVictory) {
      sound.playVictory();
      confetti({
        particleCount: 150,
        spread: 100,
        origin: { y: 0.4 },
      });
    } else {
      sound.playElimination();
    }
  }, [isVictory]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fade-in">
      <div className="relative w-full max-w-md rounded-3xl bg-slate-900 border-4 border-amber-500 shadow-2xl p-6 flex flex-col items-center text-center">
        
        {/* Riquadro Rank spostato ALL'INTERNO del corpo del modal senza -mt-12 */}
        <div
          className={`w-full px-6 py-3 rounded-2xl border-4 font-black font-game text-xl sm:text-2xl shadow-xl mb-6 ${
            isVictory
              ? 'bg-amber-400 border-yellow-200 text-slate-950 animate-bounce'
              : placement <= 3
              ? 'bg-sky-500 border-sky-300 text-white'
              : 'bg-slate-800 border-slate-600 text-slate-300'
          }`}
        >
          {isVictory ? 'VITTORIA REALE! #1' : `POSIZIONE #${placement}`}
        </div>

        {/* Stats Grid: Trophies, Tokens, Kills, Power Cubes */}
        <div className="w-full grid grid-cols-2 gap-3 mb-6">
          {/* Trophies */}
          <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 flex flex-col items-center">
            <Trophy className="w-7 h-7 text-amber-400 mb-1" />
            <div className="text-xs text-slate-400 font-bold uppercase">Trofei</div>
            <div
              className={`text-xl font-black font-game ${
                trophyDelta >= 0 ? 'text-amber-300' : 'text-red-400'
              }`}
            >
              {trophyDelta >= 0 ? `+${trophyDelta}` : trophyDelta} 🏆
            </div>
          </div>

          {/* Tokens */}
          <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 flex flex-col items-center">
            <div className="text-2xl mb-1">🎟️</div>
            <div className="text-xs text-slate-400 font-bold uppercase">Gettoni Casse</div>
            <div className="text-xl font-black font-game text-sky-400">
              +{tokensEarned}
            </div>
          </div>

          {/* Kills */}
          <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 flex flex-col items-center">
            <Skull className="w-6 h-6 text-red-500 mb-1" />
            <div className="text-xs text-slate-400 font-bold uppercase">Eliminazioni</div>
            <div className="text-lg font-black text-white font-game">{kills}</div>
          </div>

          {/* Power Cubes */}
          <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 flex flex-col items-center">
            <Zap className="w-6 h-6 text-emerald-400 mb-1" />
            <div className="text-xs text-slate-400 font-bold uppercase">Potenziamenti</div>
            <div className="text-lg font-black text-emerald-400 font-game">{powerCubes}</div>
          </div>
        </div>

        {/* Action Buttons: Play Again or Menu */}
        <div className="w-full flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => {
              sound.playClick();
              onExitToMenu();
            }}
            className="flex-1 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 border-2 border-slate-600 font-black text-xs flex items-center justify-center gap-2 active:scale-95 transition"
          >
            <Home className="w-4 h-4" />
            <span>MENU PRINCIPALE</span>
          </button>

          <button
            onClick={() => {
              sound.playClick();
              onPlayAgain();
            }}
            className="flex-1 py-3 rounded-2xl brawl-btn-yellow text-slate-950 border-2 border-yellow-200 font-black text-xs flex items-center justify-center gap-2 active:scale-95 transition shadow-lg"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>GIOCA ANCORA</span>
          </button>
        </div>
      </div>
    </div>
  );
};
