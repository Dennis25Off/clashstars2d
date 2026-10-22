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
  isCountdownActive: boolean; 
}

export const BattleArena: React.FC<BattleArenaProps> = ({
  profile,
  selectedBrawlerId,
  matchedPlayers,
  onUpdateProfile,
  onExitToMenu,
  onPlayAgain,
  isCountdownActive, 
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
  const [playerGadgetCharges, setPlayerGadgetCharges] = useState(3);
  const [killFeed, setKillFeed] = useState<KillFeedEntry[]>([]);
  const [poisonPhase, setPoisonPhase] = useState(1);
  const [poisonTimer, setPoisonTimer] = useState(30);
  const [pingMs, setPingMs] = useState(24);
  const [currentZoom, setCurrentZoom] = useState(0.65);
  const [fovMode, setFovModeState] = useState<'normal' | 'wide' | 'ultra'>(
    profile.controlsConfig?.fovMode || 'wide'
  );

  const [gameOverResult, setGameOverResult] = useState<{
    placement: number;
    kills: number;
    powerCubes: number;
  } | null>(null);

  // 1. L'INIZIALIZZAZIONE DI PHASER DEVE CORRERE UNA SOLA VOLTA (Array di dipendenze vuoto [])
  // Usiamo i riferimenti mutabili stabili (useRef) per evitare che React distrugga il canvas
  useEffect(() => {
    const mountContainer = phaserMountRef.current;
    if (!mountContainer) return;

    const brawlerLevel = profile.brawlers[selectedBrawlerId]?.level || 1;
    const selfSpawnIndex = matchedPlayers?.find(
      (p) => !p.isBot && (p.name === profile.username || p.id.includes(profile.username))
    )?.spawnIndex ?? 0;

    const currentRoomId = matchedPlayers?.[0]?.roomId || `CS-${Math.floor(1000 + Math.random() * 9000)}`;
    const activeColyseusRoom = colyseusClient.getActiveRoom();

    const phaserInstance = new PhaserGameBridge(
      mountContainer,
      selectedBrawlerId,
      brawlerLevel,
      profile.username,
      profile.platform,
      {
        onGameOver: (placement, kills, cubes) => {
          setGameOverResult({ placement, kills, powerCubes: cubes });
          // ... (Tua logica intatta dei calcoli trofei rimossa per brevità di lettura)
        },
        onAliveChange: (count) => setAliveCount(count),
        onKillFeed: (entry) => setKillFeed((feed) => [...feed.slice(-4), entry]),
        onPlayerHpChange: (hp, maxHp, ammo, superCharge, cubes, gadgets) => {
          setPlayerHp(hp);
          setPlayerMaxHp(maxHp);
          setPlayerAmmo(ammo);
          setPlayerSuperCharge(superCharge);
          setPowerCubes(cubes);
          if (typeof gadgets === 'number') setPlayerGadgetCharges(gadgets);
        },
        onPoisonPhaseChange: (phase, timeToNext) => {
          setPoisonPhase(phase);
          setPoisonTimer(timeToNext);
        },
        onPingChange: (ping) => setPingMs(ping),
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
  }, []); // 🔴 Svuotato l'array: Impedisce a React di distruggere Phaser a ogni microscopico cambio di stato

  // Sospende il bridge alla fine del match
  useEffect(() => {
    if (gameOverResult && bridgeRef.current) {
      bridgeRef.current.stop();
    }
  }, [gameOverResult]);

  // 🟢 LOGICA DI SBLOCCO DIRETTA ED IMPERATIVA (NIENTE EVENTI DI WINDOW)
  useEffect(() => {
    if (bridgeRef.current && !isCountdownActive) {
      try {
        const phaserGame = (bridgeRef.current as any).game;
        if (phaserGame) {
          // 'BattleScene' è la chiave originale passata a super() in PhaserBattleScene.ts
          const scene = phaserGame.scene.getScene('BattleScene') as any;
          if (scene) {
            console.log("Sblocco imperativo eseguito!");
            scene.startMatch(); // Forza isCountdownActive = false dentro la scena
          }
        }
      } catch (e) {
        console.error("Errore durante lo sblocco forzato della scena:", e);
      }
    }
  }, [isCountdownActive]);

  return (
    // 🔴 AGGIUNGIAMO 'pointer-events-auto' se il countdown è sbloccato per pulire i clic catturati dal DOM di React
    <div className={`relative w-full h-full min-h-screen bg-[#090d16] overflow-hidden select-none touch-none ${!isCountdownActive ? 'pointer-events-auto' : ''}`}>
      
      {/* Il Canvas di Phaser. Rimane fisso e immutabile a z-0 */}
      <div ref={phaserMountRef} className="absolute inset-0 w-full h-full block z-0" />

      {/* Interfaccia grafica HUD */}
      {engine && (
        <GameHUD
          engine={engine}
          aliveCount={aliveCount}
          playerHp={playerHp}
          playerMaxHp={playerMaxHp}
          playerAmmo={playerAmmo}
          playerSuperCharge={playerSuperCharge}
          powerCubes={powerCubes}
          gadgetCharges={playerGadgetCharges}
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

      {/* Modal di Game Over */}
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
