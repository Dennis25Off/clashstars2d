/**
 * Colyseus Multiplayer Client for Clash Stars Battle Royale
 * Provides full Colyseus Room & Client state synchronization,
 * message dispatch, and real-time networking using native WebSockets.
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
  
  private nativeRoom: Room<any> | null = null;
  private messageHandlers: Map<string, Set<ColyseusMessageHandler>> = new Map();
  private stateChangeHandlers: Set<(state: ColyseusGameState) => void> = new Set();
  private leaveHandlers: Set<() => void> = new Set();
  private errorHandlers: Set<(err: any) => void> = new Set();
  private isHost: boolean = false;

  constructor(nativeRoom: Room<any>) {
    this.nativeRoom = nativeRoom;
    this.id = nativeRoom.id;
    this.sessionId = nativeRoom.sessionId;
    
    // Inizializza lo stato locale riflettendo lo stato iniziale del server Colyseus
    this.state = this.mapNativeStateToGameState(nativeRoom.state);

    // Sincronizza lo stato in tempo reale quando cambia sul Server
    this.nativeRoom.onStateChange((serverState) => {
      this.state = this.mapNativeStateToGameState(serverState);
      this.triggerStateChange();
    });

    // Ascolta i messaggi di rete inviati dal server Colyseus tramite room.broadcast() o client.send()
    this.nativeRoom.onMessage("*", (type, message) => {
      this.triggerMessage(type as string, message);
    });

    // Gestione degli errori nativi
    this.nativeRoom.onError((code, message) => {
      this.errorHandlers.forEach((h) => h({ code, message }));
    });

    // Gestione dell'abbandono/disconnessione
    this.nativeRoom.onLeave((code) => {
      this.leaveHandlers.forEach((h) => h());
    });
  }

  /**
   * Converte la struttura dello schema di Colyseus nello stato atteso dall'applicazione TSX
   */
  private mapNativeStateToGameState(serverState: any): ColyseusGameState {
    if (!serverState) return this.state;

    // Converte mappe/array Colyseus (se presenti come collection nel server schema) in array JS normali
    const playersArray: ColyseusPlayerState[] = Array.isArray(serverState.players) 
      ? serverState.players 
      : (serverState.players?.toJSON ? Object.values(serverState.players.toJSON()) : Object.values(serverState.players || {}));

    return {
      roomId: serverState.roomId || this.id,
      status: serverState.status || 'waiting',
      countdownRemaining: serverState.countdownRemaining ?? null,
      gameStartTime: serverState.gameStartTime,
      players: playersArray,
      deterministicBots: serverState.deterministicBots || [],
      otherPlayers: playersArray.filter((p: any) => p.id !== this.sessionId),
      remoteProjectiles: serverState.remoteProjectiles || [],
      relevantDamage: serverState.relevantDamage || [],
      kills: serverState.kills || [],
      destroyedBoxes: serverState.destroyedBoxes || [],
      collectedItems: serverState.collectedItems || [],
      syncedBots: serverState.syncedBots || [],
      serverTime: serverState.serverTime || Date.now(),
    };
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
   * Colyseus native send method via WebSockets
   */
  public send(type: string, message: any): void {
    if (this.nativeRoom) {
      this.nativeRoom.send(type, message);
    }
  }

  public leave(): void {
    if (this.nativeRoom) {
      this.nativeRoom.leave();
      this.nativeRoom = null;
    }
  }
}

/**
 * ColyseusBattleClient
 * Front-end Colyseus Client interface connected to WebSocket
 */
export class ColyseusBattleClient {
  private colyseusSdkClient: Client | null = null;
  private activeRoom: ColyseusBattleRoom | null = null;

  constructor() {
    // Determina l'indirizzo del server WebSocket (stesso host del client o configurabile)
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const host = window.location.host; 
    
    try {
      // Inizializza l'SDK ufficiale di Colyseus con il protocollo WS/WSS corretto
      this.colyseusSdkClient = new Client(`${protocol}://${host}`);
    } catch (e) {
      console.error('Failed to initialize Colyseus SDK:', e);
    }
  }

  /**
   * Joins or creates a Battle Royale match room using the Colyseus WebSockets Matchmaker
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
    if (!this.colyseusSdkClient) {
      throw new Error("Colyseus SDK client is not initialized.");
    }

    if (this.activeRoom) {
      this.activeRoom.leave();
      this.activeRoom = null;
    }

    try {
      let nativeRoom: Room<any>;

      // Se viene passato un ID stanza specifico, forza l'ingresso in quella, altrimenti usa il matchmaker standard
      if (options.requestedRoomId) {
        nativeRoom = await this.colyseusSdkClient.joinById(options.requestedRoomId, options);
      } else {
        nativeRoom = await this.colyseusSdkClient.joinOrCreate(roomName, options);
      }

      // Incapsula la stanza nativa WebSocket di Colyseus nella classe wrapper usata dall'app
      const room = new ColyseusBattleRoom(nativeRoom);

      // Definisci l'host basandoti sui client connessi alla stanza reale
      const isHost = nativeRoom.state?.players 
        ? Object.keys(nativeRoom.state.players).indexOf(nativeRoom.sessionId) === 0 
        : true;
        
      room.setHost(isHost);

      this.activeRoom = room;
      return room;

    } catch (error) {
      console.error(`Colyseus native matchmaking failed for ${roomName}:`, error);
      throw error;
    }
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
