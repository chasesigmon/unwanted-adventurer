// Shared mutable client state — the single source of truth for "my own"
// profile, the active Phaser scene, and world-clock state, read/written
// across the UI modules and WorldScene alike. Split out of main.ts so
// those modules don't have to import each other directly just to reach a
// handful of shared values (see main.ts's own refactor note).
import { NetworkManager } from './net.js';
import type { PlayerSnapshot } from '../shared/types.js';
import type { WorldScene } from './game/WorldScene.js';

const SERVER_URL = (import.meta.env.VITE_SERVER_URL as string | undefined) || 'http://localhost:3001';
export const network = new NetworkManager(SERVER_URL);

// Updated on 'sync' and on any 'combat'/'loot' outcome that affects me,
// read by the status bar and every modal. WorldScene owns game logic
// (position, facing, sprites); this is purely the display-side profile.
export let myProfile: PlayerSnapshot | null = null;
export function setMyProfile(next: PlayerSnapshot | null): void {
  myProfile = next;
}

export let activeScene: WorldScene | null = null;
export function setActiveScene(scene: WorldScene | null): void {
  activeScene = scene;
}

export let inputCaptured = false;
export function setInputCaptured(next: boolean): void {
  inputCaptured = next;
}

// The "can't see outside without a light source" mechanic (see
// shared/lighting.ts) needs to know the current hour/tick; not known
// until the first 'worldTime' broadcast arrives.
export let currentWorldHour = 12;
export let worldTimeKnown = false;
// The same world-tick counter GameGateway measures Eat Brains/Glare
// cooldowns in.
export let currentWorldTick = 0;
// When the last 'worldTime' broadcast actually arrived — lets the Eat
// Brains cooldown wipe interpolate smoothly BETWEEN ticks instead of only
// visibly changing once every 30s when a fresh tick lands.
export let lastWorldTickAt = Date.now();

export function setWorldTime(hour: number, tick: number): void {
  currentWorldHour = hour;
  currentWorldTick = tick;
  lastWorldTickAt = Date.now();
  worldTimeKnown = true;
}
