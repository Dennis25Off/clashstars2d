import { BrawlerId, ControlsConfig, DEFAULT_CONTROLS_CONFIG, PlayerProfile } from '../types/game';

const STORAGE_KEY = 'clash_stars_profile_v1';

export const INITIAL_PROFILE: PlayerProfile = {
  id: 'player_user_1',
  username: 'StarBrawler',
  platform: 'mobile',
  trophies: 120,
  coins: 850,
  gems: 45,
  tokens: 180, // Enough for at least 1 Brawl Box right away!
  brawlers: {
    blaze: { level: 2, powerPoints: 35, unlocked: true, trophies: 45 },
    viper: { level: 1, powerPoints: 20, unlocked: true, trophies: 50 },
    titan: { level: 1, powerPoints: 15, unlocked: true, trophies: 25 },
    raven: { level: 1, powerPoints: 10, unlocked: true, trophies: 0 },
    harmony: { level: 1, powerPoints: 10, unlocked: true, trophies: 0 },
  },
  selectedBrawler: 'blaze',
  stats: {
    matchesPlayed: 4,
    victories: 2,
    totalKills: 9,
    boxesOpened: 1,
  },
  claimedTrophyRoad: [0, 50],
  controlsConfig: { ...DEFAULT_CONTROLS_CONFIG },
};

export function loadPlayerProfile(): PlayerProfile {
  if (typeof window === 'undefined') return INITIAL_PROFILE;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      savePlayerProfile(INITIAL_PROFILE);
      return INITIAL_PROFILE;
    }
    const parsed = JSON.parse(raw);
    // Ensure all 5 brawlers exist in profile
    const mergedBrawlers = { ...INITIAL_PROFILE.brawlers, ...(parsed.brawlers || {}) };
    const mergedControls: ControlsConfig = {
      ...DEFAULT_CONTROLS_CONFIG,
      ...(parsed.controlsConfig || {}),
      customKeys: {
        ...DEFAULT_CONTROLS_CONFIG.customKeys,
        ...(parsed.controlsConfig?.customKeys || {}),
      },
    };
    const isDesktop = typeof window !== 'undefined' && (!('ontouchstart' in window) || window.matchMedia?.('(pointer: fine)')?.matches);
    const detectedPlatform = parsed.platform || (isDesktop ? 'pc' : 'mobile');

    return {
      ...INITIAL_PROFILE,
      ...parsed,
      platform: detectedPlatform,
      brawlers: mergedBrawlers,
      stats: { ...INITIAL_PROFILE.stats, ...(parsed.stats || {}) },
      controlsConfig: mergedControls,
    };
  } catch (e) {
    console.error('Failed to load profile:', e);
    return INITIAL_PROFILE;
  }
}

export function savePlayerProfile(profile: PlayerProfile): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch (e) {
    console.error('Failed to save profile:', e);
  }
}

// Power Point & Coin requirements per level
export const UPGRADE_COSTS: Record<number, { powerPoints: number; coins: number }> = {
  1: { powerPoints: 20, coins: 50 },
  2: { powerPoints: 30, coins: 100 },
  3: { powerPoints: 50, coins: 180 },
  4: { powerPoints: 80, coins: 290 },
  5: { powerPoints: 130, coins: 480 },
  6: { powerPoints: 210, coins: 800 },
  7: { powerPoints: 340, coins: 1250 },
  8: { powerPoints: 550, coins: 1875 },
  9: { powerPoints: 890, coins: 2800 },
  10: { powerPoints: 1440, coins: 4000 },
};

// Trophy road milestone definitions
export interface TrophyMilestone {
  trophies: number;
  rewardType: 'coins' | 'gems' | 'tokens' | 'brawler' | 'box';
  amount: number;
  brawlerId?: BrawlerId;
  name: string;
}

export const TROPHY_ROAD: TrophyMilestone[] = [
  { trophies: 0, rewardType: 'brawler', amount: 1, brawlerId: 'blaze', name: 'Sblocca Blaze' },
  { trophies: 25, rewardType: 'coins', amount: 100, name: '100 Monete' },
  { trophies: 50, rewardType: 'box', amount: 1, name: 'Cassa Brawl' },
  { trophies: 100, rewardType: 'tokens', amount: 100, name: '100 Gettoni' },
  { trophies: 150, rewardType: 'gems', amount: 20, name: '20 Gemme' },
  { trophies: 250, rewardType: 'brawler', amount: 1, brawlerId: 'titan', name: 'Sblocca Titan' },
  { trophies: 400, rewardType: 'box', amount: 2, name: 'Cassa Grande' },
  { trophies: 600, rewardType: 'gems', amount: 35, name: '35 Gemme' },
  { trophies: 800, rewardType: 'box', amount: 3, name: 'Mega Cassa' },
  { trophies: 1000, rewardType: 'brawler', amount: 1, brawlerId: 'raven', name: 'Sblocca Raven' },
];
