import React, { useState, useEffect } from 'react';
import { Settings, Gamepad2, Volume2, VolumeX, X, Maximize2, Minimize2 } from 'lucide-react'; // 1. Aggiunto VolumeX
import { PWAInstallButton } from './PWAInstallButton';
import { sound } from '../utils/audio'; // 2. Importata l'utility audio

interface SettingsModalProps {
  onClose: () => void;
  openControls: () => void;
  openAudio: () => void;
}

export function SettingsModal({ onClose, openControls, openAudio }: SettingsModalProps) {
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);
  // 3. Stato locale per monitorare se l'audio è disattivato recuperando il valore iniziale
  const [isMuted, setIsMuted] = useState(sound.getMuted());

  // Monitora se l'utente cambia lo stato del fullscreen (es. premendo F11)
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.error(`Errore attivazione schermo intero: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  // 4. Gestione del click sull'audio combinata con l'aggiornamento grafico del modal
  const handleAudioClick = () => {
    openAudio(); // Esegue la logica passata dalla Lobby
    setIsMuted(sound.getMuted()); // Sincronizza istantaneamente l'interfaccia del modal
  };

  return (
    /* Sfondo oscurato ad alta opacità con sfocatura, coerente con lo stile */
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      
      {/* Contenitore con lo stile identico a ChangeNameModal */}
      <div className="relative w-full max-w-sm rounded-3xl bg-gradient-to-b from-slate-900 to-indigo-950 border-4 border-indigo-500/80 shadow-[0_0_50px_rgba(99,102,241,0.5)] p-5 text-white">
        
        {/* Header stilizzato */}
        <div className="flex items-center justify-between pb-3 border-b border-indigo-800/60 mb-4">
          <div className="flex items-center gap-2">
            {/* Cornice icona indaco */}
            <div className="p-2 rounded-xl bg-indigo-600 border border-indigo-400">
              <Settings className="w-5 h-5 text-white animate-[spin_10s_linear_infinite]" />
            </div>
            <div>
              <h2 className="text-lg font-black font-game text-white tracking-wide uppercase">
                IMPOSTAZIONI
              </h2>
              <p className="text-[11px] text-indigo-300 font-bold">Configura le tue impostazioni di gioco</p>
            </div>
          </div>

          {/* Tasto chiusura coordinato */}
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 active:scale-95 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Lista Opzioni con bottoni stilizzati per integrarsi con lo stile scuro/indaco */}
        <div className="flex flex-col gap-3">
          
          {/* Opzione 1: Mappatura Comandi */}
          <button 
            onClick={openControls}
            className="flex items-center justify-between w-full bg-slate-950/60 hover:bg-indigo-950 p-3 rounded-2xl border-2 border-indigo-500/30 hover:border-indigo-400 text-left transition-all active:scale-95 group"
          >
            <div className="flex items-center gap-2.5">
              <Gamepad2 className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
              <span className="font-extrabold text-sm tracking-wide">Gestione Comandi</span>
            </div>
            <span className="text-indigo-300 text-xs font-bold">WASD & Touch</span>
          </button>

          {/* Opzione 2: Opzioni Audio (Dinamica) */}
          <button 
            onClick={handleAudioClick}
            className="flex items-center justify-between w-full bg-slate-950/60 hover:bg-indigo-950 p-3 rounded-2xl border-2 border-indigo-500/30 hover:border-indigo-400 text-left transition-all active:scale-95 group"
          >
            <div className="flex items-center gap-2.5">
              {/* Mostra l'icona corretta in base allo stato mutato */}
              {isMuted ? (
                <VolumeX className="w-4 h-4 text-red-400 group-hover:scale-110 transition-transform" />
              ) : (
                <Volume2 className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
              )}
              <span className="font-extrabold text-sm tracking-wide">Attiva/Disattiva Audio</span>
            </div>
            {/* Cambia il testo laterale in base allo stato dell'audio */}
            <span className={`text-xs font-bold ${isMuted ? 'text-red-400' : 'text-emerald-400'}`}>
              {isMuted ? 'Disattivato' : 'Attivato'}
            </span>
          </button>

          {/* Opzione 3: Schermo Intero */}
          <button 
            onClick={toggleFullscreen}
            className="flex items-center justify-between w-full bg-slate-950/60 hover:bg-indigo-950 p-3 rounded-2xl border-2 border-indigo-500/30 hover:border-indigo-400 text-left transition-all active:scale-95 group"
          >
            <div className="flex items-center gap-2.5">
              {isFullscreen ? (
                <Minimize2 className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
              ) : (
                <Maximize2 className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
              )}
              <span className="font-extrabold text-sm tracking-wide">Schermo Intero</span>
            </div>
            <span className="text-indigo-300 text-xs font-bold">{isFullscreen ? 'Disattiva' : 'Attiva'}</span>
          </button>

          {/* Opzione 4: PWA Install Button */}
          <div className="w-full *.w-full *.justify-between *.bg-slate-950\/60 *.hover:bg-indigo-950 *.p-3 *.rounded-2xl *.border-2 *.border-indigo-500\/30 *.hover:border-indigo-400 *.text-left *.transition-all *.flex *.items-center *.active:scale-95 font-extrabold text-sm tracking-wide text-white">
            <PWAInstallButton />
          </div>

        </div>
      </div>
    </div>
  );
}
