import React, { useState, useEffect } from 'react';
import {
  X,
  Keyboard,
  Smartphone,
  MousePointer,
  Zap,
  Shield,
  Crosshair,
  RotateCcw,
  Check,
  Flame,
  Gamepad2,
  Sparkles,
  SlidersHorizontal,
  Target,
} from 'lucide-react';
import { ControlsConfig, DEFAULT_CONTROLS_CONFIG, MobileMoveMode, PCLayoutMode } from '../types/game';
import { sound } from '../utils/audio';

interface ControlsMappingModalProps {
  currentConfig?: ControlsConfig;
  onSave: (config: ControlsConfig) => void;
  onClose: () => void;
}

export const ControlsMappingModal: React.FC<ControlsMappingModalProps> = ({
  currentConfig,
  onSave,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'pc' | 'mobile' | 'test'>('pc');
  const [config, setConfig] = useState<ControlsConfig>(() => ({
    ...DEFAULT_CONTROLS_CONFIG,
    ...(currentConfig || {}),
  }));

  // Live keypress feedback for the interactive preview
  const [activePressedKeys, setActivePressedKeys] = useState<Record<string, boolean>>({});
  const [lastActionTriggered, setLastActionTriggered] = useState<string>('');

  // Interactive Touch Aim Sensitivity Live Tester state
  const [testAimStick, setTestAimStick] = useState<{
    active: boolean;
    dx: number;
    dy: number;
    angle: number;
    power: number;
  }>({
    active: false,
    dx: 0,
    dy: 0,
    angle: 0,
    power: 0,
  });

  const handleTestAimPointer = (clientX: number, clientY: number, target: HTMLElement) => {
    const rect = target.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const rawDx = clientX - rect.left - centerX;
    const rawDy = clientY - rect.top - centerY;

    const sens = config.touchAimSensitivity ?? 1.0;
    const scaledDx = rawDx * sens;
    const scaledDy = rawDy * sens;
    const scaledDist = Math.hypot(scaledDx, scaledDy);
    const maxRadius = 45;
    const normDist = Math.min(scaledDist, maxRadius);
    const angle = Math.atan2(scaledDy, scaledDx);

    const clampedDx = scaledDist > 0 ? (scaledDx / scaledDist) * normDist : 0;
    const clampedDy = scaledDist > 0 ? (scaledDy / scaledDist) * normDist : 0;

    setTestAimStick({
      active: true,
      dx: clampedDx,
      dy: clampedDy,
      angle,
      power: Math.round((normDist / maxRadius) * 100),
    });
  };

  const handleTestAimRelease = () => {
    setTestAimStick({ active: false, dx: 0, dy: 0, angle: 0, power: 0 });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      setActivePressedKeys((prev) => ({ ...prev, [k]: true, [e.code.toLowerCase()]: true }));

      if (['w', 'arrowup'].includes(k)) setLastActionTriggered('Movimento Verso L\'Alto (Su)');
      else if (['s', 'arrowdown'].includes(k)) setLastActionTriggered('Movimento Verso Il Basso (Giù)');
      else if (['a', 'arrowleft'].includes(k)) setLastActionTriggered('Movimento Verso Sinistra');
      else if (['d', 'arrowright'].includes(k)) setLastActionTriggered('Movimento Verso Destra');
      else if ([' ', 'r'].includes(k)) setLastActionTriggered('SUPER Attivata!');
      else if (['e', 'q'].includes(k)) setLastActionTriggered('Gadget Utilizzato!');
      else if (['f'].includes(k)) setLastActionTriggered('Attacco Normale!');
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      setActivePressedKeys((prev) => ({ ...prev, [k]: false, [e.code.toLowerCase()]: false }));
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const handleReset = () => {
    sound.playClick();
    setConfig({ ...DEFAULT_CONTROLS_CONFIG });
  };

  const handleSaveAndExit = () => {
    sound.playClick();
    onSave(config);
    onClose();
  };

  const isKeyActive = (key: string) => !!activePressedKeys[key.toLowerCase()];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md animate-fadeIn font-['Outfit',sans-serif]">
      <div className="relative w-full max-w-2xl bg-[#0c1222] border-3 border-amber-400/80 rounded-3xl shadow-[0_0_50px_rgba(245,158,11,0.25)] flex flex-col max-h-[92vh] overflow-hidden text-white">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b-2 border-slate-800 bg-gradient-to-r from-amber-500/20 via-slate-900 to-indigo-950/40">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-2xl bg-amber-500/20 border-2 border-amber-400 flex items-center justify-center shadow-md">
              <Gamepad2 className="w-5 h-5 sm:w-6 sm:h-6 text-amber-400 animate-pulse" />
            </div>
            <div>
              <h2 className="text-base sm:text-xl font-black font-game text-white tracking-wide flex items-center gap-2">
                MAPPATURA COMANDI & TASTI
              </h2>
              <p className="text-[10px] sm:text-xs text-amber-300 font-semibold">
                Personalizza controlli per PC (WASD) e Mobile (Touch)
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              sound.playClick();
              onClose();
            }}
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-slate-800 hover:bg-red-600 border border-slate-600 text-slate-300 hover:text-white flex items-center justify-center transition active:scale-95"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab navigation */}
        <div className="flex items-center gap-1 sm:gap-2 px-3 sm:px-6 pt-3 border-b border-slate-800 bg-slate-950/60 shrink-0">
          <button
            onClick={() => {
              sound.playClick();
              setActiveTab('pc');
            }}
            className={`flex items-center gap-1.5 px-3 sm:px-5 py-2 rounded-t-2xl font-black text-xs sm:text-sm tracking-wide transition border-t-2 border-x-2 ${
              activeTab === 'pc'
                ? 'bg-[#0c1222] border-amber-400 text-amber-300 shadow-lg -mb-[1px]'
                : 'bg-transparent border-transparent text-slate-400 hover:text-white hover:bg-slate-900/50'
            }`}
          >
            <Keyboard className="w-4 h-4" />
            <span>PC & Tastiera (WASD)</span>
          </button>

          <button
            onClick={() => {
              sound.playClick();
              setActiveTab('mobile');
            }}
            className={`flex items-center gap-1.5 px-3 sm:px-5 py-2 rounded-t-2xl font-black text-xs sm:text-sm tracking-wide transition border-t-2 border-x-2 ${
              activeTab === 'mobile'
                ? 'bg-[#0c1222] border-sky-400 text-sky-300 shadow-lg -mb-[1px]'
                : 'bg-transparent border-transparent text-slate-400 hover:text-white hover:bg-slate-900/50'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            <span>Mobile & Touchscreen</span>
          </button>

          <button
            onClick={() => {
              sound.playClick();
              setActiveTab('test');
            }}
            className={`flex items-center gap-1.5 px-3 sm:px-5 py-2 rounded-t-2xl font-black text-xs sm:text-sm tracking-wide transition border-t-2 border-x-2 ${
              activeTab === 'test'
                ? 'bg-[#0c1222] border-emerald-400 text-emerald-300 shadow-lg -mb-[1px]'
                : 'bg-transparent border-transparent text-slate-400 hover:text-white hover:bg-slate-900/50'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>Test Comandi Live</span>
          </button>
        </div>

        {/* Scrollable Tab Content */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-4 sm:space-y-5 text-slate-200">
          {/* TAB 1: PC & KEYBOARD (WASD) */}
          {activeTab === 'pc' && (
            <div className="space-y-4">
              {/* Layout Switcher */}
              <div className="p-3 sm:p-4 rounded-2xl bg-slate-900/90 border border-slate-700/80">
                <label className="block text-xs sm:text-sm font-black text-amber-300 mb-2">
                  SCHEMA DI CONTROLLO PC SELEZIONATO
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    onClick={() => {
                      sound.playClick();
                      setConfig((c) => ({ ...c, pcLayout: 'wasd_mouse' }));
                    }}
                    className={`p-2.5 rounded-xl border-2 text-left flex flex-col gap-1 transition ${
                      config.pcLayout === 'wasd_mouse'
                        ? 'bg-amber-500/20 border-amber-400 text-white shadow-md'
                        : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span className="font-black text-xs flex items-center justify-between">
                      WASD + Mouse
                      {config.pcLayout === 'wasd_mouse' && <Check className="w-4 h-4 text-amber-400" />}
                    </span>
                    <span className="text-[10px] text-slate-400 leading-tight">
                      Movimento WASD, mira mouse, click per sparare. (Consigliato!)
                    </span>
                  </button>

                  <button
                    onClick={() => {
                      sound.playClick();
                      setConfig((c) => ({ ...c, pcLayout: 'wasd_keyboard' }));
                    }}
                    className={`p-2.5 rounded-xl border-2 text-left flex flex-col gap-1 transition ${
                      config.pcLayout === 'wasd_keyboard'
                        ? 'bg-amber-500/20 border-amber-400 text-white shadow-md'
                        : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span className="font-black text-xs flex items-center justify-between">
                      Solo Tastiera
                      {config.pcLayout === 'wasd_keyboard' && <Check className="w-4 h-4 text-amber-400" />}
                    </span>
                    <span className="text-[10px] text-slate-400 leading-tight">
                      WASD per muoversi, F per attacco, Spazio/R per Super.
                    </span>
                  </button>

                  <button
                    onClick={() => {
                      sound.playClick();
                      setConfig((c) => ({ ...c, pcLayout: 'arrows' }));
                    }}
                    className={`p-2.5 rounded-xl border-2 text-left flex flex-col gap-1 transition ${
                      config.pcLayout === 'arrows'
                        ? 'bg-amber-500/20 border-amber-400 text-white shadow-md'
                        : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span className="font-black text-xs flex items-center justify-between">
                      Frecce Direzionali
                      {config.pcLayout === 'arrows' && <Check className="w-4 h-4 text-amber-400" />}
                    </span>
                    <span className="text-[10px] text-slate-400 leading-tight">
                      Frecce ↑←↓→ per muoverti, Spazio per Super, Mouse per mira.
                    </span>
                  </button>
                </div>
              </div>

              {/* FOV (Field Of View) Setting */}
              <div className="p-3 sm:p-4 rounded-2xl bg-gradient-to-r from-indigo-950/60 via-slate-900 to-indigo-950/60 border-2 border-indigo-500/80 shadow-md">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs sm:text-sm font-black text-indigo-300 flex items-center gap-1.5">
                    <span>👁️ CAMPO VISIVO (FOV) & ZOOM</span>
                    <span className="px-2 py-0.2 rounded-full bg-indigo-500 text-white font-extrabold text-[9px] uppercase">
                      Espanso
                    </span>
                  </label>
                  <span className="text-[10px] text-slate-400 font-semibold hidden sm:inline">
                    Usa anche la rotellina del mouse o il pinch su touch per zoomare in partita!
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    onClick={() => {
                      sound.playClick();
                      setConfig((c) => ({ ...c, fovMode: 'wide' }));
                    }}
                    className={`p-2.5 rounded-xl border-2 text-left flex flex-col gap-1 transition ${
                      (config.fovMode || 'wide') === 'wide'
                        ? 'bg-indigo-600/30 border-indigo-400 text-white shadow-md'
                        : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span className="font-black text-xs flex items-center justify-between">
                      🌟 Ampio (0.65x)
                      {(config.fovMode || 'wide') === 'wide' && <Check className="w-4 h-4 text-indigo-400" />}
                    </span>
                    <span className="text-[10px] text-slate-400 leading-tight">
                      Visuale bilanciata e tattica (Consigliato). Copre l'intera zona di combattimento.
                    </span>
                  </button>

                  <button
                    onClick={() => {
                      sound.playClick();
                      setConfig((c) => ({ ...c, fovMode: 'ultra' }));
                    }}
                    className={`p-2.5 rounded-xl border-2 text-left flex flex-col gap-1 transition ${
                      config.fovMode === 'ultra'
                        ? 'bg-indigo-600/30 border-indigo-400 text-white shadow-md'
                        : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span className="font-black text-xs flex items-center justify-between">
                      🦅 Ultra Panoramico (0.52x)
                      {config.fovMode === 'ultra' && <Check className="w-4 h-4 text-indigo-400" />}
                    </span>
                    <span className="text-[10px] text-slate-400 leading-tight">
                      Visione aerea massima. Vedi i nemici e la nube tossica da enorme distanza.
                    </span>
                  </button>

                  <button
                    onClick={() => {
                      sound.playClick();
                      setConfig((c) => ({ ...c, fovMode: 'normal' }));
                    }}
                    className={`p-2.5 rounded-xl border-2 text-left flex flex-col gap-1 transition ${
                      config.fovMode === 'normal'
                        ? 'bg-indigo-600/30 border-indigo-400 text-white shadow-md'
                        : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span className="font-black text-xs flex items-center justify-between">
                      🎯 Normale (0.82x)
                      {config.fovMode === 'normal' && <Check className="w-4 h-4 text-indigo-400" />}
                    </span>
                    <span className="text-[10px] text-slate-400 leading-tight">
                      Inquadratura classica più ravvicinata con dettagli grafici ingranditi.
                    </span>
                  </button>
                </div>
              </div>

              {/* Visual Keyboard Cluster */}
              <div className="p-3 sm:p-5 rounded-2xl bg-slate-900/80 border-2 border-slate-700">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-black text-xs sm:text-sm text-white uppercase tracking-wider flex items-center gap-1.5">
                    <Keyboard className="w-4 h-4 text-amber-400" />
                    Tasti Visibili & Funzione in Gioco
                  </h3>
                  <span className="text-[10px] text-slate-400">Premi un tasto per provarlo!</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                  {/* WASD Movement Cluster */}
                  <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex flex-col items-center">
                    <span className="text-[11px] font-black text-sky-400 mb-2 uppercase tracking-wide">
                      Movimento Personaggio
                    </span>
                    <div className="flex flex-col items-center gap-1.5">
                      {/* W Key */}
                      <div
                        className={`w-12 h-12 rounded-xl border-2 flex flex-col items-center justify-center font-black text-sm shadow-md transition-all ${
                          isKeyActive('w') || isKeyActive('arrowup')
                            ? 'bg-sky-500 border-white text-white scale-110 shadow-sky-500/60'
                            : 'bg-slate-800 border-slate-600 text-slate-200'
                        }`}
                      >
                        <span className="text-[9px] text-sky-300">▲</span>
                        <span>W</span>
                      </div>

                      {/* A, S, D Keys */}
                      <div className="flex items-center gap-1.5">
                        <div
                          className={`w-12 h-12 rounded-xl border-2 flex flex-col items-center justify-center font-black text-sm shadow-md transition-all ${
                            isKeyActive('a') || isKeyActive('arrowleft')
                              ? 'bg-sky-500 border-white text-white scale-110 shadow-sky-500/60'
                              : 'bg-slate-800 border-slate-600 text-slate-200'
                          }`}
                        >
                          <span className="text-[9px] text-sky-300">◄</span>
                          <span>A</span>
                        </div>
                        <div
                          className={`w-12 h-12 rounded-xl border-2 flex flex-col items-center justify-center font-black text-sm shadow-md transition-all ${
                            isKeyActive('s') || isKeyActive('arrowdown')
                              ? 'bg-sky-500 border-white text-white scale-110 shadow-sky-500/60'
                              : 'bg-slate-800 border-slate-600 text-slate-200'
                          }`}
                        >
                          <span className="text-[9px] text-sky-300">▼</span>
                          <span>S</span>
                        </div>
                        <div
                          className={`w-12 h-12 rounded-xl border-2 flex flex-col items-center justify-center font-black text-sm shadow-md transition-all ${
                            isKeyActive('d') || isKeyActive('arrowright')
                              ? 'bg-sky-500 border-white text-white scale-110 shadow-sky-500/60'
                              : 'bg-slate-800 border-slate-600 text-slate-200'
                          }`}
                        >
                          <span className="text-[9px] text-sky-300">►</span>
                          <span>D</span>
                        </div>
                      </div>
                    </div>
                    <span className="text-[9px] text-slate-400 mt-2 text-center">
                      Oppure usa i tasti freccia ↑ ← ↓ →
                    </span>
                  </div>

                  {/* Actions & Combat Cluster */}
                  <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex flex-col justify-between gap-2">
                    <span className="text-[11px] font-black text-red-400 uppercase tracking-wide text-center">
                      Azioni di Combattimento
                    </span>

                    {/* Attack */}
                    <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900 border border-slate-800">
                      <div className="flex items-center gap-2">
                        <Crosshair className="w-4 h-4 text-red-400" />
                        <span className="text-xs font-bold text-white">Attacco Base</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span
                          className={`px-2 py-0.5 rounded border text-[11px] font-black ${
                            isKeyActive('f')
                              ? 'bg-red-600 border-white text-white'
                              : 'bg-slate-800 border-slate-700 text-slate-300'
                          }`}
                        >
                          F
                        </span>
                        <span className="text-[10px] text-slate-400">o</span>
                        <span className="px-2 py-0.5 rounded border border-slate-700 bg-slate-800 text-[11px] font-black text-slate-300">
                          Click SX
                        </span>
                      </div>
                    </div>

                    {/* Super */}
                    <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900 border border-slate-800">
                      <div className="flex items-center gap-2">
                        <Zap className="w-4 h-4 text-yellow-400" />
                        <span className="text-xs font-bold text-white">Super Mossa</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span
                          className={`px-2 py-0.5 rounded border text-[11px] font-black ${
                            isKeyActive(' ')
                              ? 'bg-yellow-500 border-white text-slate-950'
                              : 'bg-slate-800 border-slate-700 text-yellow-400'
                          }`}
                        >
                          SPAZIO
                        </span>
                        <span className="text-[10px] text-slate-400">o</span>
                        <span
                          className={`px-2 py-0.5 rounded border text-[11px] font-black ${
                            isKeyActive('r')
                              ? 'bg-yellow-500 border-white text-slate-950'
                              : 'bg-slate-800 border-slate-700 text-slate-300'
                          }`}
                        >
                          R
                        </span>
                        <span className="text-[10px] text-slate-400">o</span>
                        <span className="px-1.5 py-0.5 rounded border border-slate-700 bg-slate-800 text-[10px] font-black text-slate-300">
                          Click DX
                        </span>
                      </div>
                    </div>

                    {/* Gadget */}
                    <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900 border border-slate-800">
                      <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-emerald-400" />
                        <span className="text-xs font-bold text-white">Gadget Attivo</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span
                          className={`px-2 py-0.5 rounded border text-[11px] font-black ${
                            isKeyActive('e')
                              ? 'bg-emerald-600 border-white text-white'
                              : 'bg-slate-800 border-slate-700 text-emerald-400'
                          }`}
                        >
                          E
                        </span>
                        <span className="text-[10px] text-slate-400">o</span>
                        <span
                          className={`px-2 py-0.5 rounded border text-[11px] font-black ${
                            isKeyActive('q')
                              ? 'bg-emerald-600 border-white text-white'
                              : 'bg-slate-800 border-slate-700 text-slate-300'
                          }`}
                        >
                          Q
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Show Visible Key Badges on HUD toggle */}
              <div className="p-3 sm:p-4 rounded-2xl bg-slate-900/90 border border-slate-700 flex items-center justify-between">
                <div>
                  <h4 className="text-xs sm:text-sm font-black text-white">
                    Mostra Tasti Visibili a Schermo durante il match
                  </h4>
                  <p className="text-[10px] sm:text-xs text-slate-400">
                    Mostra i pulsanti [W][A][S][D], [Click], [Spazio] e [E] sovraimpressi sui comandi in partita.
                  </p>
                </div>
                <button
                  onClick={() => {
                    sound.playClick();
                    setConfig((c) => ({ ...c, showVisibleKeys: !c.showVisibleKeys }));
                  }}
                  className={`w-12 h-7 rounded-full transition-colors relative flex items-center px-1 ${
                    config.showVisibleKeys ? 'bg-amber-500' : 'bg-slate-700'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white transition-transform ${
                      config.showVisibleKeys ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: MOBILE & TOUCHSCREEN */}
          {activeTab === 'mobile' && (
            <div className="space-y-4">
              {/* Movement Mode Selector */}
              <div className="p-3 sm:p-4 rounded-2xl bg-slate-900/90 border border-slate-700">
                <label className="block text-xs sm:text-sm font-black text-sky-300 mb-2">
                  MODALITÀ DI MOVIMENTO MOBILE (POLLICE SINISTRO)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {/* Option 1: Virtual Analog Joystick */}
                  <button
                    onClick={() => {
                      sound.playClick();
                      setConfig((c) => ({ ...c, mobileMoveMode: 'joystick' }));
                    }}
                    className={`p-3 rounded-2xl border-2 text-left flex items-start gap-3 transition ${
                      config.mobileMoveMode === 'joystick'
                        ? 'bg-sky-500/20 border-sky-400 text-white shadow-lg shadow-sky-500/20'
                        : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-full border-2 border-sky-400 bg-sky-950/60 flex items-center justify-center shrink-0">
                      <div className="w-4 h-4 rounded-full bg-sky-400" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-black text-xs sm:text-sm text-sky-300">
                          Joystick Virtuale Fluido
                        </span>
                        {config.mobileMoveMode === 'joystick' && <Check className="w-4 h-4 text-sky-400" />}
                      </div>
                      <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5">
                        Trascina il pollice ovunque nell'area sinistra per muovere a 360° con velocità proporzionale.
                      </p>
                    </div>
                  </button>

                  {/* Option 2: Visible D-Pad Keys */}
                  <button
                    onClick={() => {
                      sound.playClick();
                      setConfig((c) => ({ ...c, mobileMoveMode: 'dpad' }));
                    }}
                    className={`p-3 rounded-2xl border-2 text-left flex items-start gap-3 transition ${
                      config.mobileMoveMode === 'dpad'
                        ? 'bg-sky-500/20 border-sky-400 text-white shadow-lg shadow-sky-500/20'
                        : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-xl border-2 border-sky-400 bg-sky-950/60 flex items-center justify-center shrink-0 font-black text-xs text-sky-300">
                      WASD
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-black text-xs sm:text-sm text-sky-300">
                          Pulsantiera Tasti Direzionali
                        </span>
                        {config.mobileMoveMode === 'dpad' && <Check className="w-4 h-4 text-sky-400" />}
                      </div>
                      <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5">
                        Tasti fisici a croce visibili [▲ W], [◄ A], [▼ S], [► D] da toccare per un controllo arcade diretto.
                      </p>
                    </div>
                  </button>
                </div>
              </div>

              {/* Touch Aim Sensitivity Control Card */}
              <div className="p-3 sm:p-5 rounded-2xl bg-slate-900/90 border-2 border-amber-500/40 shadow-lg shadow-amber-500/5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border-2 border-amber-400 flex items-center justify-center shrink-0 shadow-md">
                      <SlidersHorizontal className="w-5 h-5 text-amber-400" />
                    </div>
                    <div>
                      <h4 className="text-xs sm:text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                        SENSIBILITÀ DI MIRA TOUCH
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-400/40 font-bold">
                          JOYSTICK DESTRO
                        </span>
                      </h4>
                      <p className="text-[10px] sm:text-xs text-slate-300">
                        Regola l'escursione del pollice e la reattività di puntamento per l'attacco manuale.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 self-start sm:self-center px-3 py-1.5 rounded-2xl bg-gradient-to-r from-amber-500/25 to-yellow-500/25 border-2 border-amber-400 text-amber-300 font-black text-sm shadow">
                    <Target className="w-4 h-4 text-amber-400 animate-pulse" />
                    <span>{Math.round((config.touchAimSensitivity ?? 1.0) * 100)}%</span>
                    <span className="text-xs text-amber-200">({(config.touchAimSensitivity ?? 1.0).toFixed(1)}x)</span>
                  </div>
                </div>

                {/* Range Slider */}
                <div className="space-y-1.5 px-1 bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                  <div className="flex justify-between items-center text-[10px] sm:text-[11px] font-black text-slate-400">
                    <span className="text-sky-300 flex items-center gap-1">
                      🎯 Precisione (0.5x - 50%)
                    </span>
                    <span className="text-amber-300 font-black">
                      ⚡ Standard (1.0x - 100%)
                    </span>
                    <span className="text-red-400 flex items-center gap-1">
                      🔥 Iper-Reattivo (2.0x - 200%)
                    </span>
                  </div>

                  <input
                    type="range"
                    min="0.5"
                    max="2.0"
                    step="0.05"
                    value={config.touchAimSensitivity ?? 1.0}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setConfig((c) => ({ ...c, touchAimSensitivity: val }));
                    }}
                    className="w-full h-3 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-400 focus:outline-none"
                  />

                  <div className="flex justify-between text-[9px] text-slate-500 px-0.5">
                    <span>50%</span>
                    <span>75%</span>
                    <span>100% (Default)</span>
                    <span>125%</span>
                    <span>150%</span>
                    <span>175%</span>
                    <span>200%</span>
                  </div>
                </div>

                {/* Quick Presets */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-black text-slate-400 uppercase tracking-wide">
                    Preimpostazioni Rapide Consigliate:
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        sound.playClick();
                        setConfig((c) => ({ ...c, touchAimSensitivity: 0.7 }));
                      }}
                      className={`p-2 rounded-xl border-2 text-left transition flex flex-col gap-0.5 ${
                        Math.abs((config.touchAimSensitivity ?? 1.0) - 0.7) < 0.05
                          ? 'bg-sky-500/25 border-sky-400 text-sky-200 shadow-md'
                          : 'bg-slate-950/70 border-slate-800 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between font-black text-xs">
                        <span>🎯 Cecchino</span>
                        <span className="text-[10px] text-sky-400">0.7x (70%)</span>
                      </div>
                      <span className="text-[9px] text-slate-400 leading-tight">
                        Corsa ampia per micro-correzioni millimetriche (es. Blaze).
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        sound.playClick();
                        setConfig((c) => ({ ...c, touchAimSensitivity: 1.0 }));
                      }}
                      className={`p-2 rounded-xl border-2 text-left transition flex flex-col gap-0.5 ${
                        Math.abs((config.touchAimSensitivity ?? 1.0) - 1.0) < 0.05
                          ? 'bg-amber-500/25 border-amber-400 text-amber-200 shadow-md'
                          : 'bg-slate-950/70 border-slate-800 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between font-black text-xs">
                        <span>⚡ Bilanciato</span>
                        <span className="text-[10px] text-amber-400">1.0x (100%)</span>
                      </div>
                      <span className="text-[9px] text-slate-400 leading-tight">
                        Configurazione arcade classica predefinita.
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        sound.playClick();
                        setConfig((c) => ({ ...c, touchAimSensitivity: 1.4 }));
                      }}
                      className={`p-2 rounded-xl border-2 text-left transition flex flex-col gap-0.5 ${
                        Math.abs((config.touchAimSensitivity ?? 1.0) - 1.4) < 0.05
                          ? 'bg-rose-500/25 border-rose-400 text-rose-200 shadow-md'
                          : 'bg-slate-950/70 border-slate-800 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between font-black text-xs">
                        <span>🔥 Rapido</span>
                        <span className="text-[10px] text-rose-400">1.4x (140%)</span>
                      </div>
                      <span className="text-[9px] text-slate-400 leading-tight">
                        Rotazione reattiva con minimo movimento delle dita.
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        sound.playClick();
                        setConfig((c) => ({ ...c, touchAimSensitivity: 1.8 }));
                      }}
                      className={`p-2 rounded-xl border-2 text-left transition flex flex-col gap-0.5 ${
                        Math.abs((config.touchAimSensitivity ?? 1.0) - 1.8) < 0.05
                          ? 'bg-purple-500/25 border-purple-400 text-purple-200 shadow-md'
                          : 'bg-slate-950/70 border-slate-800 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between font-black text-xs">
                        <span>🚀 Fulmine</span>
                        <span className="text-[10px] text-purple-400">1.8x (180%)</span>
                      </div>
                      <span className="text-[9px] text-slate-400 leading-tight">
                        Rotazione istantanea con leggeri tocchi (ravvicinato / Viper).
                      </span>
                    </button>
                  </div>
                </div>

                {/* Live Interactive Sensitivity Test Pad */}
                <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="text-left space-y-1">
                    <span className="text-xs font-black text-amber-300 uppercase tracking-wide flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-amber-400" />
                      Prova Subito la Sensibilità:
                    </span>
                    <p className="text-[10px] sm:text-xs text-slate-400 max-w-xs">
                      Trascina il cerchio rosso qui a fianco con il dito o mouse: noterai subito come cambia l'agilità e la corsa del joystick!
                    </p>
                    <div className="flex items-center gap-2 pt-1 text-[10px] font-bold text-slate-300">
                      <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700">
                        Angolo: {testAimStick.active ? `${Math.round((testAimStick.angle * 180) / Math.PI)}°` : 'Inattivo'}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700">
                        Potenza: {testAimStick.active ? `${testAimStick.power}%` : '0%'}
                      </span>
                    </div>
                  </div>

                  {/* Interactive Test Joystick Ring */}
                  <div
                    onPointerDown={(e) => {
                      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                      handleTestAimPointer(e.clientX, e.clientY, e.currentTarget);
                    }}
                    onPointerMove={(e) => {
                      if (testAimStick.active) {
                        handleTestAimPointer(e.clientX, e.clientY, e.currentTarget);
                      }
                    }}
                    onPointerUp={handleTestAimRelease}
                    onPointerCancel={handleTestAimRelease}
                    className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-full bg-slate-900/90 border-2 border-red-500/50 flex items-center justify-center shrink-0 cursor-crosshair select-none touch-none shadow-inner"
                  >
                    {/* Crosshair guide lines */}
                    <div className="absolute w-full h-[1px] bg-red-500/20 pointer-events-none" />
                    <div className="absolute h-full w-[1px] bg-red-500/20 pointer-events-none" />

                    {/* Aim trajectory line during drag */}
                    {testAimStick.active && (
                      <div
                        className="absolute h-1 bg-gradient-to-r from-red-500 to-amber-300 rounded-full pointer-events-none origin-left"
                        style={{
                          left: '50%',
                          top: '50%',
                          width: `${testAimStick.power * 0.45}px`,
                          transform: `rotate(${testAimStick.angle}rad)`,
                        }}
                      />
                    )}

                    {/* Joystick Knob */}
                    <div
                      className="absolute w-11 h-11 rounded-full bg-gradient-to-tr from-red-600 to-red-400 border-2 border-white shadow-lg flex items-center justify-center text-white pointer-events-none transform -translate-x-1/2 -translate-y-1/2 transition-transform duration-75"
                      style={{
                        left: `${50 + (testAimStick.dx / 45) * 40}%`,
                        top: `${50 + (testAimStick.dy / 45) * 40}%`,
                      }}
                    >
                      <Crosshair className="w-5 h-5 animate-pulse" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Combat Controls Breakdown on Mobile */}
              <div className="p-3 sm:p-5 rounded-2xl bg-slate-900/80 border-2 border-slate-700 space-y-3">
                <h3 className="font-black text-xs sm:text-sm text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Flame className="w-4 h-4 text-red-400" />
                  Controlli di Fuoco & Abilità Touch
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {/* Attack Button */}
                  <div className="p-3 rounded-xl bg-slate-950/70 border border-red-500/40 flex flex-col items-center text-center">
                    <div className="w-12 h-12 rounded-full bg-red-600 border-2 border-white flex items-center justify-center text-white shadow-lg shadow-red-600/40 mb-2">
                      <Crosshair className="w-6 h-6" />
                    </div>
                    <span className="font-black text-xs text-red-300">ATTACCO ROSSO</span>
                    <p className="text-[10px] text-slate-400 mt-1">
                      <strong>Tocco Rapido:</strong> Auto-Mira istantanea al bersaglio più vicino.
                      <br />
                      <strong>Trascina:</strong> Mira manuale di precisione.
                    </p>
                  </div>

                  {/* Super Button */}
                  <div className="p-3 rounded-xl bg-slate-950/70 border border-yellow-500/40 flex flex-col items-center text-center">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-amber-500 to-yellow-300 border-2 border-white flex items-center justify-center text-slate-950 shadow-lg shadow-yellow-500/40 mb-2 animate-bounce">
                      <Zap className="w-6 h-6 fill-current" />
                    </div>
                    <span className="font-black text-xs text-yellow-300">SUPER MOSSA</span>
                    <p className="text-[10px] text-slate-400 mt-1">
                      Si carica al 100% infliggendo danno. Tocca quando è carica per rilasciare l'abilità devastante!
                    </p>
                  </div>

                  {/* Gadget Button */}
                  <div className="p-3 rounded-xl bg-slate-950/70 border border-emerald-500/40 flex flex-col items-center text-center">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-600 border-2 border-white flex items-center justify-center text-white shadow-lg shadow-emerald-600/40 mb-2">
                      <Shield className="w-6 h-6" />
                    </div>
                    <span className="font-black text-xs text-emerald-300">GADGET (3 USI)</span>
                    <p className="text-[10px] text-slate-400 mt-1">
                      Tocca per attivare potenziamenti istantanei (scudi, velocità, dardi o cure).
                    </p>
                  </div>
                </div>
              </div>

              {/* Controls Size / Settings */}
              <div className="p-3 sm:p-4 rounded-2xl bg-slate-900/90 border border-slate-700 flex items-center justify-between">
                <div>
                  <h4 className="text-xs sm:text-sm font-black text-white">
                    Auto-Mira con Tocco Rapido
                  </h4>
                  <p className="text-[10px] sm:text-xs text-slate-400">
                    Un tocco secco sul tasto attacco spara automaticamente al nemico nel raggio.
                  </p>
                </div>
                <button
                  onClick={() => {
                    sound.playClick();
                    setConfig((c) => ({ ...c, autoAimOnTap: !c.autoAimOnTap }));
                  }}
                  className={`w-12 h-7 rounded-full transition-colors relative flex items-center px-1 ${
                    config.autoAimOnTap ? 'bg-sky-500' : 'bg-slate-700'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white transition-transform ${
                      config.autoAimOnTap ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: LIVE COMMANDS TEST */}
          {activeTab === 'test' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-700 text-center">
                <span className="text-xs font-black text-emerald-300 uppercase tracking-wider">
                  🧪 Area di Prova Interattiva Tasti
                </span>
                <p className="text-[11px] text-slate-400 mt-1">
                  Premi i tasti WASD, F, Spazio, E, Q o clicca/tocca i pulsanti per verificare che rispondano all'istante!
                </p>

                {lastActionTriggered && (
                  <div className="mt-3 px-3 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-400 text-emerald-300 font-black text-xs animate-bounce inline-block">
                    ⚡ {lastActionTriggered}
                  </div>
                )}
              </div>

              {/* Simulated on-screen gamepad demo */}
              <div className="p-4 sm:p-6 rounded-3xl bg-slate-950 border-2 border-slate-800 flex items-center justify-between select-none">
                {/* Movement D-Pad */}
                <div className="flex flex-col items-center gap-1.5">
                  <button
                    onMouseDown={() => {
                      setActivePressedKeys((p) => ({ ...p, w: true }));
                      setLastActionTriggered('W / Su');
                    }}
                    onMouseUp={() => setActivePressedKeys((p) => ({ ...p, w: false }))}
                    onTouchStart={() => {
                      setActivePressedKeys((p) => ({ ...p, w: true }));
                      setLastActionTriggered('W / Su');
                    }}
                    onTouchEnd={() => setActivePressedKeys((p) => ({ ...p, w: false }))}
                    className={`w-12 h-12 rounded-xl border-2 flex items-center justify-center font-black text-sm transition ${
                      isKeyActive('w') || isKeyActive('arrowup')
                        ? 'bg-sky-500 border-white text-white scale-110 shadow-lg shadow-sky-500/50'
                        : 'bg-slate-800 border-slate-700 text-slate-200'
                    }`}
                  >
                    W ▲
                  </button>
                  <div className="flex items-center gap-1.5">
                    <button
                      onMouseDown={() => {
                        setActivePressedKeys((p) => ({ ...p, a: true }));
                        setLastActionTriggered('A / Sinistra');
                      }}
                      onMouseUp={() => setActivePressedKeys((p) => ({ ...p, a: false }))}
                      onTouchStart={() => {
                        setActivePressedKeys((p) => ({ ...p, a: true }));
                        setLastActionTriggered('A / Sinistra');
                      }}
                      onTouchEnd={() => setActivePressedKeys((p) => ({ ...p, a: false }))}
                      className={`w-12 h-12 rounded-xl border-2 flex items-center justify-center font-black text-sm transition ${
                        isKeyActive('a') || isKeyActive('arrowleft')
                          ? 'bg-sky-500 border-white text-white scale-110 shadow-lg shadow-sky-500/50'
                          : 'bg-slate-800 border-slate-700 text-slate-200'
                      }`}
                    >
                      A ◄
                    </button>
                    <button
                      onMouseDown={() => {
                        setActivePressedKeys((p) => ({ ...p, s: true }));
                        setLastActionTriggered('S / Giù');
                      }}
                      onMouseUp={() => setActivePressedKeys((p) => ({ ...p, s: false }))}
                      onTouchStart={() => {
                        setActivePressedKeys((p) => ({ ...p, s: true }));
                        setLastActionTriggered('S / Giù');
                      }}
                      onTouchEnd={() => setActivePressedKeys((p) => ({ ...p, s: false }))}
                      className={`w-12 h-12 rounded-xl border-2 flex items-center justify-center font-black text-sm transition ${
                        isKeyActive('s') || isKeyActive('arrowdown')
                          ? 'bg-sky-500 border-white text-white scale-110 shadow-lg shadow-sky-500/50'
                          : 'bg-slate-800 border-slate-700 text-slate-200'
                      }`}
                    >
                      S ▼
                    </button>
                    <button
                      onMouseDown={() => {
                        setActivePressedKeys((p) => ({ ...p, d: true }));
                        setLastActionTriggered('D / Destra');
                      }}
                      onMouseUp={() => setActivePressedKeys((p) => ({ ...p, d: false }))}
                      onTouchStart={() => {
                        setActivePressedKeys((p) => ({ ...p, d: true }));
                        setLastActionTriggered('D / Destra');
                      }}
                      onTouchEnd={() => setActivePressedKeys((p) => ({ ...p, d: false }))}
                      className={`w-12 h-12 rounded-xl border-2 flex items-center justify-center font-black text-sm transition ${
                        isKeyActive('d') || isKeyActive('arrowright')
                          ? 'bg-sky-500 border-white text-white scale-110 shadow-lg shadow-sky-500/50'
                          : 'bg-slate-800 border-slate-700 text-slate-200'
                      }`}
                    >
                      D ►
                    </button>
                  </div>
                </div>

                {/* Center Gadget */}
                <div className="flex flex-col items-center">
                  <button
                    onClick={() => {
                      sound.playClick();
                      setLastActionTriggered('Gadget Attivato!');
                    }}
                    className={`w-12 h-12 rounded-2xl border-2 flex flex-col items-center justify-center transition active:scale-95 ${
                      isKeyActive('e') || isKeyActive('q')
                        ? 'bg-emerald-500 border-white text-white scale-110 shadow-lg shadow-emerald-500/50'
                        : 'bg-emerald-600 border-emerald-300 text-white'
                    }`}
                  >
                    <Shield className="w-5 h-5" />
                    <span className="text-[8px] font-black">[E]</span>
                  </button>
                  <span className="text-[9px] text-slate-400 mt-1">Gadget</span>
                </div>

                {/* Combat Right */}
                <div className="flex items-center gap-3">
                  {/* Super */}
                  <button
                    onClick={() => {
                      sound.playClick();
                      setLastActionTriggered('SUPER Eseguita!');
                    }}
                    className={`w-14 h-14 rounded-full border-3 flex flex-col items-center justify-center transition active:scale-95 ${
                      isKeyActive(' ') || isKeyActive('r')
                        ? 'bg-yellow-300 border-white text-slate-950 scale-110 shadow-xl shadow-yellow-400/60'
                        : 'bg-gradient-to-tr from-amber-500 to-yellow-400 border-yellow-200 text-slate-950'
                    }`}
                  >
                    <Zap className="w-6 h-6 fill-current" />
                    <span className="text-[8px] font-black">[SPAZIO]</span>
                  </button>

                  {/* Attack */}
                  <button
                    onClick={() => {
                      sound.playClick();
                      setLastActionTriggered('Colpo Normale!');
                    }}
                    className={`w-14 h-14 rounded-full border-3 flex flex-col items-center justify-center transition active:scale-95 ${
                      isKeyActive('f')
                        ? 'bg-red-500 border-white text-white scale-110 shadow-xl shadow-red-500/60'
                        : 'bg-red-600 border-red-300 text-white shadow-lg'
                    }`}
                  >
                    <Crosshair className="w-6 h-6" />
                    <span className="text-[8px] font-black">[F / CLICK]</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-4 sm:px-6 py-3 border-t-2 border-slate-800 bg-slate-950/80 flex items-center justify-between gap-3 shrink-0">
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-xs border border-slate-600 transition active:scale-95"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Predefiniti</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                sound.playClick();
                onClose();
              }}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs border border-slate-600 transition active:scale-95"
            >
              Annulla
            </button>
            <button
              onClick={handleSaveAndExit}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-black font-game text-xs sm:text-sm shadow-lg shadow-amber-500/30 transition active:scale-95 flex items-center gap-1.5"
            >
              <Check className="w-4 h-4 stroke-[3]" />
              <span>SALVA & APPLICA</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
