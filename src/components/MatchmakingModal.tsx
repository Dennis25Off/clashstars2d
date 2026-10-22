import React, { useEffect, useRef, useState } from 'react';
import { Shield, Sparkles, X, Globe, Smartphone, Monitor, Tablet, Bot, UserCheck, Clock } from 'lucide-react';
import { BrawlerId, CrossPlayPlatform, LobbyPlayerInfo, PlayerProfile } from '../types/game';
import { BRAWLERS } from '../data/brawlers';
import { sound } from '../utils/audio';
import { colyseusClient } from '../network/colyseusClient';

interface MatchmakingModalProps {
  profile: PlayerProfile;
  selectedBrawlerId: BrawlerId;
  requestedRoomId?: string;
  onMatchReady: (matchedPlayers: LobbyPlayerInfo[]) => void;
  onCancel: () => void;
}

const SAMPLE_BOT_NAMES = [
  'El_Pro_77 [BOT]',
  'ViperKing [BOT]',
  'SuperBrawler [BOT]',
  'Phoenix_X [BOT]',
  'ToxicRaven [BOT]',
  'TitanLover [BOT]',
  'BlazeSniper [BOT]',
  'ApexPredator [BOT]',
  'GhostRider [BOT]',
  'GigaChad [BOT]',
];

const PLATFORMS: CrossPlayPlatform[] = ['mobile', 'pc', 'tablet'];
const BRAWLER_KEYS: BrawlerId[] = ['blaze', 'viper', 'titan', 'raven', 'harmony'];

export const MatchmakingModal: React.FC<MatchmakingModalProps> = ({
  profile,
  selectedBrawlerId,
  requestedRoomId,
  onMatchReady,
  onCancel,
}) => {
  const [secondsRemaining, setSecondsRemaining] = useState(6);
  const [botFillTriggered, setBotFillTriggered] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [roomId, setRoomId] = useState<string>(requestedRoomId || 'CS-WAITING');
  const [players, setPlayers] = useState<LobbyPlayerInfo[]>([
    {
      id: profile.id,
      name: profile.username,
      brawlerId: selectedBrawlerId,
      trophies: profile.trophies,
      platform: profile.platform,
      isBot: false,
      spawnIndex: 0,
    },
  ]);
  const [countdown, setCountdown] = useState<number | null>(null);

  const channelRef = useRef<BroadcastChannel | null>(null);
  const isMatchStartingRef = useRef(false);
  const currentRoomIdRef = useRef<string>(requestedRoomId || 'CS-WAITING');
  const deterministicBotsRef = useRef<LobbyPlayerInfo[]>([]);

  useEffect(() => {
    // 1. Setup local BroadcastChannel for zero-latency inter-tab discovery
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('clash_stars_matchmaking');
      channelRef.current = bc;

      bc.onmessage = (event) => {
        const { type, player } = event.data || {};
        if (type === 'PLAYER_JOIN' && player && player.id !== profile.id) {
          setPlayers((curr) => {
            if (curr.some((p) => p.id === player.id) || curr.length >= 10) return curr;
            sound.playPlayerJoined();
            return [...curr, { ...player, isBot: false }];
          });
        }
      };

      // Broadcast self
      bc.postMessage({
        type: 'PLAYER_JOIN',
        player: {
          id: profile.id,
          name: profile.username,
          brawlerId: selectedBrawlerId,
          trophies: profile.trophies,
          platform: profile.platform,
          isBot: false,
        },
      });
    } catch {
      // BroadcastChannel fallback
    }

    // 2. Connect via Colyseus Client
    colyseusClient
      .joinOrCreate('battle_royale', {
        id: profile.id,
        name: profile.username,
        brawlerId: selectedBrawlerId,
        trophies: profile.trophies,
        platform: profile.platform,
        requestedRoomId: requestedRoomId || undefined,
      })
      .then((room) => {
        if (room.id) {
          currentRoomIdRef.current = room.id;
          setRoomId(room.id);
        }
        if (Array.isArray(room.state.deterministicBots)) {
          deterministicBotsRef.current = room.state.deterministicBots;
        }
        if (Array.isArray(room.state.players)) {
          setPlayers(
            room.state.players.map((p: any) => ({
              ...p,
              isBot: false,
            }))
          );
        }
        if (room.state.status === 'countdown' && typeof room.state.countdownRemaining === 'number') {
          triggerServerCountdown(room.state.countdownRemaining, room.state.players, room.state.deterministicBots);
        }

        // Listen for Colyseus state updates
        room.onStateChange((state) => {
          if (state.roomId) {
            currentRoomIdRef.current = state.roomId;
            setRoomId(state.roomId);
          }
          if (Array.isArray(state.deterministicBots) && state.deterministicBots.length > 0) {
            deterministicBotsRef.current = state.deterministicBots;
          }
          if (Array.isArray(state.players) && state.players.length > 0) {
            setPlayers(
              state.players.map((p: any) => ({
                ...p,
                isBot: false,
              }))
            );
          }
          if (state.status === 'countdown' && typeof state.countdownRemaining === 'number') {
            triggerServerCountdown(state.countdownRemaining, state.players, state.deterministicBots);
          }
        });
      })
      .catch((err) => {
        console.warn('Colyseus join warning, using fallback queue:', err);
      });

    // Colyseus ping interval to maintain active match status
    const pollInterval = setInterval(() => {
      if (isMatchStartingRef.current) return;

      fetch('/api/matchmaking/ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: profile.id, roomId: currentRoomIdRef.current }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data?.roomId) {
            currentRoomIdRef.current = data.roomId;
            setRoomId(data.roomId);
          }
          if (Array.isArray(data?.deterministicBots)) {
            deterministicBotsRef.current = data.deterministicBots;
          }
          if (data?.players && Array.isArray(data.players)) {
            setPlayers(
              data.players.map((p: any) => ({
                ...p,
                isBot: false,
              }))
            );
          }

          if (data?.status === 'countdown' && typeof data.countdownRemaining === 'number') {
            triggerServerCountdown(data.countdownRemaining, data.players, data.deterministicBots);
          }
        })
        .catch(() => {});
    }, 700);

    const triggerServerCountdown = (
      remainingSecs: number,
      realPlayers?: any[],
      serverBots?: any[]
    ) => {
      if (isMatchStartingRef.current) return;
      isMatchStartingRef.current = true;
      clearInterval(pollInterval);

      let count = Math.max(1, remainingSecs);
      setCountdown(count);
      sound.playCountdown(false);

      const countInterval = setInterval(() => {
        count--;
        if (count > 0) {
          setCountdown(count);
          sound.playCountdown(false);
        } else if (count === 0) {
          setCountdown(0);
          sound.playCountdown(true);
        } else {
          clearInterval(countInterval);

          // Build final 10-player roster: real players + deterministic bots
          const finalReal = (realPlayers || players).map((p: any, idx: number) => ({
            id: p.id,
            name: p.name,
            brawlerId: p.brawlerId as BrawlerId,
            trophies: p.trophies || 0,
            platform: p.platform as CrossPlayPlatform,
            isBot: false,
            roomId: currentRoomIdRef.current,
            spawnIndex: typeof p.spawnIndex === 'number' ? p.spawnIndex : idx,
          }));

          const bots = (serverBots || deterministicBotsRef.current).map((b: any, bIdx: number) => ({
            id: b.id || `bot_synced_${finalReal.length + bIdx}`,
            name: b.name || `${SAMPLE_BOT_NAMES[bIdx % SAMPLE_BOT_NAMES.length]}`,
            brawlerId: (b.brawlerId || BRAWLER_KEYS[bIdx % BRAWLER_KEYS.length]) as BrawlerId,
            trophies: b.trophies || 300,
            platform: (b.platform || PLATFORMS[bIdx % PLATFORMS.length]) as CrossPlayPlatform,
            isBot: true,
            roomId: currentRoomIdRef.current,
            spawnIndex: typeof b.spawnIndex === 'number' ? b.spawnIndex : finalReal.length + bIdx,
          }));

          const fullRoster = [...finalReal, ...bots].slice(0, 10);
          onMatchReady(fullRoster);
        }
      }, 700);
    };

    return () => {
      clearInterval(pollInterval);
      if (channelRef.current) {
        channelRef.current.close();
      }
      fetch('/api/matchmaking/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: profile.id, roomId: currentRoomIdRef.current }),
      }).catch(() => {});
    };
  }, [profile, selectedBrawlerId, requestedRoomId, onMatchReady]);

  const handleStartNow = () => {
    sound.playClick();
    fetch('/api/matchmaking/start-now', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: currentRoomIdRef.current }),
    }).catch(() => {});
  };

  const handleCopyRoomCode = () => {
    sound.playClick();
    if (navigator.clipboard) {
      navigator.clipboard.writeText(roomId).catch(() => {});
    }
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const renderPlatformIcon = (platform: CrossPlayPlatform) => {
    if (platform === 'pc') return <span title="PC"><Monitor className="w-3.5 h-3.5 text-sky-400" /></span>;
    if (platform === 'tablet') return <span title="Tablet"><Tablet className="w-3.5 h-3.5 text-purple-400" /></span>;
    return <span title="Mobile"><Smartphone className="w-3.5 h-3.5 text-emerald-400" /></span>;
  };

  const realPlayerCount = players.filter((p) => !p.isBot).length;
  const botCount = Math.max(0, 10 - realPlayerCount);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fade-in">
      <div className="relative w-full max-w-2xl rounded-3xl bg-slate-900 border-4 border-indigo-500 shadow-2xl p-5 sm:p-6 flex flex-col items-center">
        {/* Close Button */}
        {countdown === null && (
          <button
            onClick={() => {
              sound.playClick();
              onCancel();
            }}
            className="absolute top-4 right-4 p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* Header */}
        <div className="flex flex-col items-center mb-5 text-center">
          <div className="flex flex-wrap items-center justify-center gap-2 mb-2">
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-950 border border-indigo-500 text-indigo-300 text-xs font-bold">
              <Globe className="w-4 h-4 text-sky-400 animate-spin" />
              <span>CROSS-PLAY ATTIVO</span>
            </div>

            {/* Room Code with 1-click Copy */}
            <button
              onClick={handleCopyRoomCode}
              title="Clicca per copiare il codice stanza e condividerlo con amici su PC o Mobile!"
              className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400 text-amber-300 text-xs font-black transition active:scale-95"
            >
              <span>🔑 STANZA:</span>
              <span className="font-mono text-white underline">{roomId}</span>
              <span className="text-[10px] text-amber-400 font-bold ml-1">
                {copiedCode ? '✓ COPIATO!' : '📋 COPIA'}
              </span>
            </button>
          </div>

          <h2 className="font-extrabold text-2xl sm:text-3xl text-white font-game tracking-wide">
            {countdown !== null ? (
              <span className="text-amber-400 animate-bounce">SCONTRO SINCRONIZZATO!</span>
            ) : realPlayerCount > 1 ? (
              <span className="text-emerald-400">GIOCATORI TROVATI!</span>
            ) : (
              'RICERCA GIOCATORI'
            )}
          </h2>
          </div>
        {/* 10 Player Slots Grid */}
        <div className="w-full grid grid-cols-2 sm:grid-cols-5 gap-2.5 mb-5">
          {Array.from({ length: 10 }).map((_, i) => {
            const p = players[i];
            const brawlerDef = p ? BRAWLERS[p.brawlerId] : null;

            return (
              <div
                key={i}
                className={`relative rounded-2xl p-2.5 flex flex-col items-center justify-center border-2 transition-all ${
                  p
                    ? p.isBot
                      ? 'bg-purple-950/40 border-purple-500/80 shadow-md scale-100'
                      : 'bg-emerald-950/40 border-emerald-500 shadow-lg scale-100 ring-2 ring-emerald-500/30'
                    : 'bg-slate-950/60 border-slate-800 border-dashed opacity-50 scale-95'
                }`}
              >
                {p ? (
                  <>
                    {/* Brawler Avatar circle */}
                    <div
                      className="w-11 h-11 rounded-full flex items-center justify-center text-xl shadow-inner border-2 border-white mb-1.5"
                      style={{ backgroundColor: brawlerDef?.color || '#3b82f6' }}
                    >
                      {brawlerDef?.avatarEmoji}
                    </div>

                    <div className="font-black text-xs text-white truncate max-w-[90px] text-center">
                      {p.name}
                    </div>

                    <div className="flex items-center gap-1 mt-0.5 text-[10px] text-slate-400">
                      {renderPlatformIcon(p.platform)}
                      <span>{p.trophies} 🏆</span>
                    </div>

                    {/* Real Player vs Bot Badge */}
                    <span
                      className={`mt-1 px-1.5 py-0.2 rounded font-black text-[8px] uppercase tracking-wider ${
                        p.isBot
                          ? 'bg-purple-600/30 text-purple-300 border border-purple-500/40'
                          : 'bg-emerald-500/30 text-emerald-300 border border-emerald-400/50'
                      }`}
                    >
                      {p.isBot ? '🤖 BOT' : '🟢 REALE'}
                    </span>
                  </>
                ) : (
                  <div className="h-24 flex flex-col items-center justify-center text-slate-600">
                    <span className="text-xl animate-pulse">?</span>
                    <span className="text-[9px] font-bold mt-1 text-slate-500">In attesa...</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Countdown Indicator or Action Buttons */}
        {countdown !== null ? (
          <div className="flex flex-col items-center">
            <div className="text-5xl font-black text-amber-400 font-game animate-ping">
              {countdown === 0 ? 'SCONTRO!' : countdown}
            </div>
            <p className="text-xs text-slate-300 mt-2 font-semibold">Tutti i 10 combattenti sono sincronizzati!</p>
          </div>
        ) : (
          <div className="flex items-center gap-3 w-full justify-center">
            <button
              onClick={handleStartNow}
              className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-black text-xs border-2 border-yellow-200 shadow-xl active:scale-95 transition"
            >
              <span>🚀 AVVIA ORA</span>
              <span className="text-[10px] text-amber-950 font-bold bg-white/40 px-1.5 py-0.2 rounded-full">
                (con Bot)
              </span>
            </button>

            <button
              onClick={() => {
                sound.playClick();
                onCancel();
              }}
              className="px-5 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs border border-slate-600 active:scale-95 transition"
            >
              Annulla
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
