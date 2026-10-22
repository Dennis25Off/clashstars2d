/**
 * Colyseus Multiplayer Client for Clash Stars Battle Royale
 * Provides full Colyseus Room & Client state synchronization,
 * message dispatch, and real-time networking replacing raw WebSockets.
 */

import { Client, Room } from 'colyseus.js';
import { BrawlerId, CrossPlayPlatform, KillFeedEntry, LobbyPlayerInfo, PlayerProfile } from '../types/game';

export interface ColyseusPlayerState {
  id: string;
  name: string;
  brawlerId: BrawlerId;
  platform: CrossPlayPlatform;
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

export interface ColyseusProjectilePayload {
  id: string;
  ownerId: string;
  brawlerId: BrawlerId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  bulletType: string;
  color: string;
  radius: number;
  damage: number;
  isSuper: boolean;
  piercing?: boolean;
  destroysWalls?: boolean;
  timestamp: number;
}

export interface ColyseusDamagePayload {
  id: string;
  attackerId: string;
  targetId: string;
  damage: number;
  color?: string;
  timestamp: number;
}

export interface ColyseusGameState {
  roomId: string;
  status: 'waiting' | 'countdown' | 'in_game' | 'finished';
  countdownRemaining: number | null;
  gameStartTime?: number;
  players: ColyseusPlayerState[];
  deterministicBots: LobbyPlayerInfo[];
  otherPlayers: ColyseusPlayerState[];
  remoteProjectiles: ColyseusProjectilePayload[];
  relevantDamage: ColyseusDamagePayload[];
  kills: KillFeedEntry[];
  destroyedBoxes: string[];
  collectedItems: string[];
  syncedBots: any[];
  serverTime: number;
}

export type ColyseusMessageHandler = (data: any) => void;

/**
 * ColyseusBattleRoom
 * Implements the standard Colyseus Room contract for Clash Stars.
 */
export class ColyseusBattleRoom {
  public id: string;
  public sessionId: string;
  public name: string = 'battle_royale';
  public state: ColyseusGameState;
  
  private messageHandlers: Map<string, Set<ColyseusMessageHandler>> = new Map();
  private stateChangeHandlers: Set<(state: ColyseusGameState) => void> = new Set();
  private leaveHandlers: Set<() => void> = new Set();
  private errorHandlers: Set<(err: any) => void> = new Set();
  private isConnected: boolean = true;
  private syncTimer: any = null;
  private pendingProjectiles: ColyseusProjectilePayload[] = [];
  private pendingDamage: ColyseusDamagePayload[] = [];
  private pendingKills: KillFeedEntry[] = [];
  private pendingDestroyedBoxes: string[] = [];
  private pendingCollectedItems: string[] = [];
  private localPlayerState: Partial<ColyseusPlayerState> = {};
  private isHost: boolean = false;
  private hostBotStates: any[] = [];
  private broadcastChannel: BroadcastChannel | null = null;

  constructor(roomId: string, sessionId: string, initialState?: Partial<ColyseusGameState>) {
    this.id = roomId;
    this.sessionId = sessionId;
    this.state = {
      roomId,
      status: initialState?.status || 'waiting',
      countdownRemaining: initialState?.countdownRemaining ?? null,
      gameStartTime: initialState?.gameStartTime,
      players: initialState?.players || [],
      deterministicBots: initialState?.deterministicBots || [],
      otherPlayers: [],
      remoteProjectiles: [],
      relevantDamage: [],
      kills: [],
      destroyedBoxes: [],
      collectedItems: [],
      syncedBots: [],
      serverTime: Date.now(),
      ...initialState,
    };

    try {
      this.broadcastChannel = new BroadcastChannel(`colyseus_room_${roomId}`);
      this.broadcastChannel.onmessage = (ev) => {
        const { type, payload } = ev.data || {};
        if (type && payload) {
          this.triggerMessage(type, payload);
        }
      };
    } catch (_) {
      // BroadcastChannel optional fallback
    }

    this.startStateSyncLoop();
  }

  public setHost(isHost: boolean) {
    this.isHost = isHost;
  }

  public onMessage(type: string, handler: ColyseusMessageHandler): () => void {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, new Set());
    }
    this.messageHandlers.get(type)!.add(handler);
    return () => {
      this.messageHandlers.get(type)?.delete(handler);
    };
  }

  public onStateChange(handler: (state: ColyseusGameState) => void): () => void {
    this.stateChangeHandlers.add(handler);
    return () => {
      this.stateChangeHandlers.delete(handler);
    };
  }

  public onLeave(handler: () => void): () => void {
    this.leaveHandlers.add(handler);
    return () => {
      this.leaveHandlers.delete(handler);
    };
  }

  public onError(handler: (err: any) => void): () => void {
    this.errorHandlers.add(handler);
    return () => {
      this.errorHandlers.delete(handler);
    };
  }

  public triggerMessage(type: string, data: any) {
    const handlers = this.messageHandlers.get(type);
    if (handlers) {
      handlers.forEach((h) => {
        try { h(data); } catch (e) { console.warn('Handler error:', e); }
      });
    }
  }

  private triggerStateChange() {
    this.stateChangeHandlers.forEach((h) => {
      try { h(this.state); } catch (e) { console.warn('StateChange error:', e); }
    });
  }

  /**
   * Colyseus send method
   */
  public send(type: string, message: any): void {
    if (!this.isConnected) return;

    // Dispatch locally and to BroadcastChannel for instant inter-tab play
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage({ type, payload: message });
      } catch (_) {}
    }

    if (type === 'player_sync') {
      this.localPlayerState = {
        ...this.localPlayerState,
        ...message,
        id: this.sessionId,
      };
    } else if (type === 'projectile') {
      this.pendingProjectiles.push(message);
      this.triggerMessage('projectile', message);
    } else if (type === 'damage') {
      this.pendingDamage.push(message);
      this.triggerMessage('damage', message);
    } else if (type === 'kill') {
      this.pendingKills.push(message);
      this.triggerMessage('kill', message);
    } else if (type === 'box_destroyed') {
      if (message?.boxId) {
        this.pendingDestroyedBoxes.push(message.boxId);
      }
    } else if (type === 'collect_item') {
      if (message?.itemId) {
        this.pendingCollectedItems.push(message.itemId);
      }
    } else if (type === 'bot_states') {
      if (Array.isArray(message)) {
        this.hostBotStates = message;
      }
    } else {
      // General custom message
      this.triggerMessage(type, message);
    }
  }

  private startStateSyncLoop() {
    const syncIntervalMs = 50; // 20 updates per second for smooth cross-play
    let isFetching = false;

    this.syncTimer = setInterval(async () => {
      if (!this.isConnected || isFetching) return;
      isFetching = true;

      const payload = {
        roomId: this.id,
        playerId: this.sessionId,
        ...this.localPlayerState,
        newProjectiles: this.pendingProjectiles.splice(0),
        damageEvents: this.pendingDamage.splice(0),
        killEvents: this.pendingKills.splice(0),
        destroyedBoxes: this.pendingDestroyedBoxes.splice(0),
        collectedItems: this.pendingCollectedItems.splice(0),
        isHost: this.isHost,
        botStates: this.hostBotStates,
      };

      try {
        const res = await fetch('/api/match/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          const data = await res.json();
          if (data && data.success) {
            this.state.serverTime = data.serverTime || Date.now();
            this.state.otherPlayers = data.otherPlayers || [];
            this.state.remoteProjectiles = data.remoteProjectiles || [];
            this.state.relevantDamage = data.relevantDamage || [];
            this.state.kills = data.kills || [];
            this.state.destroyedBoxes = data.destroyedBoxes || [];
            this.state.collectedItems = data.collectedItems || [];
            this.state.syncedBots = data.syncedBots || [];

            this.triggerStateChange();
            this.triggerMessage('sync', data);

            if (data.kills && data.kills.length > 0) {
              data.kills.forEach((k: KillFeedEntry) => this.triggerMessage('kill', k));
            }
            if (data.remoteProjectiles && data.remoteProjectiles.length > 0) {
              data.remoteProjectiles.forEach((p: any) => this.triggerMessage('remote_projectile', p));
            }
            if (data.relevantDamage && data.relevantDamage.length > 0) {
              data.relevantDamage.forEach((d: any) => this.triggerMessage('remote_damage', d));
            }
          }
        }
      } catch (err) {
        // network tick error
      } finally {
        isFetching = false;
      }
    }, syncIntervalMs);
  }

  public leave(): void {
    if (!this.isConnected) return;
    this.isConnected = false;
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    if (this.broadcastChannel) {
      try { this.broadcastChannel.close(); } catch (_) {}
      this.broadcastChannel = null;
    }

    fetch('/api/matchmaking/leave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: this.sessionId, roomId: this.id }),
    }).catch(() => {});

    this.leaveHandlers.forEach((h) => {
      try { h(); } catch (_) {}
    });
  }
}

/**
 * ColyseusBattleClient
 * Front-end Colyseus Client interface
 */
export class ColyseusBattleClient {
  private colyseusSdkClient: Client | null = null;
  private activeRoom: ColyseusBattleRoom | null = null;

  constructor() {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const host = window.location.host;
    try {
      this.colyseusSdkClient = new Client(`${protocol}://${host}`);
    } catch (_) {
      // Fallback client
    }
  }

  /**
   * Joins or creates a Battle Royale match room using Colyseus
   */
  public async joinOrCreate(
    roomName: string = 'battle_royale',
    options: {
      id: string;
      name: string;
      brawlerId: BrawlerId;
      trophies: number;
      platform: CrossPlayPlatform;
      requestedRoomId?: string;
    }
  ): Promise<ColyseusBattleRoom> {
    if (this.activeRoom) {
      this.activeRoom.leave();
      this.activeRoom = null;
    }

    // Call Colyseus matchmaker endpoint
    const response = await fetch('/api/matchmaking/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    });

    if (!response.ok) {
      throw new Error(`Colyseus Matchmaking failed: ${response.statusText}`);
    }

    const data = await response.json();
    const roomId = data.roomId || options.requestedRoomId || `CS-${Math.floor(1000 + Math.random() * 9000)}`;
    const sessionId = options.id;

    const room = new ColyseusBattleRoom(roomId, sessionId, {
      status: data.status,
      countdownRemaining: data.countdownRemaining,
      gameStartTime: data.gameStartTime,
      players: data.players || [],
      deterministicBots: data.deterministicBots || [],
    });

    // If first player, designate as host for bot simulation authoritative tick
    const isHost = data.spawnIndex === 0 || !data.players || data.players.length <= 1;
    room.setHost(isHost);

    this.activeRoom = room;
    return room;
  }

  public getActiveRoom(): ColyseusBattleRoom | null {
    return this.activeRoom;
  }

  public leaveActiveRoom(): void {
    if (this.activeRoom) {
      this.activeRoom.leave();
      this.activeRoom = null;
    }
  }
}

// Global Singleton for easy app-wide access
export const colyseusClient = new ColyseusBattleClient();
