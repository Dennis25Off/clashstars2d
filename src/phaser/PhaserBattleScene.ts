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
  onPlayerHpChange: (hp: number, maxHp: number, ammo: number, superCharge: number, cubes: number, gadgetCharges?: number) => void;
  onPoisonPhaseChange: (phase: number, timeToNext: number) => void;
  onPingChange?: (pingMs: number) => void;
  onFovChange?: (zoom: number, mode: string) => void;
}

interface ActiveBurst {
  attackerId: string;
  brawlerId: BrawlerId;
  angle: number;
  bulletsTotal: number;
  bulletsLeft: number;
  interval: number;
  timer: number;
  isSuper: boolean;
  damage: number;
  color: string;
  bulletType: 'bullet' | 'shotgun' | 'punch' | 'poison' | 'sonic';
  bulletSpeed: number;
  bulletRadius: number;
  range: number;
  piercing: boolean;
  destroysWalls: boolean;
  handOffsetIndex: number;
}

export class PhaserBattleScene extends Phaser.Scene {
 // Flag pubblica per bloccare il gameplay durante l'anteprima
  public isCountdownActive: boolean = true;

  constructor() {
    super('PhaserBattleScene');
  }

  create() {
    // Forza il blocco iniziale all'avvio della scena
    this.isCountdownActive = true;

    // Ascolta l'evento globale lanciato da React quando finisce il countdown
    this.game.events.on('REACT_COUNTDOWN_COMPLETE', () => {
      this.startMatch();
    });

    // ... Incolla qui il resto del tuo codice originale di create() ...
  }

  update(time: number, delta: number) {
    // SE IL COUNTDOWN È ATTIVO, BLOCCA TUTTI GLI INPUT E IL NETWORKING DI SPOSTAMENTO
    if (this.isCountdownActive) {
      return;
    }

    // ... Incolla qui il resto del tuo codice originale di update() ...
  }

  public startMatch() {
    this.isCountdownActive = false;
    
    // Riproduci il feedback sonoro e visivo di inizio round
    sound.play('match_start'); 
    this.cameras.main.flash(400, 255, 255, 255);
    
    // Pulisce l'evento per evitare duplicati nei match successivi
    this.game.events.off('REACT_COUNTDOWN_COMPLETE');
  }
}
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
  public mouseWorldPos = { x: 1200, y: 1200 };
  public isMouseActive = false;
  public isLeftMouseDown = false;
  public isRightMouseDown = false;
  private mouseFireCooldown = 0;

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
  private activeBursts: ActiveBurst[] = [];

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

    // 6. Setup Pointer/Mouse input (Desktop & Mouse Support)
    // Suppress context menu on canvas so right-click is dedicated to Super
    if (this.game.canvas) {
      this.game.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (pointer.wasTouch || (pointer.event as any)?.pointerType === 'touch') return;
      this.isMouseActive = true;
      const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      this.mouseWorldPos.x = worldPoint.x;
      this.mouseWorldPos.y = worldPoint.y;
      this.mousePos.x = worldPoint.x;
      this.mousePos.y = worldPoint.y;

      const dx = worldPoint.x - this.player.x;
      const dy = worldPoint.y - this.player.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 5) {
        this.aimVector.x = dx / dist;
        this.aimVector.y = dy / dist;
      }

      // If not aiming via touch stick, rotate player smoothly towards mouse cursor
      if (!this.aimVector.isAiming && !this.aimVector.isSuperAiming && dist > 10) {
        this.player.rotation = Math.atan2(dy, dx);
      }
    });

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.wasTouch || (pointer.event as any)?.pointerType === 'touch') return;
      this.isMouseActive = true;
      const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      this.mouseWorldPos.x = worldPoint.x;
      this.mouseWorldPos.y = worldPoint.y;

      const dx = worldPoint.x - this.player.x;
      const dy = worldPoint.y - this.player.y;
      const angle = Math.atan2(dy, dx);
      this.player.rotation = angle;

      if (pointer.button === 0) {
        // Left Click: Shoot immediately towards cursor
        this.isLeftMouseDown = true;
        this.firePlayerNormalAttack(angle);
        const def = BRAWLERS[this.player.brawlerId];
        this.mouseFireCooldown = def.id === 'titan' ? 0.35 : def.id === 'blaze' ? 0.42 : 0.28;
      } else if (pointer.button === 2) {
        // Right Click: Fire Super immediately towards cursor
        this.isRightMouseDown = true;
        if (this.player.superCharge >= 100) {
          this.firePlayerSuper(angle);
        }
      }
    });

    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (pointer.wasTouch || (pointer.event as any)?.pointerType === 'touch') return;
      if (pointer.button === 0) {
        this.isLeftMouseDown = false;
      } else if (pointer.button === 2) {
        this.isRightMouseDown = false;
      }
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
    this.callbacks?.onAliveChange?.(10);
    this.callbacks?.onPlayerHpChange?.(
      this.player.hp,
      this.player.maxHp,
      this.player.ammo,
      this.player.superCharge,
      this.player.powerCubes,
      this.player.gadgetCharges
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
      this.callbacks?.onKillFeed?.(k);
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

    // 3. Update Active Burst Attacks (Cadenced bursts for Blaze & Titan)
    this.updateBursts(dt);

    // 4. Update Bot AI & Entities
    this.updateEntities(dt);

    // 5. Update Poison Zone
    this.updatePoisonZone(dt);

    // 6. Update Projectiles & Collisions
    this.updateProjectiles(dt);

    // 7. Update Tactical Items & Power Cubes
    this.updateItems(dt);

    // 8. Update Damage Numbers
    this.updateDamageNumbers(dt);

    // 9. Sync with Colyseus Room
    this.syncColyseusRoom();

    // 10. Render All Game Objects with Phaser
    this.renderPhaserLayers();

    // 11. Check Victory / Game Over
    this.checkMatchStatus();
  }

  private updatePlayerInput(dt: number) {
    if (!this.player.isAlive || this.player.isLeaping) return;

    // Track real-time mouse position in world space as player & camera move
    if (this.isMouseActive && this.input.activePointer && !this.input.activePointer.wasTouch) {
      const wp = this.cameras.main.getWorldPoint(this.input.activePointer.x, this.input.activePointer.y);
      this.mouseWorldPos.x = wp.x;
      this.mouseWorldPos.y = wp.y;
    }

    // Cooldown countdown for mouse auto-repeat fire
    if (this.mouseFireCooldown > 0) {
      this.mouseFireCooldown = Math.max(0, this.mouseFireCooldown - dt);
    }

    // Auto-fire while holding down Left Click on PC
    if (this.isLeftMouseDown && this.isMouseActive && this.player.isAlive && !this.player.isLeaping) {
      const activePlayerBursts = this.activeBursts.filter((b) => b.attackerId === this.player.id).length;
      if (this.player.ammo >= 1 && this.mouseFireCooldown <= 0 && activePlayerBursts === 0) {
        const dx = this.mouseWorldPos.x - this.player.x;
        const dy = this.mouseWorldPos.y - this.player.y;
        const angle = Math.atan2(dy, dx);
        this.firePlayerNormalAttack(angle);
        const def = BRAWLERS[this.player.brawlerId];
        this.mouseFireCooldown = def.id === 'titan' ? 0.42 : def.id === 'blaze' ? 0.45 : 0.32;
      }
    }

    let moveX = this.moveVector.x;
    let moveY = this.moveVector.y;

    // Check keyboard WASD / Arrows
    if (this.keys.up?.isDown || this.keys.upArrow?.isDown) moveY -= 1;
    if (this.keys.down?.isDown || this.keys.downArrow?.isDown) moveY += 1;
    if (this.keys.left?.isDown || this.keys.leftArrow?.isDown) moveX -= 1;
    if (this.keys.right?.isDown || this.keys.rightArrow?.isDown) moveX += 1;

    // Hotkeys
    if (Phaser.Input.Keyboard.JustDown(this.keys.space)) {
      const angle = this.isMouseActive
        ? Math.atan2(this.mouseWorldPos.y - this.player.y, this.mouseWorldPos.x - this.player.x)
        : undefined;
      this.firePlayerSuper(angle);
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.e) || Phaser.Input.Keyboard.JustDown(this.keys.f)) {
      this.usePlayerGadget();
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.q)) {
      const angle = this.isMouseActive
        ? Math.atan2(this.mouseWorldPos.y - this.player.y, this.mouseWorldPos.x - this.player.x)
        : undefined;
      this.firePlayerNormalAttack(angle);
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

      // Only face movement direction if neither mouse nor touch aim stick are active
      if (!this.isMouseActive && !this.aimVector.isAiming && !this.aimVector.isSuperAiming) {
        this.player.rotation = Math.atan2(normY, normX);
      }
    } else {
      this.player.isMoving = false;
      this.player.walkCycle = 0;
    }

    // Direction priority: touch aim joystick > mouse aim cursor
    if (this.aimVector.isAiming || this.aimVector.isSuperAiming) {
      this.player.rotation = Math.atan2(this.aimVector.y, this.aimVector.x);
    } else if (this.isMouseActive) {
      const dx = this.mouseWorldPos.x - this.player.x;
      const dy = this.mouseWorldPos.y - this.player.y;
      if (Math.hypot(dx, dy) > 8) {
        this.player.rotation = Math.atan2(dy, dx);
      }
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

  // --- BURST FIRING SYSTEM (RAT-TAT-TAT FOR BLAZE, 1-2 PUNCH COMBO FOR TITAN) ---
  private updateBursts(dt: number) {
    for (let i = this.activeBursts.length - 1; i >= 0; i--) {
      const burst = this.activeBursts[i];
      burst.timer -= dt;

      if (burst.timer <= 0) {
        const attacker = this.brawlers.find((b) => b.id === burst.attackerId);
        if (!attacker || !attacker.isAlive) {
          this.activeBursts.splice(i, 1);
          continue;
        }

        // Alternating gun barrel / left-right fists
        const handOffset = (burst.handOffsetIndex % 2 === 0 ? 1 : -1) * 7;
        burst.handOffsetIndex++;

        // Bullets follow strictly the direction angle of the initial shot (parallel strafe spread)
        const currentAngle = burst.angle;

        const perpX = -Math.sin(currentAngle) * handOffset;
        const perpY = Math.cos(currentAngle) * handOffset;
        const startX = attacker.x + Math.cos(currentAngle) * (attacker.radius + 8) + perpX;
        const startY = attacker.y + Math.sin(currentAngle) * (attacker.radius + 8) + perpY;
        const speed = burst.bulletSpeed * 60;

        const proj: Projectile = {
          id: `p_${burst.attackerId}_${Date.now()}_${Math.random()}`,
          ownerId: burst.attackerId,
          brawlerId: burst.brawlerId,
          isSuper: burst.isSuper,
          x: startX,
          y: startY,
          vx: Math.cos(currentAngle) * speed,
          vy: Math.sin(currentAngle) * speed,
          distanceTraveled: 0,
          maxDistance: burst.range,
          damage: burst.damage,
          radius: burst.bulletRadius,
          piercing: burst.piercing,
          destroysWalls: burst.destroysWalls,
          color: burst.color,
          bulletType: burst.bulletType,
        };

        this.projectiles.push(proj);
        sound.playShoot(burst.bulletType);
        attacker.recoilOffset = Math.min(14, attacker.recoilOffset + 4);

        if (attacker.isPlayer && this.colyseusRoom) {
          this.colyseusRoom.send('projectile', {
            ...proj,
            timestamp: Date.now(),
          });
        }

        burst.bulletsLeft--;
        burst.timer = burst.interval;

        if (burst.bulletsLeft <= 0) {
          this.activeBursts.splice(i, 1);
        }
      }
    }
  }

  private updateEntities(dt: number) {
    this.playerCombatTimer += dt;
    // Passive HP Regeneration when out of combat for 3.2s
    if (this.player.isAlive && this.playerCombatTimer >= 3.2 && this.player.hp < this.player.maxHp) {
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + this.player.maxHp * 0.14 * dt);
      this.callbacks?.onPlayerHpChange?.(
        this.player.hp,
        this.player.maxHp,
        this.player.ammo,
        this.player.superCharge,
        this.player.powerCubes,
        this.player.gadgetCharges
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

      // Crow's Poison Damage Over Time
      if (brawler.poisonTicksLeft > 0) {
        brawler.poisonDamageTimer = (brawler.poisonDamageTimer || 0) + dt;
        if (brawler.poisonDamageTimer >= 0.75) {
          brawler.poisonDamageTimer = 0;
          brawler.poisonTicksLeft--;
          this.applyDamage(brawler, brawler.poisonDamage || 160, brawler.poisonAttackerId || 'poison', false, '#10b981');
          sound.playHit();
        }
      }

      // Ammo reload
      const bDef = BRAWLERS[brawler.brawlerId];
      if (brawler.ammo < brawler.maxAmmo) {
        brawler.ammo = Math.min(brawler.maxAmmo, brawler.ammo + dt / bDef.reloadTime);
        if (brawler.isPlayer) {
          this.callbacks?.onPlayerHpChange?.(
            brawler.hp,
            brawler.maxHp,
            brawler.ammo,
            brawler.superCharge,
            brawler.powerCubes,
            brawler.gadgetCharges
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
      this.callbacks?.onPoisonPhaseChange?.(this.poisonZone.phase, Math.round(this.poisonZone.phaseTimer));
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

      // Check wall / obstacle collision
      let hitObstacle = false;
      for (let oi = this.obstacles.length - 1; oi >= 0; oi--) {
        const obs = this.obstacles[oi];
        if (obs.type === 'water') continue;
        if (
          p.x + p.radius >= obs.x &&
          p.x - p.radius <= obs.x + obs.width &&
          p.y + p.radius >= obs.y &&
          p.y - p.radius <= obs.y + obs.height
        ) {
          hitObstacle = true;

          // Wall-breaking Super (Colt Super, Shelly Super, Titan Super)
          if (p.destroysWalls && obs.destructible) {
            this.obstacles.splice(oi, 1);
            sound.playExplosion();
            this.cameras.main.shake(120, 0.012);
            this.damageNumbers.push({
              id: Math.random().toString(),
              x: obs.x + obs.width / 2,
              y: obs.y - 10,
              text: 'MURO FRANTUMATO!',
              color: '#f97316',
              scale: 1.2,
              life: 1.0,
              isHeal: false,
            });
          }
          // Normal bullet attack against destructible wooden crates / obstacles
          else if (obs.destructible) {
            obs.hp = (obs.hp || 400) - p.damage;
            sound.playHit();
            this.damageNumbers.push({
              id: Math.random().toString(),
              x: obs.x + obs.width / 2,
              y: obs.y - 8,
              text: String(p.damage),
              color: '#d97706',
              scale: 1.0,
              life: 0.8,
              isHeal: false,
            });

            if (obs.hp <= 0) {
              this.obstacles.splice(oi, 1);
              sound.playExplosion();
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
          p.x + p.radius >= box.x &&
          p.x - p.radius <= box.x + box.width &&
          p.y + p.radius >= box.y &&
          p.y - p.radius <= box.y + box.height
        ) {
          box.hp = Math.max(0, box.hp - p.damage);
          sound.playHit();
          hitBox = true;

          // Pop floating damage number directly on the power box
          this.damageNumbers.push({
            id: Math.random().toString(),
            x: box.x + box.width / 2 + (Math.random() - 0.5) * 20,
            y: box.y - 12,
            text: String(p.damage),
            color: '#fbbf24',
            scale: 1.1,
            life: 0.9,
            isHeal: false,
          });

          // Award small Super charge when shooting boxes
          const shooter = this.brawlers.find((b) => b.id === p.ownerId);
          if (shooter) {
            shooter.superCharge = Math.min(100, shooter.superCharge + 8);
            if (shooter.isPlayer) {
              this.callbacks?.onPlayerHpChange?.(
                shooter.hp,
                shooter.maxHp,
                shooter.ammo,
                shooter.superCharge,
                shooter.powerCubes
              );
            }
          }

          if (box.hp <= 0) {
            box.isDestroyed = true;
            this.spawnPowerCubes(box.x + box.width / 2, box.y + box.height / 2, box.cubesToDrop);
            sound.playExplosion();
            this.cameras.main.shake(160, 0.012);
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

          // Crow Poison application
          if (p.bulletType === 'poison') {
            brawler.poisonTicksLeft = 4;
            brawler.poisonDamage = Math.max(90, Math.round(p.damage * 0.35));
            brawler.poisonAttackerId = p.ownerId;
          }

          // Viper Knockback on Super
          if (p.isSuper && p.brawlerId === 'viper') {
            const knockAngle = Math.atan2(p.vy, p.vx);
            this.moveEntityWithCollision(brawler, Math.cos(knockAngle) * 55, Math.sin(knockAngle) * 55);
          }

          // Charge shooter super
          const shooter = this.brawlers.find((b) => b.id === p.ownerId);
          if (shooter) {
            shooter.superCharge = Math.min(100, shooter.superCharge + 28);
            if (shooter.isPlayer) {
              this.callbacks?.onPlayerHpChange?.(
                shooter.hp,
                shooter.maxHp,
                shooter.ammo,
                shooter.superCharge,
                shooter.powerCubes,
                shooter.gadgetCharges
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
            this.callbacks?.onPlayerHpChange?.(
              brawler.hp,
              brawler.maxHp,
              brawler.ammo,
              brawler.superCharge,
              brawler.powerCubes,
              brawler.gadgetCharges
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
            this.callbacks?.onPlayerHpChange?.(
              brawler.hp,
              brawler.maxHp,
              brawler.ammo,
              brawler.superCharge,
              brawler.powerCubes,
              brawler.gadgetCharges
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

  private updateDamageNumbers(dt: number) {
    for (let i = this.damageNumbers.length - 1; i >= 0; i--) {
      const dn = this.damageNumbers[i];
      dn.life -= dt * 1.4;
      dn.y -= 45 * dt;
      if (dn.life <= 0) {
        this.damageNumbers.splice(i, 1);
      }
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

  // --- ATTACKS & ACTIONS (UNIQUELY CUSTOMIZED FOR EACH BRAWLER) ---
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
    if (!this.player.isAlive || this.player.isLeaping) return;
    if (this.player.gadgetCharges <= 0) return;

    this.player.gadgetCharges--;
    const bId = this.player.brawlerId;

    // 1. BLAZE (Colt) -> Ricarica Rapida: Instant +2 ammo reloads
    if (bId === 'blaze') {
      this.player.ammo = Math.min(this.player.maxAmmo, this.player.ammo + 2);
      sound.playUnlockJingle();
      this.damageNumbers.push({
        id: Math.random().toString(),
        x: this.player.x,
        y: this.player.y - this.player.radius - 20,
        text: '+2 MUNIZIONI!',
        color: '#fbbf24',
        scale: 1.3,
        life: 1.2,
        isHeal: true,
      });
    }
    // 2. VIPER (Shelly) -> Scatto Tattico: Instant tactical forward dash
    else if (bId === 'viper') {
      const dashAngle = this.player.rotation;
      const dashDist = 200;
      this.moveEntityWithCollision(
        this.player,
        Math.cos(dashAngle) * dashDist,
        Math.sin(dashAngle) * dashDist
      );
      this.player.speedBoostTimer = 3;
      sound.playPowerUp();
      this.damageNumbers.push({
        id: Math.random().toString(),
        x: this.player.x,
        y: this.player.y - this.player.radius - 20,
        text: 'SCATTO TATTICO!',
        color: '#a855f7',
        scale: 1.3,
        life: 1.2,
        isHeal: false,
      });
    }
    // 3. TITAN (El Primo) -> Onda Sismica: Ground stomp shockwave slow & box crack
    else if (bId === 'titan') {
      sound.playExplosion();
      this.cameras.main.shake(220, 0.015);
      const radius = 220;

      for (const target of this.brawlers) {
        if (target.id === this.player.id || !target.isAlive) continue;
        const d = Math.hypot(target.x - this.player.x, target.y - this.player.y);
        if (d <= radius) {
          this.applyDamage(target, 600, this.player.id, false, '#3b82f6');
          target.speedBoostTimer = -2.5; // slow
        }
      }

      // Crack nearby boxes in range
      for (const box of this.powerBoxes) {
        if (box.isDestroyed) continue;
        const d = Math.hypot(box.x + box.width / 2 - this.player.x, box.y + box.height / 2 - this.player.y);
        if (d <= radius) {
          box.hp = Math.max(0, box.hp - 800);
          if (box.hp <= 0) {
            box.isDestroyed = true;
            this.spawnPowerCubes(box.x + box.width / 2, box.y + box.height / 2, box.cubesToDrop);
            sound.playExplosion();
          }
        }
      }

      // Shatter nearby crates/destructible walls
      for (let i = this.obstacles.length - 1; i >= 0; i--) {
        const obs = this.obstacles[i];
        if (obs.destructible) {
          const d = Math.hypot(obs.x + obs.width / 2 - this.player.x, obs.y + obs.height / 2 - this.player.y);
          if (d <= radius) {
            this.obstacles.splice(i, 1);
          }
        }
      }

      this.damageNumbers.push({
        id: Math.random().toString(),
        x: this.player.x,
        y: this.player.y - this.player.radius - 20,
        text: 'ONDA SISMICA!',
        color: '#3b82f6',
        scale: 1.3,
        life: 1.2,
        isHeal: false,
      });
    }
    // 4. RAVEN (Crow) -> Scudo d'Ombra: 50% damage reduction for 4s
    else if (bId === 'raven') {
      this.player.shieldTimer = 4.0;
      this.player.shieldRatio = 0.50;
      sound.playPowerUp();
      this.damageNumbers.push({
        id: Math.random().toString(),
        x: this.player.x,
        y: this.player.y - this.player.radius - 20,
        text: 'SCUDO D\'OMBRA!',
        color: '#eab308',
        scale: 1.3,
        life: 1.2,
        isHeal: true,
      });
    }
    // 5. HARMONY (Poco) -> Risonanza Protettiva: Cleanse + 1200 HP
    else if (bId === 'harmony') {
      this.player.poisonTicksLeft = 0;
      this.player.poisonDamage = 0;
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 1200);
      sound.playUnlockJingle();
      this.damageNumbers.push({
        id: Math.random().toString(),
        x: this.player.x,
        y: this.player.y - this.player.radius - 20,
        text: '+1200 HP CURA!',
        color: '#10b981',
        scale: 1.4,
        life: 1.2,
        isHeal: true,
      });
    }

    this.callbacks?.onPlayerHpChange?.(
      this.player.hp,
      this.player.maxHp,
      this.player.ammo,
      this.player.superCharge,
      this.player.powerCubes
    );
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
    attacker.recoilOffset = 14;

    const def = BRAWLERS[attacker.brawlerId];
    let damage = Math.round(def.attackDamage * (1 + attacker.powerCubes * 0.1));
    if (attacker.doubleDamageTimer > 0) damage *= 2;

    sound.playShoot(def.bulletType);

    // 1. BLAZE (Colt) -> 6 RAPID-FIRE TRACER BULLETS IN SEQUENCE
    if (attacker.brawlerId === 'blaze') {
      this.activeBursts.push({
        attackerId: attacker.id,
        brawlerId: attacker.brawlerId,
        angle,
        bulletsTotal: 6,
        bulletsLeft: 6,
        interval: 0.065, // rapid rat-tat-tat cadence
        timer: 0, // first bullet fires immediately
        isSuper: false,
        damage,
        color: '#ef4444',
        bulletType: 'bullet',
        bulletSpeed: 19,
        bulletRadius: 5,
        range: 560,
        piercing: false,
        destroysWalls: false,
        handOffsetIndex: 0,
      });
      return;
    }

    // 2. TITAN (El Primo) -> 4 RAPID 1-2 PUNCH COMBO SHOCKWAVES
    if (attacker.brawlerId === 'titan') {
      this.activeBursts.push({
        attackerId: attacker.id,
        brawlerId: attacker.brawlerId,
        angle,
        bulletsTotal: 4,
        bulletsLeft: 4,
        interval: 0.085, // 1-2 punch rhythm
        timer: 0,
        isSuper: false,
        damage,
        color: '#3b82f6',
        bulletType: 'punch',
        bulletSpeed: 15,
        bulletRadius: 10,
        range: 130, // short melee range
        piercing: false,
        destroysWalls: false,
        handOffsetIndex: 0,
      });
      return;
    }

    // 3. VIPER (Shelly) -> INSTANT SHOTGUN BUCKSHOT SPRAY (10 PELLETS)
    if (attacker.brawlerId === 'viper') {
      const count = 10;
      const spread = 0.42;
      const startAngle = angle - spread / 2;
      const step = spread / (count - 1);

      for (let i = 0; i < count; i++) {
        // slight natural angle & speed variance
        const curAngle = startAngle + step * i + (Math.random() - 0.5) * 0.05;
        const speedVar = 1 + (Math.random() - 0.5) * 0.15;
        const speed = def.bulletSpeed * 60 * speedVar;

        const proj: Projectile = {
          id: `p_${attacker.id}_${Date.now()}_${i}`,
          ownerId: attacker.id,
          brawlerId: attacker.brawlerId,
          x: attacker.x + Math.cos(curAngle) * (attacker.radius + 8),
          y: attacker.y + Math.sin(curAngle) * (attacker.radius + 8),
          vx: Math.cos(curAngle) * speed,
          vy: Math.sin(curAngle) * speed,
          distanceTraveled: 0,
          maxDistance: 350 + (Math.random() - 0.5) * 40,
          damage,
          radius: 6,
          piercing: false,
          destroysWalls: false,
          color: '#a855f7',
          bulletType: 'shotgun',
          isSuper: false,
        };

        this.projectiles.push(proj);

        if (attacker.isPlayer && this.colyseusRoom) {
          this.colyseusRoom.send('projectile', { ...proj, timestamp: Date.now() });
        }
      }
      return;
    }

    // 4. RAVEN (Crow) -> 3 SHARP POISON KUNAI DAGGER FAN
    if (attacker.brawlerId === 'raven') {
      const angles = [angle - 0.16, angle, angle + 0.16];
      for (let i = 0; i < angles.length; i++) {
        const curAngle = angles[i];
        const speed = def.bulletSpeed * 60;
        const proj: Projectile = {
          id: `p_${attacker.id}_${Date.now()}_${i}`,
          ownerId: attacker.id,
          brawlerId: attacker.brawlerId,
          x: attacker.x + Math.cos(curAngle) * (attacker.radius + 8),
          y: attacker.y + Math.sin(curAngle) * (attacker.radius + 8),
          vx: Math.cos(curAngle) * speed,
          vy: Math.sin(curAngle) * speed,
          distanceTraveled: 0,
          maxDistance: 500,
          damage,
          radius: 5,
          piercing: false,
          destroysWalls: false,
          color: '#eab308',
          bulletType: 'poison',
          isSuper: false,
        };

        this.projectiles.push(proj);

        if (attacker.isPlayer && this.colyseusRoom) {
          this.colyseusRoom.send('projectile', { ...proj, timestamp: Date.now() });
        }
      }
      return;
    }

    // 5. HARMONY (Poco) -> WIDE WALL-PENETRATING ACOUSTIC CRESCENT WAVE
    if (attacker.brawlerId === 'harmony') {
      const speed = def.bulletSpeed * 58;
      const proj: Projectile = {
        id: `p_${attacker.id}_${Date.now()}`,
        ownerId: attacker.id,
        brawlerId: attacker.brawlerId,
        x: attacker.x + Math.cos(angle) * (attacker.radius + 12),
        y: attacker.y + Math.sin(angle) * (attacker.radius + 12),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        distanceTraveled: 0,
        maxDistance: 460,
        damage,
        radius: 36, // wide wave
        piercing: true, // pierces everything!
        destroysWalls: false,
        color: '#10b981',
        bulletType: 'sonic',
        isSuper: false,
      };

      this.projectiles.push(proj);

      if (attacker.isPlayer && this.colyseusRoom) {
        this.colyseusRoom.send('projectile', { ...proj, timestamp: Date.now() });
      }
    }
  }

  private executeSuper(attacker: BrawlerEntity, angle: number) {
    attacker.superCharge = 0;
    attacker.rotation = angle;
    attacker.recoilOffset = 20;

    const def = BRAWLERS[attacker.brawlerId];
    sound.playSuperCast();
    this.cameras.main.shake(180, 0.015);

    let damage = Math.round(def.superDamage * (1 + attacker.powerCubes * 0.1));
    if (attacker.doubleDamageTimer > 0) damage *= 2;

    // 1. BLAZE (Colt) -> 12 HEAVY PIERCING LASER BOLTS IN A BLISTERING BARRAGE
    if (attacker.brawlerId === 'blaze') {
      this.activeBursts.push({
        attackerId: attacker.id,
        brawlerId: attacker.brawlerId,
        angle,
        bulletsTotal: 12,
        bulletsLeft: 12,
        interval: 0.045, // blistering speed
        timer: 0,
        isSuper: true,
        damage,
        color: '#fbbf24',
        bulletType: 'bullet',
        bulletSpeed: 23,
        bulletRadius: 8,
        range: 640,
        piercing: true,
        destroysWalls: true,
        handOffsetIndex: 0,
      });
      return;
    }

    // 2. TITAN (El Primo) -> METEOR LEAP & GROUND CRATER SLAM
    if (attacker.brawlerId === 'titan') {
      const leapDist = Math.min(def.superRange, 440);
      attacker.isLeaping = true;
      attacker.leapProgress = 0;
      attacker.leapStartX = attacker.x;
      attacker.leapStartY = attacker.y;
      attacker.leapTargetX = attacker.x + Math.cos(angle) * leapDist;
      attacker.leapTargetY = attacker.y + Math.sin(angle) * leapDist;
      return;
    }

    // 3. VIPER (Shelly) -> SUPER CALIBRO: 14 WALL-SHREDDING KNOCKBACK PELLETS
    if (attacker.brawlerId === 'viper') {
      const count = 14;
      const spread = 0.55;
      const startAngle = angle - spread / 2;
      const step = spread / (count - 1);

      for (let i = 0; i < count; i++) {
        const curAngle = startAngle + step * i;
        const speed = def.bulletSpeed * 68;
        const proj: Projectile = {
          id: `super_viper_${attacker.id}_${Date.now()}_${i}`,
          ownerId: attacker.id,
          brawlerId: attacker.brawlerId,
          isSuper: true,
          x: attacker.x + Math.cos(curAngle) * (attacker.radius + 12),
          y: attacker.y + Math.sin(curAngle) * (attacker.radius + 12),
          vx: Math.cos(curAngle) * speed,
          vy: Math.sin(curAngle) * speed,
          distanceTraveled: 0,
          maxDistance: 420,
          damage,
          radius: 10,
          piercing: true,
          destroysWalls: true,
          color: '#fbbf24',
          bulletType: 'shotgun',
        };

        this.projectiles.push(proj);

        if (attacker.isPlayer && this.colyseusRoom) {
          this.colyseusRoom.send('projectile', { ...proj, timestamp: Date.now() });
        }
      }
      return;
    }

    // 4. RAVEN (Crow) -> SALTO DEL CORVO: 360-DEGREE RADIAL DAGGER STORM
    if (attacker.brawlerId === 'raven') {
      for (let i = 0; i < 14; i++) {
        const radAngle = (Math.PI * 2 * i) / 14;
        const speed = def.bulletSpeed * 65;
        this.projectiles.push({
          id: `super_raven_${attacker.id}_${Date.now()}_${i}`,
          ownerId: attacker.id,
          brawlerId: attacker.brawlerId,
          isSuper: true,
          x: attacker.x + Math.cos(radAngle) * 20,
          y: attacker.y + Math.sin(radAngle) * 20,
          vx: Math.cos(radAngle) * speed,
          vy: Math.sin(radAngle) * speed,
          distanceTraveled: 0,
          maxDistance: 450,
          damage,
          radius: 7,
          piercing: false,
          destroysWalls: false,
          color: '#eab308',
          bulletType: 'poison',
        });
      }

      // Leap forward
      const leapDist = Math.min(def.superRange, 460);
      attacker.isLeaping = true;
      attacker.leapProgress = 0;
      attacker.leapStartX = attacker.x;
      attacker.leapStartY = attacker.y;
      attacker.leapTargetX = attacker.x + Math.cos(angle) * leapDist;
      attacker.leapTargetY = attacker.y + Math.sin(angle) * leapDist;
      return;
    }

    // 5. HARMONY (Poco) -> SERENATA CURATIVA (+2500 HP TEAM HEAL)
    if (attacker.brawlerId === 'harmony') {
      sound.playUnlockJingle();
      this.cameras.main.shake(150, 0.01);
      attacker.hp = Math.min(attacker.maxHp, attacker.hp + 2500);

      for (const b of this.brawlers) {
        if (!b.isAlive) continue;
        const d = Math.hypot(b.x - attacker.x, b.y - attacker.y);
        if (d < 450) {
          b.hp = Math.min(b.maxHp, b.hp + 2500);
          this.damageNumbers.push({
            id: Math.random().toString(),
            x: b.x,
            y: b.y - b.radius - 15,
            text: '+2500 HP',
            color: '#22c55e',
            scale: 1.4,
            life: 1,
            isHeal: true,
          });
        }
      }

      if (attacker.isPlayer) {
        this.callbacks?.onPlayerHpChange?.(
          attacker.hp,
          attacker.maxHp,
          attacker.ammo,
          attacker.superCharge,
          attacker.powerCubes,
          attacker.gadgetCharges
        );
      }
    }
  }

  private triggerLeapImpact(brawler: BrawlerEntity) {
    sound.playExplosion();
    this.cameras.main.shake(250, 0.02);

    if (brawler.brawlerId === 'raven') {
      // Raven second radial dagger storm upon landing!
      const def = BRAWLERS['raven'];
      let damage = Math.round(def.superDamage * (1 + brawler.powerCubes * 0.1));
      for (let i = 0; i < 14; i++) {
        const radAngle = (Math.PI * 2 * i) / 14;
        const speed = def.bulletSpeed * 65;
        this.projectiles.push({
          id: `super_raven_land_${brawler.id}_${Date.now()}_${i}`,
          ownerId: brawler.id,
          brawlerId: brawler.brawlerId,
          isSuper: true,
          x: brawler.x + Math.cos(radAngle) * 20,
          y: brawler.y + Math.sin(radAngle) * 20,
          vx: Math.cos(radAngle) * speed,
          vy: Math.sin(radAngle) * speed,
          distanceTraveled: 0,
          maxDistance: 450,
          damage,
          radius: 7,
          piercing: false,
          destroysWalls: false,
          color: '#eab308',
          bulletType: 'poison',
        });
      }
      return;
    }

    // Titan Ground Slam Crater
    const radius = 170;
    const def = BRAWLERS[brawler.brawlerId];
    const damage = Math.round(def.superDamage * (1 + brawler.powerCubes * 0.1));

    for (const target of this.brawlers) {
      if (target.id === brawler.id || !target.isAlive) continue;
      const dist = Math.hypot(target.x - brawler.x, target.y - brawler.y);
      if (dist <= radius) {
        this.applyDamage(target, damage, brawler.id, true, '#ef4444');
      }
    }

    // Destroy obstacles in crater
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const obs = this.obstacles[i];
      if (obs.destructible) {
        const ocx = obs.x + obs.width / 2;
        const ocy = obs.y + obs.height / 2;
        if (Math.hypot(ocx - brawler.x, ocy - brawler.y) <= radius + 30) {
          this.obstacles.splice(i, 1);
        }
      }
    }

    // Damage power boxes in crater
    for (const box of this.powerBoxes) {
      if (box.isDestroyed) continue;
      const ocx = box.x + box.width / 2;
      const ocy = box.y + box.height / 2;
      if (Math.hypot(ocx - brawler.x, ocy - brawler.y) <= radius + 30) {
        box.hp = Math.max(0, box.hp - damage);
        if (box.hp <= 0) {
          box.isDestroyed = true;
          this.spawnPowerCubes(box.x + box.width / 2, box.y + box.height / 2, box.cubesToDrop);
          sound.playExplosion();
          if (this.colyseusRoom) {
            this.colyseusRoom.send('box_destroyed', { boxId: box.id });
          }
        }
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
      this.callbacks?.onPlayerHpChange?.(
        target.hp,
        target.maxHp,
        target.ammo,
        target.superCharge,
        target.powerCubes,
        target.gadgetCharges
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

      this.callbacks?.onKillFeed?.(killEntry);
      const aliveCount = this.brawlers.filter((b) => b.isAlive).length;
      this.callbacks?.onAliveChange?.(aliveCount);
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

    // Power boxes also block entities while intact; once destroyed, entities can walk through
    for (const box of this.powerBoxes) {
      if (box.isDestroyed) continue;
      if (
        boundedX + r > box.x &&
        boundedX - r < box.x + box.width &&
        entity.y + r > box.y &&
        entity.y - r < box.y + box.height
      ) {
        collidesX = true;
      }
      if (
        entity.x + r > box.x &&
        entity.x - r < box.x + box.width &&
        boundedY + r > box.y &&
        boundedY - r < box.y + box.height
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
      this.callbacks?.onGameOver?.(aliveCount + 1, this.player.kills, this.player.powerCubes);
    } else if (aliveCount === 1 && this.player.isAlive) {
      this.placementCalculated = true;
      this.isGameOver = true;
      sound.playVictory();
      this.callbacks?.onGameOver?.(1, this.player.kills, this.player.powerCubes);
    }
  }

  // --- PHASER GRAPHICS RENDERING (WITH DISTINCT CUSTOM SHAPES & COMIC POP NUMBERS) ---
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

    // 5. DISTINCT CUSTOM PROJECTILES PER BRAWLER
    this.projectileGraphics.clear();
    for (const p of this.projectiles) {
      const ang = Math.atan2(p.vy, p.vx);
      const colorNum = parseInt(p.color.replace('#', ''), 16) || 0xf97316;

      if (p.bulletType === 'bullet') {
        // --- BLAZE / COLT: HIGH-VELOCITY TRACER LASER CAPSULE ---
        const len = p.isSuper ? 26 : 18;
        const w = p.isSuper ? 6 : 4;

        // Motion tracer tail
        this.projectileGraphics.lineStyle(w + 4, colorNum, 0.35);
        this.projectileGraphics.lineBetween(
          p.x - Math.cos(ang) * (len * 1.6),
          p.y - Math.sin(ang) * (len * 1.6),
          p.x,
          p.y
        );

        // Outer glow
        this.projectileGraphics.fillStyle(colorNum, 0.9);
        this.projectileGraphics.fillCircle(p.x, p.y, w + 2);

        // Core bright beam
        this.projectileGraphics.lineStyle(w, 0xffffff, 1);
        this.projectileGraphics.lineBetween(
          p.x - Math.cos(ang) * len,
          p.y - Math.sin(ang) * len,
          p.x,
          p.y
        );
        this.projectileGraphics.fillStyle(0xffffff, 1);
        this.projectileGraphics.fillCircle(p.x, p.y, w);

      } else if (p.bulletType === 'shotgun') {
        // --- VIPER / SHELLY: FOCUSED BUCKSHOT PELLETS ---
        const r = p.radius;
        // Burning pellet glow
        this.projectileGraphics.fillStyle(0xf97316, 0.45);
        this.projectileGraphics.fillCircle(p.x - Math.cos(ang) * 8, p.y - Math.sin(ang) * 8, r * 0.8);

        this.projectileGraphics.fillStyle(p.isSuper ? 0xfacc15 : 0xa855f7, 1);
        this.projectileGraphics.fillCircle(p.x, p.y, r);
        this.projectileGraphics.lineStyle(2, 0xffffff, 0.95);
        this.projectileGraphics.strokeCircle(p.x, p.y, r);

      } else if (p.bulletType === 'punch') {
        // --- TITAN / EL PRIMO: KINETIC BOXING GLOVE SHOCKWAVE ---
        const r = p.radius * 1.35;
        // Shockwave aura
        this.projectileGraphics.lineStyle(3, 0x38bdf8, 0.85);
        this.projectileGraphics.strokeCircle(p.x, p.y, r + 5);

        // Glove body
        this.projectileGraphics.fillStyle(0x0284c7, 0.95);
        this.projectileGraphics.fillCircle(p.x, p.y, r);

        // Clenched knuckle highlight
        const kx = p.x + Math.cos(ang) * (r * 0.45);
        const ky = p.y + Math.sin(ang) * (r * 0.45);
        this.projectileGraphics.fillStyle(0xffffff, 0.95);
        this.projectileGraphics.fillCircle(kx, ky, r * 0.5);

      } else if (p.bulletType === 'poison') {
        // --- RAVEN / CROW: AERODYNAMIC EMERALD POISON KUNAI DAGGER ---
        const tipX = p.x + Math.cos(ang) * 14;
        const tipY = p.y + Math.sin(ang) * 14;
        const backLeftX = p.x - Math.cos(ang) * 8 - Math.sin(ang) * 6;
        const backLeftY = p.y - Math.sin(ang) * 8 + Math.cos(ang) * 6;
        const backRightX = p.x - Math.cos(ang) * 8 + Math.sin(ang) * 6;
        const backRightY = p.y - Math.sin(ang) * 8 - Math.cos(ang) * 6;
        const handleX = p.x - Math.cos(ang) * 14;
        const handleY = p.y - Math.sin(ang) * 14;

        // Dagger blade
        this.projectileGraphics.fillStyle(0x10b981, 1);
        this.projectileGraphics.beginPath();
        this.projectileGraphics.moveTo(tipX, tipY);
        this.projectileGraphics.lineTo(backLeftX, backLeftY);
        this.projectileGraphics.lineTo(backRightX, backRightY);
        this.projectileGraphics.closePath();
        this.projectileGraphics.fillPath();

        // Dark toxic outline
        this.projectileGraphics.lineStyle(2, 0xa855f7, 1);
        this.projectileGraphics.strokePath();

        // Handle
        this.projectileGraphics.lineStyle(3, 0x1e293b, 1);
        this.projectileGraphics.lineBetween(p.x, p.y, handleX, handleY);

        // Venom drop
        this.projectileGraphics.fillStyle(0x22c55e, 0.7);
        this.projectileGraphics.fillCircle(handleX, handleY, 3);

      } else if (p.bulletType === 'sonic') {
        // --- HARMONY / POCO: PENETRATING SOUNDWAVE CRESCENT ---
        const arcR = Math.max(20, p.radius * 2.3);

        // Outer sound ripple
        this.projectileGraphics.lineStyle(7, 0x10b981, 0.85);
        this.projectileGraphics.beginPath();
        this.projectileGraphics.arc(p.x, p.y, arcR, ang - 0.75, ang + 0.75);
        this.projectileGraphics.strokePath();

        // Inner glowing resonance wave
        this.projectileGraphics.lineStyle(3, 0x6ee7b7, 0.95);
        this.projectileGraphics.beginPath();
        this.projectileGraphics.arc(p.x, p.y, arcR * 0.75, ang - 0.55, ang + 0.55);
        this.projectileGraphics.strokePath();

        // Acoustic resonance spark
        this.projectileGraphics.fillStyle(0xffffff, 1);
        this.projectileGraphics.fillCircle(p.x + Math.cos(ang) * arcR, p.y + Math.sin(ang) * arcR, 4);
      }
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
      if (brawler.poisonTicksLeft > 0) {
        // Toxic poison mist aura over brawler
        this.brawlerGraphics.lineStyle(3, 0x10b981, 0.85);
        this.brawlerGraphics.strokeCircle(drawX, drawY, brawler.radius + 8);
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

    // 7. Aim Trajectory & Weapon Reticle (PC Mouse & Touch Aim)
    this.aimGraphics.clear();
    const isSuperAiming = this.aimVector.isSuperAiming || (this.isRightMouseDown && this.player.superCharge >= 100);
    const isNormalAiming = this.aimVector.isAiming || this.isMouseActive;

    if (this.player.isAlive && (isNormalAiming || isSuperAiming)) {
      const def = BRAWLERS[this.player.brawlerId];
      const range = isSuperAiming ? def.superRange : def.attackRange;

      let angle = this.player.rotation;
      if (this.aimVector.isAiming || this.aimVector.isSuperAiming) {
        angle = Math.atan2(this.aimVector.y, this.aimVector.x);
      } else if (this.isMouseActive) {
        angle = Math.atan2(this.mouseWorldPos.y - this.player.y, this.mouseWorldPos.x - this.player.x);
      }

      const pX = this.player.x;
      const pY = this.player.y;
      const endX = pX + Math.cos(angle) * range;
      const endY = pY + Math.sin(angle) * range;

      const glowAlpha = isSuperAiming ? 0.9 : 0.75;

      if (isSuperAiming) {
        // SUPER AIMING OVERLAY
        if (this.player.brawlerId === 'titan') {
          // El Primo Super Leap Target Circle
          const cursorDist = Math.hypot(this.mouseWorldPos.x - pX, this.mouseWorldPos.y - pY);
          const leapDist = Math.min(range, cursorDist);
          const leapX = pX + Math.cos(angle) * leapDist;
          const leapY = pY + Math.sin(angle) * leapDist;

          // Leap path line
          this.aimGraphics.lineStyle(3, 0xfacc15, 0.6);
          this.aimGraphics.lineBetween(pX, pY, leapX, leapY);

          // Impact crater circle
          this.aimGraphics.fillStyle(0xfacc15, 0.2);
          this.aimGraphics.fillCircle(leapX, leapY, 110);
          this.aimGraphics.lineStyle(3.5, 0xfacc15, 0.9);
          this.aimGraphics.strokeCircle(leapX, leapY, 110);
        } else if (this.player.brawlerId === 'raven') {
          // Crow Super 360 Radial Storm
          this.aimGraphics.lineStyle(2, 0xfacc15, 0.4);
          this.aimGraphics.strokeCircle(pX, pY, 200);
          this.aimGraphics.lineStyle(3.5, 0xfacc15, 0.85);
          this.aimGraphics.lineBetween(pX, pY, endX, endY);
          this.aimGraphics.strokeCircle(endX, endY, 16);
        } else {
          // Super beam / blast line
          this.aimGraphics.lineStyle(6, 0xfacc15, 0.35);
          this.aimGraphics.lineBetween(pX, pY, endX, endY);
          this.aimGraphics.lineStyle(3, 0xffffff, glowAlpha);
          this.aimGraphics.lineBetween(pX, pY, endX, endY);
          this.aimGraphics.strokeCircle(endX, endY, 16);
        }
      } else {
        // NORMAL ATTACK RETICLE ACCORDING TO BRAWLER TYPE
        if (def.id === 'blaze') {
          // Blaze / Colt: Sharp Long-Range Tracer Line
          this.aimGraphics.lineStyle(4, 0xef4444, 0.3);
          this.aimGraphics.lineBetween(pX, pY, endX, endY);
          this.aimGraphics.lineStyle(2.5, 0x38bdf8, 0.85);
          this.aimGraphics.lineBetween(pX, pY, endX, endY);

          // End Crosshair with targeting ticks
          this.aimGraphics.lineStyle(2, 0xffffff, 0.95);
          this.aimGraphics.strokeCircle(endX, endY, 12);
          this.aimGraphics.lineBetween(endX - 16, endY, endX - 6, endY);
          this.aimGraphics.lineBetween(endX + 6, endY, endX + 16, endY);
          this.aimGraphics.lineBetween(endX, endY - 16, endX, endY - 6);
          this.aimGraphics.lineBetween(endX, endY + 6, endX, endY + 16);

        } else if (def.id === 'viper') {
          // Viper / Shelly: Shotgun Spread Cone (0.38 rad spread)
          const halfSpread = 0.19;
          const leftAngle = angle - halfSpread;
          const rightAngle = angle + halfSpread;
          const leftX = pX + Math.cos(leftAngle) * range;
          const leftY = pY + Math.sin(leftAngle) * range;
          const rightX = pX + Math.cos(rightAngle) * range;
          const rightY = pY + Math.sin(rightAngle) * range;

          // Cone boundary rays
          this.aimGraphics.lineStyle(2, 0xa855f7, 0.85);
          this.aimGraphics.lineBetween(pX, pY, leftX, leftY);
          this.aimGraphics.lineBetween(pX, pY, rightX, rightY);
          // Center ray
          this.aimGraphics.lineStyle(1.5, 0xffffff, 0.6);
          this.aimGraphics.lineBetween(pX, pY, endX, endY);
          // Curved end spread arc
          this.aimGraphics.lineStyle(2.5, 0xa855f7, 0.85);
          this.aimGraphics.lineBetween(leftX, leftY, endX, endY);
          this.aimGraphics.lineBetween(endX, endY, rightX, rightY);

        } else if (def.id === 'titan') {
          // Titan / El Primo: Short Melee Punch Arc
          this.aimGraphics.lineStyle(4, 0x0284c7, 0.85);
          const halfArc = 0.55;
          const leftX = pX + Math.cos(angle - halfArc) * range;
          const leftY = pY + Math.sin(angle - halfArc) * range;
          const rightX = pX + Math.cos(angle + halfArc) * range;
          const rightY = pY + Math.sin(angle + halfArc) * range;
          this.aimGraphics.lineBetween(pX, pY, leftX, leftY);
          this.aimGraphics.lineBetween(pX, pY, rightX, rightY);
          this.aimGraphics.lineBetween(leftX, leftY, endX, endY);
          this.aimGraphics.lineBetween(endX, endY, rightX, rightY);
          this.aimGraphics.strokeCircle(endX, endY, 14);

        } else if (def.id === 'raven') {
          // Raven / Crow: 3 Toxic Dagger Rays
          const dAngles = [angle - 0.22, angle, angle + 0.22];
          for (const dAng of dAngles) {
            const dx = pX + Math.cos(dAng) * range;
            const dy = pY + Math.sin(dAng) * range;
            this.aimGraphics.lineStyle(2, 0x10b981, 0.85);
            this.aimGraphics.lineBetween(pX, pY, dx, dy);
            this.aimGraphics.strokeCircle(dx, dy, 5);
          }

        } else {
          // Harmony / Poco: Acoustic Wide Fan Arc
          const halfFan = 0.34;
          const leftX = pX + Math.cos(angle - halfFan) * range;
          const leftY = pY + Math.sin(angle - halfFan) * range;
          const rightX = pX + Math.cos(angle + halfFan) * range;
          const rightY = pY + Math.sin(angle + halfFan) * range;

          this.aimGraphics.lineStyle(2, 0x38bdf8, 0.85);
          this.aimGraphics.lineBetween(pX, pY, leftX, leftY);
          this.aimGraphics.lineBetween(pX, pY, rightX, rightY);
          this.aimGraphics.lineBetween(leftX, leftY, endX, endY);
          this.aimGraphics.lineBetween(endX, endY, rightX, rightY);
        }

        // Distinct Mouse Crosshair Reticle under cursor on PC
        if (this.isMouseActive) {
          const mX = this.mouseWorldPos.x;
          const mY = this.mouseWorldPos.y;
          this.aimGraphics.lineStyle(1.5, 0xffffff, 0.8);
          this.aimGraphics.strokeCircle(mX, mY, 8);
          this.aimGraphics.fillStyle(0x38bdf8, 0.9);
          this.aimGraphics.fillCircle(mX, mY, 2.5);
        }
      }
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

    // 9. Comic Pop Damage Numbers
    for (const dn of this.damageNumbers) {
      const colNum = parseInt(dn.color.replace('#', ''), 16) || 0xef4444;
      this.uiGraphics.fillStyle(colNum, dn.life);
      this.uiGraphics.fillCircle(dn.x, dn.y, 4 * dn.scale);
      this.uiGraphics.lineStyle(1.5, 0xffffff, dn.life);
      this.uiGraphics.strokeCircle(dn.x, dn.y, 4 * dn.scale);
    }
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
