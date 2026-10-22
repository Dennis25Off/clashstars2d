import React, { useState, useEffect } from 'react';
import { loadPlayerProfile, savePlayerProfile } from './utils/storage';
import { BrawlerId, LobbyPlayerInfo, PlayerProfile } from './types/game';
import { Lobby } from './components/Lobby';
import { BattleArena } from './components/BattleArena';
import { MatchmakingModal } from './components/MatchmakingModal';
import { BrawlerSelectModal } from './components/BrawlerSelectModal';
import { BoxesModal } from './components/BoxesModal';
import { TrophyRoadModal } from './components/TrophyRoadModal';
import { MatchStartOverlay } from './components/MatchStartOverlay';
// Importiamo il client globale per gestire in modo sicuro il ciclo di vita delle stanze WebSocket
import { colyseusClient } from './utils/colyseusClient'; 

export default function App() {
  const [profile, setProfile] = useState<PlayerProfile>(() => loadPlayerProfile());
  const [currentView, setCurrentView] = useState<'lobby' | 'matchmaking' | 'battle'>('lobby');
  const [matchedPlayers, setMatchedPlayers] = useState<LobbyPlayerInfo[] | null>(null);
  const [requestedRoomId, setRequestedRoomId] = useState<string | undefined>(undefined);

  // Modals state
  const [showBrawlersModal, setShowBrawlersModal] = useState(false);
  const [showBoxesModal, setShowBoxesModal] = useState(false);
  const [showTrophyRoadModal, setShowTrophyRoadModal] = useState(false);
  
  // Stato per controllare l'avvio del countdown sopra l'arena
  const [isCountingDown, setIsCountingDown] = useState(false);

  useEffect(() => {
    savePlayerProfile(profile);
  }, [profile]);

  // Cleanup di sicurezza all'uscita o alla chiusura dell'applicazione
  useEffect(() => {
    return () => {
      colyseusClient.leaveActiveRoom();
    };
  }, []);

  const updateProfile = (updater: (prev: PlayerProfile) => PlayerProfile) => {
    setProfile((prev) => {
      const next = updater(prev);
      savePlayerProfile(next);
      return next;
    });
  };

  const handleSelectBrawler = (id: BrawlerId) => {
    updateProfile((p) => ({ ...p, selectedBrawler: id }));
  };

  const handleStartMatchmaking = (roomId?: string) => {
    setMatchedPlayers(null);
    setRequestedRoomId(roomId);
    setCurrentView('matchmaking');
  };

  const handleMatchReady = (roster: LobbyPlayerInfo[]) => {
    setMatchedPlayers(roster);
    setCurrentView('battle');
    setIsCountingDown(true); // Attiva l'overlay quando la partita è pronta
  };

  const handleExitToMenu = () => {
    // Chiude in modo pulito il canale WebSocket attivo sul server Colyseus
    colyseusClient.leaveActiveRoom();
    setMatchedPlayers(null);
    setRequestedRoomId(undefined);
    setCurrentView('lobby');
    setIsCountingDown(false);
  };

  const handlePlayAgain = () => {
    // Chiude la vecchia stanza prima di rientrare in matchmaking
    colyseusClient.leaveActiveRoom();
    setMatchedPlayers(null);
    setCurrentView('matchmaking');
    setIsCountingDown(false);
  };

  // Questa funzione viene scattata quando finiscono i 5 secondi dell'overlay React
  const handleCountdownComplete = () => {
    setIsCountingDown(false);
    
    // Invia un evento globale alle istanze Phaser attive nella pagina
    if (window.phaserGame) {
      window.phaserGame.events.emit('REACT_COUNTDOWN_COMPLETE');
    }
  };

  return (
    <div className="w-full h-full min-h-screen bg-[#070b14] overflow-hidden select-none touch-none">
      {/* 1. Main Lobby View */}
      {currentView === 'lobby' && (
        <Lobby
          profile={profile}
          onStartMatchmaking={handleStartMatchmaking}
          onOpenBrawlers={() => setShowBrawlersModal(true)}
          onOpenBoxes={() => setShowBoxesModal(true)}
          onOpenTrophyRoad={() => setShowTrophyRoadModal(true)}
          onUpdateProfile={updateProfile}
        />
      )}

      {/* 2. Fast Matchmaking Queue View */}
      {currentView === 'matchmaking' && (
        <>
          <Lobby
            profile={profile}
            onStartMatchmaking={handleStartMatchmaking}
            onOpenBrawlers={() => setShowBrawlersModal(true)}
            onOpenBoxes={() => setShowBoxesModal(true)}
            onOpenTrophyRoad={() => setShowTrophyRoadModal(true)}
            onUpdateProfile={updateProfile}
          />
          <MatchmakingModal
            profile={profile}
            selectedBrawlerId={profile.selectedBrawler}
            requestedRoomId={requestedRoomId}
            onMatchReady={handleMatchReady}
            onCancel={() => {
              colyseusClient.leaveActiveRoom();
              setCurrentView('lobby');
            }}
          />
        </>
      )}

      {/* 3. Battle Arena View */}
      {currentView === 'battle' && (
        // Usiamo un contenitore fisso "isolate". L'overlay React NON deve stare dentro lo stesso blocco logico di BattleArena se causa il re-render
        <div className="relative w-full h-full min-h-screen z-10">
          <BattleArena
            profile={profile}
            selectedBrawlerId={profile.selectedBrawler}
            matchedPlayers={matchedPlayers}
            onUpdateProfile={updateProfile}
            onExitToMenu={handleExitToMenu}
            onPlayAgain={handlePlayAgain}
            isCountdownActive={isCountingDown} 
          />
          
          {/* L'overlay è posizionato qui, ma la gestione della sua chiusura non smonterà Phaser */}
          {isCountingDown && (
            <MatchStartOverlay
              playerBrawlerId={profile.selectedBrawler}
              matchedPlayers={matchedPlayers}
              onComplete={handleCountdownComplete}
            />
          )}
        </div>
      )}

      {/* Brawler Selection & Upgrade Modal */}
      {showBrawlersModal && (
        <BrawlerSelectModal
          profile={profile}
          onSelectBrawler={handleSelectBrawler}
          onUpdateProfile={updateProfile}
          onClose={() => setShowBrawlersModal(false)}
        />
      )}

      {/* Brawl Boxes & Unboxing Modal */}
      {showBoxesModal && (
        <BoxesModal
          profile={profile}
          onUpdateProfile={updateProfile}
          onClose={() => setShowBoxesModal(false)}
        />
      )}

      {/* Trophy Road Milestone Modal */}
      {showTrophyRoadModal && (
        <TrophyRoadModal
          profile={profile}
          onUpdateProfile={updateProfile}
          onClose={() => setShowTrophyRoadModal(false)}
        />
      )}
    </div>
  );
}
