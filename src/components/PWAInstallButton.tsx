import React, { useState } from 'react';
import { Download, Maximize2, X, Smartphone } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        {/* Fullscreen toggle button to eliminate browser borders */}
        <button
          onClick={toggleFullscreen}
          title="Schermo Intero"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-600 text-xs font-bold text-white shadow transition backdrop-blur-md active:scale-95"
        >
          <Maximize2 className="w-4 h-4 text-sky-400" />
          <span className="hidden sm:inline">Schermo Intero</span>
        </button>

        {/* PWA Install Button for Chromium/Android/Desktop */}
        {!isInstalled && isInstallable && (
          <button
            onClick={install}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 border border-emerald-400 text-xs font-bold text-white shadow-lg transition active:scale-95 animate-pulse"
          >
            <Download className="w-4 h-4" />
            <span>Installa App</span>
          </button>
        )}

        {/* PWA Install Button for iOS */}
        {!isInstalled && isIOS && (
          <button
            onClick={() => setShowIOSGuide(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 border border-indigo-400 text-xs font-bold text-white shadow-lg transition active:scale-95"
          >
            <Smartphone className="w-4 h-4" />
            <span>Installa su iOS</span>
          </button>
        )}
      </div>

      {/* iOS Safari Guided Modal */}
      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-slate-900 border-2 border-indigo-500 p-6 shadow-2xl text-white relative">
            <button
              onClick={() => setShowIOSGuide(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-400">
                <Smartphone className="w-7 h-7" />
              </div>
              <div>
                <h3 className="font-extrabold text-base text-white">Installa Clash Stars</h3>
                <p className="text-xs text-slate-300">Nessuna barra, schermo 100% pieno</p>
              </div>
            </div>
            <div className="space-y-3 text-xs text-slate-200 bg-slate-800/70 p-3.5 rounded-xl border border-slate-700">
              <p className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center font-bold text-[10px]">1</span>
                Tocca il tasto <strong className="text-sky-300">Condividi (Share)</strong> nella barra Safari.
              </p>
              <p className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center font-bold text-[10px]">2</span>
                Scorri in basso e scegli <strong className="text-emerald-300">Aggiungi a schermata Home</strong>.
              </p>
              <p className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center font-bold text-[10px]">3</span>
                Avvia Clash Stars dall'icona per giocare a tutto schermo a 60 FPS!
              </p>
            </div>
            <button
              onClick={() => setShowIOSGuide(false)}
              className="mt-5 w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-bold text-sm text-white"
            >
              Ho capito
            </button>
          </div>
        </div>
      )}
    </>
  );
};
