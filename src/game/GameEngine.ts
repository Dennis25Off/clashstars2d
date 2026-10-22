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
import { generateBattleRoyaleMap, MapData } from './mapGenerator';

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

export interface GameEngineCallbacks {
  onGameOver: (placement: number, kills: number, powerCubes: number) => void;
  onAliveChange: (count: number) => void;
  onKillFeed: (entry: KillFeedEntry) => void;
  onPlayerHpChange: (hp: number, maxHp: number, ammo: number, superCharge: number, cubes: number) => void;
  onPoisonPhaseChange: (phase: number, timeToNext: number) => void;
  onPingChange?: (pingMs: number) => void;
  onFovChange?: (zoom: number, mode: string) => void;
}

export class GameEngine {
  public canvas: HTMLCanvasElement;
  public ctx: CanvasRenderingContext2D;
  private mapData: MapData;

  public player: BrawlerEntity;
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
    phaseTimer: 30, // seconds until next shrink
    shrinkSpeed: 20, // pixels per second
  };

  // Camera with Expanded Tactical FOV (default wide ~0.65x instead of 1.0)
  public camera = {
    x: 0,
    y: 0,
    zoom: 0.65,
    targetZoom: 0.65,
    targetX: 0,
    targetY: 0,
    shake: 0,
  };
  public fovMode: 'normal' | 'wide' | 'ultra' = 'wide';

  // Controls state
  public moveVector = { x: 0, y: 0 };
  public aimVector = { x: 0, y: 0, isAiming: false, isSuperAiming: false };
  public mousePos = { x: 0, y: 0 };

  private isRunning = false;
  private animationFrameId: number | null = null;
  private lastTime = 0;
  private callbacks: GameEngineCallbacks;

  // Real-time multiplayer synchronization
  public roomId: string = 'CS-DEFAULT';
  public spawnIndex: number = 0;
  public isHost: boolean = true;
  public pingMs: number = 24;
  private broadcastChannel: BroadcastChannel | null = null;
  private multiplayerSyncTimer = 0;
  private lastProcessedDamageTime = 0;
  private pendingProjectilesToSend: any[] = [];
  private pendingDamageToSend: any[] = [];
  private pendingKillsToSend: any[] = [];
  private pendingDestroyedBoxes: string[] = [];
  private pendingCollectedItems: string[] = [];
  private isSyncingWithServer = false;

  // Natural health regeneration timer for player
  private playerCombatTimer = 0;

  // Periodic powerup respawn timer
  private powerUpRespawnTimer = 18;

  // Touch pinch zoom handling
  private touchStartDist = 0;

  constructor(
    canvas: HTMLCanvasElement,
    playerBrawlerId: BrawlerId,
    playerLevel: number,
    playerUsername: string,
    playerPlatform: CrossPlayPlatform,
    callbacks: GameEngineCallbacks,
    matchedPlayers?: LobbyPlayerInfo[],
    roomId?: string,
    spawnIndex?: number
  ) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.callbacks = callbacks;
    this.roomId = roomId || matchedPlayers?.[0]?.roomId || `CS-${Math.floor(1000 + Math.random() * 9000)}`;

    // Set initial adaptive FOV (generous wide field of view)
    const isMobileViewport = window.innerWidth < 768;
    this.camera.targetZoom = isMobileViewport ? 0.62 : 0.68;
    this.camera.zoom = this.camera.targetZoom;

    this.mapData = generateBattleRoyaleMap();
    this.obstacles = [...this.mapData.obstacles];
    this.powerBoxes = [...this.mapData.powerBoxes];

    // Initialize 8 tactical powerups across the arena
    this.powerUps = this.mapData.powerUpSpawns.map((s, idx) => ({
      id: `pup_${idx}`,
      type: s.type,
      x: s.x,
      y: s.y,
      radius: 20,
      bobTimer: idx * 0.7,
      collected: false,
    }));

    // Symmetrical 10-player spawn positioning
    // Determine player's spawn index
    let resolvedSpawnIndex = typeof spawnIndex === 'number' ? spawnIndex : 0;
    if (matchedPlayers && matchedPlayers.length > 0) {
      const foundSelf = matchedPlayers.find(
        (p) => !p.isBot && (p.name === playerUsername || p.id.includes(playerUsername))
      );
      if (foundSelf && typeof foundSelf.spawnIndex === 'number') {
        resolvedSpawnIndex = foundSelf.spawnIndex;
      }
    }
    this.spawnIndex = resolvedSpawnIndex;
    this.isHost = this.spawnIndex === 0;

    // 1. Setup Local Player at their exact symmetrical spawn
    const playerDef = BRAWLERS[playerBrawlerId];
    const levelMult = 1 + (playerLevel - 1) * 0.06;
    const playerHp = Math.round(playerDef.baseHp * levelMult);
    const selfSpawn = this.mapData.spawnPoints[this.spawnIndex % 10];
    const selfId = (matchedPlayers && matchedPlayers.find((p) => !p.isBot && p.name === playerUsername)?.id) ||
      `player_${playerUsername}_${Date.now()}`;

    this.player = {
      id: selfId,
      name: playerUsername,
      isPlayer: true,
      platform: playerPlatform,
      brawlerId: playerBrawlerId,
      x: selfSpawn.x,
      y: selfSpawn.y,
      vx: 0,
      vy: 0,
      radius: 26,
      rotation: Math.atan2(1200 - selfSpawn.y, 1200 - selfSpawn.x),
      hp: playerHp,
      maxHp: playerHp,
      ammo: playerDef.maxAmmo,
      maxAmmo: playerDef.maxAmmo,
      ammoProgress: 1,
      superCharge: 0,
      gadgetCharges: 3,
      powerCubes: 0,
      kills: 0,
      isAlive: true,
      isInBush: false,

      // Cartoon animation states
      walkCycle: 0,
      isMoving: false,
      hitFlashTimer: 0,
      recoilOffset: 0,

      // Status & Powerup timers
      speedBoostTimer: 0,
      shieldTimer: 0,
      shieldRatio: 0,
      doubleDamageTimer: 0,
      poisonTicksLeft: 0,
      poisonDamage: 0,
      poisonAttackerId: null,
      bandAidCooldown: 0,
      isLeaping: false,
      leapProgress: 0,
      leapStartX: 0,
      leapStartY: 0,
      leapTargetX: 0,
      leapTargetY: 0,
      aiTargetId: null,
      aiState: 'roam',
      aiDecisionTimer: 0,
      aiAimAngle: 0,
    };
    this.brawlers.push(this.player);

    // 2. Setup Remaining 9 Combatants (Other Real Players + Synced Deterministic Bots)
    const brawlerIds: BrawlerId[] = ['blaze', 'viper', 'titan', 'raven', 'harmony'];
    for (let slot = 0; slot < 10; slot++) {
      if (slot === this.spawnIndex) continue; // Skip local player's slot

      const slotSpawn = this.mapData.spawnPoints[slot % 10];
      const matchP = matchedPlayers?.find((p) => p.spawnIndex === slot) || matchedPlayers?.[slot];
      const isRemote = matchP ? !matchP.isBot : false;

      const botId = matchP ? matchP.id : `bot_synced_${slot}`;
      const botName = matchP ? matchP.name : `${BOT_NAMES[slot % BOT_NAMES.length]} [BOT]`;
      const botPlatform = matchP ? matchP.platform : BOT_PLATFORMS[slot % BOT_PLATFORMS.length];
      const bId = matchP ? matchP.brawlerId : brawlerIds[slot % brawlerIds.length];

      const botDef = BRAWLERS[bId];
      const botLevel = Math.floor(Math.random() * 3) + 1;
      const bMult = 1 + (botLevel - 1) * 0.05;
      const botHp = Math.round(botDef.baseHp * bMult);

      const combatant: BrawlerEntity = {
        id: botId,
        name: botName,
        isPlayer: false,
        isRemotePlayer: isRemote,
        platform: botPlatform,
        brawlerId: bId,
        x: slotSpawn.x,
        y: slotSpawn.y,
        vx: 0,
        vy: 0,
        radius: 26,
        rotation: Math.atan2(1200 - slotSpawn.y, 1200 - slotSpawn.x),
        hp: botHp,
        maxHp: botHp,
        ammo: botDef.maxAmmo,
        maxAmmo: botDef.maxAmmo,
        ammoProgress: 1,
        superCharge: Math.floor(Math.random() * 25),
        gadgetCharges: 3,
        powerCubes: 0,
        kills: 0,
        isAlive: true,
        isInBush: false,

        walkCycle: Math.random() * 10,
        isMoving: false,
        hitFlashTimer: 0,
        recoilOffset: 0,

        speedBoostTimer: 0,
        shieldTimer: 0,
        shieldRatio: 0,
        doubleDamageTimer: 0,
        poisonTicksLeft: 0,
        poisonDamage: 0,
        poisonAttackerId: null,
        bandAidCooldown: 0,
        isLeaping: false,
        leapProgress: 0,
        leapStartX: 0,
        leapStartY: 0,
        leapTargetX: 0,
        leapTargetY: 0,
        aiTargetId: null,
        aiState: 'roam',
        aiDecisionTimer: Math.random() * 2,
        aiAimAngle: 0,
      };
      this.brawlers.push(combatant);
    }

    this.camera.x = this.player.x;
    this.camera.y = this.player.y;
    this.callbacks.onAliveChange(10);

    // Bind FOV wheel and pinch gesture handlers
    this.canvas.addEventListener('wheel', this.handleWheel, { passive: false });
    this.canvas.addEventListener('touchstart', this.handleTouchStart, { passive: true });
    this.canvas.addEventListener('touchmove', this.handleTouchMove, { passive: true });
  }

  // --- INTERACTIVE FOV METHODS ---
  public setFovMode(mode: 'normal' | 'wide' | 'ultra') {
    this.fovMode = mode;
    if (mode === 'ultra') this.camera.targetZoom = 0.52; // Massive wide-angle tactical view
    else if (mode === 'wide') this.camera.targetZoom = 0.65; // Balanced wide FOV (recommended)
    else this.camera.targetZoom = 0.82; // Closer combat view
    this.callbacks.onFovChange?.(this.camera.targetZoom, mode);
  }

  public adjustZoom(delta: number) {
    this.camera.targetZoom = Math.max(0.46, Math.min(0.95, this.camera.targetZoom + delta));
    this.callbacks.onFovChange?.(this.camera.targetZoom, this.fovMode);
  }

  private handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    this.adjustZoom(delta);
  };

  private handleTouchStart = (e: TouchEvent) => {
    if (e.touches.length === 2) {
      this.touchStartDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
    }
  };

  private handleTouchMove = (e: TouchEvent) => {
    if (e.touches.length === 2 && this.touchStartDist > 0) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const diff = (dist - this.touchStartDist) * 0.002;
      this.adjustZoom(diff);
      this.touchStartDist = dist;
    }
  };

  public start() {
    this.isRunning = true;
    this.lastTime = performance.now();
    try {
      this.broadcastChannel = new BroadcastChannel(`cs_mp_${this.roomId}`);
      this.broadcastChannel.onmessage = (event) => {
        const { type, payload } = event.data || {};
        if (type === 'STATE_SYNC' && payload && payload.playerId !== this.player.id) {
          this.handleRemoteState(payload);
        }
      };
    } catch (_) {}
    this.loop = this.loop.bind(this);
    this.animationFrameId = requestAnimationFrame(this.loop);
  }

  public stop() {
    this.isRunning = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  public destroy() {
    this.stop();
    this.canvas.removeEventListener('wheel', this.handleWheel);
    this.canvas.removeEventListener('touchstart', this.handleTouchStart);
    this.canvas.removeEventListener('touchmove', this.handleTouchMove);
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.close();
      } catch (_) {}
      this.broadcastChannel = null;
    }
  }

  private loop(time: number) {
    if (!this.isRunning) return;
    const dt = Math.min((time - this.lastTime) / 1000, 0.05);
    this.lastTime = time;

    this.update(dt);
    this.render();

    this.animationFrameId = requestAnimationFrame(this.loop);
  }

  // --- UPDATE CYCLE ---
  private update(dt: number) {
    this.updatePoisonZone(dt);
    this.updatePlayerInput(dt);
    this.updateBrawlers(dt);
    this.updateProjectiles(dt);
    this.updatePowerCubes(dt);
    this.updatePowerUps(dt);
    this.updateParticles(dt);
    this.updateDamageNumbers(dt);
    this.updateCamera(dt);
    this.updateMultiplayerSync(dt);

    // Sync HUD callback
    this.callbacks.onPlayerHpChange(
      Math.max(0, Math.round(this.player.hp)),
      this.player.maxHp,
      this.player.ammo,
      Math.min(100, Math.round(this.player.superCharge)),
      this.player.powerCubes
    );
  }

  private updatePoisonZone(dt: number) {
    this.poisonZone.phaseTimer -= dt;
    this.callbacks.onPoisonPhaseChange(
      this.poisonZone.phase,
      Math.max(0, Math.ceil(this.poisonZone.phaseTimer))
    );

    if (this.poisonZone.phaseTimer <= 0) {
      this.poisonZone.phase++;
      if (this.poisonZone.phase === 2) {
        this.poisonZone.targetRadius = 750;
        this.poisonZone.phaseTimer = 35;
      } else if (this.poisonZone.phase === 3) {
        this.poisonZone.targetRadius = 400;
        this.poisonZone.phaseTimer = 30;
      } else if (this.poisonZone.phase >= 4) {
        this.poisonZone.targetRadius = 120;
        this.poisonZone.phaseTimer = 40;
      }
    }

    if (this.poisonZone.currentRadius > this.poisonZone.targetRadius) {
      this.poisonZone.currentRadius = Math.max(
        this.poisonZone.targetRadius,
        this.poisonZone.currentRadius - this.poisonZone.shrinkSpeed * dt
      );
    }
  }

  private updatePlayerInput(dt: number) {
    if (!this.player.isAlive || this.player.isLeaping) return;

    const brawlerDef = BRAWLERS[this.player.brawlerId];
    let speedMult = 1;
    if (this.player.brawlerId === 'blaze') speedMult += 0.18;
    if (this.player.speedBoostTimer > 0) speedMult += 0.5; // Power-up turbo speed!

    const moveSpeed = brawlerDef.speed * 60 * speedMult;

    if (this.moveVector.x !== 0 || this.moveVector.y !== 0) {
      const mag = Math.sqrt(this.moveVector.x * this.moveVector.x + this.moveVector.y * this.moveVector.y);
      const normX = this.moveVector.x / mag;
      const normY = this.moveVector.y / mag;
      const moveDist = Math.min(1, mag) * moveSpeed * dt;

      this.moveEntityWithCollision(this.player, normX * moveDist, normY * moveDist);
      if (!this.aimVector.isAiming && !this.aimVector.isSuperAiming) {
        this.player.rotation = Math.atan2(normY, normX);
      }

      this.player.isMoving = true;
      this.player.walkCycle += dt * 14;

      // Spawn cartoon foot dust puffs while running
      if (Math.random() < 0.25) {
        this.spawnParticles(this.player.x, this.player.y + 12, '#94a3b8', 1);
      }
    } else {
      this.player.isMoving = false;
      this.player.walkCycle = 0;
    }

    // Aim rotation
    if (this.aimVector.isAiming || this.aimVector.isSuperAiming) {
      this.player.rotation = Math.atan2(this.aimVector.y, this.aimVector.x);
    }
  }

  private updateBrawlers(dt: number) {
    const cx = this.poisonZone.centerX;
    const cy = this.poisonZone.centerY;
    const poisonR = this.poisonZone.currentRadius;

    for (const brawler of this.brawlers) {
      if (!brawler.isAlive) continue;

      const def = BRAWLERS[brawler.brawlerId];

      // Ammo regeneration mechanic:
      // If ammo is below max, reload progress ticks up to 1. When it reaches 1, ammo increases by 1!
      if (brawler.ammo < brawler.maxAmmo) {
        brawler.ammoProgress += dt / def.reloadTime;
        if (brawler.ammoProgress >= 1) {
          brawler.ammo += 1;
          brawler.ammoProgress = brawler.ammo < brawler.maxAmmo ? 0 : 1;
        }
      } else {
        brawler.ammoProgress = 1;
      }

      // Check bush stealth
      brawler.isInBush = this.isInsideBush(brawler.x, brawler.y);

      // Timers & animations decay
      if (brawler.speedBoostTimer > 0) brawler.speedBoostTimer -= dt;
      if (brawler.shieldTimer > 0) brawler.shieldTimer -= dt;
      if (brawler.doubleDamageTimer > 0) brawler.doubleDamageTimer -= dt;
      if (brawler.bandAidCooldown > 0) brawler.bandAidCooldown -= dt;
      if (brawler.hitFlashTimer > 0) brawler.hitFlashTimer -= dt;
      if (brawler.recoilOffset > 0) {
        brawler.recoilOffset = Math.max(0, brawler.recoilOffset - dt * 45);
      }

      // Poison Tick Damage
      if (brawler.poisonTicksLeft > 0) {
        brawler.poisonTicksLeft -= dt;
        if (Math.random() < dt * 4) {
          this.applyDamage(brawler, brawler.poisonDamage, brawler.poisonAttackerId || '', false, '#10b981');
          this.spawnParticles(brawler.x, brawler.y, '#22c55e', 3);
        }
      }

      // Poison Storm gas damage
      const distFromCenter = Math.hypot(brawler.x - cx, brawler.y - cy);
      if (distFromCenter > poisonR) {
        const poisonDmgPerSec = 1000;
        this.applyDamage(brawler, poisonDmgPerSec * dt, 'gas_storm', false, '#22c55e');
        if (Math.random() < 0.25) {
          this.spawnParticles(brawler.x, brawler.y, '#16a34a', 2);
        }
      }

      // Natural health regen (after 3.5s without combat)
      if (brawler.isPlayer) {
        this.playerCombatTimer += dt;
        if (this.playerCombatTimer > 3.5 && brawler.hp < brawler.maxHp && distFromCenter <= poisonR && brawler.poisonTicksLeft <= 0) {
          const healAmount = Math.round(brawler.maxHp * 0.13 * dt);
          brawler.hp = Math.min(brawler.maxHp, brawler.hp + healAmount);
        }
      } else {
        this.updateBotAI(brawler, dt);
      }

      // Leap Animation
      if (brawler.isLeaping) {
        brawler.leapProgress += dt * 1.6;
        if (brawler.leapProgress >= 1) {
          brawler.isLeaping = false;
          brawler.x = brawler.leapTargetX;
          brawler.y = brawler.leapTargetY;
          this.onLeapLanding(brawler);
        } else {
          brawler.x = brawler.leapStartX + (brawler.leapTargetX - brawler.leapStartX) * brawler.leapProgress;
          brawler.y = brawler.leapStartY + (brawler.leapTargetY - brawler.leapStartY) * brawler.leapProgress;
        }
      }

      // Passive: Viper's Band-Aid
      if (brawler.brawlerId === 'viper' && brawler.hp < brawler.maxHp * 0.35 && brawler.bandAidCooldown <= 0) {
        brawler.hp = Math.min(brawler.maxHp, brawler.hp + 2400);
        brawler.bandAidCooldown = 25;
        this.spawnDamageNumber(brawler.x, brawler.y - 30, '+2400 HP', '#22c55e', true);
        this.spawnParticles(brawler.x, brawler.y, '#4ade80', 14);
        sound.playVictory();
      }
    }
  }

  // --- BOT AI ---
  private updateBotAI(bot: BrawlerEntity, dt: number) {
    if (bot.isLeaping || !bot.isAlive || bot.isRemotePlayer) return;

    bot.aiDecisionTimer -= dt;
    const def = BRAWLERS[bot.brawlerId];
    const cx = this.poisonZone.centerX;
    const cy = this.poisonZone.centerY;
    const poisonR = this.poisonZone.currentRadius;

    let speedMult = 1;
    if (bot.speedBoostTimer > 0) speedMult += 0.5;
    const moveSpeed = def.speed * 60 * speedMult * dt;

    // 1. Storm retreat
    const distToCenter = Math.hypot(bot.x - cx, bot.y - cy);
    if (distToCenter > poisonR - 100) {
      const angleToCenter = Math.atan2(cy - bot.y, cx - bot.x);
      this.moveEntityWithCollision(bot, Math.cos(angleToCenter) * moveSpeed, Math.sin(angleToCenter) * moveSpeed);
      bot.rotation = angleToCenter;
      bot.isMoving = true;
      bot.walkCycle += dt * 12;
      return;
    }

    // 2. Target check: nearby power-ups!
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

    // 3. Enemies or Boxes
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

    if (closestEnemy && closestEnemyDist < def.attackRange + 100) {
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
        if (Math.random() < 0.15) {
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

  // --- ATTACKS & AMMO DECREASE ---
  public firePlayerNormalAttack(angle?: number) {
    if (!this.player.isAlive || this.player.isLeaping) return;
    // Cannot fire if 0 ammo!
    if (this.player.ammo <= 0) return;

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
    if (!this.player.isAlive || this.player.gadgetCharges <= 0) return;
    this.player.gadgetCharges--;

    const brawlerId = this.player.brawlerId;
    if (brawlerId === 'blaze') {
      this.player.ammo = Math.min(this.player.maxAmmo, this.player.ammo + 2);
      this.player.ammoProgress = 1;
      this.spawnParticles(this.player.x, this.player.y, '#f59e0b', 16);
      sound.playPowerCube();
    } else if (brawlerId === 'viper') {
      const dashDist = 200;
      const dx = Math.cos(this.player.rotation) * dashDist;
      const dy = Math.sin(this.player.rotation) * dashDist;
      this.moveEntityWithCollision(this.player, dx, dy);
      this.spawnParticles(this.player.x, this.player.y, '#a855f7', 18);
      sound.playBush();
    } else if (brawlerId === 'titan') {
      this.spawnParticles(this.player.x, this.player.y, '#3b82f6', 30);
      sound.playExplosion();
      this.camera.shake = 10;
      for (const other of this.brawlers) {
        if (other.id !== this.player.id && other.isAlive) {
          const d = Math.hypot(other.x - this.player.x, other.y - this.player.y);
          if (d < 220) {
            this.applyDamage(other, 800, this.player.id, false, '#3b82f6');
            other.speedBoostTimer = -2.5;
          }
        }
      }
    } else if (brawlerId === 'raven') {
      this.player.shieldTimer = 3.5;
      this.player.shieldRatio = 0.5;
      this.spawnParticles(this.player.x, this.player.y, '#eab308', 20);
      sound.playSuperReady();
    } else if (brawlerId === 'harmony') {
      this.player.poisonTicksLeft = 0;
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 1400);
      this.spawnDamageNumber(this.player.x, this.player.y - 30, '+1400 HP', '#10b981', true);
      this.spawnParticles(this.player.x, this.player.y, '#10b981', 25);
      sound.playVictory();
    }
  }

  private executeNormalAttack(attacker: BrawlerEntity, angle: number) {
    const def = BRAWLERS[attacker.brawlerId];
    
    // Decrement ammo immediately
    attacker.ammo--;
    if (attacker.ammoProgress >= 1) {
      attacker.ammoProgress = 0; // Starts refilling from 0!
    }

    attacker.rotation = angle;
    attacker.recoilOffset = 10; // Cartoon recoil kickback!

    // Cube & Double Damage multiplier
    let damageMult = 1 + attacker.powerCubes * 0.1;
    if (attacker.doubleDamageTimer > 0) damageMult *= 2; // 2x Double Damage powerup!

    const baseDamage = Math.round(def.attackDamage * damageMult);

    sound.playShoot(def.bulletType);

    // Muzzle flash particle
    this.spawnParticles(
      attacker.x + Math.cos(angle) * 35,
      attacker.y + Math.sin(angle) * 35,
      '#fef08a',
      6
    );

    if (attacker.brawlerId === 'blaze') {
      for (let i = 0; i < def.bulletCount; i++) {
        setTimeout(() => {
          if (!attacker.isAlive) return;
          const bulletSpread = (Math.random() - 0.5) * def.attackSpread;
          const a = angle + bulletSpread;
          this.addProjectile({
            id: `proj_${Date.now()}_${Math.random()}`,
            ownerId: attacker.id,
            isSuper: false,
            brawlerId: attacker.brawlerId,
            x: attacker.x + Math.cos(a) * 30,
            y: attacker.y + Math.sin(a) * 30,
            vx: Math.cos(a) * def.bulletSpeed,
            vy: Math.sin(a) * def.bulletSpeed,
            distanceTraveled: 0,
            maxDistance: def.attackRange,
            damage: baseDamage,
            radius: def.bulletRadius,
            piercing: false,
            destroysWalls: false,
            color: attacker.doubleDamageTimer > 0 ? '#ef4444' : '#f97316',
            bulletType: 'bullet',
          });
        }, i * 65);
      }
    } else if (attacker.brawlerId === 'viper') {
      for (let i = 0; i < def.bulletCount; i++) {
        const spreadOffset = ((i - (def.bulletCount - 1) / 2) / (def.bulletCount - 1)) * def.attackSpread;
        const a = angle + spreadOffset;
        this.addProjectile({
          id: `proj_${Date.now()}_${Math.random()}`,
          ownerId: attacker.id,
          isSuper: false,
          brawlerId: attacker.brawlerId,
          x: attacker.x + Math.cos(a) * 26,
          y: attacker.y + Math.sin(a) * 26,
          vx: Math.cos(a) * def.bulletSpeed,
          vy: Math.sin(a) * def.bulletSpeed,
          distanceTraveled: 0,
          maxDistance: def.attackRange,
          damage: baseDamage,
          radius: def.bulletRadius,
          piercing: false,
          destroysWalls: false,
          color: attacker.doubleDamageTimer > 0 ? '#f43f5e' : '#c084fc',
          bulletType: 'shotgun',
        });
      }
    } else if (attacker.brawlerId === 'titan') {
      for (let i = 0; i < def.bulletCount; i++) {
        setTimeout(() => {
          if (!attacker.isAlive) return;
          const a = angle + (Math.random() - 0.5) * def.attackSpread;
          this.addProjectile({
            id: `proj_${Date.now()}_${Math.random()}`,
            ownerId: attacker.id,
            isSuper: false,
            brawlerId: attacker.brawlerId,
            x: attacker.x + Math.cos(a) * 25,
            y: attacker.y + Math.sin(a) * 25,
            vx: Math.cos(a) * def.bulletSpeed,
            vy: Math.sin(a) * def.bulletSpeed,
            distanceTraveled: 0,
            maxDistance: def.attackRange,
            damage: baseDamage,
            radius: def.bulletRadius,
            piercing: false,
            destroysWalls: false,
            color: attacker.doubleDamageTimer > 0 ? '#ea580c' : '#60a5fa',
            bulletType: 'punch',
          });
        }, i * 80);
      }
    } else if (attacker.brawlerId === 'raven') {
      for (let i = 0; i < def.bulletCount; i++) {
        const spreadOffset = ((i - 1) * def.attackSpread) / 2;
        const a = angle + spreadOffset;
        this.addProjectile({
          id: `proj_${Date.now()}_${Math.random()}`,
          ownerId: attacker.id,
          isSuper: false,
          brawlerId: attacker.brawlerId,
          x: attacker.x + Math.cos(a) * 25,
          y: attacker.y + Math.sin(a) * 25,
          vx: Math.cos(a) * def.bulletSpeed,
          vy: Math.sin(a) * def.bulletSpeed,
          distanceTraveled: 0,
          maxDistance: def.attackRange,
          damage: baseDamage,
          radius: def.bulletRadius,
          piercing: false,
          destroysWalls: false,
          color: '#eab308',
          bulletType: 'poison',
          isPoisonous: true,
        });
      }
    } else if (attacker.brawlerId === 'harmony') {
      this.addProjectile({
        id: `proj_${Date.now()}_${Math.random()}`,
        ownerId: attacker.id,
        isSuper: false,
        brawlerId: attacker.brawlerId,
        x: attacker.x + Math.cos(angle) * 30,
        y: attacker.y + Math.sin(angle) * 30,
        vx: Math.cos(angle) * def.bulletSpeed,
        vy: Math.sin(angle) * def.bulletSpeed,
        distanceTraveled: 0,
        maxDistance: def.attackRange,
        damage: baseDamage,
        radius: def.bulletRadius,
        piercing: true,
        destroysWalls: false,
        color: '#34d399',
        bulletType: 'sonic',
      });
    }
  }

  private executeSuper(attacker: BrawlerEntity, angle: number) {
    const def = BRAWLERS[attacker.brawlerId];
    attacker.superCharge = 0;
    attacker.rotation = angle;
    attacker.recoilOffset = 16;
    sound.playSuperCast();

    let damageMult = 1 + attacker.powerCubes * 0.1;
    if (attacker.doubleDamageTimer > 0) damageMult *= 2;
    const superDamage = Math.round(def.superDamage * damageMult);

    if (attacker.brawlerId === 'blaze') {
      this.camera.shake = 8;
      for (let i = 0; i < 12; i++) {
        setTimeout(() => {
          if (!attacker.isAlive) return;
          const a = angle + (Math.random() - 0.5) * 0.1;
          this.addProjectile({
            id: `proj_super_${Date.now()}_${Math.random()}`,
            ownerId: attacker.id,
            isSuper: true,
            brawlerId: attacker.brawlerId,
            x: attacker.x + Math.cos(a) * 30,
            y: attacker.y + Math.sin(a) * 30,
            vx: Math.cos(a) * 20,
            vy: Math.sin(a) * 20,
            distanceTraveled: 0,
            maxDistance: def.superRange,
            damage: superDamage,
            radius: def.superRadius,
            piercing: true,
            destroysWalls: true,
            color: '#ef4444',
            bulletType: 'bullet',
          });
        }, i * 50);
      }
    } else if (attacker.brawlerId === 'viper') {
      this.camera.shake = 12;
      for (let i = 0; i < 9; i++) {
        const spread = ((i - 4) / 4) * 0.5;
        const a = angle + spread;
        this.addProjectile({
          id: `proj_super_${Date.now()}_${Math.random()}`,
          ownerId: attacker.id,
          isSuper: true,
          brawlerId: attacker.brawlerId,
          x: attacker.x + Math.cos(a) * 30,
          y: attacker.y + Math.sin(a) * 30,
          vx: Math.cos(a) * 18,
          vy: Math.sin(a) * 18,
          distanceTraveled: 0,
          maxDistance: def.superRange,
          damage: superDamage,
          radius: def.superRadius,
          piercing: true,
          destroysWalls: true,
          color: '#9333ea',
          bulletType: 'shotgun',
        });
      }
    } else if (attacker.brawlerId === 'titan') {
      const leapDist = Math.min(def.superRange, 480);
      attacker.isLeaping = true;
      attacker.leapProgress = 0;
      attacker.leapStartX = attacker.x;
      attacker.leapStartY = attacker.y;
      attacker.leapTargetX = attacker.x + Math.cos(angle) * leapDist;
      attacker.leapTargetY = attacker.y + Math.sin(angle) * leapDist;
      this.spawnParticles(attacker.x, attacker.y, '#3b82f6', 20);
    } else if (attacker.brawlerId === 'raven') {
      this.launchRavenDaggerRing(attacker);
      const leapDist = Math.min(def.superRange, 460);
      attacker.isLeaping = true;
      attacker.leapProgress = 0;
      attacker.leapStartX = attacker.x;
      attacker.leapStartY = attacker.y;
      attacker.leapTargetX = attacker.x + Math.cos(angle) * leapDist;
      attacker.leapTargetY = attacker.y + Math.sin(angle) * leapDist;
    } else if (attacker.brawlerId === 'harmony') {
      this.camera.shake = 6;
      attacker.hp = Math.min(attacker.maxHp, attacker.hp + 3800);
      this.spawnDamageNumber(attacker.x, attacker.y - 30, '+3800 HP', '#10b981', true);
      this.spawnParticles(attacker.x, attacker.y, '#10b981', 35);
      sound.playVictory();

      this.addProjectile({
        id: `proj_super_${Date.now()}`,
        ownerId: attacker.id,
        isSuper: true,
        brawlerId: attacker.brawlerId,
        x: attacker.x + Math.cos(angle) * 30,
        y: attacker.y + Math.sin(angle) * 30,
        vx: Math.cos(angle) * 16,
        vy: Math.sin(angle) * 16,
        distanceTraveled: 0,
        maxDistance: def.superRange,
        damage: superDamage,
        radius: 65,
        piercing: true,
        destroysWalls: false,
        color: '#059669',
        bulletType: 'sonic',
      });
    }
  }

  private launchRavenDaggerRing(brawler: BrawlerEntity) {
    const numDaggers = 12;
    for (let i = 0; i < numDaggers; i++) {
      const a = (i * 2 * Math.PI) / numDaggers;
      this.addProjectile({
        id: `proj_raven_${Date.now()}_${i}`,
        ownerId: brawler.id,
        isSuper: true,
        brawlerId: 'raven',
        x: brawler.x,
        y: brawler.y,
        vx: Math.cos(a) * 16,
        vy: Math.sin(a) * 16,
        distanceTraveled: 0,
        maxDistance: 380,
        damage: 640,
        radius: 7,
        piercing: false,
        destroysWalls: false,
        color: '#eab308',
        bulletType: 'poison',
        isPoisonous: true,
      });
    }
  }

  private onLeapLanding(brawler: BrawlerEntity) {
    if (brawler.brawlerId === 'titan') {
      this.camera.shake = 16;
      sound.playExplosion();
      this.spawnParticles(brawler.x, brawler.y, '#f97316', 40);
      this.destroyWallsInRadius(brawler.x, brawler.y, 140);

      const cubeDamageMult = 1 + brawler.powerCubes * 0.1;
      const landingDamage = Math.round(3000 * cubeDamageMult);

      for (const other of this.brawlers) {
        if (other.id !== brawler.id && other.isAlive) {
          const dist = Math.hypot(other.x - brawler.x, other.y - brawler.y);
          if (dist <= 140) {
            this.applyDamage(other, landingDamage, brawler.id, false, '#f97316');
            other.poisonTicksLeft = 4;
            other.poisonDamage = 200;
            other.poisonAttackerId = brawler.id;
          }
        }
      }
    } else if (brawler.brawlerId === 'raven') {
      this.launchRavenDaggerRing(brawler);
      this.spawnParticles(brawler.x, brawler.y, '#eab308', 25);
    }
  }

  private findAutoAimAngle(from: BrawlerEntity, isSuper = false): number {
    let closestTarget: { x: number; y: number } | null = null;
    let closestDist = Infinity;

    for (const b of this.brawlers) {
      if (b.id === from.id || !b.isAlive) continue;
      if (b.isInBush && !from.isInBush && Math.hypot(from.x - b.x, from.y - b.y) > 85) {
        continue;
      }
      const dist = Math.hypot(b.x - from.x, b.y - from.y);
      if (dist < closestDist) {
        closestDist = dist;
        closestTarget = { x: b.x, y: b.y };
      }
    }

    if (!closestTarget && !isSuper) {
      for (const box of this.powerBoxes) {
        if (box.isDestroyed) continue;
        const dist = Math.hypot(box.x + box.width / 2 - from.x, box.y + box.height / 2 - from.y);
        if (dist < closestDist) {
          closestDist = dist;
          closestTarget = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        }
      }
    }

    if (closestTarget) {
      return Math.atan2(closestTarget.y - from.y, closestTarget.x - from.x);
    }
    return from.rotation;
  }

  // --- POWER-UPS UPDATE & COLLECTION ---
  private updatePowerUps(dt: number) {
    this.powerUpRespawnTimer -= dt;
    if (this.powerUpRespawnTimer <= 0) {
      this.powerUpRespawnTimer = 22;
      // Respawn 2 random powerups in safe area
      const types: PowerUpType[] = ['speed', 'shield', 'damage', 'heal', 'super'];
      for (let i = 0; i < 2; i++) {
        const angle = Math.random() * Math.PI * 2;
        const r = Math.random() * (this.poisonZone.currentRadius * 0.7);
        this.powerUps.push({
          id: `pup_spawn_${Date.now()}_${i}`,
          type: types[Math.floor(Math.random() * types.length)],
          x: this.poisonZone.centerX + Math.cos(angle) * r,
          y: this.poisonZone.centerY + Math.sin(angle) * r,
          radius: 20,
          bobTimer: Math.random() * 5,
          collected: false,
        });
      }
    }

    for (let i = this.powerUps.length - 1; i >= 0; i--) {
      const pu = this.powerUps[i];
      if (pu.collected) continue;

      pu.bobTimer += dt * 3.5;

      // Check collision with living brawlers
      for (const b of this.brawlers) {
        if (!b.isAlive || b.isLeaping) continue;
        const dist = Math.hypot(b.x - pu.x, b.y - pu.y);
        if (dist <= b.radius + pu.radius) {
          // Collected!
          pu.collected = true;
          this.pendingCollectedItems.push(pu.id);
          this.applyPowerUp(b, pu.type);
          this.powerUps.splice(i, 1);
          break;
        }
      }
    }
  }

  private applyPowerUp(brawler: BrawlerEntity, type: PowerUpType) {
    sound.playPowerUp();

    if (type === 'speed') {
      brawler.speedBoostTimer = 8;
      this.spawnDamageNumber(brawler.x, brawler.y - 30, '⚡ VELOCITÀ MAX!', '#38bdf8', true);
      this.spawnParticles(brawler.x, brawler.y, '#38bdf8', 18);
    } else if (type === 'shield') {
      brawler.shieldTimer = 7;
      brawler.shieldRatio = 0.7; // 70% damage reduction
      this.spawnDamageNumber(brawler.x, brawler.y - 30, '🛡️ SUPER SCUDO!', '#a855f7', true);
      this.spawnParticles(brawler.x, brawler.y, '#c084fc', 20);
    } else if (type === 'damage') {
      brawler.doubleDamageTimer = 8;
      this.spawnDamageNumber(brawler.x, brawler.y - 30, '💥 DANNO DOPPIO!', '#ef4444', true);
      this.spawnParticles(brawler.x, brawler.y, '#f87171', 22);
    } else if (type === 'heal') {
      brawler.hp = Math.min(brawler.maxHp, brawler.hp + 2500);
      this.spawnDamageNumber(brawler.x, brawler.y - 30, '💚 +2500 HP!', '#22c55e', true);
      this.spawnParticles(brawler.x, brawler.y, '#4ade80', 25);
    } else if (type === 'super') {
      brawler.superCharge = 100;
      this.spawnDamageNumber(brawler.x, brawler.y - 30, '🌟 SUPER PRONTA!', '#eab308', true);
      this.spawnParticles(brawler.x, brawler.y, '#facc15', 25);
      if (brawler.isPlayer) {
        sound.playSuperReady();
      }
    }
  }

  // --- PROJECTILES & DAMAGE ---
  private updateProjectiles(dt: number) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.distanceTraveled += Math.hypot(p.vx, p.vy);

      if (p.distanceTraveled >= p.maxDistance) {
        this.projectiles.splice(i, 1);
        continue;
      }
      // Wall collision
      let hitWall = false;
      for (let wIdx = this.obstacles.length - 1; wIdx >= 0; wIdx--) {
        const obs = this.obstacles[wIdx];
        if (obs.type === 'water') continue;

        // Verifica geometrica della collisione
        if (
          p.x + p.radius > obs.x &&
          p.x - p.radius < obs.x + obs.width &&
          p.y + p.radius > obs.y &&
          p.y - p.radius < obs.y + obs.height
        ) {
          
          // 1. IL SUPER OVERRIDE DELLE SUPER DISTRUTTIVE 💥
          // Se il proiettile distrugge i muri (Super di Blaze/Viper), ELIMINIAMO il controllo "obs.destructible"
          if (p.destroysWalls) {
            this.spawnParticles(obs.x + obs.width / 2, obs.y + obs.height / 2, '#78350f', 12);
            this.obstacles.splice(wIdx, 1); // Rimuove il blocco di pietra indistruttibile dalla mappa
            sound.playExplosion();
            
            // Essendo colpi perforanti (piercing), indichiamo al proiettile di proseguire la sua corsa
            if (p.piercing) {
              continue; 
            }
          } 
          // Comportamento per i colpi normali: loro richiedono OBBLIGATORIAMENTE che il muro sia destructible
          else if (obs.destructible && obs.hp) {
            obs.hp -= p.damage;
            if (obs.hp <= 0) {
              this.spawnParticles(obs.x + obs.width / 2, obs.y + obs.height / 2, '#78350f', 10);
              this.obstacles.splice(wIdx, 1);
            }
          }

          // 2. GESTIONE SPECIALE HARMONY / POCO
          const isSonic = p.bulletType === 'sonic';
          if (isSonic) {
            if (!p.isSuper) {
              hitWall = true;
              this.spawnParticles(p.x, p.y, p.color, 4);
              break;
            }
            continue; // La Super di Harmony passa oltre
          }

          // 3. SE IL COLPO NON È UNA SUPER DISTRUTTIVA E NON È PERFORANTE, SI INFRANGE CONTRO LA PIETRA
          if (!p.piercing && !p.destroysWalls) {
            hitWall = true;
            this.spawnParticles(p.x, p.y, p.color, 4);
            break;
          }
        }
      }

      // Se il colpo normale ha toccato la pietra senza poterla rompere, svanisce
      if (hitWall) {
        this.projectiles.splice(i, 1);
        continue;
      }


      // Box collision
      let hitBox = false;
      for (const box of this.powerBoxes) {
        if (box.isDestroyed) continue;
        if (
          p.x + p.radius > box.x &&
          p.x - p.radius < box.x + box.width &&
          p.y + p.radius > box.y &&
          p.y - p.radius < box.y + box.height
        ) {
          box.hp -= p.damage;
          this.spawnDamageNumber(p.x, p.y, `${p.damage}`, '#ffffff');
          this.spawnParticles(p.x, p.y, '#f59e0b', 6);
          sound.playHit();

          if (box.hp <= 0) {
            box.isDestroyed = true;
            this.pendingDestroyedBoxes.push(box.id);
            this.spawnPowerCubes(box.x + box.width / 2, box.y + box.height / 2, box.cubesToDrop);
            sound.playExplosion();
          }

          const attacker = this.brawlers.find((b) => b.id === p.ownerId);
          if (attacker && !p.isSuper) {
            const def = BRAWLERS[attacker.brawlerId];
            attacker.superCharge = Math.min(100, attacker.superCharge + def.superChargePerHit * 0.5);
          }

          if (!p.piercing) {
            hitBox = true;
            break;
          }
        }
      }

      if (hitBox) {
        this.projectiles.splice(i, 1);
        continue;
      }

      // Brawler collision
      let hitBrawler = false;
      for (const target of this.brawlers) {
        if (target.id === p.ownerId || !target.isAlive || target.isLeaping) continue;

        const dist = Math.hypot(p.x - target.x, p.y - target.y);
        if (dist <= p.radius + target.radius) {
          const attacker = this.brawlers.find((b) => b.id === p.ownerId);
          if (attacker && !p.isSuper) {
            const def = BRAWLERS[attacker.brawlerId];
            attacker.superCharge = Math.min(100, attacker.superCharge + def.superChargePerHit);
            if (attacker.superCharge >= 100 && attacker.isPlayer) {
              sound.playSuperReady();
            }
            if (attacker.brawlerId === 'harmony') {
              attacker.hp = Math.min(attacker.maxHp, attacker.hp + 450);
              this.spawnDamageNumber(attacker.x, attacker.y - 20, '+450 HP', '#10b981', true);
            }
          }

          if (p.isPoisonous) {
            target.poisonTicksLeft = 4;
            target.poisonDamage = 180;
            target.poisonAttackerId = p.ownerId;
          }

          this.applyDamage(target, p.damage, p.ownerId, p.isSuper, p.color);
          this.spawnParticles(p.x, p.y, p.color, 6);
          sound.playHit();

          if (!p.piercing) {
            hitBrawler = true;
            break;
          }
        }
      }

      if (hitBrawler) {
        this.projectiles.splice(i, 1);
      }
    }
  }

  private applyDamage(
    target: BrawlerEntity,
    rawDamage: number,
    attackerId: string,
    isSuper = false,
    color = '#ef4444'
  ) {
    if (!target.isAlive) return;

    let finalDamage = Math.round(rawDamage);

    if (target.shieldTimer > 0) {
      finalDamage = Math.round(finalDamage * (1 - target.shieldRatio));
    }

    target.hp -= finalDamage;
    target.hitFlashTimer = 0.12; // White cartoon hit flash!
    this.spawnDamageNumber(target.x, target.y - 25, `${finalDamage}`, color);

    if (attackerId === this.player.id && !target.isPlayer) {
      this.pendingDamageToSend.push({
        id: `dmg_${Date.now()}_${Math.random()}`,
        targetId: target.id,
        damage: finalDamage,
      });
    }

    if (target.isPlayer) {
      this.playerCombatTimer = 0;
      this.camera.shake = Math.min(12, this.camera.shake + 5);
    }

    if (target.hp <= 0) {
      target.hp = 0;
      target.isAlive = false;
      this.spawnParticles(target.x, target.y, '#ef4444', 30);
      sound.playElimination();

      const cubesToDrop = Math.max(2, target.powerCubes + 1);
      this.spawnPowerCubes(target.x, target.y, cubesToDrop);

      const killer = this.brawlers.find((b) => b.id === attackerId);
      if (killer) {
        killer.kills++;
      }

      const killerName = killer ? killer.name : 'Tempesta Velenosa';
      const killEntry: KillFeedEntry = {
        id: `kill_${Date.now()}_${Math.random()}`,
        killerName,
        victimName: target.name,
        brawlerId: target.brawlerId,
        time: Date.now(),
      };
      this.callbacks.onKillFeed(killEntry);

      if (attackerId === this.player.id) {
        this.pendingKillsToSend.push({
          id: killEntry.id,
          killerId: this.player.id,
          killerName: this.player.name,
          victimId: target.id,
          victimName: target.name,
          timestamp: Date.now(),
        });
      }

      const aliveCount = this.brawlers.filter((b) => b.isAlive).length;
      this.callbacks.onAliveChange(aliveCount);

      if (target.isPlayer) {
        const placement = aliveCount + 1;
        this.callbacks.onGameOver(placement, target.kills, target.powerCubes);
      } else if (aliveCount === 1) {
        const winner = this.brawlers.find((b) => b.isAlive);
        if (winner && winner.isPlayer) {
          sound.playVictory();
          this.callbacks.onGameOver(1, winner.kills, winner.powerCubes);
        }
      }
    }
  }

  // --- POWER CUBES ---
  private spawnPowerCubes(x: number, y: number, count: number) {
    for (let i = 0; i < count; i++) {
      const angle = (i * 2 * Math.PI) / count + Math.random() * 0.5;
      const speed = 2.5 + Math.random() * 2;
      this.powerCubes.push({
        id: `cube_${Date.now()}_${i}_${Math.random()}`,
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        collected: false,
      });
    }
  }

  private updatePowerCubes(dt: number) {
    for (let i = this.powerCubes.length - 1; i >= 0; i--) {
      const cube = this.powerCubes[i];
      cube.x += cube.vx;
      cube.y += cube.vy;
      cube.vx *= 0.92;
      cube.vy *= 0.92;

      for (const brawler of this.brawlers) {
        if (!brawler.isAlive || brawler.isLeaping) continue;
        const dist = Math.hypot(brawler.x - cube.x, brawler.y - cube.y);
        if (dist < 130) {
          cube.x += ((brawler.x - cube.x) / dist) * 7;
          cube.y += ((brawler.y - cube.y) / dist) * 7;
        }

        if (dist <= brawler.radius + 14) {
          brawler.powerCubes++;
          brawler.maxHp += 400;
          brawler.hp = Math.min(brawler.maxHp, brawler.hp + 400);

          this.spawnParticles(cube.x, cube.y, '#10b981', 12);
          this.spawnDamageNumber(brawler.x, brawler.y - 35, '+1 CUBO ⚡', '#10b981', true);
          if (brawler.isPlayer) {
            sound.playPowerCube();
            this.pendingCollectedItems.push(cube.id);
          }

          this.powerCubes.splice(i, 1);
          break;
        }
      }
    }
  }

  // --- PARTICLES & DAMAGE NUMBERS ---
  private spawnParticles(x: number, y: number, color: string, count: number) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 4;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color,
        radius: 2 + Math.random() * 4,
        life: 0,
        maxLife: 0.35 + Math.random() * 0.35,
        alpha: 1,
      });
    }
  }

  private updateParticles(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.95;
      p.vy *= 0.95;
      p.life += dt;
      p.alpha = 1 - p.life / p.maxLife;

      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1);
      }
    }
  }

  private spawnDamageNumber(x: number, y: number, text: string, color: string, isHeal = false) {
    this.damageNumbers.push({
      id: `dmg_${Date.now()}_${Math.random()}`,
      x: x + (Math.random() - 0.5) * 20,
      y,
      text,
      color,
      scale: isHeal ? 1.3 : 1.1,
      life: 0,
      isHeal,
    });
  }

  private updateDamageNumbers(dt: number) {
    for (let i = this.damageNumbers.length - 1; i >= 0; i--) {
      const d = this.damageNumbers[i];
      d.y -= 40 * dt;
      d.life += dt * 1.5;
      if (d.life >= 1) {
        this.damageNumbers.splice(i, 1);
      }
    }
  }

  // --- COLLISION ---
  private moveEntityWithCollision(entity: BrawlerEntity, dx: number, dy: number) {
    const newX = entity.x + dx;
    const newY = entity.y + dy;

    const r = entity.radius;
    const clampedX = Math.max(r + 40, Math.min(this.mapData.width - r - 40, newX));
    const clampedY = Math.max(r + 40, Math.min(this.mapData.height - r - 40, newY));

    let canMoveX = true;
    let canMoveY = true;

    for (const obs of this.obstacles) {
      if (this.circleIntersectsRect(clampedX, entity.y, r, obs)) canMoveX = false;
      if (this.circleIntersectsRect(entity.x, clampedY, r, obs)) canMoveY = false;
    }

    for (const box of this.powerBoxes) {
      if (box.isDestroyed) continue;
      if (this.circleIntersectsRect(clampedX, entity.y, r, box)) canMoveX = false;
      if (this.circleIntersectsRect(entity.x, clampedY, r, box)) canMoveY = false;
    }

    if (canMoveX) entity.x = clampedX;
    if (canMoveY) entity.y = clampedY;
  }

  private circleIntersectsRect(cx: number, cy: number, cr: number, rect: { x: number; y: number; width: number; height: number }) {
    const closestX = Math.max(rect.x, Math.min(cx, rect.x + rect.width));
    const closestY = Math.max(rect.y, Math.min(cy, rect.y + rect.height));
    const distX = cx - closestX;
    const distY = cy - closestY;
    return distX * distX + distY * distY < cr * cr;
  }

  private isInsideBush(x: number, y: number): boolean {
    for (const b of this.mapData.bushes) {
      if (x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height) {
        return true;
      }
    }
    return false;
  }

  private findNearestBush(x: number, y: number) {
    let nearest = null;
    let minDist = Infinity;
    for (const b of this.mapData.bushes) {
      const dist = Math.hypot(b.x + b.width / 2 - x, b.y + b.height / 2 - y);
      if (dist < minDist) {
        minDist = dist;
        nearest = b;
      }
    }
    return nearest;
  }

  private destroyWallsInRadius(x: number, y: number, radius: number) {
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const obs = this.obstacles[i];
      if (!obs.destructible) continue;
      const ox = obs.x + obs.width / 2;
      const oy = obs.y + obs.height / 2;
      if (Math.hypot(ox - x, oy - y) <= radius + 25) {
        this.spawnParticles(ox, oy, '#78350f', 12);
        this.obstacles.splice(i, 1);
      }
    }
  }

  private updateCamera(dt: number) {
    this.camera.targetX = this.player.x;
    this.camera.targetY = this.player.y;

    const lerpSpeed = 8;
    this.camera.x += (this.camera.targetX - this.camera.x) * lerpSpeed * dt;
    this.camera.y += (this.camera.targetY - this.camera.y) * lerpSpeed * dt;

    // Smooth FOV Zoom transition
    this.camera.zoom += (this.camera.targetZoom - this.camera.zoom) * 8 * dt;

    if (this.camera.shake > 0) {
      this.camera.shake -= dt * 25;
      if (this.camera.shake < 0) this.camera.shake = 0;
    }
  }

  // --- CARTOON RENDERING SYSTEM ---
  private render() {
    const { ctx, canvas } = this;
    const width = canvas.width;
    const height = canvas.height;

    ctx.fillStyle = '#0a0e1a';
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    const shakeX = (Math.random() - 0.5) * this.camera.shake;
    const shakeY = (Math.random() - 0.5) * this.camera.shake;
    ctx.translate(width / 2 + shakeX, height / 2 + shakeY);
    ctx.scale(this.camera.zoom, this.camera.zoom);
    ctx.translate(-this.camera.x, -this.camera.y);

    // 1. Stylized Cartoon Arena Ground
    this.renderGround(ctx);

    // 2. Bushes
    this.renderBushes(ctx);

    // 3. Obstacles, Boxes, Power Cubes, and Tactical Power-Ups
    this.renderObstacles(ctx);
    this.renderPowerBoxes(ctx);
    this.renderPowerCubes(ctx);
    this.renderPowerUps(ctx);

    // 4. Projectiles
    this.renderProjectiles(ctx);

    // 5. Brawlers with Cartoon Walking & Recoil Animations + OVERHEAD HEALTH BARS
    this.renderBrawlers(ctx);

    // 6. Aiming Trajectory
    if (this.player.isAlive) {
      this.renderPlayerAimIndicator(ctx);
    }

    // 7. Particles
    this.renderParticles(ctx);

    // 8. Comic Damage Numbers
    this.renderDamageNumbers(ctx);

    // 9. Poison Storm Zone
    this.renderPoisonZone(ctx);

    ctx.restore();
  }

  private renderGround(ctx: CanvasRenderingContext2D) {
    const mapW = this.mapData.width;
    const mapH = this.mapData.height;

    // Rich cartoon desert ground
    ctx.fillStyle = '#243048';
    ctx.fillRect(0, 0, mapW, mapH);

    // Cartoon hex / cobblestone pattern
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2;
    const step = 80;
    ctx.beginPath();
    for (let x = 0; x <= mapW; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, mapH);
    }
    for (let y = 0; y <= mapH; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(mapW, y);
    }
    ctx.stroke();

    // Stylized flower clumps and grass tufts scattered around
    ctx.fillStyle = '#3b82f6';
    for (let i = 120; i < mapW; i += 240) {
      for (let j = 120; j < mapH; j += 240) {
        ctx.beginPath();
        ctx.arc(i + 15, j + 20, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Central Arena Decal
    const cx = mapW / 2;
    const cy = mapH / 2;
    ctx.save();
    ctx.fillStyle = 'rgba(234, 179, 8, 0.12)';
    ctx.beginPath();
    ctx.arc(cx, cy, 260, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(234, 179, 8, 0.4)';
    ctx.lineWidth = 6;
    ctx.setLineDash([20, 16]);
    ctx.stroke();

    // Star icon in center
    ctx.font = '72px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(234, 179, 8, 0.3)';
    ctx.fillText('⭐', cx, cy);
    ctx.restore();
  }

  private renderBushes(ctx: CanvasRenderingContext2D) {
    for (const b of this.mapData.bushes) {
      // Lush cartoon tall grass with round leafy tufts
      ctx.fillStyle = '#15803d';
      ctx.beginPath();
      ctx.roundRect(b.x, b.y, b.width, b.height, 16);
      ctx.fill();

      // Bright cartoon grass leaves
      ctx.fillStyle = '#22c55e';
      const step = 22;
      for (let gx = b.x + 8; gx < b.x + b.width - 8; gx += step) {
        for (let gy = b.y + 8; gy < b.y + b.height - 8; gy += step) {
          ctx.beginPath();
          ctx.arc(gx, gy, 7, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Dark comic border
      ctx.strokeStyle = '#052e16';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }

  private renderObstacles(ctx: CanvasRenderingContext2D) {
    for (const obs of this.obstacles) {
      if (obs.type === 'stone') {
        // 3D Cartoon Stone Block
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.roundRect(obs.x + 3, obs.y + 7, obs.width, obs.height, 10);
        ctx.fill();

        ctx.fillStyle = '#475569';
        ctx.beginPath();
        ctx.roundRect(obs.x, obs.y + 5, obs.width, obs.height - 5, 10);
        ctx.fill();

        ctx.fillStyle = '#64748b';
        ctx.beginPath();
        ctx.roundRect(obs.x, obs.y, obs.width, obs.height - 6, 10);
        ctx.fill();

        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3.5;
        ctx.stroke();
      } else if (obs.type === 'wood_box') {
        // Cartoon Destructible Wood Crate
        ctx.fillStyle = '#78350f';
        ctx.fillRect(obs.x, obs.y + 6, obs.width, obs.height - 6);

        ctx.fillStyle = '#d97706';
        ctx.fillRect(obs.x, obs.y, obs.width, obs.height - 6);

        ctx.strokeStyle = '#451a03';
        ctx.lineWidth = 3.5;
        ctx.strokeRect(obs.x, obs.y, obs.width, obs.height);
        ctx.beginPath();
        ctx.moveTo(obs.x, obs.y);
        ctx.lineTo(obs.x + obs.width, obs.y + obs.height);
        ctx.moveTo(obs.x + obs.width, obs.y);
        ctx.lineTo(obs.x, obs.y + obs.height);
        ctx.stroke();
      } else if (obs.type === 'water') {
        // Cartoon Water Pond with ripples
        ctx.fillStyle = '#0284c7';
        ctx.beginPath();
        ctx.roundRect(obs.x, obs.y, obs.width, obs.height, 16);
        ctx.fill();
        ctx.strokeStyle = '#075985';
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.beginPath();
        ctx.ellipse(obs.x + obs.width * 0.4, obs.y + obs.height * 0.35, 18, 6, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private renderPowerBoxes(ctx: CanvasRenderingContext2D) {
    for (const box of this.powerBoxes) {
      if (box.isDestroyed) continue;

      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath();
      ctx.ellipse(box.x + box.width / 2, box.y + box.height + 4, 22, 8, 0, 0, Math.PI * 2);
      ctx.fill();

      // Cartoon Power Box Body
      ctx.fillStyle = '#1e3a8a';
      ctx.fillRect(box.x, box.y + 6, box.width, box.height - 6);
      ctx.fillStyle = '#3b82f6';
      ctx.fillRect(box.x, box.y, box.width, box.height - 6);

      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(box.x + box.width / 2, box.y + box.height / 2 - 2, 9, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3.5;
      ctx.strokeRect(box.x, box.y, box.width, box.height);

      // HP Bar over Box
      const hpPct = Math.max(0, box.hp / box.maxHp);
      const barW = box.width + 12;
      const barH = 6;
      const barX = box.x - 6;
      const barY = box.y - 14;

      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.roundRect(barX - 1, barY - 1, barW + 2, barH + 2, 4);
      ctx.fill();

      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.roundRect(barX, barY, barW * hpPct, barH, 3);
      ctx.fill();
    }
  }

  private renderPowerCubes(ctx: CanvasRenderingContext2D) {
    for (const cube of this.powerCubes) {
      ctx.save();
      ctx.translate(cube.x, cube.y);
      ctx.shadowColor = '#10b981';
      ctx.shadowBlur = 14;

      ctx.fillStyle = '#059669';
      ctx.fillRect(-11, -7, 22, 18);
      ctx.fillStyle = '#34d399';
      ctx.fillRect(-11, -11, 22, 18);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-4, -7, 8, 8);

      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3;
      ctx.strokeRect(-11, -11, 22, 22);
      ctx.restore();
    }
  }

  // Tactical In-Match Power-Ups (Speed, Shield, Double Damage, Heal, Super)
  private renderPowerUps(ctx: CanvasRenderingContext2D) {
    for (const pu of this.powerUps) {
      if (pu.collected) continue;

      ctx.save();
      const bobOffset = Math.sin(pu.bobTimer) * 6;
      ctx.translate(pu.x, pu.y + bobOffset);

      // Ground beacon ring
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(0, 18 - bobOffset, 18, 6, 0, 0, Math.PI * 2);
      ctx.fill();

      let badgeBg = '#38bdf8';
      let icon = '⚡';
      if (pu.type === 'shield') {
        badgeBg = '#a855f7';
        icon = '🛡️';
      } else if (pu.type === 'damage') {
        badgeBg = '#ef4444';
        icon = '💥';
      } else if (pu.type === 'heal') {
        badgeBg = '#22c55e';
        icon = '💚';
      } else if (pu.type === 'super') {
        badgeBg = '#eab308';
        icon = '🌟';
      }

      ctx.shadowColor = badgeBg;
      ctx.shadowBlur = 18;

      // Outer circle orb
      ctx.fillStyle = badgeBg;
      ctx.beginPath();
      ctx.arc(0, 0, pu.radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Icon
      ctx.font = '16px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(icon, 0, 1);

      ctx.restore();
    }
  }

  private renderProjectiles(ctx: CanvasRenderingContext2D) {
    for (const p of this.projectiles) {
      ctx.save();
      ctx.translate(p.x, p.y);
      const angle = Math.atan2(p.vy, p.vx);
      ctx.rotate(angle);

      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = p.isSuper ? 16 : 8;

      if (p.bulletType === 'sonic') {
        ctx.beginPath();
        ctx.arc(0, 0, p.radius, -Math.PI / 3, Math.PI / 3);
        ctx.lineWidth = p.isSuper ? 14 : 8;
        ctx.strokeStyle = p.color;
        ctx.stroke();
      } else if (p.bulletType === 'punch') {
        ctx.beginPath();
        ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.stroke();
      } else if (p.bulletType === 'poison') {
        ctx.beginPath();
        ctx.moveTo(p.radius * 2, 0);
        ctx.lineTo(-p.radius, -p.radius);
        ctx.lineTo(-p.radius, p.radius);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.ellipse(0, 0, p.radius * 1.5, p.radius, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(2, 0, p.radius * 0.7, p.radius * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  // --- CARTOON BRAWLER RENDERING WITH WALKING ANIMATION & OVERHEAD HEALTH/AMMO BARS ---
  private renderBrawlers(ctx: CanvasRenderingContext2D) {
    for (const brawler of this.brawlers) {
      if (!brawler.isAlive) continue;

      const playerDist = Math.hypot(brawler.x - this.player.x, brawler.y - this.player.y);
      const isHiddenFromPlayer =
        !brawler.isPlayer &&
        brawler.isInBush &&
        (!this.player.isInBush || playerDist > 85);

      if (isHiddenFromPlayer) continue;

      ctx.save();

      if (brawler.isInBush) {
        ctx.globalAlpha = brawler.isPlayer ? 0.65 : 0.8;
      }

      let heightOffset = 0;
      if (brawler.isLeaping) {
        heightOffset = Math.sin(brawler.leapProgress * Math.PI) * 120;
      }

      // Animated squash and stretch when running
      let scaleX = 1;
      let scaleY = 1;
      let bobY = 0;
      if (brawler.isMoving && !brawler.isLeaping) {
        scaleX = 1 + Math.sin(brawler.walkCycle) * 0.08;
        scaleY = 1 - Math.sin(brawler.walkCycle) * 0.08;
        bobY = -Math.abs(Math.sin(brawler.walkCycle)) * 4;
      }

      // Recoil displacement (kicking back opposite rotation)
      const recoilX = -Math.cos(brawler.rotation) * brawler.recoilOffset;
      const recoilY = -Math.sin(brawler.rotation) * brawler.recoilOffset;

      const drawX = brawler.x + recoilX;
      const drawY = brawler.y + recoilY - heightOffset + bobY;

      // 1. Drop shadow
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath();
      ctx.ellipse(brawler.x, brawler.y + 6, brawler.radius * 1.15 * scaleX, brawler.radius * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();

      // 2. Active Power-Up Auras (Shield bubble, Double Damage fire ring, Speed sparks)
      if (brawler.shieldTimer > 0) {
        ctx.save();
        ctx.strokeStyle = '#c084fc';
        ctx.lineWidth = 4;
        ctx.shadowColor = '#a855f7';
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.arc(drawX, drawY, brawler.radius + 12, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      if (brawler.doubleDamageTimer > 0) {
        ctx.save();
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 3;
        ctx.shadowColor = '#dc2626';
        ctx.shadowBlur = 12;
        ctx.setLineDash([8, 8]);
        ctx.beginPath();
        ctx.arc(drawX, drawY, brawler.radius + 10, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // 3. Cartoon Character Body
      ctx.save();
      ctx.translate(drawX, drawY);
      ctx.scale(scaleX, scaleY);

      const def = BRAWLERS[brawler.brawlerId];

      // White hit flash if damaged recently
      ctx.fillStyle = brawler.hitFlashTimer > 0 ? '#ffffff' : def.color;
      ctx.beginPath();
      ctx.arc(0, 0, brawler.radius, 0, Math.PI * 2);
      ctx.fill();

      // Thick black comic outline
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = brawler.isPlayer ? 4.5 : 3.5;
      ctx.stroke();

      // Highlight sheen
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath();
      ctx.arc(-brawler.radius * 0.3, -brawler.radius * 0.3, brawler.radius * 0.5, 0, Math.PI * 2);
      ctx.fill();

      // Weapon barrel pointing in rotation direction
      const barrelLen = brawler.radius + 14;
      const bx = Math.cos(brawler.rotation) * barrelLen;
      const by = Math.sin(brawler.rotation) * barrelLen;
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(bx, by);
      ctx.stroke();

      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(bx, by);
      ctx.stroke();

      // Character Avatar Emoji
      ctx.font = '22px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(def.avatarEmoji, 0, 0);

      ctx.restore(); // restore brawler transform

      // 4. OVERHEAD HEALTH BAR & AMMO BARS (directly attached above each player in game!)
      if (!brawler.isLeaping) {
        this.renderOverheadHealthAndAmmo(ctx, brawler, drawX, drawY - brawler.radius - 16);
      }

      ctx.restore();
    }
  }

  // OVERHEAD HEALTH BAR & 3 AMMO BARS (Requested: "sistema la vita e mettila sopra il giocatore nel gioco e non come gui")
  private renderOverheadHealthAndAmmo(
    ctx: CanvasRenderingContext2D,
    brawler: BrawlerEntity,
    x: number,
    y: number
  ) {
    const isPlayer = brawler.isPlayer;
    const isRemote = brawler.isRemotePlayer;
    const barW = isPlayer ? 78 : 62;
    const barH = isPlayer ? 10 : 8;
    const barX = x - barW / 2;
    const barY = y;

    // Platform symbol and player name
    const platformSymbol = brawler.platform === 'pc' ? '💻' : brawler.platform === 'tablet' ? '📱' : '📱';
    const nameText = `${platformSymbol} ${brawler.name}`;

    ctx.font = `bold ${isPlayer ? 12 : 11}px 'Rowdies', 'Outfit', system-ui`;
    ctx.textAlign = 'center';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3.5;
    ctx.strokeText(nameText, x, barY - 14);
    ctx.fillStyle = isPlayer ? '#67e8f9' : isRemote ? '#f59e0b' : '#ffffff';
    ctx.fillText(nameText, x, barY - 14);

    if (isRemote) {
      ctx.font = "bold 9px 'Rowdies', 'Outfit', system-ui";
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2.5;
      ctx.strokeText('👑 REALE', x, barY - 26);
      ctx.fillStyle = '#fbbf24';
      ctx.fillText('👑 REALE', x, barY - 26);
    }

    // Active power-up indicator tag over head
    if (brawler.speedBoostTimer > 0) {
      ctx.fillText('⚡', x + barW / 2 + 10, barY - 14);
    } else if (brawler.shieldTimer > 0) {
      ctx.fillText('🛡️', x + barW / 2 + 10, barY - 14);
    } else if (brawler.doubleDamageTimer > 0) {
      ctx.fillText('💥', x + barW / 2 + 10, barY - 14);
    }

    // --- HEALTH BAR ---
    const hpPct = Math.max(0, Math.min(1, brawler.hp / brawler.maxHp));

    // Outer dark pill background with thick 3D border
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.roundRect(barX - 2, barY - 2, barW + 4, barH + 4, 6);
    ctx.fill();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Color gradient based on health
    let hpColor = '#22c55e';
    if (hpPct < 0.28) hpColor = '#ef4444';
    else if (hpPct < 0.58) hpColor = '#eab308';

    ctx.fillStyle = hpColor;
    ctx.beginPath();
    ctx.roundRect(barX, barY, Math.max(0, barW * hpPct), barH, 4);
    ctx.fill();

    // Exact HP Numbers inside bar (crisp comic font!)
    ctx.font = `bold ${isPlayer ? 9 : 8}px 'Outfit', system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2.5;
    const hpText = `${Math.round(brawler.hp)} / ${brawler.maxHp}`;
    ctx.strokeText(hpText, x, barY + barH / 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(hpText, x, barY + barH / 2);

    // --- 3 AMMO BARS (SLOTS) BENEATH HEALTH BAR ---
    // (Requested: "fai in modo che i colpi una volta che vengano usati, scendano")
    const ammoSlotGap = 2;
    const ammoSlotW = (barW - ammoSlotGap * 2) / 3;
    const ammoSlotH = isPlayer ? 4.5 : 3.5;
    const ammoY = barY + barH + 3;

    for (let s = 0; s < 3; s++) {
      const slotX = barX + s * (ammoSlotW + ammoSlotGap);

      // Slot background (empty / used state)
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.roundRect(slotX, ammoY, ammoSlotW, ammoSlotH, 2);
      ctx.fill();
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      if (s < brawler.ammo) {
        // Slot is full: solid bright orange cartoon pill
        ctx.fillStyle = '#f97316';
        ctx.beginPath();
        ctx.roundRect(slotX, ammoY, ammoSlotW, ammoSlotH, 2);
        ctx.fill();

        // Top highlight
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fillRect(slotX + 1, ammoY, ammoSlotW - 2, 1);
      } else if (s === brawler.ammo) {
        // Current reloading slot: refills smoothly from 0% to 100%!
        const fillW = Math.max(0, ammoSlotW * brawler.ammoProgress);
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.roundRect(slotX, ammoY, fillW, ammoSlotH, 2);
        ctx.fill();
      }
    }

    // Power Cubes badge on left of bar
    if (brawler.powerCubes > 0) {
      const badgeX = barX - 16;
      const badgeY = barY + barH / 2;
      ctx.fillStyle = '#059669';
      ctx.beginPath();
      ctx.arc(badgeX, badgeY, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${brawler.powerCubes}`, badgeX, badgeY);
    }
  }

  // Trajectory aiming reticle
  private renderPlayerAimIndicator(ctx: CanvasRenderingContext2D) {
    if (!this.aimVector.isAiming && !this.aimVector.isSuperAiming) return;

    const p = this.player;
    const def = BRAWLERS[p.brawlerId];
    const isSuper = this.aimVector.isSuperAiming;
    const range = isSuper ? def.superRange : def.attackRange;
    const angle = p.rotation;
    const color = isSuper ? '#eab308' : '#ef4444';

    ctx.save();
    ctx.translate(p.x, p.y);

    if (isSuper && def.superType === 'leap') {
      const targetDist = Math.min(range, Math.hypot(this.aimVector.x, this.aimVector.y) * 4);
      const tx = Math.cos(angle) * targetDist;
      const ty = Math.sin(angle) * targetDist;

      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 8]);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(tx, ty);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(234, 179, 8, 0.25)';
      ctx.beginPath();
      ctx.arc(tx, ty, def.superRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.stroke();
    } else {
      const spread = def.attackSpread;
      ctx.fillStyle = isSuper ? 'rgba(234, 179, 8, 0.2)' : 'rgba(239, 68, 68, 0.2)';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, range, angle - spread / 2, angle + spread / 2);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([10, 6]);
      ctx.stroke();
    }

    ctx.restore();
  }

  private renderParticles(ctx: CanvasRenderingContext2D) {
    for (const p of this.particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private renderDamageNumbers(ctx: CanvasRenderingContext2D) {
    for (const d of this.damageNumbers) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - d.life);
      ctx.font = `bold ${Math.round(20 * d.scale)}px 'Rowdies', 'Outfit', sans-serif`;
      ctx.textAlign = 'center';

      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 4.5;
      ctx.strokeText(d.text, d.x, d.y);

      ctx.fillStyle = d.color;
      ctx.fillText(d.text, d.x, d.y);
      ctx.restore();
    }
  }

  private renderPoisonZone(ctx: CanvasRenderingContext2D) {
    const cx = this.poisonZone.centerX;
    const cy = this.poisonZone.centerY;
    const r = this.poisonZone.currentRadius;

    ctx.save();
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 6;
    ctx.shadowColor = '#4ade80';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = 'rgba(22, 101, 52, 0.38)';
    ctx.beginPath();
    ctx.rect(0, 0, this.mapData.width, this.mapData.height);
    ctx.arc(cx, cy, r, 0, Math.PI * 2, true);
    ctx.fill();
    ctx.restore();
  }

  // --- MULTIPLAYER SYNCHRONIZATION METHODS ---
  private addProjectile(proj: Projectile) {
    this.projectiles.push(proj);
    if (proj.ownerId === this.player.id) {
      this.pendingProjectilesToSend.push({
        id: proj.id,
        ownerId: proj.ownerId,
        x: Math.round(proj.x),
        y: Math.round(proj.y),
        vx: proj.vx,
        vy: proj.vy,
        bulletType: proj.bulletType,
        color: proj.color,
        radius: proj.radius,
        damage: proj.damage,
        isSuper: proj.isSuper,
      });
    }
  }

  public handleRemoteState(payload: any) {
    if (!payload || payload.playerId === this.player.id) return;

    let target = this.brawlers.find((b) => b.id === payload.playerId);
    if (!target) {
      target = this.brawlers.find((b) => !b.isPlayer && !b.isRemotePlayer);
      if (target) {
        target.id = payload.playerId;
        target.name = payload.name || target.name;
        target.brawlerId = payload.brawlerId || target.brawlerId;
        target.platform = payload.platform || target.platform;
      }
    }

    if (target) {
      target.isRemotePlayer = true;
      target.x += (payload.x - target.x) * 0.45;
      target.y += (payload.y - target.y) * 0.45;
      if (typeof payload.rotation === 'number') target.rotation = payload.rotation;
      if (typeof payload.hp === 'number') target.hp = payload.hp;
      if (typeof payload.maxHp === 'number') target.maxHp = payload.maxHp;
      if (typeof payload.ammo === 'number') target.ammo = payload.ammo;
      if (typeof payload.powerCubes === 'number') target.powerCubes = payload.powerCubes;
      if (typeof payload.isAlive === 'boolean') target.isAlive = payload.isAlive;
      if (typeof payload.isMoving === 'boolean') target.isMoving = payload.isMoving;
      if (typeof payload.walkCycle === 'number') target.walkCycle = payload.walkCycle;
      if (payload.hitFlash) target.hitFlashTimer = 0.12;

      if (Array.isArray(payload.newProjectiles)) {
        for (const p of payload.newProjectiles) {
          if (!this.projectiles.some((existing) => existing.id === p.id)) {
            const def = BRAWLERS[target.brawlerId];
            this.projectiles.push({
              id: p.id,
              ownerId: target.id,
              isSuper: p.isSuper || false,
              brawlerId: target.brawlerId,
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
    }
  }

  private updateMultiplayerSync(dt: number) {
    this.multiplayerSyncTimer += dt;
    if (this.multiplayerSyncTimer < 0.065) return; // ~15 updates per second
    this.multiplayerSyncTimer = 0;

    // If host, package alive bots to keep them authoritative for non-hosts
    const botStates = this.isHost
      ? this.brawlers
          .filter((b) => !b.isPlayer && !b.isRemotePlayer)
          .map((b) => ({
            id: b.id,
            x: Math.round(b.x),
            y: Math.round(b.y),
            rotation: Number(b.rotation.toFixed(3)),
            hp: Math.round(b.hp),
            maxHp: b.maxHp,
            ammo: b.ammo,
            powerCubes: b.powerCubes,
            isAlive: b.isAlive,
            isMoving: b.isMoving,
            walkCycle: Number(b.walkCycle.toFixed(2)),
          }))
      : [];

    const localPayload = {
      roomId: this.roomId,
      playerId: this.player.id,
      name: this.player.name,
      brawlerId: this.player.brawlerId,
      platform: this.player.platform,
      x: Math.round(this.player.x),
      y: Math.round(this.player.y),
      rotation: Number(this.player.rotation.toFixed(3)),
      hp: Math.round(this.player.hp),
      maxHp: this.player.maxHp,
      ammo: this.player.ammo,
      powerCubes: this.player.powerCubes,
      isAlive: this.player.isAlive,
      isMoving: this.player.isMoving,
      walkCycle: Number(this.player.walkCycle.toFixed(2)),
      hitFlash: this.player.hitFlashTimer > 0,
      newProjectiles: this.pendingProjectilesToSend.splice(0),
      damageEvents: this.pendingDamageToSend.splice(0),
      killEvents: this.pendingKillsToSend.splice(0),
      destroyedBoxes: this.pendingDestroyedBoxes.splice(0),
      collectedItems: this.pendingCollectedItems.splice(0),
      isHost: this.isHost,
      botStates,
    };

    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage({
          type: 'STATE_SYNC',
          payload: localPayload,
        });
      } catch (_) {}
    }

    if (!this.isSyncingWithServer) {
      this.isSyncingWithServer = true;
      const reqStart = performance.now();

      fetch('/api/match/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(localPayload),
      })
        .then((r) => r.json())
        .then((data) => {
          this.isSyncingWithServer = false;
          if (!data || !data.success) return;

          // Latency ping calculation
          this.pingMs = Math.round(performance.now() - reqStart);
          this.callbacks.onPingChange?.(this.pingMs);

          // 1. Sync remote human players
          if (Array.isArray(data.otherPlayers)) {
            for (const remote of data.otherPlayers) {
              this.handleRemoteState({
                playerId: remote.id,
                name: remote.name,
                brawlerId: remote.brawlerId,
                platform: remote.platform,
                x: remote.x,
                y: remote.y,
                rotation: remote.rotation,
                hp: remote.hp,
                maxHp: remote.maxHp,
                ammo: remote.ammo,
                powerCubes: remote.powerCubes,
                isAlive: remote.isAlive,
                isMoving: remote.isMoving,
                walkCycle: remote.walkCycle,
                hitFlash: remote.hitFlash,
              });
            }
          }

          // 2. For non-hosts: interpolate synced bots from host
          if (!this.isHost && Array.isArray(data.syncedBots)) {
            for (const synced of data.syncedBots) {
              const bot = this.brawlers.find((b) => b.id === synced.id);
              if (bot) {
                bot.x += (synced.x - bot.x) * 0.45;
                bot.y += (synced.y - bot.y) * 0.45;
                bot.rotation = synced.rotation;
                bot.hp = synced.hp;
                bot.maxHp = synced.maxHp;
                bot.ammo = synced.ammo;
                bot.powerCubes = synced.powerCubes;
                bot.isAlive = synced.isAlive;
                bot.isMoving = synced.isMoving;
                bot.walkCycle = synced.walkCycle;
              }
            }
          }

          // 3. Sync remote projectiles
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

          // 4. Sync destroyed boxes across clients
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

          // 5. Sync collected items across clients
          if (Array.isArray(data.collectedItems)) {
            for (const itemId of data.collectedItems) {
              const pIdx = this.powerUps.findIndex((pu) => pu.id === itemId);
              if (pIdx !== -1) {
                this.powerUps.splice(pIdx, 1);
              }
              const cIdx = this.powerCubes.findIndex((c) => c.id === itemId);
              if (cIdx !== -1) {
                this.powerCubes.splice(cIdx, 1);
              }
            }
          }

          // 6. Relevant damage applied to player or local entities
          if (Array.isArray(data.relevantDamage)) {
            for (const dmg of data.relevantDamage) {
              if (dmg.timestamp > this.lastProcessedDamageTime) {
                this.lastProcessedDamageTime = dmg.timestamp;
                const target = this.brawlers.find((b) => b.id === dmg.targetId);
                if (target) {
                  this.applyDamage(target, dmg.damage, dmg.attackerId, false, dmg.color || '#ef4444');
                }
              }
            }
          }

          // 7. Update alive count
          const liveCount = this.brawlers.filter((b) => b.isAlive).length;
          this.callbacks.onAliveChange(liveCount);
        })
        .catch(() => {
          this.isSyncingWithServer = false;
        });
    }
  }
}
