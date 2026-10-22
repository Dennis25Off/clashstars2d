import React, { useState } from 'react';
import {
  Trophy,
  Coins,
  Gem,
  Gift,
  Users,
  Volume2,
  VolumeX,
  Play,
  Globe,
  Pencil,
  Flame,
  ArrowRight,
  Gamepad2,
  X,
  Settings,
} from 'lucide-react';
import { BrawlerId, ControlsConfig, PlayerProfile } from '../types/game';
import { BRAWLERS } from '../data/brawlers';
import { PWAInstallButton } from './PWAInstallButton';
import { ChangeNameModal } from './ChangeNameModal';
import { ControlsMappingModal } from './ControlsMappingModal';
import { SettingsModal } from './SettingsModal';
import { sound } from '../utils/audio';

interface LobbyProps {
  profile: PlayerProfile;
  onStartMatchmaking: (roomId?: string) => void;
  onOpenBrawlers: () => void;
  onOpenBoxes: () => void;
  onOpenTrophyRoad: () => void;
  onUpdateProfile: (updater: (prev: PlayerProfile) => PlayerProfile) => void;
}

export const Lobby: React.FC<LobbyProps> = ({
  profile,
  onStartMatchmaking,
  onOpenBrawlers,
  onOpenBoxes,
  onOpenTrophyRoad,
  onUpdateProfile,
}) => {
  const [isMuted, setIsMuted] = useState(sound.getMuted());
  const [showNameModal, setShowNameModal] = useState(false);
  const [showControlsModal, setShowControlsModal] = useState(false);
  const [showRoomModal, setShowRoomModal] = useState(false);
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  const selectedBrawler = BRAWLERS[profile.selectedBrawler];
  const brawlerProg = profile.brawlers[profile.selectedBrawler] || { level: 1, powerPoints: 0 };

  const toggleSound = () => {
    const muted = sound.toggleMute();
    setIsMuted(muted);
  };

  const togglePlatform = () => {
    sound.playClick();
    onUpdateProfile((p) => {
      const nextPlatform = p.platform === 'mobile' ? 'pc' : p.platform === 'pc' ? 'tablet' : 'mobile';
      return { ...p, platform: nextPlatform };
    });
  };

  const handleSaveName = (newName: string) => {
    onUpdateProfile((p) => ({ ...p, username: newName }));
  };

  return (
    <div className="relative w-full h-[100dvh] max-h-[100dvh] bg-[#070b14] text-white flex flex-col justify-between overflow-hidden select-none p-2 sm:p-4">
      {/* Background radial atmosphere */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(37,99,235,0.22)_0%,_rgba(11,15,25,0.96)_75%)] pointer-events-none" />
      <div className="absolute -bottom-20 left-1/2 -translate-x-1/2 w-[500px] h-[250px] bg-blue-600/15 rounded-full blur-3xl pointer-events-none" />

      {/* TOP HEADER: User Profile, Currencies, PWA and Audio */}
      <header className="relative z-10 flex items-center justify-between gap-1.5 sm:gap-3 w-full shrink-0">
        {/* Left: Player Profile, Edit Name & Platform */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
          {/* Avatar icon */}
          <button
            onClick={togglePlatform}
            title="Cambia Piattaforma Cross-Play"
            className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-indigo-600 border-2 border-indigo-400 shadow-md flex items-center justify-center text-xl sm:text-2xl active:scale-95 transition relative shrink-0"
          >
            {selectedBrawler.avatarEmoji}
            <span className="absolute -bottom-1 -right-1 text-[10px]">
              {profile.platform === 'pc' ? '💻' : profile.platform === 'tablet' ? '📱' : '📱'}
            </span>
          </button>

          <div className="min-w-0">
            {/* Username + Edit Button */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  sound.playClick();
                  setShowNameModal(true);
                }}
                className="font-black text-xs sm:text-base text-white font-game tracking-wide truncate max-w-[110px] sm:max-w-[180px] hover:text-amber-300 transition text-left flex items-center gap-1"
                title="Clicca per cambiare nome"
              >
                <span>{profile.username}</span>
                <Pencil className="w-3 h-3 text-amber-400 shrink-0" />
              </button>

              <button
                onClick={togglePlatform}
                className="px-1.5 py-0.2 rounded-md bg-slate-800 border border-slate-600 text-[8px] sm:text-[10px] font-bold text-sky-400 shrink-0"
              >
                {profile.platform.toUpperCase()}
              </button>
            </div>

            {/* Trophy road quick badge */}
            <button
              onClick={() => {
                sound.playClick();
                onOpenTrophyRoad();
              }}
              className="flex items-center gap-1 mt-0.5 px-1.5 sm:px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/40 text-amber-300 text-[10px] sm:text-xs font-bold hover:bg-amber-500/25 transition active:scale-95"
            >
              <Trophy className="w-3 h-3 text-amber-400 shrink-0" />
              <span>Trofei</span>
              <span>{profile.trophies}</span>
              <ArrowRight className="w-2.5 h-2.5 text-amber-400 shrink-0" />
            </button>
          </div>
        </div>

        {/* Right: Currencies & Quick Controls */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {/* Tokens (for Brawl Boxes) */}
          <button
            onClick={() => {
              sound.playClick();
              onOpenBoxes();
            }}
            className="flex items-center gap-1 px-1.5 sm:px-2.5 py-1 rounded-xl bg-slate-900/90 border border-sky-500/80 shadow-sm hover:bg-slate-800 transition active:scale-95"
            title="Gettoni Casse"
          >
            <span className="text-xs sm:text-sm">🎟️</span>
            <div className="text-left font-black text-[10px] sm:text-xs text-sky-300 leading-tight">
              {profile.tokens}<span className="text-[8px] sm:text-[10px] text-slate-400">/100</span>
            </div>
          </button>

          {/* Coins */}
          <div className="flex items-center gap-1 px-1.5 sm:px-2 py-1 rounded-xl bg-slate-900/90 border border-amber-500/80 shadow-sm">
            <Coins className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-400" />
            <span className="font-extrabold text-[10px] sm:text-xs text-amber-300">{profile.coins}</span>
          </div>

          {/* Gems */}
          <div className="flex items-center gap-1 px-1.5 sm:px-2 py-1 rounded-xl bg-slate-900/90 border border-emerald-500/80 shadow-sm">
            <Gem className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-400" />
            <span className="font-extrabold text-[10px] sm:text-xs text-emerald-300">{profile.gems}</span>
          </div>

          {/* Nuovo bottone Impostazioni (Sotto a PWAInstallButton) */}
          <button
            onClick={() => {
              sound.playClick();
              setShowSettingsModal(true);
            }}
            className="p-1.5 sm:p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 border-2 border-zinc-600 text-amber-400 transition active:scale-95 flex items-center justify-center shadow-md"
            title="Impostazioni di Gioco"
          >
            <Settings className="w-4 h-4 animate-[spin_12s_linear_infinite]" />
          </button>
        </div>
      </header>

      {/* CENTER STAGE: Selected Brawler Showcase with 3D-style Podium (Mobile Optimized) */}
      <main className="relative z-8 flex-1 flex flex-col items-center justify-center my-auto min-h-0">
        <div className="relative flex flex-col items-center justify-center">
          {/* Animated Glow Halo */}
          <div
            className="w-32 h-32 sm:w-48 sm:h-48 rounded-full blur-2xl opacity-35 animate-pulse pointer-events-none absolute"
            style={{ backgroundColor: selectedBrawler.color }}
          />

          {/* Massive cartoon avatar emoji */}
          <div
            className="relative w-24 h-24 sm:w-36 sm:h-36 md:w-44 md:h-44 rounded-full flex items-center justify-center text-5xl sm:text-7xl md:text-8xl border-4 border-white shadow-[0_8px_30px_rgba(0,0,0,0.8)] transform transition-transform hover:scale-105 active:scale-95 cursor-pointer animate-float"
            style={{ backgroundColor: selectedBrawler.color }}
            onClick={() => {
              sound.playClick();
              onOpenBrawlers();
            }}
          >
            {selectedBrawler.avatarEmoji}
          </div>

          {/* Stage Pedestal */}
          <div className="w-44 sm:w-60 md:w-68 h-6 sm:h-8 rounded-full bg-gradient-to-r from-slate-800 via-indigo-900 to-slate-800 border-2 border-indigo-400/60 shadow-xl -mt-3 flex items-center justify-center">
            <div className="w-32 sm:w-44 h-2 rounded-full bg-indigo-500/40 blur-xs" />
          </div>

          {/* Brawler Info Label */}
          <div className="mt-2 sm:mt-3 flex flex-col items-center text-center">
            <span className="text-[9px] sm:text-[11px] font-black uppercase tracking-widest text-amber-400">
              {selectedBrawler.role}
            </span>
            <h1 className="text-xl sm:text-3xl font-black text-white font-game tracking-wider drop-shadow-md leading-tight">
              {selectedBrawler.name}
            </h1>

            {/* Level & Power Points bar */}
            <div className="flex items-center gap-1.5 mt-1 px-2.5 py-0.5 rounded-lg bg-slate-900/80 border border-slate-700 shadow">
              <span className="text-[10px] sm:text-xs font-black text-white">Livello {brawlerProg.level}</span>
              <span className="text-[10px] sm:text-xs text-amber-400 font-bold">⚡ {brawlerProg.powerPoints} Punti</span>
            </div>

            {/* Change Brawler Button */}
            <button
              onClick={() => {
                sound.playClick();
                onOpenBrawlers();
              }}
              className="mt-1.5 px-3 py-0.5 rounded-full bg-indigo-600/60 hover:bg-indigo-600 border border-indigo-400 text-[10px] font-extrabold text-indigo-200 transition active:scale-95"
            >
              CLICCA PER CAMBIARE
            </button>
          </div>
        </div>
      </main>

      {/* BOTTOM ACTION BAR: Mode Selection, Casse Quick Access, and GIOCA Button */}
      <footer className="relative z-10 w-full flex flex-col gap-1.5 sm:gap-2.5 pt-1.5 border-t border-slate-800/80 shrink-0">
        {/* Top Mini-Row: Mode Info & Cross-Play */}
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-1.5 text-[10px] sm:text-xs text-slate-300">
            <Flame className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <strong className="text-white">SOPRAVVIVENZA SOLO</strong>
            <span className="text-emerald-400 hidden sm:inline"> - BATTLE ROYALE</span>
          </div>
              <strong className="text-white">Cross-Play Attivo</strong>
            </div>

        {/* Main Controls Row: BRAWLER, CASSE, and GIOCA Button */}
        <div className="flex items-center gap-2 w-full">
          {/* Brawler Roster Button */}
          <button
            onClick={() => {
              sound.playClick();
              onOpenBrawlers();
            }}
            className="flex-1 sm:flex-none flex items-center justify-center gap-1 sm:gap-1.5 px-2.5 sm:px-4 py-2 sm:py-3 rounded-2xl bg-indigo-950/80 hover:bg-indigo-900 border-2 border-indigo-400 text-white font-black text-[11px] sm:text-xs shadow-md active:scale-95 transition"
          >
            <Users className="w-4 h-4 text-indigo-400" />
            <span>CLASHERS</span>
          </button>

          {/* Casse Shop Button */}
          <button
            onClick={() => {
              sound.playClick();
              onOpenBoxes();
            }}
            className="flex-1 sm:flex-none flex items-center justify-center gap-1 sm:gap-1.5 px-2.5 sm:px-4 py-2 sm:py-3 rounded-2xl bg-amber-950/80 hover:bg-amber-900 border-2 border-amber-400 text-white font-black text-[11px] sm:text-xs shadow-md active:scale-95 transition relative"
          >
            <Gift className="w-4 h-4 text-amber-400" />
            <span>CASSE</span>
            {profile.tokens >= 100 && (
              <span className="absolute -top-1 -right-1 px-1.5 py-0.2 rounded-full bg-red-600 text-white font-black text-[8px] animate-bounce">
                1
              </span>
            )}
          </button>

          {/* Stanza Privata con Amici Button */}
          <button
            onClick={() => {
              sound.playClick();
              setShowRoomModal(true);
            }}
            title="Crea o unisciti a una stanza privata con amici (Crossplay PC/Mobile)"
            className="flex-1 sm:flex-none flex items-center justify-center gap-1 sm:gap-1.5 px-2.5 sm:px-4 py-2 sm:py-3 rounded-2xl bg-sky-950/80 hover:bg-sky-900 border-2 border-sky-400 text-white font-black text-[11px] sm:text-xs shadow-md active:scale-95 transition"
          >
            <Globe className="w-4 h-4 text-sky-400" />
            <span>STANZA</span>
          </button>

          {/* GIOCA (PLAY) Comic Button */}
          <button
            onClick={() => {
              sound.playClick();
              onStartMatchmaking();
            }}
            className="flex-[1.5] ml-auto sm:flex-none sm:w-56 py-2 sm:py-3.5 rounded-2xl sm:rounded-3xl brawl-btn-yellow border-3 sm:border-4 border-yellow-200 text-slate-950 font-black font-game text-base sm:text-xl flex items-center justify-center gap-2 shadow-[0_6px_20px_rgba(234,179,8,0.4)] transition active:scale-95 tracking-wide text-white"
          >
            <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-current text-slate-950" />
            <span className="text-slate-950">GIOCA!</span>
          </button>
        </div>
      </footer>

      {/* Friends & Custom Room Code Modal */}
      {showRoomModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-md rounded-3xl bg-slate-900 border-4 border-sky-400 shadow-2xl p-6 flex flex-col items-center text-white">
            <button
              onClick={() => {
                sound.playClick();
                setShowRoomModal(false);
              }}
              className="absolute top-4 right-4 p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="w-12 h-12 rounded-2xl bg-sky-500/20 border-2 border-sky-400 flex items-center justify-center mb-3">
              <Globe className="w-7 h-7 text-sky-400 animate-spin" />
            </div>

            <h3 className="font-extrabold text-xl font-game text-white tracking-wide">
              STANZA MULTIPLAYER
            </h3>
            <p className="text-xs text-sky-300 text-center mt-1">
              Sfida amici in tempo reale cross-platform da PC, smartphone o tablet!
            </p>

            <div className="w-full mt-4 space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Codice Stanza Amico
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={roomCodeInput}
                    onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
                    placeholder="es. CS-7842"
                    maxLength={10}
                    className="flex-1 px-3 py-2.5 rounded-xl bg-slate-950 border-2 border-slate-700 text-white font-mono font-bold tracking-wider uppercase focus:border-sky-400 outline-none text-sm placeholder:text-slate-600"
                  />
                  <button
                    disabled={!roomCodeInput.trim()}
                    onClick={() => {
                      if (!roomCodeInput.trim()) return;
                      sound.playClick();
                      setShowRoomModal(false);
                      onStartMatchmaking(roomCodeInput.trim().toUpperCase());
                    }}
                    className="px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-40 disabled:hover:bg-sky-500 text-slate-950 font-black text-xs transition active:scale-95"
                  >
                    ENTRA
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 text-slate-500 text-[10px] uppercase font-bold my-1 justify-center">
                <span className="w-12 h-px bg-slate-700" />
                <span>oppure</span>
                <span className="w-12 h-px bg-slate-700" />
              </div>

              <button
                onClick={() => {
                  sound.playClick();
                  setShowRoomModal(false);
                  const generated = `CS-${Math.floor(1000 + Math.random() * 9000)}`;
                  onStartMatchmaking(generated);
                }}
                className="w-full py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 border-2 border-indigo-400 text-white font-black text-xs flex items-center justify-center gap-2 shadow-lg transition active:scale-95"
              >
                <span>✨ CREA NUOVA STANZA PRIVATA</span>
              </button>

              <button
                onClick={() => {
                  sound.playClick();
                  setShowRoomModal(false);
                  onStartMatchmaking();
                }}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition active:scale-95"
              >
                Partita Rapida Online (Pubblica)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rendering condizionale dei Modal */}
      {showSettingsModal && (
        <SettingsModal
          onClose={() => setShowSettingsModal(false)}
          openControls={() => {
            setShowSettingsModal(false);
            setShowControlsModal(true);
          }}
          openAudio={() => {
            // Sfrutta la funzione toggleSound già esistente nella Lobby
            toggleSound();
          }}
        />
      )}

      {/* Change Name Modal */}
      {showNameModal && (
        <ChangeNameModal
          currentName={profile.username}
          onSave={handleSaveName}
          onClose={() => setShowNameModal(false)}
        />
      )}

      {/* Controls & Keys Mapping Modal */}
      {showControlsModal && (
        <ControlsMappingModal
          currentConfig={profile.controlsConfig}
          onSave={(cfg) => {
            onUpdateProfile((p) => ({ ...p, controlsConfig: cfg }));
          }}
          onClose={() => setShowControlsModal(false)}
        />
      )}
    </div>
  );
};