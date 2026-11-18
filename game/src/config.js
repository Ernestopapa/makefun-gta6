// Shared small helpers and the sun-soaked Solmar Bay palette.
export const TAU = Math.PI * 2;

export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

// Shortest signed turn from heading `from` to heading `to`, in radians.
export function angleDiff(to, from) {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export const PALETTE = {
  ground: '#cdbd97',
  grass: '#86b364',
  grassDark: '#74a355',
  parkPath: '#d9cba0',
  water: '#39a0c2',
  waterDeep: '#2b7f9e',
  sand: '#ecd9a4',
  road: '#55545c',
  roadLine: '#d9d2b8',
  dash: '#e8e0c0',
  sidewalk: '#b3a888',
  tree: '#4f8f4a',
  treeDark: '#3c7a38',
  trunk: '#7a5a38',
  palm: '#5da24e',
  roofLine: 'rgba(0,0,0,0.28)',
  glass: '#20242e',
  skin: ['#e8b88a', '#c98d5f', '#8a5a3b', '#f0c8a0'],
  shirt: ['#d96a7f', '#3f6fb5', '#e0a13c', '#7fae5a', '#8a6fb5', '#e07856', '#dfe3e6', '#5f8f6b'],
};
