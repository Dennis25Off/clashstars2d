import React, { useState } from 'react';
import { X, Check, Dices, User, Sparkles } from 'lucide-react';
import { sound } from '../utils/audio';

interface ChangeNameModalProps {
  currentName: string;
  onSave: (newName: string) => void;
  onClose: () => void;
}

const FUN_NAMES = [
  'DuroW3',
  'Peperone2030',
  'BabiloniaRegna',
  'SimbaRaiDue',
  'MarraSoldi',
  'BrawlClone',
  'ProSniper',
  'TitanKing',
  'BlazeMaster',
  'RavenBlade',
  'SonicHarmony',
  'GigaBrawler',
  'ApexChampion',
  'SuperStar99',
  'GhostShooter',
  'PixelHero',
];

export const ChangeNameModal: React.FC<ChangeNameModalProps> = ({
  currentName,
  onSave,
  onClose,
}) => {
  const [name, setName] = useState(currentName);
  const [error, setError] = useState('');

  const handleRandomize = () => {
    sound.playClick();
    const available = FUN_NAMES.filter((n) => n !== name);
    const randomPick = available[Math.floor(Math.random() * available.length)];
    setName(randomPick);
    setError('');
  };

  const handleConfirm = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Il nome non può essere vuoto!');
      return;
    }
    if (trimmed.length < 2) {
      setError('Il nome deve contenere almeno 2 caratteri.');
      return;
    }
    if (trimmed.length > 15) {
      setError('Il nome non può superare 15 caratteri.');
      return;
    }

    sound.playVictory();
    onSave(trimmed);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-sm rounded-3xl bg-gradient-to-b from-slate-900 to-indigo-950 border-4 border-indigo-500/80 shadow-[0_0_50px_rgba(99,102,241,0.5)] p-5 text-white">
        {/* Header with Close */}
        <div className="flex items-center justify-between pb-3 border-b border-indigo-800/60">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-indigo-600 border border-indigo-400">
              <User className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-black font-game text-white tracking-wide">
                CAMBIA NOME
              </h2>
              <p className="text-[11px] text-indigo-300 font-bold">Creati la tua identita'</p>
            </div>
          </div>

          <button
            onClick={() => {
              sound.playClick();
              onClose();
            }}
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 active:scale-95 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Input section */}
        <div className="mt-4 space-y-3">
          <div>
            <label className="block text-xs font-black text-slate-300 uppercase tracking-wider mb-1.5">
              Nuovo Nickname
            </label>
            <div className="relative">
              <input
                type="text"
                value={name}
                maxLength={15}
                onChange={(e) => {
                  setName(e.target.value);
                  setError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleConfirm();
                }}
                placeholder="Inserisci nome..."
                autoFocus
                className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-950/90 border-2 border-indigo-400 text-white font-extrabold text-base focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/40 shadow-inner"
              />
              <span className="absolute right-3 top-3 text-[11px] font-bold text-slate-400">
                {name.length}/15
              </span>
            </div>
            {error && (
              <p className="mt-1 text-xs text-red-400 font-bold animate-pulse">{error}</p>
            )}
          </div>

          {/* Random generator button */}
          <button
            type="button"
            onClick={handleRandomize}
            className="w-full py-2 px-3 rounded-xl bg-indigo-900/60 hover:bg-indigo-900 border border-indigo-500/50 text-indigo-200 text-xs font-bold flex items-center justify-center gap-2 active:scale-95 transition"
          >
            <Dices className="w-4 h-4 text-amber-400" />
            <span>Genera Nome Casuale</span>
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          </button>
        </div>

        {/* Action Buttons */}
        <div className="mt-5 flex items-center gap-2.5">
          <button
            onClick={() => {
              sound.playClick();
              onClose();
            }}
            className="flex-1 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs font-black text-slate-300 active:scale-95 transition"
          >
            ANNULLA
          </button>

          <button
            onClick={handleConfirm}
            className="flex-1 py-2.5 rounded-2xl bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 border-2 border-yellow-200 text-slate-950 text-xs font-black font-game flex items-center justify-center gap-1.5 shadow-lg shadow-amber-500/30 active:scale-95 transition"
          >
            <Check className="w-4 h-4 stroke-[3]" />
            <span>SALVA</span>
          </button>
        </div>
      </div>
    </div>
  );
};
