import Phaser from 'phaser';
import { BRAWLERS } from '../data/brawlers';
import {
  BrawlerEntity,
  BrawlerId,
  CrossPlayPlatform,
  DamageNumber,
  KillFeedEntry,
  LobbyPlayerInfo,
  MapObstacle,
  Particle,
  PowerBox,
  PowerCubeDrop,
  PowerUpItem,
  PowerUpType,
  Projectile,
} from '../types/game';
import { sound } from '../utils/audio';
import { generateBattleRoyaleMap, MapData } from '../game/mapGenerator';
import { ColyseusBattleRoom } from '../network/colyseusClient';

const BOT_NAMES = [
  'El_Pro_77',
  'StarShooter_IT',
  'ShadowNinja',
  'Phoenix_X',
  'ViperKing',
  'SuperBrawler',
  'ToxicCrow',
  'ApexPredator',
  'GigaChad',
  'DynamiteKid',
  'GoldenStar',
  'MegaKnight',
  'GhostRider',
];

const BOT_PLATFORMS: CrossPlayPlatform[] = ['mobile', 'pc', 'tablet'];

export interface PhaserSceneCallbacks {
  onGameOver: (placement: number, kills: number, powerCubes: number) => void;
  onAliveChange: (count: number) => void;
  onKillFeed: (entry: KillFeedEntry) => void;
  onPlayerHpChange: (hp: number, maxHp: number, ammo: number, superCharge: number, cubes: number) => void;
  onPoisonPhaseChange: (phase: number, timeToNext: number) => void;
  onPingChange?: (pingMs: number) => void;
  onFovChange?: (zoom: number, mode: string) => void;
}

export class PhaserBattleScene extends Phaser.Scene {
  public mapData!: MapData;
  public player!: BrawlerEntity;
  public brawlers: BrawlerEntity[] = [];
  public projectiles: Projectile[] = [];
  public particles: Particle[] = [];
  public damageNumbers: DamageNumber[] = [];
  public powerBoxes: PowerBox[] = [];
  public powerCubes: PowerCubeDrop[] = [];
  public powerUps: PowerUpItem[] = [];
  public obstacles: MapObstacle[] = [];

  // Poison Storm Zone
  public poisonZone = {
    centerX: 1200,
    centerY: 1200,
    currentRadius: 1550,
    targetRadius: 1100,
    phase: 1,
    phaseTimer: 30,
    shrinkSpeed: 20,
  };

  // Camera & FOV
  public fovMode: 'normal' | 'wide' | 'ultra' = 'wide';
  public targetZoom: number = 0.65;
  public currentZoom: number = 0.65;

  // Controls state
  public moveVector = { x: 0, y: 0 };
  public aimVector = { x: 0, y: 0, isAiming: false, isSuperAiming: false };
  public mousePos = { x: 0, y: 0 };

  // Multiplayer & Colyseus
  public roomId: string = 'CS-DEFAULT';
  public spawnIndex: number = 0;
  public isHost: boolean = true;
  public pingMs: number = 24;
  public colyseusRoom: ColyseusBattleRoom | null = null;

  // Timers & Combat
  private playerCombatTimer = 0;
  private poisonTickTimer = 0;
  private powerUpSpawnTimer = 18;
  private isGameOver = false;
  private placementCalculated = false;
  private callbacks: PhaserSceneCallbacks = {
    onGameOver: () => {},
    onAliveChange: () => {},
    onKillFeed: () => {},
    onPlayerHpChange: () => {},
    onPoisonPhaseChange: () => {},
    onPingChange: () => {},
    onFovChange: () => {},
  };
  private selectedBrawlerId: BrawlerId = 'blaze';
  private brawlerLevel: number = 1;
  private playerName: string = 'Brawler';
  private playerPlatform: CrossPlayPlatform = 'mobile';
  private initialMatchedPlayers?: LobbyPlayerInfo[];

  // Phaser Graphics Layers
  private groundGraphics!: Phaser.GameObjects.Graphics;
  private bushGraphics!: Phaser.GameObjects.Graphics;
  private obstacleGraphics!: Phaser.GameObjects.Graphics;
  private boxGraphics!: Phaser.GameObjects.Graphics;
  private itemGraphics!: Phaser.GameObjects.Graphics;
  private projectileGraphics!: Phaser.GameObjects.Graphics;
  private brawlerGraphics!: Phaser.GameObjects.Graphics;
  private uiGraphics!: Phaser.GameObjects.Graphics;
  private poisonGraphics!: Phaser.GameObjects.Graphics;
  private aimGraphics!: Phaser.GameObjects.Graphics;

  // Key tracking
  private keys: { [key: string]: Phaser.Input.Keyboard.Key } = {};

  constructor() {
    super({ key: 'BattleScene' });
  }

  public init(data?: Partial<{
    selectedBrawlerId: BrawlerId;
    brawlerLevel: number;
    playerName: string;
    playerPlatform: CrossPlayPlatform;
    callbacks: PhaserSceneCallbacks;
    matchedPlayers?: LobbyPlayerInfo[];
    roomId?: string;
    spawnIndex?: number;
    colyseusRoom?: ColyseusBattleRoom | null;
  }>) {
    if (!data) return;
    if (data.selectedBrawlerId) this.selectedBrawlerId = data.selectedBrawlerId;
    if (data.brawlerLevel) this.brawlerLevel = data.brawlerLevel;
    if (data.playerName) this.playerName = data.playerName;
    if (data.playerPlatform) this.playerPlatform = data.playerPlatform;
    if (data.callbacks) this.callbacks = data.callbacks;
    if (data.matchedPlayers) this.initialMatchedPlayers = data.matchedPlayers;
    if (data.roomId) this.roomId = data.roomId;
    if (typeof data.spawnIndex === 'number') this.spawnIndex = data.spawnIndex;
    if (data.colyseusRoom !== undefined) this.colyseusRoom = data.colyseusRoom;
  }

  public create(data?: any) {
    if (data) {
      this.init(data);
    }
    // 1. Generate map
    this.mapData = generateBattleRoyaleMap();
    this.obstacles = this.mapData.obstacles;
    this.powerBoxes = this.mapData.powerBoxes;

    // 2. Setup Phaser Layers
    this.groundGraphics = this.add.graphics();
    this.bushGraphics = this.add.graphics();
    this.obstacleGraphics = this.add.graphics();
    this.boxGraphics = this.add.graphics();
    this.itemGraphics = this.add.graphics();
    this.projectileGraphics = this.add.graphics();
    this.brawlerGraphics = this.add.graphics();
    this.uiGraphics = this.add.graphics();
    this.poisonGraphics = this.add.graphics();
    this.aimGraphics = this.add.graphics();

    // 3. Initialize Entities
    this.initEntities();

    // 4. Setup Camera
    this.cameras.main.setBounds(0, 0, this.mapData.width, this.mapData.height);
    this.setFovMode(this.fovMode);

    // 5. Setup Keyboard input
    if (this.input.keyboard) {
      this.keys = this.input.keyboard.addKeys({
        up: Phaser.Input.Keyboard.KeyCodes.W,
        down: Phaser.Input.Keyboard.KeyCodes.S,
        left: Phaser.Input.Keyboard.KeyCodes.A,
        right: Phaser.Input.Keyboard.KeyCodes.D,
        upArrow: Phaser.Input.Keyboard.KeyCodes.UP,
        downArrow: Phaser.Input.Keyboard.KeyCodes.DOWN,
        leftArrow: Phaser.Input.Keyboard.KeyCodes.LEFT,
        rightArrow: Phaser.Input.Keyboard.KeyCodes.RIGHT,
        space: Phaser.Input.Keyboard.KeyCodes.SPACE,
        e: Phaser.Input.Keyboard.KeyCodes.E,
        q: Phaser.Input.Keyboard.KeyCodes.Q,
        f: Phaser.Input.Keyboard.KeyCodes.F,
      }) as { [key: string]: Phaser.Input.Keyboard.Key };
    }

    // 6. Setup Pointer/Mouse input
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      this.mousePos.x = worldPoint.x;
      this.mousePos.y = worldPoint.y;

      if (this.aimVector.isAiming || pointer.isDown) {
        const dx = worldPoint.x - this.player.x;
        const dy = worldPoint.y - this.player.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 15) {
          this.aimVector.x = dx / dist;
          this.aimVector.y = dy / dist;
        }
      }
    });

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const dx = worldPoint.x - this.player.x;
      const dy = worldPoint.y - this.player.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 10) {
        this.aimVector.x = dx / dist;
        this.aimVector.y = dy / dist;
        this.aimVector.isAiming = true;
      }
    });

    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const dx = worldPoint.x - this.player.x;
      const dy = worldPoint.y - this.player.y;
      const angle = Math.atan2(dy, dx);

      this.firePlayerNormalAttack(angle);
      this.aimVector.isAiming = false;
    });

    // 7. Setup Colyseus Room listeners
    if (this.colyseusRoom) {
      this.setupColyseusListeners(this.colyseusRoom);
    }

    // Initial draw of static ground
    this.renderGround();
  }

  private initEntities() {
    const spawns = this.mapData.spawnPoints;
    const playerSpawn = spawns[this.spawnIndex % spawns.length];
    const def = BRAWLERS[this.selectedBrawlerId];
    const statMultiplier = 1 + (this.brawlerLevel - 1) * 0.05;
    const finalHp = Math.round(def.baseHp * statMultiplier);

    this.player = {
      id: `player_${this.playerName}`,
      name: this.playerName,
      brawlerId: this.selectedBrawlerId,
      platform: this.playerPlatform,
      x: playerSpawn.x,
      y: playerSpawn.y,
      vx: 0,
      vy: 0,
      rotation: 0,
      radius: def.role === 'Colosso' ? 28 : 24,
      hp: finalHp,
      maxHp: finalHp,
      ammo: def.maxAmmo,
      maxAmmo: def.maxAmmo,
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

    this.brawlers = [this.player];

    // Spawn other players / bots
    for (let slot = 0; slot < 10; slot++) {
      if (slot === this.spawnIndex) continue;

      const spawn = spawns[slot % spawns.length];
      const matchP = this.initialMatchedPlayers?.find((p) => p.spawnIndex === slot);

      const botId = matchP ? matchP.id : `bot_synced_${slot}`;
      const botName = matchP ? matchP.name : `${BOT_NAMES[slot % BOT_NAMES.length]} [BOT]`;
      const isRemoteHuman = Boolean(matchP && !matchP.isBot);
      const botPlatform = matchP ? matchP.platform : BOT_PLATFORMS[slot % BOT_PLATFORMS.length];
      const bId = (matchP ? matchP.brawlerId : Object.keys(BRAWLERS)[slot % 5]) as BrawlerId;

      const botDef = BRAWLERS[bId];
      const botLevel = Math.floor(Math.random() * 3) + 1;
      const bMult = 1 + (botLevel - 1) * 0.05;
      const botHp = Math.round(botDef.baseHp * bMult);

      const brawlerEntity: BrawlerEntity = {
        id: botId,
        name: botName,
        brawlerId: bId,
        platform: botPlatform,
        x: spawn.x,
        y: spawn.y,
        vx: 0,
        vy: 0,
        rotation: Math.random() * Math.PI * 2,
        radius: botDef.role === 'Colosso' ? 28 : 24,
        hp: botHp,
        maxHp: botHp,
        ammo: botDef.maxAmmo,
        maxAmmo: botDef.maxAmmo,
        ammoProgress: 0,
        superCharge: 0,
        gadgetCharges: 3,
        powerCubes: 0,
        kills: 0,
        isAlive: true,
        isPlayer: false,
        isRemotePlayer: isRemoteHuman,
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
        aiDecisionTimer: Math.random() * 0.5,
        aiAimAngle: 0,
      };

      this.brawlers.push(brawlerEntity);
    }

    // Set host if spawn index 0
    this.isHost = this.spawnIndex === 0;

    // Initial callbacks
    this.callbacks?.onAliveChange(10);
    this.callbacks?.onPlayerHpChange(
      this.player.hp,
      this.player.maxHp,
      this.player.ammo,
      this.player.superCharge,
      this.player.powerCubes
    );
  }

  private setupColyseusListeners(room: ColyseusBattleRoom) {
    room.onMessage('sync', (data: any) => {
      // 1. Sync remote human players
      if (Array.isArray(data.otherPlayers)) {
        for (const remote of data.otherPlayers) {
          const target = this.brawlers.find((b) => b.id === remote.id);
          if (target && !target.isPlayer) {
            target.x += (remote.x - target.x) * 0.45;
            target.y += (remote.y - target.y) * 0.45;
            target.rotation = remote.rotation;
            target.hp = remote.hp;
            target.maxHp = remote.maxHp;
            target.ammo = remote.ammo;
            target.powerCubes = remote.powerCubes;
            target.isAlive = remote.isAlive;
            target.isMoving = remote.isMoving;
            target.walkCycle = remote.walkCycle || 0;
            target.isRemotePlayer = true;
          }
        }
      }

      // 2. Sync bots if not host
      if (!this.isHost && Array.isArray(data.syncedBots)) {
        for (const synced of data.syncedBots) {
          const bot = this.brawlers.find((b) => b.id === synced.id);
          if (bot && !bot.isPlayer && !bot.isRemotePlayer) {
            bot.x += (synced.x - bot.x) * 0.4;
            bot.y += (synced.y - bot.y) * 0.4;
            bot.rotation = synced.rotation;
            bot.hp = synced.hp;
            bot.maxHp = synced.maxHp;
            bot.ammo = synced.ammo;
            bot.powerCubes = synced.powerCubes;
            bot.isAlive = synced.isAlive;
            bot.isMoving = synced.isMoving;
          }
        }
      }

      // 3. Sync destroyed boxes
      if (Array.isArray(data.destroyedBoxes)) {
        for (const boxId of data.destroyedBoxes) {
          const box = this.powerBoxes.find((b) => b.id === boxId);
          if (box && !box.isDestroyed) {
            box.isDestroyed = true;
            box.hp = 0;
            this.spawnPowerCubes(box.x + box.width / 2, box.y + box.height / 2, box.cubesToDrop);
            sound.playExplosion();
          }
        }
      }

      // 4. Sync remote projectiles
      if (Array.isArray(data.remoteProjectiles)) {
        for (const p of data.remoteProjectiles) {
          if (p.ownerId !== this.player.id && !this.projectiles.some((pr) => pr.id === p.id)) {
            const owner = this.brawlers.find((b) => b.id === p.ownerId);
            const bId = (p.brawlerId || owner?.brawlerId || 'blaze') as BrawlerId;
            const def = BRAWLERS[bId];
            this.projectiles.push({
              id: p.id,
              ownerId: p.ownerId,
              isSuper: p.isSuper || false,
              brawlerId: bId,
              x: p.x,
              y: p.y,
              vx: p.vx,
              vy: p.vy,
              distanceTraveled: 0,
              maxDistance: p.isSuper ? def.superRange : def.attackRange,
              damage: p.damage || def.attackDamage,
              radius: p.radius || def.bulletRadius,
              piercing: p.piercing || false,
              destroysWalls: p.destroysWalls || false,
              color: p.color || (p.isSuper ? '#eab308' : '#f97316'),
              bulletType: p.bulletType || def.bulletType,
            });
            sound.playShoot(p.bulletType || def.bulletType);
          }
        }
      }
    });

    room.onMessage('kill', (k: KillFeedEntry) => {
      this.callbacks?.onKillFeed(k);
    });
  }

  // --- PHASER MAIN UPDATE LOOP (60 FPS) ---
  public override update(time: number, delta: number) {
    if (this.isGameOver && this.placementCalculated) return;

    const dt = Math.min(delta / 1000, 0.05);

    // 1. Process Player Movement & Input
    this.updatePlayerInput(dt);

    // 2. Camera tracking
    this.updateCamera();

    // 3. Update Bot AI & Entities
    this.updateEntities(dt);

    // 4. Update Poison Zone
    this.updatePoisonZone(dt);

    // 5. Update Projectiles & Collisions
    this.updateProjectiles(dt);

    // 6. Update Tactical Items & Power Cubes
    this.updateItems(dt);

    // 7. Sync with Colyseus Room
    this.syncColyseusRoom();

    // 8. Render All Game Objects with Phaser
    this.renderPhaserLayers();

    // 9. Check Victory / Game Over
    this.checkMatchStatus();
  }

  private updatePlayerInput(dt: number) {
    if (!this.player.isAlive || this.player.isLeaping) return;

    let moveX = this.moveVector.x;
    let moveY = this.moveVector.y;

    // Check keyboard WASD / Arrows
    if (this.keys.up?.isDown || this.keys.upArrow?.isDown) moveY -= 1;
    if (this.keys.down?.isDown || this.keys.downArrow?.isDown) moveY += 1;
    if (this.keys.left?.isDown || this.keys.leftArrow?.isDown) moveX -= 1;
    if (this.keys.right?.isDown || this.keys.rightArrow?.isDown) moveX += 1;

    // Hotkeys
    if (Phaser.Input.Keyboard.JustDown(this.keys.space)) {
      this.firePlayerSuper();
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.e) || Phaser.Input.Keyboard.JustDown(this.keys.f)) {
      this.usePlayerGadget();
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.q)) {
      this.firePlayerNormalAttack();
    }

    const def = BRAWLERS[this.player.brawlerId];
    let speedMult = 1;
    if (this.player.speedBoostTimer > 0) speedMult += 0.5;
    const baseSpeed = def.speed * 60 * speedMult;

    const len = Math.hypot(moveX, moveY);
    if (len > 0.05) {
      const normX = moveX / len;
      const normY = moveY / len;
      const moveDistance = Math.min(len, 1.0) * baseSpeed * dt;

      this.moveEntityWithCollision(this.player, normX * moveDistance, normY * moveDistance);
      this.player.isMoving = true;
      this.player.walkCycle += dt * 14;

      if (!this.aimVector.isAiming) {
        this.player.rotation = Math.atan2(normY, normX);
      }
    } else {
      this.player.isMoving = false;
      this.player.walkCycle = 0;
    }

    if (this.aimVector.isAiming) {
      this.player.rotation = Math.atan2(this.aimVector.y, this.aimVector.x);
    }
  }

  private updateCamera() {
    // Smooth camera follow player
    const cam = this.cameras.main;
    const targetX = this.player.x;
    const targetY = this.player.y;

    cam.scrollX += (targetX - cam.width / 2 - cam.scrollX) * 0.12;
    cam.scrollY += (targetY - cam.height / 2 - cam.scrollY) * 0.12;

    // Smooth zoom
    this.currentZoom += (this.targetZoom - this.currentZoom) * 0.1;
    cam.setZoom(this.currentZoom);
  }

  private updateEntities(dt: number) {
    this.playerCombatTimer += dt;
    // Passive HP Regeneration when out of combat for 3.2s
    if (this.player.isAlive && this.playerCombatTimer >= 3.2 && this.player.hp < this.player.maxHp) {
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + this.player.maxHp * 0.14 * dt);
      this.callbacks?.onPlayerHpChange(
        this.player.hp,
        this.player.maxHp,
        this.player.ammo,
        this.player.superCharge,
        this.player.powerCubes
      );
    }

    for (const brawler of this.brawlers) {
      if (!brawler.isAlive) continue;

      // Decrement timers
      if (brawler.recoilOffset > 0) brawler.recoilOffset = Math.max(0, brawler.recoilOffset - dt * 30);
      if (brawler.hitFlashTimer > 0) brawler.hitFlashTimer = Math.max(0, brawler.hitFlashTimer - dt);
      if (brawler.speedBoostTimer > 0) brawler.speedBoostTimer = Math.max(0, brawler.speedBoostTimer - dt);
      if (brawler.shieldTimer > 0) brawler.shieldTimer = Math.max(0, brawler.shieldTimer - dt);
      if (brawler.doubleDamageTimer > 0) brawler.doubleDamageTimer = Math.max(0, brawler.doubleDamageTimer - dt);

      // Ammo reload
      const bDef = BRAWLERS[brawler.brawlerId];
      if (brawler.ammo < brawler.maxAmmo) {
        brawler.ammo = Math.min(brawler.maxAmmo, brawler.ammo + dt / bDef.reloadTime);
        if (brawler.isPlayer) {
          this.callbacks?.onPlayerHpChange(
            brawler.hp,
            brawler.maxHp,
            brawler.ammo,
            brawler.superCharge,
            brawler.powerCubes
          );
        }
      }

      // Leap mechanic
      if (brawler.isLeaping) {
        brawler.leapProgress += dt * 1.6;
        if (brawler.leapProgress >= 1) {
          brawler.isLeaping = false;
          brawler.x = brawler.leapTargetX;
          brawler.y = brawler.leapTargetY;
          this.triggerLeapImpact(brawler);
        } else {
          brawler.x = brawler.leapStartX + (brawler.leapTargetX - brawler.leapStartX) * brawler.leapProgress;
          brawler.y = brawler.leapStartY + (brawler.leapTargetY - brawler.leapStartY) * brawler.leapProgress;
        }
      }

      // Check bush status
      brawler.isInBush = this.checkInBush(brawler.x, brawler.y);

      // Update Bot AI (only host simulates bots)
      if (!brawler.isPlayer && !brawler.isRemotePlayer && this.isHost) {
        this.updateBotAI(brawler, dt);
      }
    }
  }

  private updateBotAI(bot: BrawlerEntity, dt: number) {
    if (bot.isLeaping || !bot.isAlive) return;

    bot.aiDecisionTimer -= dt;
    const def = BRAWLERS[bot.brawlerId];
    const cx = this.poisonZone.centerX;
    const cy = this.poisonZone.centerY;
    const poisonR = this.poisonZone.currentRadius;

    let speedMult = 1;
    if (bot.speedBoostTimer > 0) speedMult += 0.5;
    const moveSpeed = def.speed * 60 * speedMult * dt;

    // 1. Storm retreat if outside safe zone
    const distToCenter = Math.hypot(bot.x - cx, bot.y - cy);
    if (distToCenter > poisonR - 90) {
      const angleToCenter = Math.atan2(cy - bot.y, cx - bot.x);
      this.moveEntityWithCollision(bot, Math.cos(angleToCenter) * moveSpeed, Math.sin(angleToCenter) * moveSpeed);
      bot.rotation = angleToCenter;
      bot.isMoving = true;
      bot.walkCycle += dt * 12;
      return;
    }

    // 2. Pick up nearby power-ups or cubes
    let nearestPowerUp: PowerUpItem | null = null;
    let nearestPUDist = Infinity;
    for (const pu of this.powerUps) {
      if (pu.collected) continue;
      const d = Math.hypot(bot.x - pu.x, bot.y - pu.y);
      if (d < 350 && d < nearestPUDist) {
        nearestPUDist = d;
        nearestPowerUp = pu;
      }
    }

    if (nearestPowerUp && nearestPUDist < 300) {
      const angle = Math.atan2(nearestPowerUp.y - bot.y, nearestPowerUp.x - bot.x);
      this.moveEntityWithCollision(bot, Math.cos(angle) * moveSpeed, Math.sin(angle) * moveSpeed);
      bot.rotation = angle;
      bot.isMoving = true;
      bot.walkCycle += dt * 12;
      return;
    }

    // 3. Find closest target
    let closestEnemy: BrawlerEntity | null = null;
    let closestEnemyDist = Infinity;

    for (const other of this.brawlers) {
      if (other.id === bot.id || !other.isAlive) continue;
      if (other.isInBush && !bot.isInBush && Math.hypot(bot.x - other.x, bot.y - other.y) > 85) {
        continue;
      }
      const dist = Math.hypot(bot.x - other.x, bot.y - other.y);
      if (dist < closestEnemyDist) {
        closestEnemyDist = dist;
        closestEnemy = other;
      }
    }

    let closestBox: PowerBox | null = null;
    let closestBoxDist = Infinity;
    for (const box of this.powerBoxes) {
      if (box.isDestroyed) continue;
      const dist = Math.hypot(bot.x - (box.x + box.width / 2), bot.y - (box.y + box.height / 2));
      if (dist < closestBoxDist) {
        closestBoxDist = dist;
        closestBox = box;
      }
    }

    if (closestEnemy && closestEnemyDist < def.attackRange + 120) {
      const angle = Math.atan2(closestEnemy.y - bot.y, closestEnemy.x - bot.x);
      bot.rotation = angle;

      const idealDist = def.role === 'Colosso' ? 80 : def.attackRange * 0.75;
      if (closestEnemyDist > idealDist) {
        this.moveEntityWithCollision(bot, Math.cos(angle) * moveSpeed, Math.sin(angle) * moveSpeed);
        bot.isMoving = true;
        bot.walkCycle += dt * 12;
      } else if (closestEnemyDist < idealDist * 0.6 && def.role !== 'Colosso') {
        this.moveEntityWithCollision(bot, -Math.cos(angle) * moveSpeed, -Math.sin(angle) * moveSpeed);
        bot.isMoving = true;
        bot.walkCycle += dt * 12;
      } else {
        bot.isMoving = false;
      }

      if (bot.superCharge >= 100 && closestEnemyDist < def.superRange) {
        this.executeSuper(bot, angle);
      } else if (bot.ammo >= 1 && closestEnemyDist <= def.attackRange) {
        if (Math.random() < 0.16) {
          this.executeNormalAttack(bot, angle);
        }
      }
    } else if (closestBox && closestBoxDist < 450) {
      const targetX = closestBox.x + closestBox.width / 2;
      const targetY = closestBox.y + closestBox.height / 2;
      const angle = Math.atan2(targetY - bot.y, targetX - bot.x);
      bot.rotation = angle;

      if (closestBoxDist > def.attackRange * 0.6) {
        this.moveEntityWithCollision(bot, Math.cos(angle) * moveSpeed, Math.sin(angle) * moveSpeed);
        bot.isMoving = true;
        bot.walkCycle += dt * 12;
      } else {
        bot.isMoving = false;
      }

      if (bot.ammo >= 1 && closestBoxDist <= def.attackRange) {
        if (Math.random() < 0.18) {
          this.executeNormalAttack(bot, angle);
        }
      }
    } else {
      const angle = Math.atan2(cy - bot.y, cx - bot.x) + (Math.random() - 0.5) * 0.6;
      this.moveEntityWithCollision(bot, Math.cos(angle) * moveSpeed * 0.7, Math.sin(angle) * moveSpeed * 0.7);
      bot.rotation = angle;
      bot.isMoving = true;
      bot.walkCycle += dt * 10;
    }
  }

  private updatePoisonZone(dt: number) {
    this.poisonZone.phaseTimer -= dt;

    if (this.poisonZone.currentRadius > this.poisonZone.targetRadius) {
      this.poisonZone.currentRadius = Math.max(
        this.poisonZone.targetRadius,
        this.poisonZone.currentRadius - this.poisonZone.shrinkSpeed * dt
      );
    }

    if (this.poisonZone.phaseTimer <= 0) {
      this.poisonZone.phase++;
      this.poisonZone.phaseTimer = 26;
      if (this.poisonZone.phase === 2) {
        this.poisonZone.targetRadius = 750;
      } else if (this.poisonZone.phase === 3) {
        this.poisonZone.targetRadius = 400;
      } else if (this.poisonZone.phase >= 4) {
        this.poisonZone.targetRadius = 150;
      }
      this.callbacks?.onPoisonPhaseChange(this.poisonZone.phase, Math.round(this.poisonZone.phaseTimer));
    }

    // Apply poison damage ticks
    this.poisonTickTimer += dt;
    if (this.poisonTickTimer >= 1.0) {
      this.poisonTickTimer = 0;
      const damage = 650 + (this.poisonZone.phase - 1) * 200;

      for (const brawler of this.brawlers) {
        if (!brawler.isAlive) continue;
        const dist = Math.hypot(brawler.x - this.poisonZone.centerX, brawler.y - this.poisonZone.centerY);
        if (dist > this.poisonZone.currentRadius) {
          this.applyDamage(brawler, damage, 'poison_storm', false, '#a855f7');
          sound.playHit();
        }
      }
    }
  }

  private updateProjectiles(dt: number) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      const stepX = p.vx * dt;
      const stepY = p.vy * dt;
      p.x += stepX;
      p.y += stepY;
      p.distanceTraveled += Math.hypot(stepX, stepY);

      // Check max distance
      if (p.distanceTraveled >= p.maxDistance) {
        this.projectiles.splice(i, 1);
        continue;
      }

      // Check wall collision
      let hitObstacle = false;
      for (const obs of this.obstacles) {
        if (obs.type === 'water') continue;
        if (p.x >= obs.x && p.x <= obs.x + obs.width && p.y >= obs.y && p.y <= obs.y + obs.height) {
          hitObstacle = true;
          if (p.destroysWalls && obs.destructible) {
            obs.hp = (obs.hp || 400) - p.damage;
            if (obs.hp <= 0) {
              const obsIdx = this.obstacles.indexOf(obs);
              if (obsIdx !== -1) this.obstacles.splice(obsIdx, 1);
            }
          }
          break;
        }
      }

      if (hitObstacle && !p.piercing) {
        this.projectiles.splice(i, 1);
        continue;
      }

      // Check power box collision
      let hitBox = false;
      for (const box of this.powerBoxes) {
        if (box.isDestroyed) continue;
        if (
          p.x >= box.x &&
          p.x <= box.x + box.width &&
          p.y >= box.y &&
          p.y <= box.y + box.height
        ) {
          box.hp = Math.max(0, box.hp - p.damage);
          sound.playHit();
          hitBox = true;

          if (box.hp <= 0) {
            box.isDestroyed = true;
            this.spawnPowerCubes(box.x + box.width / 2, box.y + box.height / 2, box.cubesToDrop);
            sound.playExplosion();
            if (this.colyseusRoom) {
              this.colyseusRoom.send('box_destroyed', { boxId: box.id });
            }
          }
          break;
        }
      }

      if (hitBox && !p.piercing) {
        this.projectiles.splice(i, 1);
        continue;
      }

      // Check enemy brawlers collision
      let hitBrawler = false;
      for (const brawler of this.brawlers) {
        if (!brawler.isAlive || brawler.id === p.ownerId || brawler.isLeaping) continue;
        const dist = Math.hypot(p.x - brawler.x, p.y - brawler.y);
        if (dist <= brawler.radius + p.radius) {
          this.applyDamage(brawler, p.damage, p.ownerId, p.isSuper, p.color);
          hitBrawler = true;

          // Charge shooter super
          const shooter = this.brawlers.find((b) => b.id === p.ownerId);
          if (shooter) {
            shooter.superCharge = Math.min(100, shooter.superCharge + 28);
            if (shooter.isPlayer) {
              this.callbacks?.onPlayerHpChange(
                shooter.hp,
                shooter.maxHp,
                shooter.ammo,
                shooter.superCharge,
                shooter.powerCubes
              );
            }
          }
          break;
        }
      }

      if (hitBrawler && !p.piercing) {
        this.projectiles.splice(i, 1);
      }
    }
  }

  private updateItems(dt: number) {
    // Collect power cubes
    for (let i = this.powerCubes.length - 1; i >= 0; i--) {
      const cube = this.powerCubes[i];
      for (const brawler of this.brawlers) {
        if (!brawler.isAlive || brawler.isLeaping) continue;
        const dist = Math.hypot(cube.x - brawler.x, cube.y - brawler.y);
        if (dist <= brawler.radius + 18) {
          brawler.powerCubes++;
          brawler.maxHp += 400;
          brawler.hp = Math.min(brawler.maxHp, brawler.hp + 400);

          if (brawler.isPlayer) {
            sound.playPowerCube();
            this.callbacks?.onPlayerHpChange(
              brawler.hp,
              brawler.maxHp,
              brawler.ammo,
              brawler.superCharge,
              brawler.powerCubes
            );
          }
          this.powerCubes.splice(i, 1);
          break;
        }
      }
    }

    // Collect power-ups
    for (let i = this.powerUps.length - 1; i >= 0; i--) {
      const pu = this.powerUps[i];
      pu.bobTimer += dt * 3.5;
      for (const brawler of this.brawlers) {
        if (!brawler.isAlive || brawler.isLeaping) continue;
        const dist = Math.hypot(pu.x - brawler.x, pu.y - brawler.y);
        if (dist <= brawler.radius + pu.radius) {
          if (pu.type === 'speed') brawler.speedBoostTimer = 6;
          else if (pu.type === 'shield') brawler.shieldTimer = 5;
          else if (pu.type === 'damage') brawler.doubleDamageTimer = 6;
          else if (pu.type === 'heal') brawler.hp = Math.min(brawler.maxHp, brawler.hp + 1800);
          else if (pu.type === 'super') brawler.superCharge = 100;

          if (brawler.isPlayer) {
            sound.playPowerUp();
            this.callbacks?.onPlayerHpChange(
              brawler.hp,
              brawler.maxHp,
              brawler.ammo,
              brawler.superCharge,
              brawler.powerCubes
            );
          }
          this.powerUps.splice(i, 1);
          break;
        }
      }
    }

    // Periodically spawn tactical power-ups
    this.powerUpSpawnTimer -= dt;
    if (this.powerUpSpawnTimer <= 0) {
      this.powerUpSpawnTimer = 16;
      this.spawnRandomPowerUp();
    }
  }

  private syncColyseusRoom() {
    if (!this.colyseusRoom) return;

    this.colyseusRoom.send('player_sync', {
      x: Math.round(this.player.x),
      y: Math.round(this.player.y),
      rotation: Number(this.player.rotation.toFixed(2)),
      hp: Math.round(this.player.hp),
      maxHp: this.player.maxHp,
      ammo: Number(this.player.ammo.toFixed(2)),
      powerCubes: this.player.powerCubes,
      isAlive: this.player.isAlive,
      isMoving: this.player.isMoving,
      walkCycle: Number(this.player.walkCycle.toFixed(2)),
      hitFlash: this.player.hitFlashTimer > 0,
    });

    if (this.isHost) {
      const botPayload = this.brawlers
        .filter((b) => !b.isPlayer && !b.isRemotePlayer)
        .map((b) => ({
          id: b.id,
          x: Math.round(b.x),
          y: Math.round(b.y),
          rotation: Number(b.rotation.toFixed(2)),
          hp: Math.round(b.hp),
          maxHp: b.maxHp,
          ammo: Number(b.ammo.toFixed(2)),
          powerCubes: b.powerCubes,
          isAlive: b.isAlive,
          isMoving: b.isMoving,
          walkCycle: Number(b.walkCycle.toFixed(2)),
        }));
      this.colyseusRoom.send('bot_states', botPayload);
    }
  }

  // --- ATTACKS & ACTIONS ---
  public firePlayerNormalAttack(angle?: number) {
    if (!this.player.isAlive || this.player.isLeaping) return;
    if (this.player.ammo < 1) return;

    let targetAngle = angle;
    if (targetAngle === undefined) {
      targetAngle = this.findAutoAimAngle(this.player, false);
    }

    this.executeNormalAttack(this.player, targetAngle);
    this.playerCombatTimer = 0;
  }

  public firePlayerSuper(angle?: number) {
    if (!this.player.isAlive || this.player.isLeaping) return;
    if (this.player.superCharge < 100) return;

    let targetAngle = angle;
    if (targetAngle === undefined) {
      targetAngle = this.findAutoAimAngle(this.player, true);
    }

    this.executeSuper(this.player, targetAngle);
    this.playerCombatTimer = 0;
  }

  public usePlayerGadget() {
    if (!this.player.isAlive) return;
    this.player.speedBoostTimer = 4;
    sound.playPowerUp();
  }

  public adjustZoom(delta: number) {
    this.targetZoom = Math.max(0.45, Math.min(1.1, this.targetZoom + delta));
    this.callbacks?.onFovChange?.(this.targetZoom, this.fovMode);
  }

  public setFovMode(mode: 'normal' | 'wide' | 'ultra') {
    this.fovMode = mode;
    if (mode === 'normal') this.targetZoom = 0.85;
    else if (mode === 'wide') this.targetZoom = 0.65;
    else if (mode === 'ultra') this.targetZoom = 0.50;
    this.callbacks?.onFovChange?.(this.targetZoom, this.fovMode);
  }

  private executeNormalAttack(attacker: BrawlerEntity, angle: number) {
    attacker.ammo = Math.max(0, attacker.ammo - 1);
    attacker.rotation = angle;
    attacker.recoilOffset = 12;

    const def = BRAWLERS[attacker.brawlerId];
    let damage = Math.round(def.attackDamage * (1 + attacker.powerCubes * 0.1));
    if (attacker.doubleDamageTimer > 0) damage *= 2;

    sound.playShoot(def.bulletType);

    // Multi-shot logic
    const count = def.bulletCount || 1;
    const spread = def.attackSpread || 0;
    const startAngle = count > 1 ? angle - spread / 2 : angle;
    const step = count > 1 ? spread / (count - 1) : 0;

    for (let i = 0; i < count; i++) {
      const curAngle = startAngle + step * i;
      const speed = def.bulletSpeed * 60;
      const proj: Projectile = {
        id: `p_${attacker.id}_${Date.now()}_${Math.random()}`,
        ownerId: attacker.id,
        brawlerId: attacker.brawlerId,
        x: attacker.x + Math.cos(curAngle) * (attacker.radius + 8),
        y: attacker.y + Math.sin(curAngle) * (attacker.radius + 8),
        vx: Math.cos(curAngle) * speed,
        vy: Math.sin(curAngle) * speed,
        distanceTraveled: 0,
        maxDistance: def.attackRange,
        damage,
        radius: def.bulletRadius,
        piercing: def.bulletType === 'sonic',
        destroysWalls: false,
        color: def.color,
        bulletType: def.bulletType,
        isSuper: false,
      };

      this.projectiles.push(proj);

      if (attacker.isPlayer && this.colyseusRoom) {
        this.colyseusRoom.send('projectile', {
          ...proj,
          timestamp: Date.now(),
        });
      }
    }
  }

  private executeSuper(attacker: BrawlerEntity, angle: number) {
    attacker.superCharge = 0;
    attacker.rotation = angle;
    attacker.recoilOffset = 18;

    const def = BRAWLERS[attacker.brawlerId];
    sound.playSuperCast();
    this.cameras.main.shake(180, 0.015);

    if (attacker.brawlerId === 'titan') {
      // Leap Super
      const leapDist = Math.min(def.superRange, 420);
      attacker.isLeaping = true;
      attacker.leapProgress = 0;
      attacker.leapStartX = attacker.x;
      attacker.leapStartY = attacker.y;
      attacker.leapTargetX = attacker.x + Math.cos(angle) * leapDist;
      attacker.leapTargetY = attacker.y + Math.sin(angle) * leapDist;
      return;
    }

    let damage = Math.round(def.superDamage * (1 + attacker.powerCubes * 0.1));
    if (attacker.doubleDamageTimer > 0) damage *= 2;

    const count = def.superType === 'daggers' ? 8 : 1;
    const spread = Math.PI / 4;
    const startAngle = count > 1 ? angle - spread / 2 : angle;
    const step = count > 1 ? spread / (count - 1) : 0;

    for (let i = 0; i < count; i++) {
      const curAngle = startAngle + step * i;
      const speed = def.bulletSpeed * 68;
      const proj: Projectile = {
        id: `super_${attacker.id}_${Date.now()}_${Math.random()}`,
        ownerId: attacker.id,
        brawlerId: attacker.brawlerId,
        isSuper: true,
        x: attacker.x + Math.cos(curAngle) * (attacker.radius + 12),
        y: attacker.y + Math.sin(curAngle) * (attacker.radius + 12),
        vx: Math.cos(curAngle) * speed,
        vy: Math.sin(curAngle) * speed,
        distanceTraveled: 0,
        maxDistance: def.superRange,
        damage,
        radius: def.bulletRadius * 1.6,
        piercing: true,
        destroysWalls: true,
        color: '#fbbf24',
        bulletType: def.bulletType,
      };

      this.projectiles.push(proj);

      if (attacker.isPlayer && this.colyseusRoom) {
        this.colyseusRoom.send('projectile', {
          ...proj,
          timestamp: Date.now(),
        });
      }
    }
  }

  private triggerLeapImpact(brawler: BrawlerEntity) {
    sound.playExplosion();
    this.cameras.main.shake(250, 0.02);
    const radius = 160;
    const def = BRAWLERS[brawler.brawlerId];
    const damage = Math.round(def.superDamage * (1 + brawler.powerCubes * 0.1));

    for (const target of this.brawlers) {
      if (target.id === brawler.id || !target.isAlive) continue;
      const dist = Math.hypot(target.x - brawler.x, target.y - brawler.y);
      if (dist <= radius) {
        this.applyDamage(target, damage, brawler.id, true, '#ef4444');
      }
    }
  }

  private applyDamage(
    target: BrawlerEntity,
    damage: number,
    attackerId: string,
    isCrit: boolean = false,
    color: string = '#ef4444'
  ) {
    if (!target.isAlive) return;

    let finalDamage = damage;
    if (target.shieldTimer > 0) finalDamage = Math.round(damage * 0.35);

    target.hp = Math.max(0, target.hp - finalDamage);
    target.hitFlashTimer = 0.15;

    // Pop floating damage number
    this.damageNumbers.push({
      id: Math.random().toString(),
      x: target.x + (Math.random() - 0.5) * 30,
      y: target.y - target.radius - 10,
      text: String(finalDamage),
      color: isCrit ? '#facc15' : color,
      scale: isCrit ? 1.4 : 1.0,
      life: 1,
      isHeal: false,
    });

    if (target.isPlayer) {
      this.playerCombatTimer = 0;
      sound.playHit();
      this.cameras.main.shake(120, 0.008);
      this.callbacks?.onPlayerHpChange(
        target.hp,
        target.maxHp,
        target.ammo,
        target.superCharge,
        target.powerCubes
      );
    }

    // Check elimination
    if (target.hp <= 0) {
      target.isAlive = false;
      const killer = this.brawlers.find((b) => b.id === attackerId);
      if (killer) killer.kills++;

      // Drop power cubes
      const dropCount = Math.max(2, target.powerCubes);
      this.spawnPowerCubes(target.x, target.y, dropCount);
      sound.playElimination();

      const killEntry: KillFeedEntry = {
        id: Math.random().toString(),
        killerName: killer ? killer.name : 'Tempesta Tossica',
        victimName: target.name,
        brawlerId: target.brawlerId,
        time: Date.now(),
      };

      this.callbacks?.onKillFeed(killEntry);
      const aliveCount = this.brawlers.filter((b) => b.isAlive).length;
      this.callbacks?.onAliveChange(aliveCount);
    }
  }

  private spawnPowerCubes(x: number, y: number, count: number) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      const dist = 30 + Math.random() * 25;
      this.powerCubes.push({
        id: `cube_${Date.now()}_${Math.random()}`,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        vx: 0,
        vy: 0,
        collected: false,
      });
    }
  }

  private spawnRandomPowerUp() {
    if (this.powerUps.length >= 6) return;
    const types: PowerUpType[] = ['speed', 'shield', 'damage', 'heal', 'super'];
    const chosenType = types[Math.floor(Math.random() * types.length)];
    const spawns = this.mapData.powerUpSpawns;
    const pt = spawns[Math.floor(Math.random() * spawns.length)];

    this.powerUps.push({
      id: `pu_${Date.now()}_${Math.random()}`,
      x: pt.x + (Math.random() - 0.5) * 60,
      y: pt.y + (Math.random() - 0.5) * 60,
      type: chosenType,
      radius: 18,
      bobTimer: Math.random() * Math.PI,
      collected: false,
    });
  }

  private moveEntityWithCollision(entity: BrawlerEntity, dx: number, dy: number) {
    const newX = entity.x + dx;
    const newY = entity.y + dy;
    const r = entity.radius;

    // Boundary check
    const boundedX = Math.max(r + 40, Math.min(this.mapData.width - r - 40, newX));
    const boundedY = Math.max(r + 40, Math.min(this.mapData.height - r - 40, newY));

    // Obstacle collision
    let collidesX = false;
    let collidesY = false;

    for (const obs of this.obstacles) {
      if (
        boundedX + r > obs.x &&
        boundedX - r < obs.x + obs.width &&
        entity.y + r > obs.y &&
        entity.y - r < obs.y + obs.height
      ) {
        collidesX = true;
      }
      if (
        entity.x + r > obs.x &&
        entity.x - r < obs.x + obs.width &&
        boundedY + r > obs.y &&
        boundedY - r < obs.y + obs.height
      ) {
        collidesY = true;
      }
    }

    if (!collidesX) entity.x = boundedX;
    if (!collidesY) entity.y = boundedY;
  }

  private checkInBush(x: number, y: number): boolean {
    for (const b of this.mapData.bushes) {
      if (x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height) {
        return true;
      }
    }
    return false;
  }

  private findAutoAimAngle(attacker: BrawlerEntity, isSuper: boolean): number {
    const range = isSuper ? BRAWLERS[attacker.brawlerId].superRange : BRAWLERS[attacker.brawlerId].attackRange;
    let bestTarget: { x: number; y: number } | null = null;
    let bestDist = Infinity;

    for (const other of this.brawlers) {
      if (other.id === attacker.id || !other.isAlive) continue;
      const d = Math.hypot(other.x - attacker.x, other.y - attacker.y);
      if (d <= range && d < bestDist) {
        bestDist = d;
        bestTarget = other;
      }
    }

    if (!bestTarget) {
      for (const box of this.powerBoxes) {
        if (box.isDestroyed) continue;
        const bx = box.x + box.width / 2;
        const by = box.y + box.height / 2;
        const d = Math.hypot(bx - attacker.x, by - attacker.y);
        if (d <= range && d < bestDist) {
          bestDist = d;
          bestTarget = { x: bx, y: by };
        }
      }
    }

    if (bestTarget) {
      return Math.atan2(bestTarget.y - attacker.y, bestTarget.x - attacker.x);
    }
    return attacker.rotation;
  }

  private checkMatchStatus() {
    if (this.placementCalculated) return;

    const aliveCount = this.brawlers.filter((b) => b.isAlive).length;

    if (!this.player.isAlive) {
      this.placementCalculated = true;
      this.isGameOver = true;
      sound.playHit();
      this.callbacks?.onGameOver(aliveCount + 1, this.player.kills, this.player.powerCubes);
    } else if (aliveCount === 1 && this.player.isAlive) {
      this.placementCalculated = true;
      this.isGameOver = true;
      sound.playVictory();
      this.callbacks?.onGameOver(1, this.player.kills, this.player.powerCubes);
    }
  }

  // --- PHASER GRAPHICS RENDERING (REPLACES REACT/CANVAS 2D) ---
  private renderGround() {
    const g = this.groundGraphics;
    g.clear();
    const mapW = this.mapData.width;
    const mapH = this.mapData.height;

    // Arena Floor
    g.fillStyle(0x1a2333, 1);
    g.fillRect(0, 0, mapW, mapH);

    // Futuristic Cobblestone / Hex grid
    g.lineStyle(2, 0x111827, 0.7);
    const step = 80;
    for (let x = 0; x <= mapW; x += step) {
      g.moveTo(x, 0);
      g.lineTo(x, mapH);
    }
    for (let y = 0; y <= mapH; y += step) {
      g.moveTo(0, y);
      g.lineTo(mapW, y);
    }
    g.strokePath();

    // Central Arena Circle Decal
    const cx = mapW / 2;
    const cy = mapH / 2;
    g.fillStyle(0xeab308, 0.12);
    g.fillCircle(cx, cy, 260);
    g.lineStyle(5, 0xeab308, 0.4);
    g.strokeCircle(cx, cy, 260);
  }

  private renderPhaserLayers() {
    // 1. Bushes
    this.bushGraphics.clear();
    for (const b of this.mapData.bushes) {
      this.bushGraphics.fillStyle(0x15803d, 1);
      this.bushGraphics.fillRoundedRect(b.x, b.y, b.width, b.height, 16);
      this.bushGraphics.lineStyle(3.5, 0x052e16, 1);
      this.bushGraphics.strokeRoundedRect(b.x, b.y, b.width, b.height, 16);

      this.bushGraphics.fillStyle(0x22c55e, 0.85);
      const step = 24;
      for (let gx = b.x + 12; gx < b.x + b.width - 8; gx += step) {
        for (let gy = b.y + 12; gy < b.y + b.height - 8; gy += step) {
          this.bushGraphics.fillCircle(gx, gy, 7);
        }
      }
    }

    // 2. Obstacles (Stone, Wood, Water)
    this.obstacleGraphics.clear();
    for (const obs of this.obstacles) {
      if (obs.type === 'stone') {
        this.obstacleGraphics.fillStyle(0x0f172a, 1);
        this.obstacleGraphics.fillRoundedRect(obs.x + 3, obs.y + 7, obs.width, obs.height, 10);
        this.obstacleGraphics.fillStyle(0x475569, 1);
        this.obstacleGraphics.fillRoundedRect(obs.x, obs.y + 5, obs.width, obs.height - 5, 10);
        this.obstacleGraphics.fillStyle(0x64748b, 1);
        this.obstacleGraphics.fillRoundedRect(obs.x, obs.y - 6, obs.width, obs.height - 6, 10);
        this.obstacleGraphics.lineStyle(3.5, 0x000000, 1);
        this.obstacleGraphics.strokeRoundedRect(obs.x, obs.y, obs.width, obs.height, 10);
      } else if (obs.type === 'wood_box') {
        this.obstacleGraphics.fillStyle(0xd97706, 1);
        this.obstacleGraphics.fillRect(obs.x, obs.y, obs.width, obs.height);
        this.obstacleGraphics.lineStyle(3.5, 0x451a03, 1);
        this.obstacleGraphics.strokeRect(obs.x, obs.y, obs.width, obs.height);
        this.obstacleGraphics.lineBetween(obs.x, obs.y, obs.x + obs.width, obs.y + obs.height);
        this.obstacleGraphics.lineBetween(obs.x + obs.width, obs.y, obs.x, obs.y + obs.height);
      } else if (obs.type === 'water') {
        this.obstacleGraphics.fillStyle(0x0284c7, 1);
        this.obstacleGraphics.fillRoundedRect(obs.x, obs.y, obs.width, obs.height, 16);
        this.obstacleGraphics.lineStyle(3, 0x075985, 1);
        this.obstacleGraphics.strokeRoundedRect(obs.x, obs.y, obs.width, obs.height, 16);
      }
    }

    // 3. Power Boxes
    this.boxGraphics.clear();
    for (const box of this.powerBoxes) {
      if (box.isDestroyed) continue;
      // Shadow
      this.boxGraphics.fillStyle(0x000000, 0.45);
      this.boxGraphics.fillEllipse(box.x + box.width / 2, box.y + box.height + 4, 24, 9);
      // Body
      this.boxGraphics.fillStyle(0x1d4ed8, 1);
      this.boxGraphics.fillRect(box.x, box.y + 6, box.width, box.height - 6);
      this.boxGraphics.fillStyle(0x3b82f6, 1);
      this.boxGraphics.fillRect(box.x, box.y, box.width, box.height - 6);
      // Emblem
      this.boxGraphics.fillStyle(0xfbbf24, 1);
      this.boxGraphics.fillCircle(box.x + box.width / 2, box.y + box.height / 2 - 2, 9);
      this.boxGraphics.lineStyle(3.5, 0x000000, 1);
      this.boxGraphics.strokeRect(box.x, box.y, box.width, box.height);

      // HP Bar above box
      const hpPct = Math.max(0, box.hp / box.maxHp);
      const barW = box.width + 12;
      const barH = 6;
      const barX = box.x - 6;
      const barY = box.y - 14;
      this.boxGraphics.fillStyle(0x000000, 1);
      this.boxGraphics.fillRoundedRect(barX - 1, barY - 1, barW + 2, barH + 2, 4);
      this.boxGraphics.fillStyle(0xef4444, 1);
      this.boxGraphics.fillRoundedRect(barX, barY, barW * hpPct, barH, 3);
    }

    // 4. Power Cubes & Tactical Items
    this.itemGraphics.clear();
    for (const cube of this.powerCubes) {
      this.itemGraphics.fillStyle(0x059669, 1);
      this.itemGraphics.fillRect(cube.x - 11, cube.y - 7, 22, 18);
      this.itemGraphics.fillStyle(0x34d399, 1);
      this.itemGraphics.fillRect(cube.x - 11, cube.y - 11, 22, 18);
      this.itemGraphics.fillStyle(0xffffff, 1);
      this.itemGraphics.fillRect(cube.x - 4, cube.y - 7, 8, 8);
      this.itemGraphics.lineStyle(3, 0x000000, 1);
      this.itemGraphics.strokeRect(cube.x - 11, cube.y - 11, 22, 22);
    }

    for (const pu of this.powerUps) {
      const bob = Math.sin(pu.bobTimer) * 6;
      let col = 0x38bdf8;
      if (pu.type === 'shield') col = 0xa855f7;
      else if (pu.type === 'damage') col = 0xef4444;
      else if (pu.type === 'heal') col = 0x22c55e;
      else if (pu.type === 'super') col = 0xeab308;

      this.itemGraphics.fillStyle(0x000000, 0.35);
      this.itemGraphics.fillEllipse(pu.x, pu.y + 18, 18, 6);
      this.itemGraphics.fillStyle(col, 1);
      this.itemGraphics.fillCircle(pu.x, pu.y + bob, pu.radius);
      this.itemGraphics.lineStyle(3, 0xffffff, 1);
      this.itemGraphics.strokeCircle(pu.x, pu.y + bob, pu.radius);
    }

    // 5. Projectiles
    this.projectileGraphics.clear();
    for (const p of this.projectiles) {
      const colorNum = parseInt(p.color.replace('#', ''), 16) || 0xf97316;
      this.projectileGraphics.fillStyle(colorNum, 1);
      this.projectileGraphics.fillCircle(p.x, p.y, p.radius);
      this.projectileGraphics.lineStyle(2, 0xffffff, 0.85);
      this.projectileGraphics.strokeCircle(p.x, p.y, p.radius);
    }

    // 6. Brawlers
    this.brawlerGraphics.clear();
    this.uiGraphics.clear();

    for (const brawler of this.brawlers) {
      if (!brawler.isAlive) continue;

      const playerDist = Math.hypot(brawler.x - this.player.x, brawler.y - this.player.y);
      const isHidden = !brawler.isPlayer && brawler.isInBush && (!this.player.isInBush || playerDist > 85);
      if (isHidden) continue;

      const alpha = brawler.isInBush ? 0.65 : 1.0;
      const recoilX = -Math.cos(brawler.rotation) * brawler.recoilOffset;
      const recoilY = -Math.sin(brawler.rotation) * brawler.recoilOffset;
      const drawX = brawler.x + recoilX;
      const drawY = brawler.y + recoilY;

      // Drop shadow
      this.brawlerGraphics.fillStyle(0x000000, 0.45 * alpha);
      this.brawlerGraphics.fillEllipse(brawler.x, brawler.y + 6, brawler.radius * 1.2, brawler.radius * 0.6);

      // Power-Up Auras
      if (brawler.shieldTimer > 0) {
        this.brawlerGraphics.lineStyle(4, 0xc084fc, alpha);
        this.brawlerGraphics.strokeCircle(drawX, drawY, brawler.radius + 12);
      }
      if (brawler.doubleDamageTimer > 0) {
        this.brawlerGraphics.lineStyle(3, 0xef4444, alpha);
        this.brawlerGraphics.strokeCircle(drawX, drawY, brawler.radius + 10);
      }

      // Character body
      const def = BRAWLERS[brawler.brawlerId];
      const bodyColor = brawler.hitFlashTimer > 0 ? 0xffffff : parseInt(def.color.replace('#', ''), 16);

      this.brawlerGraphics.fillStyle(bodyColor, alpha);
      this.brawlerGraphics.fillCircle(drawX, drawY, brawler.radius);
      this.brawlerGraphics.lineStyle(brawler.isPlayer ? 4.5 : 3.5, 0x000000, alpha);
      this.brawlerGraphics.strokeCircle(drawX, drawY, brawler.radius);

      // Weapon Barrel pointing in direction
      const barrelLen = brawler.radius + 14;
      const bx = drawX + Math.cos(brawler.rotation) * barrelLen;
      const by = drawY + Math.sin(brawler.rotation) * barrelLen;
      this.brawlerGraphics.lineStyle(6, 0x334155, alpha);
      this.brawlerGraphics.lineBetween(drawX, drawY, bx, by);

      // Overhead Health & Ammo Bar
      this.renderOverheadBars(brawler, drawX, drawY - brawler.radius - 14);
    }

    // 7. Aim Trajectory
    this.aimGraphics.clear();
    if (this.player.isAlive && (this.aimVector.isAiming || this.aimVector.isSuperAiming)) {
      const def = BRAWLERS[this.player.brawlerId];
      const range = this.aimVector.isSuperAiming ? def.superRange : def.attackRange;
      const angle = Math.atan2(this.aimVector.y, this.aimVector.x);
      const endX = this.player.x + Math.cos(angle) * range;
      const endY = this.player.y + Math.sin(angle) * range;

      this.aimGraphics.lineStyle(3, this.aimVector.isSuperAiming ? 0xfacc15 : 0x38bdf8, 0.85);
      this.aimGraphics.lineBetween(this.player.x, this.player.y, endX, endY);
      this.aimGraphics.strokeCircle(endX, endY, 14);
    }

    // 8. Poison Storm Zone
    this.poisonGraphics.clear();
    const cx = this.poisonZone.centerX;
    const cy = this.poisonZone.centerY;
    const pr = this.poisonZone.currentRadius;

    // Poison boundary ring
    this.poisonGraphics.lineStyle(10, 0xa855f7, 0.85);
    this.poisonGraphics.strokeCircle(cx, cy, pr);

    // Hazard outer ring
    this.poisonGraphics.lineStyle(4, 0xef4444, 0.6);
    this.poisonGraphics.strokeCircle(cx, cy, pr + 12);
  }

  private renderOverheadBars(brawler: BrawlerEntity, x: number, y: number) {
    const isPlayer = brawler.isPlayer;
    const barW = isPlayer ? 78 : 62;
    const barH = isPlayer ? 10 : 8;
    const barX = x - barW / 2;
    const barY = y;

    // Health Bar
    const hpPct = Math.max(0, Math.min(1, brawler.hp / brawler.maxHp));
    this.uiGraphics.fillStyle(0x0f172a, 1);
    this.uiGraphics.fillRoundedRect(barX - 2, barY - 2, barW + 4, barH + 4, 4);
    this.uiGraphics.lineStyle(2, 0x000000, 1);
    this.uiGraphics.strokeRoundedRect(barX - 2, barY - 2, barW + 4, barH + 4, 4);

    let hpColor = 0x22c55e;
    if (hpPct < 0.28) hpColor = 0xef4444;
    else if (hpPct < 0.58) hpColor = 0xeab308;

    this.uiGraphics.fillStyle(hpColor, 1);
    this.uiGraphics.fillRoundedRect(barX, barY, Math.max(2, barW * hpPct), barH, 3);

    // 3 Ammo pips directly under health bar
    const ammoMax = brawler.maxAmmo;
    const pipGap = 2;
    const pipW = (barW - (ammoMax - 1) * pipGap) / ammoMax;
    const pipH = 4;
    const pipY = barY + barH + 3;

    for (let i = 0; i < ammoMax; i++) {
      const px = barX + i * (pipW + pipGap);
      const isCharged = brawler.ammo >= i + 1;
      const partial = Math.max(0, Math.min(1, brawler.ammo - i));

      this.uiGraphics.fillStyle(0x0f172a, 1);
      this.uiGraphics.fillRect(px, pipY, pipW, pipH);

      if (isCharged) {
        this.uiGraphics.fillStyle(0xf97316, 1);
        this.uiGraphics.fillRect(px, pipY, pipW, pipH);
      } else if (partial > 0) {
        this.uiGraphics.fillStyle(0xeab308, 1);
        this.uiGraphics.fillRect(px, pipY, pipW * partial, pipH);
      }
    }
  }
}
