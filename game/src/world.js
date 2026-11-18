// Solmar Bay: the city itself. One seeded build gives the same streets, blocks and park
// every run, so a screenshot scene can be staged and repeated.
import { makeRng } from './random.js';
import { clamp } from './config.js';

export const WORLD_W = 3200;
export const WORLD_H = 2400;
export const ROAD_HALF = 60;
export const LANE_OFF = 30;
export const WALK_OFF = ROAD_HALF + 16;
export const VERTICAL_ROADS = [400, 1000, 1600, 2200, 2800];
export const HORIZONTAL_ROADS = [400, 900, 1400, 1900];
export const WATER_Y = 2120;
export const BEACH_Y = 1968;
export const PARK = { x0: 1068, y0: 968, x1: 1532, y1: 1332 };
export const POND = { x: 1300, y: 1150, rx: 130, ry: 72 };

const BUILDING_COLORS = ['#e07856', '#e0a13c', '#7fb3a3', '#d96a7f', '#f2e3c6', '#8a7f8d', '#c65a4a', '#5f8f6b'];
const PARKED_TYPES = ['sedan', 'van', 'sports', 'taxi', 'motorbike'];
const PARKED_COLORS = ['#c94f42', '#3f6fb5', '#e0a13c', '#7fae5a', '#8a6fb5', '#dfe3e6', '#2f3338'];

function overlaps(a, b, gap) {
  return a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;
}

export function createWorld(seed) {
  const rng = makeRng(seed);
  const buildings = [];
  const trees = [];
  const palms = [];
  const parkedSpots = [];

  // Cars parked at the kerb, fixed spots so the player always finds one nearby.
  const spots = [
    { x: 1082, y: 520, heading: Math.PI / 2 },
    { x: 1082, y: 700, heading: Math.PI / 2 },
    { x: 1082, y: 1560, heading: Math.PI / 2 },
    { x: 1082, y: 1750, heading: Math.PI / 2 },
    { x: 2118, y: 520, heading: -Math.PI / 2 },
    { x: 2118, y: 1080, heading: -Math.PI / 2 },
    { x: 2118, y: 1560, heading: -Math.PI / 2 },
    { x: 520, y: 982, heading: 0 },
    { x: 1750, y: 982, heading: 0 },
    { x: 2350, y: 982, heading: 0 },
    { x: 700, y: 1318, heading: Math.PI },
    { x: 2050, y: 1318, heading: Math.PI },
    { x: 2650, y: 1318, heading: Math.PI },
  ];
  // The type runs down the list in order, so every kind of car is always parked
  // somewhere in the city: a sports car at spot 2, a motorbike at spot 4.
  for (let i = 0; i < spots.length; i += 1) {
    const s = spots[i];
    parkedSpots.push({ x: s.x, y: s.y, heading: s.heading, type: PARKED_TYPES[i % PARKED_TYPES.length], color: rng.pick(PARKED_COLORS) });
  }
  // The parked cars' footprints, so no building is ever placed on top of one.
  const parkedBoxes = parkedSpots.map((s) => {
    const along = Math.abs(Math.cos(s.heading)) > 0.5;
    return along
      ? { x: s.x - 23, y: s.y - 11, w: 46, h: 22 }
      : { x: s.x - 11, y: s.y - 23, w: 22, h: 46 };
  });

  // Blocks: the rectangles between the roads. Columns run west to east, rows north to south.
  const colEdges = [8];
  for (const v of VERTICAL_ROADS) colEdges.push(v - ROAD_HALF - 8, v + ROAD_HALF + 8);
  colEdges.push(WORLD_W - 8);
  const rowEdges = [8];
  for (const h of HORIZONTAL_ROADS) rowEdges.push(h - ROAD_HALF - 8, h + ROAD_HALF + 8);

  for (let col = 0; col < VERTICAL_ROADS.length + 1; col += 1) {
    for (let row = 0; row < HORIZONTAL_ROADS.length; row += 1) {
      const bx0 = colEdges[col * 2];
      const bx1 = colEdges[col * 2 + 1];
      const by0 = rowEdges[row * 2];
      const by1 = rowEdges[row * 2 + 1];
      // The middle block is Palm Park, not buildings.
      if (col === 2 && row === 2) continue;
      if (rng.chance(0.15)) {
        for (let i = 0; i < 4; i += 1) {
          trees.push({ x: rng.range(bx0 + 30, bx1 - 30), y: rng.range(by0 + 30, by1 - 30), r: rng.range(12, 18), kind: 'oak' });
        }
        continue;
      }
      const count = rng.int(1, 3);
      const placed = [];
      for (let n = 0; n < count; n += 1) {
        for (let attempt = 0; attempt < 10; attempt += 1) {
          const w = rng.range(90, 210);
          const h = rng.range(70, 160);
          const x = rng.range(bx0 + 26, bx1 - 26 - w);
          const y = rng.range(by0 + 26, by1 - 26 - h);
          const rect = { x, y, w, h };
          if (placed.some((p) => overlaps(p, rect, 14))) continue;
          if (parkedBoxes.some((pb) => overlaps(pb, rect, 8))) continue;
          rect.color = rng.pick(BUILDING_COLORS);
          placed.push(rect);
          buildings.push(rect);
          break;
        }
      }
    }
  }

  // Palm Park: a pond, crossing paths, and trees kept clear of both.
  const inPond = (x, y) => ((x - POND.x) / 150) ** 2 + ((y - POND.y) / 92) ** 2 < 1;
  for (let i = 0; i < 46; i += 1) {
    const x = rng.range(PARK.x0 + 24, PARK.x1 - 24);
    const y = rng.range(PARK.y0 + 24, PARK.y1 - 24);
    if (inPond(x, y)) continue;
    if (x > 1276 && x < 1324) continue;
    if (y > 1126 && y < 1174) continue;
    trees.push({ x, y, r: rng.range(13, 20), kind: 'oak' });
  }

  // Palms along the harbourfront promenade, and four at the park's corners.
  for (let x = 90; x <= 3110; x += 140) {
    if (VERTICAL_ROADS.some((vx) => Math.abs(x - vx) < 90)) continue;
    palms.push({ x, y: 1952, r: 10, kind: 'palm' });
  }
  palms.push(
    { x: PARK.x0 + 30, y: PARK.y0 + 30, r: 10, kind: 'palm' },
    { x: PARK.x1 - 30, y: PARK.y0 + 30, r: 10, kind: 'palm' },
    { x: PARK.x0 + 30, y: PARK.y1 - 30, r: 10, kind: 'palm' },
    { x: PARK.x1 - 30, y: PARK.y1 - 30, r: 10, kind: 'palm' },
  );

  function isSolidAt(x, y) {
    if (x < 0 || x >= WORLD_W || y < 0 || y >= WORLD_H || y >= WATER_Y) return true;
    // The pond in Palm Park is water: nobody walks, drives or shoots through it.
    if (((x - POND.x) / POND.rx) ** 2 + ((y - POND.y) / POND.ry) ** 2 < 1) return true;
    for (const b of buildings) {
      if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) return true;
    }
    return false;
  }

  // Push a circle out of buildings, the water and the world's edge. Returns true on a hit.
  function resolveCircle(o, r) {
    let hit = false;
    for (const b of buildings) {
      const cx = clamp(o.x, b.x, b.x + b.w);
      const cy = clamp(o.y, b.y, b.y + b.h);
      const dx = o.x - cx;
      const dy = o.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= r * r) continue;
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        o.x = cx + (dx / d) * r;
        o.y = cy + (dy / d) * r;
      } else {
        const left = o.x - b.x;
        const right = b.x + b.w - o.x;
        const top = o.y - b.y;
        const bottom = b.y + b.h - o.y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) o.x = b.x - r;
        else if (m === right) o.x = b.x + b.w + r;
        else if (m === top) o.y = b.y - r;
        else o.y = b.y + b.h + r;
      }
    }
    if (o.y + r > WATER_Y) {
      o.y = WATER_Y - r;
      hit = true;
    }
    // The pond: push the circle out along the ellipse's outward normal, so
    // nobody walks or drives onto the water. The trigger is the ellipse grown
    // by the circle's radius, and the pushed point sits on the boundary of
    // that grown ellipse, on the ray from its centre — so the circle's edge
    // never dips into the pond.
    {
      const ex = POND.rx + r;
      const ey = POND.ry + r;
      const px = o.x - POND.x;
      const ux = px / ex;
      const uy = (o.y - POND.y) / ey;
      const u2 = ux * ux + uy * uy;
      if (u2 < 1) {
        hit = true;
        if (u2 > 0.0001) {
          const u = Math.sqrt(u2);
          o.x = POND.x + (ux / u) * ex;
          o.y = POND.y + (uy / u) * ey;
          // A purely radial push has no sideways component, so a circle
          // pressed against the shore and pushing straight into it freezes:
          // walking west across the park pins Rae at the pond's east tip,
          // and the old eastward bias only helped on the north-south axis
          // while trapping her at the north and south tips. Instead, slide
          // along the shore: when the motion is nearly anti-parallel to the
          // outward normal, move one frame's travel along the tangent,
          // flipped to run with the motion's tangential part. Standing still
          // means no slide, so a circle resting on the shore does not drift.
          let mx = 0;
          let my = 0;
          if (typeof o.vx === 'number' && typeof o.vy === 'number') {
            mx = o.vx;
            my = o.vy;
          } else if (typeof o.heading === 'number' && typeof o.speed === 'number') {
            mx = Math.cos(o.heading) * o.speed;
            my = Math.sin(o.heading) * o.speed;
          }
          const ms = Math.hypot(mx, my);
          if (ms > 1) {
            let nx = (o.x - POND.x) / (ex * ex);
            let ny = (o.y - POND.y) / (ey * ey);
            const nl = Math.hypot(nx, ny) || 1;
            nx /= nl;
            ny /= nl;
            const into = (mx * nx + my * ny) / ms;
            if (into < -0.7) {
              // Tangent, flipped to run with the motion's tangential part.
              // A motion with no tangential part at all takes the (-ny, nx)
              // tangent, so the exact centre line still rounds the pond.
              let tx = -ny;
              let ty = nx;
              if (mx * tx + my * ty < 0) {
                tx = -tx;
                ty = -ty;
              }
              const dist = Math.min(ms / 60, 10);
              o.x += tx * dist;
              o.y += ty * dist;
              // Back onto the grown ellipse, on the ray from its centre, so
              // the slide carries the circle around the pond instead of off it.
              const vx2 = (o.x - POND.x) / ex;
              const vy2 = (o.y - POND.y) / ey;
              const v2 = vx2 * vx2 + vy2 * vy2;
              if (v2 > 0.0001) {
                const v = Math.sqrt(v2);
                o.x = POND.x + (vx2 / v) * ex;
                o.y = POND.y + (vy2 / v) * ey;
              }
            }
          }
        } else {
          // Dead centre: out to the east shore.
          o.x = POND.x + POND.rx + r;
          o.y = POND.y;
        }
      }
    }
    if (o.x < r) {
      o.x = r;
      hit = true;
    }
    if (o.x > WORLD_W - r) {
      o.x = WORLD_W - r;
      hit = true;
    }
    if (o.y < r) {
      o.y = r;
      hit = true;
    }
    if (o.y > WORLD_H - r) {
      o.y = WORLD_H - r;
      hit = true;
    }
    return hit;
  }

  function junctionAt(x, y) {
    for (const vx of VERTICAL_ROADS) {
      if (Math.abs(x - vx) > ROAD_HALF + 8) continue;
      for (const hy of HORIZONTAL_ROADS) {
        if (Math.abs(y - hy) <= ROAD_HALF + 8) return { cx: vx, cy: hy };
      }
    }
    return null;
  }

  function districtAt(x, y) {
    if (y >= 1832) return 'Harbourfront';
    if (x >= PARK.x0 && x <= PARK.x1 && y >= PARK.y0 && y <= PARK.y1) return 'Palm Park';
    if (x < 1000) return 'Old Town';
    if (x < 2200) return 'Downtown';
    return 'Eastside';
  }

  function nearestSidewalk(x, y) {
    let best = null;
    for (const vx of VERTICAL_ROADS) {
      for (const side of [-1, 1]) {
        const d = Math.abs(x - (vx + side * WALK_OFF));
        if (!best || d < best.d) best = { d, axis: 'v', road: vx, side };
      }
    }
    for (const hy of HORIZONTAL_ROADS) {
      for (const side of [-1, 1]) {
        const d = Math.abs(y - (hy + side * WALK_OFF));
        if (!best || d < best.d) best = { d, axis: 'h', road: hy, side };
      }
    }
    return best;
  }

  function randomTrafficSpawn(spawnRng) {
    if (spawnRng.chance(0.5)) {
      const road = spawnRng.pick(VERTICAL_ROADS);
      const dir = spawnRng.chance(0.5) ? 1 : -1;
      let s = spawnRng.range(80, 1900);
      for (const hy of HORIZONTAL_ROADS) {
        if (Math.abs(s - hy) < 110) s = hy + 130;
      }
      s = clamp(s, 60, 1900);
      return {
        axis: 'v', road, dir,
        x: road + (dir > 0 ? -LANE_OFF : LANE_OFF), y: s,
        heading: dir > 0 ? Math.PI / 2 : -Math.PI / 2,
      };
    }
    const road = spawnRng.pick(HORIZONTAL_ROADS);
    const dir = spawnRng.chance(0.5) ? 1 : -1;
    let s = spawnRng.range(80, 3120);
    for (const vx of VERTICAL_ROADS) {
      if (Math.abs(s - vx) < 110) s = vx + 130;
    }
    s = clamp(s, 60, 3140);
    return {
      axis: 'h', road, dir,
      x: s, y: road + (dir > 0 ? LANE_OFF : -LANE_OFF),
      heading: dir > 0 ? 0 : Math.PI,
    };
  }

  return { buildings, trees, palms, parkedSpots, isSolidAt, resolveCircle, junctionAt, districtAt, nearestSidewalk, randomTrafficSpawn };
}
