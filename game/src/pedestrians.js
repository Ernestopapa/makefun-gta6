// People on the pavements: they stroll from junction to junction, and they run when
// something scary happens nearby.
import { clamp, angleDiff, PALETTE } from './config.js';
import { WALK_OFF, VERTICAL_ROADS, HORIZONTAL_ROADS, WORLD_W } from './world.js';
import { laneHeading } from './cars.js';

function walkPoint(p) {
  if (p.axis === 'v') return { x: p.road + p.side * WALK_OFF, y: p.y };
  return { x: p.x, y: p.road + p.side * WALK_OFF };
}

export function makePeds(world, rng, count) {
  const peds = [];
  for (let i = 0; i < count; i += 1) {
    const vertical = rng.chance(0.5);
    let axis;
    let road;
    let side;
    let dir;
    let x;
    let y;
    if (vertical) {
      axis = 'v';
      road = rng.pick(VERTICAL_ROADS);
      side = rng.chance(0.5) ? 1 : -1;
      dir = rng.chance(0.5) ? 1 : -1;
      x = road + side * WALK_OFF;
      y = rng.range(80, 1900);
    } else {
      axis = 'h';
      road = rng.pick(HORIZONTAL_ROADS);
      side = rng.chance(0.5) ? 1 : -1;
      dir = rng.chance(0.5) ? 1 : -1;
      x = rng.range(80, WORLD_W - 80);
      y = road + side * WALK_OFF;
    }
    peds.push({
      x,
      y,
      heading: laneHeading(axis, dir),
      axis,
      road,
      side,
      dir,
      speed: rng.range(55, 85),
      state: 'walk',
      timer: 0,
      decided: false,
      color: rng.pick(PALETTE.shirt),
      skin: rng.pick(PALETTE.skin),
    });
  }
  return peds;
}

export function updatePeds(peds, dt, ctx) {
  const { world, rng, scares, cars = [], player = null } = ctx;
  for (const p of peds) {
    if (p.state === 'down') {
      // Knocked down: flat on the ground for a few seconds, then up and running.
      p.timer -= dt;
      if (p.timer <= 0) {
        p.state = 'flee';
        p.timer = 2.2;
      }
      continue;
    }
    if (p.state === 'flee') {
      p.timer -= dt;
      p.x += Math.cos(p.heading) * 250 * dt;
      p.y += Math.sin(p.heading) * 250 * dt;
      world.resolveCircle(p, 10);
      if (p.timer <= 0) {
        // Calmed down: find the nearest pavement and carry on strolling.
        p.state = 'walk';
        const near = world.nearestSidewalk(p.x, p.y);
        p.axis = near.axis;
        p.road = near.road;
        p.side = near.side;
        p.dir = rng.chance(0.5) ? 1 : -1;
        p.heading = laneHeading(p.axis, p.dir);
      }
      continue;
    }

    // A scare nearby sends this pedestrian running away from it.
    for (const s of scares) {
      const dx = p.x - s.x;
      const dy = p.y - s.y;
      if (dx * dx + dy * dy < 260 * 260) {
        p.state = 'flee';
        p.timer = 2.2;
        p.heading = Math.atan2(dy, dx);
        break;
      }
    }
    if (p.state === 'flee') continue;

    // Stroll along the pavement, turning at junctions now and then.
    const lp = walkPoint(p);
    const base = laneHeading(p.axis, p.dir);
    const want = Math.atan2(Math.sin(base) + (lp.y - p.y) * 0.02, Math.cos(base) + (lp.x - p.x) * 0.02);
    p.heading += clamp(angleDiff(want, p.heading), -3.0 * dt, 3.0 * dt);
    p.x += Math.cos(p.heading) * p.speed * dt;
    p.y += Math.sin(p.heading) * p.speed * dt;
    world.resolveCircle(p, 10);

    // Walk around parked cars instead of into them: a pedestrian overlapping a
    // parked car is pushed out to its edge. The player's own car counts while
    // it is parked, and also while it still carries driver 'player' with Rae
    // on foot — a save made mid-drive can leave it that way. While Rae is
    // driving it, it is not an obstacle here (a moving car is handled by the
    // hit test instead).
    for (const c of cars) {
      const isParked = c.driver === 'parked' || (c.driver === 'player' && player && player.mode === 'foot');
      if (!isParked) continue;
      const dx = p.x - c.x;
      const dy = p.y - c.y;
      const d = Math.hypot(dx, dy);
      if (d < 26 && d > 0.01) {
        let px = dx / d;
        let py = dy / d;
        // Head-on: the push is almost exactly against the walk, so the
        // pedestrian stalls at the car's edge, pushed back to the same spot
        // every frame. Bend the push sideways so they walk around the car.
        const hx = Math.cos(p.heading);
        const hy = Math.sin(p.heading);
        if (px * hx + py * hy < -0.7) {
          const bx = px - hy;
          const by = py + hx;
          const bl = Math.hypot(bx, by) || 1;
          px = bx / bl;
          py = by / bl;
        }
        p.x = c.x + px * 26;
        p.y = c.y + py * 26;
      }
    }

    const jun = world.junctionAt(p.x, p.y);
    if (jun && !p.decided) {
      p.decided = true;
      const roll = rng.next();
      if (roll > 0.7) {
        const left = roll > 0.85;
        let h = p.heading + (left ? -Math.PI / 2 : Math.PI / 2);
        h = Math.round(h / (Math.PI / 2)) * (Math.PI / 2);
        if (Math.abs(Math.sin(h)) > 0.5) {
          p.axis = 'v';
          p.road = jun.cx;
          p.dir = Math.sin(h) > 0 ? 1 : -1;
          p.side = p.x >= jun.cx ? 1 : -1;
        } else {
          p.axis = 'h';
          p.road = jun.cy;
          p.dir = Math.cos(h) > 0 ? 1 : -1;
          p.side = p.y >= jun.cy ? 1 : -1;
        }
      }
    } else if (!jun) {
      p.decided = false;
    }

    // Turn back at the end of a road rather than walking off the city.
    if (p.axis === 'v' && (p.y < 70 || p.y > 1890)) p.dir *= -1;
    if (p.axis === 'h' && (p.x < 70 || p.x > WORLD_W - 70)) p.dir *= -1;
  }
}
