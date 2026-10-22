import React, { useEffect, useRef, useState } from 'react';
import { PhaserGameBridge } from '../phaser/PhaserGameBridge';
import { GameHUD } from './GameHUD';
import { GameOverModal } from './GameOverModal';
import { BrawlerId, CrossPlayPlatform, KillFeedEntry, LobbyPlayerInfo, PlayerProfile } from '../types/game';
import { sound } from '../utils/audio';
import { colyseusClient } from '../network/colyseusClient';

interface BattleArenaProps {
  profile: PlayerProfile;
  selectedBrawlerId: BrawlerId;
  matchedPlayers?: LobbyPlayerInfo[] | null;
  onUpdateProfile: (updater: (prev: PlayerProfile) => PlayerProfile) => void;
  onExitToMenu: () => void;
  onPlayAgain: () => void;
}

export const BattleArena: React.FC<BattleArenaProps> = ({
  profile,
  selectedBrawlerId,
  matchedPlayers,
  onUpdateProfile,
  onExitToMenu,
  onPlayAgain,
}) => {
  const phaserMountRef = useRef<HTMLDivElement>(null);
  const bridgeRef = useRef<PhaserGameBridge | null>(null);
  const [engine, setEngine] = useState<PhaserGameBridge | null>(null);

  // HUD State synced from Phaser Engine
  const [aliveCount, setAliveCount] = useState(10);
  const [playerHp, setPlayerHp] = useState(4000);
  const [playerMaxHp, setPlayerMaxHp] = useState(4000);
  const [playerAmmo, setPlayerAmmo] = useState(3);
  const [playerSuperCharge, setPlayerSuperCharge] = useState(0);
  const [powerCubes, setPowerCubes] = useState(0);
  const [killFeed, setKillFeed] = useState<KillFeedEntry[]>([]);
  const [poisonPhase, setPoisonPhase] = useState(1);
  const [poisonTimer, setPoisonTimer] = useState(30);
  const [pingMs, setPingMs] = useState(24);
  const [currentZoom, setCurrentZoom] = useState(0.65);
  const [fovMode, setFovModeState] = useState<'normal' | 'wide' | 'ultra'>(
    profile.controlsConfig?.fovMode || 'wide'
  );

  // Game over state
  const [gameOverResult, setGameOverResult] = useState<{
    placement: number;
    kills: number;
    powerCubes: number;
  } | null>(null);

  useEffect(() => {
    const mountContainer = phaserMountRef.current;
    if (!mountContainer) return;

    const brawlerLevel = profile.brawlers[selectedBrawlerId]?.level || 1;

    // Determine self spawn index
    const selfSpawnIndex = matchedPlayers?.find(
      (p) => !p.isBot && (p.name === profile.username || p.id.includes(profile.username))
    )?.spawnIndex ?? 0;

    const currentRoomId = matchedPlayers?.[0]?.roomId || `CS-${Math.floor(1000 + Math.random() * 9000)}`;
    const activeColyseusRoom = colyseusClient.getActiveRoom();

    // Instantiate Phaser 3 Game Engine
    const phaserInstance = new PhaserGameBridge(
      mountContainer,
      selectedBrawlerId,
      brawlerLevel,
      profile.username,
      profile.platform,
      {
        onGameOver: (placement, kills, cubes) => {
          setGameOverResult({ placement, kills, powerCubes: cubes });

          // Calculate rewards and update profile
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

          onUpdateProfile((prev) => {
            const currentBrawlerProg = prev.brawlers[selectedBrawlerId] || {
              level: 1,
              powerPoints: 0,
              unlocked: true,
              trophies: 0,
            };
            const updatedBrawlerTrophies = Math.max(0, currentBrawlerProg.trophies + trophyDelta);
            const totalTrophies = Math.max(0, prev.trophies + trophyDelta);

            return {
              ...prev,
              trophies: totalTrophies,
              tokens: prev.tokens + tokensEarned,
              brawlers: {
                ...prev.brawlers,
                [selectedBrawlerId]: {
                  ...currentBrawlerProg,
                  trophies: updatedBrawlerTrophies,
                },
              },
              stats: {
                ...prev.stats,
                matchesPlayed: prev.stats.matchesPlayed + 1,
                victories: placement === 1 ? prev.stats.victories + 1 : prev.stats.victories,
                totalKills: prev.stats.totalKills + kills,
              },
            };
          });
        },
        onAliveChange: (count) => {
          setAliveCount(count);
        },
        onKillFeed: (entry) => {
          setKillFeed((feed) => [...feed.slice(-4), entry]);
        },
        onPlayerHpChange: (hp, maxHp, ammo, superCharge, cubes) => {
          setPlayerHp(hp);
          setPlayerMaxHp(maxHp);
          setPlayerAmmo(ammo);
          setPlayerSuperCharge(superCharge);
          setPowerCubes(cubes);
        },
        onPoisonPhaseChange: (phase, timeToNext) => {
          setPoisonPhase(phase);
          setPoisonTimer(timeToNext);
        },
        onPingChange: (ping) => {
          setPingMs(ping);
        },
        onFovChange: (zoom, mode) => {
          setCurrentZoom(zoom);
          setFovModeState(mode as 'normal' | 'wide' | 'ultra');
        },
      },
      matchedPlayers || undefined,
      currentRoomId,
      selfSpawnIndex,
      activeColyseusRoom
    );

    // Apply saved FOV mode if configured
    if (profile.controlsConfig?.fovMode) {
      phaserInstance.setFovMode(profile.controlsConfig.fovMode);
    }

    bridgeRef.current = phaserInstance;
    setEngine(phaserInstance);

    return () => {
      phaserInstance.destroy();
      bridgeRef.current = null;
      setEngine(null);
    };
  }, [profile.username, profile.platform, profile.brawlers, selectedBrawlerId, matchedPlayers, onUpdateProfile]);

  // Pause game when match finishes
  useEffect(() => {
    if (gameOverResult && bridgeRef.current) {
      bridgeRef.current.stop();
    }
  }, [gameOverResult]);

  return (
    <div className="relative w-full h-full min-h-screen bg-[#090d16] overflow-hidden select-none touch-none">
      {/* Phaser 3 Hardware Accelerated 2D Game Container */}
      <div ref={phaserMountRef} className="absolute inset-0 w-full h-full block z-0" />

      {/* Interactive HUD & Controls */}
      {engine && (
        <GameHUD
          engine={engine}
          aliveCount={aliveCount}
          playerHp={playerHp}
          playerMaxHp={playerMaxHp}
          playerAmmo={playerAmmo}
          playerSuperCharge={playerSuperCharge}
          powerCubes={powerCubes}
          killFeed={killFeed}
          poisonPhase={poisonPhase}
          poisonTimer={poisonTimer}
          pingMs={pingMs}
          currentZoom={currentZoom}
          fovMode={fovMode}
          roomId={engine.roomId}
          controlsConfig={profile.controlsConfig}
          onUpdateControlsConfig={(cfg) => {
            onUpdateProfile((p) => ({ ...p, controlsConfig: cfg }));
          }}
          onExitMatch={() => {
            sound.playClick();
            colyseusClient.leaveActiveRoom();
            onExitToMenu();
          }}
        />
      )}

      {/* Game Over / Victory Modal */}
      {gameOverResult && (
        <GameOverModal
          placement={gameOverResult.placement}
          kills={gameOverResult.kills}
          powerCubes={gameOverResult.powerCubes}
          onPlayAgain={() => {
            colyseusClient.leaveActiveRoom();
            onPlayAgain();
          }}
          onExitToMenu={() => {
            colyseusClient.leaveActiveRoom();
            onExitToMenu();
          }}
        />
      )}
    </div>
  );
};
