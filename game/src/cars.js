// Cars: the ones parked at the kerb, the traffic driving itself, and the one the player drives.
import { clamp, angleDiff } from './config.js';
import { VERTICAL_ROADS, HORIZONTAL_ROADS, ROAD_HALF, LANE_OFF, WORLD_W, WORLD_H } from './world.js';

export const CAR_TYPES = {
  sedan: { len: 46, wid: 22, accel: 430, top: 305, grip: 6.5, brake: 700 },
  van: { len: 58, wid: 24, accel: 300, top: 235, grip: 4.5, brake: 650 },
  sports: { len: 44, wid: 22, accel: 640, top: 430, grip: 8.5, brake: 800 },
  taxi: { len: 46, wid: 22, accel: 430, top: 305, grip: 6.5, brake: 700 },
  // A motorbike: quick off the line and the fastest thing in the city, but it slides
  // where a car grips, and it stops in a shorter space than it takes to turn.
  motorbike: { len: 32, wid: 13, accel: 720, top: 470, grip: 5.0, brake: 820 },
  // A police cruiser: not the fastest, but it accelerates hard and holds the road.
  police: { len: 48, wid: 22, accel: 520, top: 380, grip: 7.5, brake: 780 },
};

export const CAR_COLORS = ['#c94f42', '#3f6fb5', '#e0a13c', '#7fae5a', '#8a6fb5', '#dfe3e6', '#2f3338', '#d96a7f'];

export function makeCar(opts) {
  return {
    x: opts.x,
    y: opts.y,
    heading: opts.heading || 0,
    speed: opts.speed || 0,
    vx: 0,
    vy: 0,
    type: opts.type || 'sedan',
    color: opts.color || '#c94f42',
    driver: opts.driver || 'parked',
    axis: opts.axis || 'v',
    road: opts.road || 0,
    dir: opts.dir || 1,
    cruise: opts.cruise || 160,
    decided: false,
    brake: false,
    // True while the car is touching a building: the corner slide's scrape
    // applies once, on first contact, not every frame.
    touching: false,
  };
}

// The centre line of a lane: right-hand traffic, so the lane sits on the right of the road
// for the direction of travel.
export function lanePoint(axis, road, dir, x, y) {
  if (axis === 'v') return { x: road + (dir > 0 ? -LANE_OFF : LANE_OFF), y };
  return { x, y: road + (dir > 0 ? LANE_OFF : -LANE_OFF) };
}

export function laneHeading(axis, dir) {
  if (axis === 'v') return dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  return dir > 0 ? 0 : Math.PI;
}

function steerToward(heading, want, dt, rate) {
  return heading + clamp(angleDiff(want, heading), -rate * dt, rate * dt);
}

// Signed distance from `a` to `b` along `a`'s direction of travel, and the sideways gap.
function gapAhead(a, b) {
  if (a.axis === 'v') return { gap: (b.y - a.y) * a.dir, side: Math.abs(b.x - a.x) };
  return { gap: (b.x - a.x) * a.dir, side: Math.abs(b.y - a.y) };
}

function nextJunction(car) {
  if (car.axis === 'v') {
    if (car.dir > 0) {
      for (const hy of HORIZONTAL_ROADS) {
        if (hy > car.y + 5) return { cx: car.road, cy: hy, dist: hy - car.y };
      }
    } else {
      for (let i = HORIZONTAL_ROADS.length - 1; i >= 0; i -= 1) {
        const hy = HORIZONTAL_ROADS[i];
        if (hy < car.y - 5) return { cx: car.road, cy: hy, dist: car.y - hy };
      }
    }
  } else if (car.dir > 0) {
    for (const vx of VERTICAL_ROADS) {
      if (vx > car.x + 5) return { cx: vx, cy: car.road, dist: vx - car.x };
    }
  } else {
    for (let i = VERTICAL_ROADS.length - 1; i >= 0; i -= 1) {
      const vx = VERTICAL_ROADS[i];
      if (vx < car.x - 5) return { cx: vx, cy: car.road, dist: car.x - vx };
    }
  }
  return null;
}

function junctionBusy(j, self, others, player) {
  const inside = (x, y) => Math.abs(x - j.cx) <= ROAD_HALF + 8 && Math.abs(y - j.cy) <= ROAD_HALF + 8;
  for (const o of others) {
    if (o === self) continue;
    if (inside(o.x, o.y)) return true;
  }
  if (player.mode === 'car' && player.car !== self && inside(player.car.x, player.car.y)) return true;
  if (player.mode === 'foot' && inside(player.x, player.y)) return true;
  return false;
}

// Work out which lane a car is on from where it is and where it points. The player's car
// needs this kept fresh so the traffic can see it ahead of them.
export function updateLaneIdentity(car) {
  let bestV = VERTICAL_ROADS[0];
  let bestVd = Infinity;
  for (const vx of VERTICAL_ROADS) {
    const d = Math.abs(car.x - vx);
    if (d < bestVd) {
      bestVd = d;
      bestV = vx;
    }
  }
  let bestH = HORIZONTAL_ROADS[0];
  let bestHd = Infinity;
  for (const hy of HORIZONTAL_ROADS) {
    const d = Math.abs(car.y - hy);
    if (d < bestHd) {
      bestHd = d;
      bestH = hy;
    }
  }
  if (Math.abs(Math.sin(car.heading)) > Math.abs(Math.cos(car.heading)) || bestVd < bestHd) {
    car.axis = 'v';
    car.road = bestV;
    car.dir = Math.sin(car.heading) >= 0 ? 1 : -1;
  } else {
    car.axis = 'h';
    car.road = bestH;
    car.dir = Math.cos(car.heading) >= 0 ? 1 : -1;
  }
}

export function updateTrafficCar(car, dt, ctx) {
  const { world, rng, others, player, peds } = ctx;

  // Follow the lane: steer along it, pulled gently back to its centre line.
  const lp = lanePoint(car.axis, car.road, car.dir, car.x, car.y);
  const base = laneHeading(car.axis, car.dir);
  const want = Math.atan2(Math.sin(base) + (lp.y - car.y) * 0.012, Math.cos(base) + (lp.x - car.x) * 0.012);
  car.heading = steerToward(car.heading, want, dt, 3.4);

  let target = car.cruise;
  // Do not run into the car ahead on the same lane.
  for (const o of others) {
    if (o === car || o.driver === 'parked') continue;
    if (o.axis !== car.axis || o.road !== car.road || o.dir !== car.dir) continue;
    const g = gapAhead(car, o);
    if (g.gap > 0 && g.gap < 115 && g.side < 34) {
      target = Math.min(target, o.speed);
      if (g.gap < 58) target = 0;
    }
  }
  if (player.mode === 'car') {
    const pc = player.car;
    if (pc.axis === car.axis && pc.road === car.road && pc.dir === car.dir) {
      const g = gapAhead(car, pc);
      if (g.gap > 0 && g.gap < 115 && g.side < 34) {
        target = Math.min(target, pc.speed);
        if (g.gap < 58) target = 0;
      }
    }
  }
  // Stop at a junction when another car is crossing it, and let the player cross on foot.
  const j = nextJunction(car);
  if (j && j.dist < 175 && junctionBusy(j, car, others, player)) {
    target = Math.min(target, Math.max(0, (j.dist - 88) * 2.2));
    if (j.dist < 92) target = 0;
  }
  // Stop for a pedestrian, or the player, in the road ahead.
  for (const p of peds) {
    const g = gapAhead(car, p);
    if (g.gap > 0 && g.gap < 95 && g.side < 26) {
      target = 0;
      break;
    }
  }
  if (player.mode === 'foot') {
    const g = gapAhead(car, player);
    if (g.gap > 0 && g.gap < 95 && g.side < 26) target = 0;
  }

  // Ease toward the target speed: gentler speeding up than slowing down.
  const rate = target > car.speed ? 260 : 520;
  car.speed += clamp(target - car.speed, -rate * dt, rate * dt);
  if (target === 0 && car.speed < 0.5) car.speed = 0;
  car.x += Math.cos(car.heading) * car.speed * dt;
  car.y += Math.sin(car.heading) * car.speed * dt;

  // At a junction, mostly carry on, sometimes turn. At the last junction on a road the
  // car must turn, so none of them ever drives off the end of the city into the bay.
  const jun = world.junctionAt(car.x, car.y);
  if (jun && !car.decided) {
    car.decided = true;
    const atEdge =
      (car.axis === 'v' && ((car.dir > 0 && jun.cy === 1900) || (car.dir < 0 && jun.cy === 400))) ||
      (car.axis === 'h' && ((car.dir > 0 && jun.cx === 2800) || (car.dir < 0 && jun.cx === 400)));
    const roll = rng.next();
    if (roll > 0.76 || atEdge) {
      const left = roll > 0.88;
      let h = car.heading + (left ? -Math.PI / 2 : Math.PI / 2);
      h = Math.round(h / (Math.PI / 2)) * (Math.PI / 2);
      if (Math.abs(Math.sin(h)) > 0.5) {
        car.axis = 'v';
        car.road = jun.cx;
        car.dir = Math.sin(h) > 0 ? 1 : -1;
      } else {
        car.axis = 'h';
        car.road = jun.cy;
        car.dir = Math.cos(h) > 0 ? 1 : -1;
      }
    }
  } else if (!jun) {
    car.decided = false;
  }

  // Stay out of the buildings if a turn cuts a corner, and loop back at the end of a road.
  if (world.resolveCircle(car, 18)) car.speed *= 0.5;
  if (car.axis === 'v' && (car.y < -60 || car.y > 2020)) car.y = car.dir > 0 ? -60 : 2020;
  if (car.axis === 'h' && (car.x < -60 || car.x > WORLD_W + 60)) car.x = car.dir > 0 ? -60 : WORLD_W + 60;
}

// The player's car: throttle, brake and reverse, steering that bites more as the car moves,
// and a velocity that lags the nose a little, so driving slides where walking is precise.
export function updatePlayerCar(car, input, dt, world, onScare) {
  const t = CAR_TYPES[car.type];
  const throttle = input.up ? 1 : 0;
  const braking = input.down ? 1 : 0;
  const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);

  car.speed += throttle * t.accel * dt;
  if (braking) {
    // Reversing out of a tight spot: 0.8x acceleration, capped at -160 px/s.
    car.speed -= (car.speed > 0 ? t.brake : t.accel * 0.8) * dt;
    if (car.speed < -160) car.speed = -160;
  }
  car.speed -= car.speed * 0.55 * dt;
  if (Math.abs(car.speed) < 2 && !throttle) car.speed = 0;
  car.speed = clamp(car.speed, -160, t.top);

  const speedFactor = clamp(Math.abs(car.speed) / 120, 0, 1);
  car.heading += steer * 2.4 * speedFactor * (Math.sign(car.speed) || 1) * dt;

  const fx = Math.cos(car.heading);
  const fy = Math.sin(car.heading);
  const k = Math.min(1, t.grip * dt);
  car.vx += (fx * car.speed - car.vx) * k;
  car.vy += (fy * car.speed - car.vy) * k;
  car.x += car.vx * dt;
  car.y += car.vy * dt;
  car.brake = braking === 1;
  updateLaneIdentity(car);

  const before = car.speed;
  const radius = car.type === 'motorbike' ? 13 : 20;
  const px = car.x;
  const py = car.y;
  if (world.resolveCircle(car, radius)) {
    // A corner slide: the push-out gives the wall's outward normal, so strip
    // the velocity component driving into the wall and keep the along-wall
    // part, and the car scrapes along instead of stopping dead on a corner.
    // The 0.9x scrape applies once, on first contact: applied every frame
    // it would damp the car to a standstill against the wall.
    const nx = car.x - px;
    const ny = car.y - py;
    const nl = Math.hypot(nx, ny);
    if (nl > 0.001) {
      const ux = nx / nl;
      const uy = ny / nl;
      const vn = car.vx * ux + car.vy * uy;
      if (vn < 0) {
        car.vx -= vn * ux;
        car.vy -= vn * uy;
      }
    }
    if (!car.touching) {
      car.speed *= 0.9;
      car.vx *= 0.9;
      car.vy *= 0.9;
    }
    car.touching = true;
    if (Math.abs(before) > 180) onScare(car.x, car.y);
  } else {
    car.touching = false;
  }
}
