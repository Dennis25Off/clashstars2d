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

  const enemies = matchedPlayers ? matchedPlayers.slice(1) : [];

  return (
    // Ridotto il padding da p-8 a p-4 su mobile (p-6 su schermi medi)
    <div className="absolute inset-0 z-50 flex flex-col justify-between bg-black/90 backdrop-blur-sm p-4 md:p-6 text-white select-none pointer-events-auto overflow-y-auto">
      
      {/* SEZIONE SUPERIORE: Titolo e Contatore compatti */}
      <div className="text-center mt-1 flex flex-col items-center justify-center gap-1">
        <h1 className="text-xl md:text-3xl font-black tracking-widest text-yellow-400 uppercase drop-shadow-[0_2px_0_#b45309]">
          Scontro Iniziato!
        </h1>
        <div className="flex items-center gap-2 bg-black/50 border border-gray-700/40 rounded-full px-4 py-1 shadow-inner">
          <span className="text-[9px] uppercase font-black tracking-widest text-gray-400">Inizio</span>
          <div 
            className="text-2xl md:text-4xl font-black font-mono text-yellow-400 drop-shadow-[0_2px_0_#b45309] transition-transform duration-150 ease-out min-w-[20px]"
            style={{ transform: `scale(${scale})` }}
          >
            {countdown}
          </div>
        </div>
      </div>

      {/* SEZIONE CENTRALE: Griglia ultra-ottimizzata */}
      <div className="flex items-center justify-center w-full my-auto max-w-5xl mx-auto py-2">
        {/* Su mobile usa flex-wrap con card più piccole, su desktop torna in griglia a 2 righe fisse */}
        <div className="flex flex-wrap justify-center items-center gap-2 md:grid md:grid-rows-2 md:grid-flow-col md:gap-3">
          
          {/* 1. LA TUA SCHEDA (Compatta) */}
          <div className="flex flex-col items-center bg-gradient-to-b from-blue-600/40 to-blue-900/40 border-2 border-blue-400 rounded-lg p-2 w-24 md:w-28 shadow-lg transform active:scale-95 transition-transform">
            <span className="bg-blue-500 text-[8px] font-black px-2 py-0.5 rounded-full uppercase mb-1 tracking-wider shadow">Tu</span>
            <div className="w-10 h-12 bg-blue-950 border border-blue-400 rounded-md flex items-center justify-center text-lg shadow-inner">
              🤠
            </div>
            <h3 className="text-[10px] md:text-xs font-black mt-1.5 uppercase truncate max-w-full text-blue-200 text-center">{playerBrawlerId}</h3>
            <span className="text-[9px] md:text-[10px] text-yellow-400 font-mono font-bold mt-0.5">🏆 MAX</span>
          </div>

          {/* 2. GLI ALTRI GIOCATORI */}
          {enemies.length === 0 ? (
            <div className="text-gray-500 text-xs italic font-bold">In attesa degli avversari...</div>
          ) : (
            enemies.map((enemy, index) => (
              <div 
                key={index} 
                className="flex flex-col items-center bg-gradient-to-b from-red-600/20 to-red-900/20 border border-red-500/50 rounded-lg p-2 w-24 md:w-28 shadow-md"
              >
                <span className="bg-red-500/80 text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase mb-1 tracking-wider">Nemico</span>
                <div className="w-10 h-10 bg-red-950 border border-red-500/40 rounded-full flex items-center justify-center text-lg shadow-inner">
                  👤
                </div>
                <h3 className="text-[10px] md:text-xs font-black mt-1.5 uppercase truncate max-w-full text-red-200 text-center">{enemy.name || 'Player'}</h3>
                <span className="text-[9px] md:text-[10px] text-yellow-500/70 font-mono font-bold mt-0.5">🏆 {enemy.trophies || 0}</span>
              </div>
            ))
          )}

        </div>
      </div>

      {/* SEZIONE INFERIORE: Suggerimento rimpicciolito o nascosto su schermi piccolissimi */}
      <div className="text-center text-[10px] font-bold text-gray-500 tracking-wide uppercase animate-pulse hidden sm:block">
        Consiglio: Raccogli i cubi di energia per aumentare i tuoi punti vita e i danni!
      </div>
    </div>
  );
};
