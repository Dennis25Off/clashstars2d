import React, { useState, useEffect } from 'react';
import { BrawlerId, LobbyPlayerInfo } from '../types/game';

interface MatchStartOverlayProps {
  playerBrawlerId: BrawlerId;
  matchedPlayers: LobbyPlayerInfo[] | null;
  onComplete: () => void;
}

export const MatchStartOverlay: React.FC<MatchStartOverlayProps> = ({
  playerBrawlerId,
  matchedPlayers,
  onComplete,
}) => {
  const [countdown, setCountdown] = useState(5);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    if (countdown === 0) {
      onComplete();
      return;
    }

    setScale(1.3);
    const scaleTimeout = setTimeout(() => setScale(1), 150);

    const timer = setTimeout(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);

    return () => {
      clearTimeout(timer);
      clearTimeout(scaleTimeout);
    };
  }, [countdown, onComplete]);

  // Esclude il primo elemento (che si assume essere il giocatore locale)
  const enemies = matchedPlayers ? matchedPlayers.slice(1) : [];

  return (
    <div className="absolute inset-0 z-50 flex flex-col justify-between bg-black/85 backdrop-blur-sm p-8 text-white select-none pointer-events-auto">
      <div className="text-center mt-4">
        <h1 className="text-4xl font-black tracking-widest text-yellow-400 uppercase drop-shadow-[0_4px_0_#b45309]">
          Scontro Iniziato!
        </h1>
        <p className="text-gray-400 text-sm mt-1 uppercase font-bold tracking-wider">Preparati alla battaglia</p>
      </div>

      <div className="flex items-center justify-around w-full my-auto max-w-6xl mx-auto gap-4">
        {/* TU */}
        <div className="flex flex-col items-center bg-gradient-to-b from-blue-600/40 to-blue-900/40 border-4 border-blue-500 rounded-2xl p-6 w-52 shadow-2xl">
          <span className="bg-blue-500 text-xs font-black px-4 py-1 rounded-full uppercase mb-4 tracking-wider">Tu</span>
          <div className="w-24 h-24 bg-blue-950 border-4 border-blue-400 rounded-full flex items-center justify-center text-4xl">
            🤠
          </div>
          <h2 className="text-xl font-black mt-4 uppercase tracking-wide text-blue-200">{playerBrawlerId}</h2>
        </div>

        {/* TIMER */}
        <div className="flex flex-col items-center justify-center min-w-[160px]">
          <span className="text-xs uppercase font-black tracking-widest text-gray-500 mb-2">Inizio tra</span>
          <div 
            className="text-8xl font-black font-mono text-yellow-400 drop-shadow-[0_6px_0_#b45309] transition-transform duration-150 ease-out"
            style={{ transform: `scale(${scale})` }}
          >
            {countdown}
          </div>
        </div>

        {/* NEMICI IN 2 RIGHE E PIÙ PICCOLI */}
        {enemies.length === 0 ? (
          <div className="text-gray-500 italic font-bold">In attesa degli avversari...</div>
        ) : (
          <div className="grid grid-rows-2 grid-flow-col gap-3">
            {enemies.map((enemy, index) => (
              <div 
                key={index} 
                className="flex flex-col items-center bg-gradient-to-b from-red-600/30 to-red-900/30 border-2 border-red-500 rounded-xl p-3 w-32 shadow-xl"
              >
                <span className="bg-red-500 text-[9px] font-black px-2 py-0.5 rounded-full uppercase mb-2 tracking-wider">Nemico</span>
                <div className="w-12 h-12 bg-red-950 border-2 border-red-400 rounded-full flex items-center justify-center text-xl">
                  👤
                </div>
                <h3 className="text-xs font-black mt-2 uppercase truncate max-w-full text-red-200 text-center">{enemy.name || 'Player'}</h3>
                <span className="text-[11px] text-yellow-500 font-mono font-bold mt-0.5">🏆 {enemy.trophies || 0}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="text-center mb-4 text-xs font-bold text-gray-500 tracking-wide uppercase animate-pulse">
        Consiglio: Raccogli i cubi di energia per aumentare i tuoi punti vita e i danni!
      </div>
    </div>
  );
};
