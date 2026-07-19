// Day/night cycle, shared by the game scene (lantern) and the UI scene (sky washes).

import { DAYNIGHT } from '../config';

export interface SkyState {
  color: number;
  alpha: number;
  night: number; // 0 = day, 1 = full dark
}

// the sun's journey: [time, tint color, wash alpha, darkness factor]
const SKY_STOPS: { t: number; color: [number, number, number]; alpha: number; night: number }[] = [
  { t: 0.0, color: [255, 217, 176], alpha: 0.1, night: 0.15 }, // dawn
  { t: 0.08, color: [255, 255, 255], alpha: 0.0, night: 0 }, // morning
  { t: 0.38, color: [255, 217, 160], alpha: 0.1, night: 0 }, // golden hour
  { t: 0.48, color: [255, 154, 106], alpha: 0.16, night: 0.05 }, // sunset
  { t: 0.56, color: [138, 90, 154], alpha: 0.2, night: 0.35 }, // dusk
  { t: 0.64, color: [26, 42, 90], alpha: 0.25, night: 1 }, // night
  { t: 0.88, color: [26, 42, 90], alpha: 0.25, night: 1 }, // deep night
  { t: 0.96, color: [255, 154, 138], alpha: 0.18, night: 0.3 }, // sunrise
  { t: 1.0, color: [255, 217, 176], alpha: 0.1, night: 0.15 },
];

export function skyState(timeMs: number): SkyState {
  const t = (timeMs / 1000 / DAYNIGHT.cycleSeconds + 0.12) % 1;
  let i = 0;
  while (i < SKY_STOPS.length - 2 && SKY_STOPS[i + 1].t <= t) i++;
  const a = SKY_STOPS[i];
  const b = SKY_STOPS[i + 1];
  const f = Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t)));
  const r = Math.round(a.color[0] + (b.color[0] - a.color[0]) * f);
  const g = Math.round(a.color[1] + (b.color[1] - a.color[1]) * f);
  const bl = Math.round(a.color[2] + (b.color[2] - a.color[2]) * f);
  return {
    color: (r << 16) | (g << 8) | bl,
    alpha: a.alpha + (b.alpha - a.alpha) * f,
    night: a.night + (b.night - a.night) * f,
  };
}
