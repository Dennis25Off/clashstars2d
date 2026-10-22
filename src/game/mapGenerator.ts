import { BushZone, MapObstacle, PowerBox, PowerUpType } from '../types/game';

export interface MapData {
  width: number;
  height: number;
  obstacles: MapObstacle[];
  bushes: BushZone[];
  powerBoxes: PowerBox[];
  spawnPoints: { x: number; y: number }[];
  powerUpSpawns: { x: number; y: number; type: PowerUpType }[];
}

export function generateBattleRoyaleMap(): MapData {
  const width = 2400;
  const height = 2400;
  const obstacles: MapObstacle[] = [];
  const bushes: BushZone[] = [];
  const powerBoxes: PowerBox[] = [];

  // 1. Surrounding boundaries (solid walls)
  const wallThick = 40;
  obstacles.push({ x: 0, y: 0, width, height: wallThick, type: 'stone', destructible: false });
  obstacles.push({ x: 0, y: height - wallThick, width, height: wallThick, type: 'stone', destructible: false });
  obstacles.push({ x: 0, y: 0, width: wallThick, height, type: 'stone', destructible: false });
  obstacles.push({ x: width - wallThick, y: 0, width: wallThick, height, type: 'stone', destructible: false });

  // 2. Central Arena Structure (The Brawl Stars iconic center with 4 crates and bushes)
  const cx = width / 2;
  const cy = height / 2;

  // Center cross walls (destructible by supers)
  obstacles.push({ x: cx - 180, y: cy - 180, width: 70, height: 70, type: 'stone', destructible: true, hp: 1000 });
  obstacles.push({ x: cx + 110, y: cy - 180, width: 70, height: 70, type: 'stone', destructible: true, hp: 1000 });
  obstacles.push({ x: cx - 180, y: cy + 110, width: 70, height: 70, type: 'stone', destructible: true, hp: 1000 });
  obstacles.push({ x: cx + 110, y: cy + 110, width: 70, height: 70, type: 'stone', destructible: true, hp: 1000 });

  // Center destructible wooden crates & stone barricades
  obstacles.push({ x: cx - 25, y: cy - 160, width: 50, height: 50, type: 'wood_box', destructible: true, hp: 400 });
  obstacles.push({ x: cx - 25, y: cy + 110, width: 50, height: 50, type: 'wood_box', destructible: true, hp: 400 });
  obstacles.push({ x: cx - 160, y: cy - 25, width: 50, height: 50, type: 'wood_box', destructible: true, hp: 400 });
  obstacles.push({ x: cx + 110, y: cy - 25, width: 50, height: 50, type: 'wood_box', destructible: true, hp: 400 });

  // Center Power Boxes (Rich loot zone)
  powerBoxes.push({ id: 'box_c1', x: cx - 60, y: cy - 60, width: 44, height: 44, hp: 2500, maxHp: 2500, isDestroyed: false, cubesToDrop: 2 });
  powerBoxes.push({ id: 'box_c2', x: cx + 20, y: cy - 60, width: 44, height: 44, hp: 2500, maxHp: 2500, isDestroyed: false, cubesToDrop: 2 });
  powerBoxes.push({ id: 'box_c3', x: cx - 60, y: cy + 20, width: 44, height: 44, hp: 2500, maxHp: 2500, isDestroyed: false, cubesToDrop: 2 });
  powerBoxes.push({ id: 'box_c4', x: cx + 20, y: cy + 20, width: 44, height: 44, hp: 2500, maxHp: 2500, isDestroyed: false, cubesToDrop: 2 });

  // Center tall bushes
  bushes.push({ x: cx - 220, y: cy - 220, width: 100, height: 100 });
  bushes.push({ x: cx + 120, y: cy - 220, width: 100, height: 100 });
  bushes.push({ x: cx - 220, y: cy + 120, width: 100, height: 100 });
  bushes.push({ x: cx + 120, y: cy + 120, width: 100, height: 100 });

  // 3. Quadrant obstacle clusters (Water ponds, stone walls, destructible barrels)
  const quadrants = [
    { ox: cx - 550, oy: cy - 550 },
    { ox: cx + 550, oy: cy - 550 },
    { ox: cx - 550, oy: cy + 550 },
    { ox: cx + 550, oy: cy + 550 },
  ];

  quadrants.forEach((q, i) => {
    // Stone ruins (destructible by supers)
    obstacles.push({ x: q.ox - 100, y: q.oy - 80, width: 180, height: 40, type: 'stone', destructible: true, hp: 1000 });
    obstacles.push({ x: q.ox - 100, y: q.oy - 40, width: 40, height: 140, type: 'stone', destructible: true, hp: 1000 });

    // Destructible barricades
    obstacles.push({ x: q.ox + 20, y: q.oy + 40, width: 60, height: 60, type: 'wood_box', destructible: true, hp: 400 });

    // Water pool
    obstacles.push({ x: q.ox + 120, y: q.oy - 70, width: 100, height: 130, type: 'water', destructible: false });

    // Bushes surrounding ruins
    bushes.push({ x: q.ox - 160, y: q.oy - 120, width: 140, height: 80 });
    bushes.push({ x: q.ox - 40, y: q.oy + 110, width: 160, height: 90 });

    // Quadrant Power Boxes
    powerBoxes.push({
      id: `box_q_${i}_1`,
      x: q.ox - 40,
      y: q.oy - 20,
      width: 44,
      height: 44,
      hp: 2500,
      maxHp: 2500,
      isDestroyed: false,
      cubesToDrop: 1,
    });
    powerBoxes.push({
      id: `box_q_${i}_2`,
      x: q.ox + 60,
      y: q.oy - 20,
      width: 44,
      height: 44,
      hp: 2500,
      maxHp: 2500,
      isDestroyed: false,
      cubesToDrop: 1,
    });
  });

  // 4. Cardinal Outposts (North, South, East, West)
  const cardinals = [
    { ox: cx, oy: cy - 750, dir: 'N' },
    { ox: cx, oy: cy + 750, dir: 'S' },
    { ox: cx - 750, oy: cy, dir: 'W' },
    { ox: cx + 750, oy: cy, dir: 'E' },
  ];

  cardinals.forEach((c, idx) => {
    // Stone block (destructible by supers)
    obstacles.push({ x: c.ox - 60, y: c.oy - 50, width: 120, height: 100, type: 'stone', destructible: true, hp: 1000 });
    // Bushes
    bushes.push({ x: c.ox - 150, y: c.oy - 80, width: 80, height: 160 });
    bushes.push({ x: c.ox + 70, y: c.oy - 80, width: 80, height: 160 });
    // Power box
    powerBoxes.push({
      id: `box_card_${idx}`,
      x: c.ox - 22,
      y: c.oy - 110,
      width: 44,
      height: 44,
      hp: 2500,
      maxHp: 2500,
      isDestroyed: false,
      cubesToDrop: 1,
    });
  });

  // 5. Outer scattered power boxes
  const outerBoxPositions = [
    { x: cx - 950, y: cy - 950 },
    { x: cx + 950, y: cy - 950 },
    { x: cx - 950, y: cy + 950 },
    { x: cx + 950, y: cy + 950 },
    { x: cx - 350, y: cy - 900 },
    { x: cx + 350, y: cy - 900 },
    { x: cx - 350, y: cy + 900 },
    { x: cx + 350, y: cy + 900 },
    { x: cx - 900, y: cy - 350 },
    { x: cx + 900, y: cy - 350 },
    { x: cx - 900, y: cy + 350 },
    { x: cx + 900, y: cy + 350 },
  ];

  outerBoxPositions.forEach((pos, idx) => {
    powerBoxes.push({
      id: `box_outer_${idx}`,
      x: pos.x - 22,
      y: pos.y - 22,
      width: 44,
      height: 44,
      hp: 2500,
      maxHp: 2500,
      isDestroyed: false,
      cubesToDrop: 1,
    });
    // Add small bush near outer boxes
    bushes.push({
      x: pos.x - 50,
      y: pos.y - 50,
      width: 100,
      height: 100,
    });
  });

  // 6. Symmetrical Spawn Points for 10 Brawlers (distributed in circle radius 920px)
  const spawnPoints: { x: number; y: number }[] = [];
  const spawnRadius = 920;
  for (let i = 0; i < 10; i++) {
    const angle = (i * 2 * Math.PI) / 10 - Math.PI / 2;
    spawnPoints.push({
      x: Math.round(cx + Math.cos(angle) * spawnRadius),
      y: Math.round(cy + Math.sin(angle) * spawnRadius),
    });
  }

  // 7. Tactical Power-Ups Spawns (Speed boots, Shield, Double Damage, Mega Heal, Super Charge)
  const powerUpSpawns: { x: number; y: number; type: PowerUpType }[] = [
    { x: cx - 350, y: cy, type: 'speed' },
    { x: cx + 350, y: cy, type: 'damage' },
    { x: cx, y: cy - 350, type: 'shield' },
    { x: cx, y: cy + 350, type: 'heal' },
    { x: cx - 600, y: cy - 600, type: 'super' },
    { x: cx + 600, y: cy - 600, type: 'damage' },
    { x: cx - 600, y: cy + 600, type: 'speed' },
    { x: cx + 600, y: cy + 600, type: 'shield' },
  ];

  return {
    width,
    height,
    obstacles,
    bushes,
    powerBoxes,
    spawnPoints,
    powerUpSpawns,
  };
}
