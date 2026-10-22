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

  // Esclude il primo elemento (che si assume essere il giocatore locale) per avere la lista dei nemici
  const enemies = matchedPlayers ? matchedPlayers.slice(1) : [];

  return (
    <div className="absolute inset-0 z-50 flex flex-col justify-between bg-black/85 backdrop-blur-sm p-8 text-white select-none pointer-events-auto">
      
      {/* SEZIONE SUPERIORE: Titolo e Contatore Countdown */}
      <div className="text-center mt-2 flex flex-col items-center justify-center gap-2">
        <h1 className="text-3xl font-black tracking-widest text-yellow-400 uppercase drop-shadow-[0_3px_0_#b45309]">
          Scontro Iniziato!
        </h1>
        <div className="flex items-center gap-2 bg-black/40 border border-gray-700/50 rounded-full px-5 py-1.5 shadow-inner">
          <span className="text-[10px] uppercase font-black tracking-widest text-gray-400">Inizio tra</span>
          <div 
            className="text-4xl font-black font-mono text-yellow-400 drop-shadow-[0_2px_0_#b45309] transition-transform duration-150 ease-out min-w-[28px]"
            style={{ transform: `scale(${scale})` }}
          >
            {countdown}
          </div>
        </div>
      </div>

      {/* SEZIONE CENTRALE: Griglia unica con "TU" in prima posizione */}
      <div className="flex items-center justify-center w-full my-auto max-w-6xl mx-auto">
        <div className="grid grid-rows-2 grid-flow-col gap-4">
          
          {/* 1. LA TUA SCHEDA (Sempre per prima nella griglia) */}
          <div className="flex flex-col items-center bg-gradient-to-b from-blue-600/40 to-blue-900/40 border-2 border-blue-400 rounded-xl p-3 w-32 shadow-xl shadow-blue-500/10 transform hover:scale-105 transition-transform duration-200">
            <span className="bg-blue-500 text-[9px] font-black px-2.5 py-0.5 rounded-full uppercase mb-2 tracking-wider shadow">Tu</span>
            <div className="w-12 h-12 bg-blue-950 border-2 border-blue-400 rounded-full flex items-center justify-center text-xl shadow-inner">
              🤠
            </div>
            <h3 className="text-xs font-black mt-2 uppercase truncate max-w-full text-blue-200 text-center">{playerBrawlerId}</h3>
            <span className="text-[11px] text-yellow-400 font-mono font-bold mt-0.5">🏆 MAX</span>
          </div>

          {/* 2. GLI ALTRI GIOCATORI / NEMICI (Riempiono i posti successivi nella griglia a 2 righe) */}
          {enemies.length === 0 ? (
            <div className="text-gray-500 italic font-bold flex items-center col-span-3 pl-4">In attesa degli avversari...</div>
          ) : (
            enemies.map((enemy, index) => (
              <div 
                key={index} 
                className="flex flex-col items-center bg-gradient-to-b from-red-600/25 to-red-900/25 border-2 border-red-500/60 rounded-xl p-3 w-32 shadow-lg"
              >
                <span className="bg-red-500/80 text-[9px] font-black px-2 py-0.5 rounded-full uppercase mb-2 tracking-wider">Nemico</span>
                <div className="w-12 h-12 bg-red-950 border-2 border-red-400/50 rounded-full flex items-center justify-center text-xl shadow-inner">
                  👤
                </div>
                <h3 className="text-xs font-black mt-2 uppercase truncate max-w-full text-red-200 text-center">{enemy.name || 'Player'}</h3>
                <span className="text-[11px] text-yellow-500/80 font-mono font-bold mt-0.5">🏆 {enemy.trophies || 0}</span>
              </div>
            ))
          )}

        </div>
      </div>

      {/* SEZIONE INFERIORE: Suggerimento */}
      <div className="text-center mb-2 text-xs font-bold text-gray-500 tracking-wide uppercase animate-pulse">
        Consiglio: Raccogli i cubi di energia per aumentare i tuoi punti vita e i danni!
      </div>
    </div>
  );
};
