process.env.DISABLE_HMR = 'true';

import express from 'express';
import http from 'http';
import { Server, Room, Client } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());

// --- STRUTTURE DATI MULTIPLAYER (COLYSEUS SCHEMA ADAPTATION) ---

interface QueuedPlayer {
  id: string;
  name: string;
  brawlerId: string;
  trophies: number;
  platform: string;
  joinedAt: number;
  lastPing: number;
  spawnIndex?: number;
  isBot?: boolean;
}

interface RemotePlayerSync {
  id: string;
  name: string;
  brawlerId: string;
  platform: string;
  x: number;
  y: number;
  rotation: number;
  hp: number;
  maxHp: number;
  ammo: number;
  powerCubes: number;
  isAlive: boolean;
  isMoving: boolean;
  walkCycle?: number;
  hitFlash?: boolean;
  lastUpdate: number;
}

const BOT_NAME_POOL = [
  'StarShooter_IT', 'El_Pro_77', 'ShadowNinja', 'Phoenix_X',
  'ViperKing', 'SuperBrawler', 'ToxicCrow', 'ApexPredator',
  'GigaChad', 'GoldenStar', 'MegaKnight', 'GhostRider',
];
const BOT_BRAWLER_POOL = ['blaze', 'viper', 'titan', 'raven', 'harmony'];
const BOT_PLATFORM_POOL = ['mobile', 'pc', 'tablet'];

function generateDeterministicBots(humanCount: number): QueuedPlayer[] {
  const bots: QueuedPlayer[] = [];
  const needed = Math.max(0, 10 - humanCount);
  for (let i = 0; i < needed; i++) {
    const spawnIndex = humanCount + i;
    const name = BOT_NAME_POOL[i % BOT_NAME_POOL.length];
    const brawlerId = BOT_BRAWLER_POOL[i % BOT_BRAWLER_POOL.length];
    const platform = BOT_PLATFORM_POOL[i % BOT_PLATFORM_POOL.length];
    bots.push({
      id: `bot_synced_${spawnIndex}`,
      name: `${name} [BOT]`,
      brawlerId,
      trophies: 250 + i * 40,
      platform,
      joinedAt: Date.now(),
      lastPing: Date.now(),
      spawnIndex,
      isBot: true,
    });
  }
  return bots;
}

/**
 * STANZA DI GIOCO COLYSEUS NATIVA PER BATTLE ROYALE
 * Gestisce l'unione dei giocatori in un unico stato sincronizzato via WebSocket.
 */
export class BattleRoyaleRoom extends Room {
  // Capienza massima consentita nella lobby reale
  maxClients = 10;

  onCreate(options: any) {
    console.log("Stanza Colyseus creata:", this.roomId);
    
    // Inizializza lo stato centralizzato della stanza
    this.setState({
      roomId: this.roomId,
      status: 'waiting',
      countdownRemaining: null,
      gameStartTime: undefined,
      players: {}, // Mappa chiave-valore degli schema player
      deterministicBots: [],
      remoteProjectiles: [],
      relevantDamage: [],
      kills: [],
      destroyedBoxes: [],
      collectedItems: [],
      syncedBots: [],
      serverTime: Date.now()
    });

    // Registrazione listener dei messaggi in arrivo dai client tramite WebSocket
    this.onMessage("player_sync", (client, message) => {
      const player = this.state.players[client.sessionId];
      if (player) {
        Object.assign(player, message, { lastUpdate: Date.now() });
      }
    });

    this.onMessage("projectile", (client, message) => {
      // Inoltra il proiettile sparato a tutti gli altri client connessi
      this.broadcast("projectile", { ...message, ownerId: client.sessionId }, { except: client });
    });

    this.onMessage("damage", (client, message) => {
      this.broadcast("remote_damage", { ...message, attackerId: client.sessionId });
    });

    this.onMessage("kill", (client, message) => {
      if (Array.isArray(this.state.kills)) {
        this.state.kills.push(message);
        if (this.state.kills.length > 10) this.state.kills.shift();
      }
      this.broadcast("kill", message);
    });

    this.onMessage("box_destroyed", (client, message) => {
      if (message?.boxId && !this.state.destroyedBoxes.includes(message.boxId)) {
        this.state.destroyedBoxes.push(message.boxId);
      }
      this.broadcast("box_destroyed", message);
    });

    this.onMessage("collect_item", (client, message) => {
      if (message?.itemId && !this.state.collectedItems.includes(message.itemId)) {
        this.state.collectedItems.push(message.itemId);
      }
      this.broadcast("collect_item", message);
    });

    this.onMessage("bot_states", (client, message) => {
      // Sincronizza i bot simulati dall'host autoritario e li invia a tutti gli altri
      if (Array.isArray(message)) {
        this.state.syncedBots = message;
      }
    });

    // Loop di aggiornamento temporale del server
    this.setSimulationInterval(() => {
      this.state.serverTime = Date.now();
      this.checkLobbyCountdown();
    }, 50);
  }

  onJoin(client: Client, options: any) {
    console.log(`Giocatore ${options.name || client.sessionId} si è unito alla stanza: ${this.roomId}`);
    
    const spawnIndex = Object.keys(this.state.players).length;
    
    // Inserisce il profilo nel dizionario condiviso dei player attivi
    this.state.players[client.sessionId] = {
      id: client.sessionId,
      name: options.name || `Brawler_${spawnIndex}`,
      brawlerId: options.brawlerId || 'blaze',
      platform: options.platform || 'mobile',
      x: 0,
      y: 0,
      rotation: 0,
      hp: 4000,
      maxHp: 4000,
      ammo: 3,
      powerCubes: 0,
      isAlive: true,
      isMoving: false,
      lastUpdate: Date.now()
    };

    // Se ci sono almeno 2 giocatori reali attivi, avvia il countdown sincronizzato
    const humanCount = Object.keys(this.state.players).length;
    if (humanCount >= 2 && this.state.status === 'waiting') {
      this.startCountdown();
    }
  }

  startCountdown() {
    this.state.status = 'countdown';
    const duration = 10000; // 10 secondi
    this.state.gameStartTime = Date.now() + duration;
    this.state.deterministicBots = generateDeterministicBots(Object.keys(this.state.players).length);
  }

  checkLobbyCountdown() {
    if (this.state.status === 'countdown' && this.state.gameStartTime) {
      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((this.state.gameStartTime - now) / 1000));
      this.state.countdownRemaining = remaining;

      if (now >= this.state.gameStartTime) {
        this.state.status = 'in_game';
      }
    }
  }

  onLeave(client: Client, consented: boolean) {
    console.log(`Giocatore disconnesso: ${client.sessionId}`);
    delete this.state.players[client.sessionId];
  }

  onDispose() {
    console.log(`Stanza ${this.roomId} distrutta.`);
  }
}

// --- INITIALIZE SERVERS ---

const httpServer = http.createServer(app);

// Inizializza il Server Colyseus principale agganciato all'infrastruttura HTTP
const gameServer = new Server({
  transport: new WebSocketTransport({
    server: httpServer
  })
});

// Definisci l'identificatore di stanza utilizzato anche dal client TSX
gameServer.define("battle_royale", BattleRoyaleRoom);

// --- COMPATIBILITY BACKWARD MATCHMAKING FALLBACK ENDPOINTS ---

app.post('/api/matchmaking/join', (req, res) => {
  const now = Date.now();
  res.json({
    success: true,
    roomId: "VIRTUAL_LOBBY",
    status: "waiting",
    countdownRemaining: null,
    players: [],
    deterministicBots: [],
    note: "Migrato a WebSockets. Usa l'SDK Colyseus client per connetterti nativamente."
  });
});

app.post('/api/matchmaking/leave', (req, res) => {
  res.json({ success: true });
});

// --- VITE MIDDLEWARE DEVELOPMENT ENGINE ---

const isProduction = process.env.NODE_ENV === 'production';
if (!isProduction) {
  const vite = await createViteServer({
    server: {
      middlewareMode: true,
      hmr: false,
    },
    appType: 'spa',
  });
  app.use(vite.middlewares);
} else {
  app.use(express.static(path.resolve(__dirname, 'dist')));
  app.get('*', (_req, res) => {
    res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
  });
}

// IMPORTANTE: Avvia il server HTTP globale (che include il server WebSocket di Colyseus)
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Clash Stars WebSocket Server running on http://0.0.0:${PORT}`);
});
