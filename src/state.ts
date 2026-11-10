export type SimMode = 'gpgpu' | 'analytic';

export interface YunnBridge {
  ready: boolean;
  shotReady: boolean;
  fallback: boolean;
  fps: number;
  ms: number;
  tier: string;
  particles: number;
  sim: string;
  morph: number;
  dpr: number;
  frames: number;
}

declare global {
  interface Window {
    __YUNN__?: YunnBridge;
  }
}

export const state = {
  morph: 0,
  lockMorph: null as number | null,
  pointerX: 0,
  pointerY: 0,
  pointerAt: 0,
  scrollVelocity: 0,
  motion: 1,
  reduced: false,
  hidden: false,
  fps: 0,
  ms: 0,
  tier: 'high',
  particles: 0,
  dpr: 1,
  sim: 'analytic' as SimMode,
  bloom: false,
  adapted: false,
  shot: null as string | null,
};

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function morphFromProgress(progress: number): number {
  const x = clamp(progress, 0, 1);
  if (x < 0.26) return 0;
  if (x < 0.4) return smoothstep(0.26, 0.4, x);
  if (x < 0.6) return 1;
  if (x < 0.76) return 1 + smoothstep(0.6, 0.76, x);
  return 2;
}

export function captionWeights(progress: number): [number, number, number] {
  const x = clamp(progress, 0, 1);
  const w0 = 1 - smoothstep(0.26, 0.4, x);
  const w2 = smoothstep(0.6, 0.76, x);
  const w1 = Math.max(0, 1 - w0 - w2);
  const sum = w0 + w1 + w2 || 1;
  return [w0 / sum, w1 / sum, w2 / sum];
}

export function shotProgress(shot: string | null): number {
  if (shot === 'nebula') return 0.5;
  if (shot === 'logo') return 0.92;
  return 0.02;
}
