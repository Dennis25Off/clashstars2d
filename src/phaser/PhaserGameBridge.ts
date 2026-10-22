import Phaser from 'phaser';
import { PhaserBattleScene, PhaserSceneCallbacks } from './PhaserBattleScene';
import { BrawlerEntity, BrawlerId, CrossPlayPlatform, LobbyPlayerInfo, MapObstacle } from '../types/game';
import { ColyseusBattleRoom } from '../network/colyseusClient';

export class PhaserGameBridge {
  public game: Phaser.Game | null = null;
  public scene: PhaserBattleScene | null = null;
  public container: HTMLElement;
  public roomId: string;

  public moveVector = { x: 0, y: 0 };
  public aimVector = { x: 0, y: 0, isAiming: false, isSuperAiming: false };

  constructor(
    container: HTMLElement,
    selectedBrawlerId: BrawlerId,
    brawlerLevel: number,
    playerName: string,
    playerPlatform: CrossPlayPlatform,
    callbacks: PhaserSceneCallbacks,
    matchedPlayers?: LobbyPlayerInfo[],
    roomId?: string,
    spawnIndex?: number,
    colyseusRoom?: ColyseusBattleRoom | null
  ) {
    this.container = container;
    this.roomId = roomId || `CS-${Math.floor(1000 + Math.random() * 9000)}`;

    const initData = {
      selectedBrawlerId,
      brawlerLevel,
      playerName,
      playerPlatform,
      callbacks,
      matchedPlayers,
      roomId: this.roomId,
      spawnIndex,
      colyseusRoom,
    };

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      parent: container,
      width: window.innerWidth,
      height: window.innerHeight,
      backgroundColor: '#0a0e1a',
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      render: {
        antialias: true,
        pixelArt: false,
        powerPreference: 'high-performance',
      },
    };

    this.game = new Phaser.Game(config);

    // Add and start scene with initData immediately
    this.game.scene.add('BattleScene', PhaserBattleScene, true, initData);

    this.game.events.once('ready', () => {
      const activeScene = this.game?.scene.getScene('BattleScene') as PhaserBattleScene;
      if (activeScene) {
        this.scene = activeScene;
        activeScene.moveVector = this.moveVector;
        activeScene.aimVector = this.aimVector;
      }
    });
  }

  public get canvas(): HTMLCanvasElement | null {
    return this.game?.canvas || null;
  }

  public get player(): BrawlerEntity {
    if (this.scene?.player) return this.scene.player;
    return {
      id: 'placeholder',
      name: 'Player',
      brawlerId: 'blaze',
      platform: 'mobile',
      x: 1200,
      y: 1200,
      vx: 0,
      vy: 0,
      rotation: 0,
      radius: 24,
      hp: 4000,
      maxHp: 4000,
      ammo: 3,
      maxAmmo: 3,
      ammoProgress: 0,
      superCharge: 0,
      gadgetCharges: 3,
      powerCubes: 0,
      kills: 0,
      isAlive: true,
      isPlayer: true,
      isInBush: false,
      recoilOffset: 0,
      walkCycle: 0,
      isMoving: false,
      isLeaping: false,
      leapProgress: 0,
      leapStartX: 0,
      leapStartY: 0,
      leapTargetX: 0,
      leapTargetY: 0,
      hitFlashTimer: 0,
      speedBoostTimer: 0,
      shieldTimer: 0,
      shieldRatio: 0,
      doubleDamageTimer: 0,
      poisonTicksLeft: 0,
      poisonDamage: 0,
      poisonAttackerId: null,
      bandAidCooldown: 0,
      aiTargetId: null,
      aiState: 'roam',
      aiDecisionTimer: 0,
      aiAimAngle: 0,
    };
  }

  public get brawlers(): BrawlerEntity[] {
    return this.scene?.brawlers || [];
  }

  public get obstacles(): MapObstacle[] {
    return this.scene?.obstacles || [];
  }

  public get poisonZone() {
    return this.scene?.poisonZone || {
      centerX: 1200,
      centerY: 1200,
      currentRadius: 1550,
      targetRadius: 1100,
      phase: 1,
      phaseTimer: 30,
      shrinkSpeed: 20,
    };
  }

  public firePlayerNormalAttack(angle?: number) {
    this.scene?.firePlayerNormalAttack(angle);
  }

  public firePlayerSuper(angle?: number) {
    this.scene?.firePlayerSuper(angle);
  }

  public usePlayerGadget() {
    this.scene?.usePlayerGadget();
  }

  public adjustZoom(delta: number) {
    this.scene?.adjustZoom(delta);
  }

  public setFovMode(mode: 'normal' | 'wide' | 'ultra') {
    this.scene?.setFovMode(mode);
  }

  public stop() {
    if (this.game) {
      this.game.scene.pause('BattleScene');
    }
  }

  public destroy() {
    if (this.game) {
      this.game.destroy(true);
      this.game = null;
      this.scene = null;
    }
  }
}
