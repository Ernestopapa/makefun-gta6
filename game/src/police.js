// Police cruisers: they answer the wanted level, chase the player, and ram them
// to a stop. One cruiser per star, up to four. They arrive from off-screen, and a
// cruiser that falls far behind reappears closer in, so the chase never goes quiet.
import { makeCar, updateLaneIdentity, lanePoint, laneHeading } from './cars.js';
import { clamp, angleDiff } from './config.js';
import { LANE_OFF, WORLD_W, VERTICAL_ROADS, HORIZONTAL_ROADS } from './world.js';

export function makePoliceCar(x, y, heading, axis = 'v', road = 0, dir = 1) {
  // The lane identity (axis/road/dir) comes from the spawn point: the pursuit
  // follows the roads, so a cruiser must know which road it is on. Without
  // it the lane-following steers toward a road that does not exist.
  const car = makeCar({
    x,
    y,
    heading,
    type: 'police',
    color: '#1e2430',
    driver: 'police',
    cruise: 300,
    axis,
    road,
    dir,
  });
  // Seconds until this cruiser may ram again: a ram is one shove, not a pin.
  car.ramTimer = 0;
  return car;
}

// The junction nearest a point: the nearest vertical road crossed with the nearest
// horizontal road. A cruiser spawning from a junction is always on a real road.
function nearestJunction(x, y) {
  let bestV = VERTICAL_ROADS[0];
  let bestVd = Infinity;
  for (const vx of VERTICAL_ROADS) {
    const d = Math.abs(x - vx);
    if (d < bestVd) {
      bestVd = d;
      bestV = vx;
    }
  }
  let bestH = HORIZONTAL_ROADS[0];
  let bestHd = Infinity;
  for (const hy of HORIZONTAL_ROADS) {
    const d = Math.abs(y - hy);
    if (d < bestHd) {
      bestHd = d;
      bestH = hy;
    }
  }
  return { cx: bestV, cy: bestH };
}

// A cruiser in its lane sits 30 px off the road centre, just outside the
// 28 px junction zone, so world.junctionAt only fires when the steering
// oscillation happens to dip it in. A cruiser crossing a junction passes
// within about 30 px of the junction centre, so measure that distance
// instead: near a junction means close enough to choose the way out.
function junctionNear(car) {
  const j = nearestJunction(car.x, car.y);
  const d = Math.hypot(car.x - j.cx, car.y - j.cy);
  return d < 45 ? j : null;
}

// The player's velocity vector: the car they are driving, or their feet.
function playerVelocity(player) {
  if (player.mode === 'car' && player.car) return { x: player.car.vx, y: player.car.vy };
  return { x: player.vx || 0, y: player.vy || 0 };
}

// The road the player is on (or turning onto), from their position and
// heading. At a junction the position is near two roads, so the heading
// decides: mostly horizontal means the horizontal road, mostly vertical
// means the vertical one. Returns { axis, road, dir } or null when the
// player is not on a road.
function playerRoad(player) {
  const j = nearestJunction(player.x, player.y);
  const onV = Math.abs(player.x - j.cx) <= 40;
  const onH = Math.abs(player.y - j.cy) <= 40;
  let axis;
  let road;
  if (onV && !onH) {
    axis = 'v';
    road = j.cx;
  } else if (onH && !onV) {
    axis = 'h';
    road = j.cy;
  } else if (onV && onH) {
    if (Math.abs(Math.sin(player.heading)) > Math.abs(Math.cos(player.heading))) {
      axis = 'v';
      road = j.cx;
    } else {
      axis = 'h';
      road = j.cy;
    }
  } else {
    return null;
  }
  const dir = axis === 'v'
    ? (Math.sin(player.heading) >= 0 ? 1 : -1)
    : (Math.cos(player.heading) >= 0 ? 1 : -1);
  return { axis, road, dir };
}

// Where the player will be shortly, from their current velocity — a cruiser
// at a junction turns toward where the player is going, not where they were.
// A car that is about to cross the junction heading south is met by turning
// south, even though the north probe is nearer to where they stand now.
function predictedPlayer(player, lead) {
  const pv = playerVelocity(player);
  return { x: player.x + pv.x * lead, y: player.y + pv.y * lead };
}
// A road point a good way from the player, so the cruiser arrives from off-screen.
// When `behind` is set, the point must be in the player's wake — behind them
// in their direction of travel — so the cruiser chases from the rear. A cruiser
// spawned ahead of the player drives head-on into them, passes through, and
// ends up past them heading away, which lets a slow car escape and rams a
// fast one; spawning behind keeps the chase behind the player where it belongs.
// Spawn a cruiser on the player's own road, behind them, so it chases from
// the rear on the same road. This is the Getaway spawn: the cruiser is already
// on the player's trail, in the same lane direction, instead of on a random
// road it must navigate from — a random road can put it ahead of the player,
// driving head-on into them and then away. Returns null when the player is
// not on a road (off-road, between junctions), and the caller falls back.
export function policeSpawnBehind(world, rng, player, minDist, maxDist) {
  const j = nearestJunction(player.x, player.y);
  const onV = Math.abs(player.x - j.cx) <= 40;
  const onH = Math.abs(player.y - j.cy) <= 40;
  let axis;
  let road;
  if (onV && !onH) {
    axis = 'v';
    road = j.cx;
  } else if (onH && !onV) {
    axis = 'h';
    road = j.cy;
  } else if (onV && onH) {
    if (Math.abs(Math.sin(player.heading)) > Math.abs(Math.cos(player.heading))) {
      axis = 'v';
      road = j.cx;
    } else {
      axis = 'h';
      road = j.cy;
    }
  } else {
    return null;
  }
  const dir = axis === 'v'
    ? (Math.sin(player.heading) >= 0 ? 1 : -1)
    : (Math.cos(player.heading) >= 0 ? 1 : -1);
  const dist = minDist + rng.next() * (maxDist - minDist);
  const laneOff = dir > 0 ? LANE_OFF : -LANE_OFF;
  let x;
  let y;
  let heading;
  if (axis === 'v') {
    x = road + laneOff;
    y = player.y - dir * dist;
    heading = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  } else {
    x = player.x - dir * dist;
    y = road + laneOff;
    heading = dir > 0 ? 0 : Math.PI;
  }
  x = clamp(x, 40, WORLD_W - 40);
  y = clamp(y, 40, 2000);
  return { x, y, heading, axis, road, dir };
}

export function policeSpawnPoint(world, rng, player, minDist, maxDist, behind) {
  for (let i = 0; i < 40; i += 1) {
    const sp = world.randomTrafficSpawn(rng);
    const d = Math.hypot(sp.x - player.x, sp.y - player.y);
    if (d < minDist || d > maxDist) continue;
    if (behind) {
      // Behind the player: opposite the direction they are facing and about
      // to drive. The heading is used, not the velocity, because the player
      // is barely moving in the moment the cruisers first spawn.
      const hx = Math.cos(player.heading);
      const hy = Math.sin(player.heading);
      const dot = (sp.x - player.x) * hx + (sp.y - player.y) * hy;
      if (dot > 0) continue;
    }
    return sp;
  }
  // Fallback: a lane on the nearest junction's road, pushed out to the minimum
  // distance from that junction — measured from the junction, so the cruiser
  // always arrives from a real road a known way off, wherever the player stands.
  const j = nearestJunction(player.x, player.y);
  return {
    axis: 'v',
    road: j.cx,
    dir: 1,
    x: j.cx - LANE_OFF,
    y: Math.max(80, j.cy - minDist),
    heading: Math.PI / 2,
  };
}

// Steer along the cruiser's own lane, pulled gently back to its centre line,
// easing toward the target speed. The cruiser never leaves the road this way:
// it cannot cut a corner across a block the way a beeline chase does.
function followLane(car, dt, targetSpeed) {
  const lp = lanePoint(car.axis, car.road, car.dir, car.x, car.y);
  const base = laneHeading(car.axis, car.dir);
  const want = Math.atan2(Math.sin(base) + (lp.y - car.y) * 0.012, Math.cos(base) + (lp.x - car.x) * 0.012);
  car.heading += clamp(angleDiff(want, car.heading), -3.4 * dt, 3.4 * dt);
  const rate = targetSpeed > car.speed ? 520 : 700;
  car.speed += clamp(targetSpeed - car.speed, -rate * dt, rate * dt);
  car.x += Math.cos(car.heading) * car.speed * dt;
  car.y += Math.sin(car.heading) * car.speed * dt;
}

// The three ways out of a junction: straight on, left, or right. Each one names
// the lane it leads onto and a probe point a block along it, so a pursuer can
// tell which way runs closest to the player.
function junctionExits(car, j) {
  if (car.axis === 'v') {
    const leftDir = car.dir === 1 ? 1 : -1;
    const rightDir = car.dir === 1 ? -1 : 1;
    return [
      { axis: 'v', road: j.cx, dir: car.dir, px: j.cx, py: j.cy + car.dir * 300 },
      { axis: 'h', road: j.cy, dir: leftDir, px: j.cx + leftDir * 300, py: j.cy },
      { axis: 'h', road: j.cy, dir: rightDir, px: j.cx + rightDir * 300, py: j.cy },
    ];
  }
  const leftDir = car.dir === 1 ? -1 : 1;
  const rightDir = car.dir === 1 ? 1 : -1;
  return [
    { axis: 'h', road: j.cy, dir: car.dir, px: j.cx + car.dir * 300, py: j.cy },
    { axis: 'v', road: j.cx, dir: leftDir, px: j.cx, py: j.cy + leftDir * 300 },
    { axis: 'v', road: j.cx, dir: rightDir, px: j.cx, py: j.cy + rightDir * 300 },
  ];
}

export function updatePoliceCar(car, dt, ctx) {
  const { world, player, police } = ctx;
  car.ramTimer = Math.max(0, (car.ramTimer || 0) - dt);
  // Steer at the player: flat out while far away, easing off to ram when close.
  const dx = player.x - car.x;
  const dy = player.y - car.y;
  const dist = Math.hypot(dx, dy) || 1;
  if (ctx.escapeActive) {
    // The Getaway is a driving challenge, so the cruisers stay on the roads.
    // In range they pursue along the lanes, capped at 280 — a sedan tops out
    // at 305, so it can open a gap and hold it. Out of range they patrol at
    // 150 and never close in, so the gap the player opened stays open.
    if (dist > 450) {
      followLane(car, dt, 150);
    } else {
      // Close behind the player, match their speed instead of barrelling
      // into them: the cruiser holds its gap, stays on their trail through
      // the turns, and neither rams them nor overshoots the junction. A
      // faster car still pulls away — the sedan outruns the 280 cap —
      // while a slower car is held, never able to open the gap.
      let target = 280;
      if (dist < 180) {
        const pv = playerVelocity(player);
        const pspeed = Math.hypot(pv.x, pv.y);
        if (pspeed > 10) target = Math.min(280, pspeed);
      }
      followLane(car, dt, target);
    }
    // At a junction, pick the way out. Pursuing, take the road that runs
    // closest to where the player is heading — re-evaluated every frame
    // while the cruiser is in the junction, so it follows the player's turn
    // instead of committing to the straight-ahead it saw a moment before
    // the player turned. Patrolling, turn the way traffic does, decided
    // once per junction — and always turn at the last junction on a road,
    // so a patrolling cruiser never drives off the end of the city into the bay.
    const j = junctionNear(car);
    if (j) {
      const exits = junctionExits(car, j);
      if (dist <= 450) {
        // Follow the player onto their road, in their direction — stay on
        // their trail. A straight-line prediction overshoots while the
        // player is mid-turn, so it is only the fallback when the player's
        // road is not one of the ways out of this junction.
        const pr = playerRoad(player);
        let pick = null;
        if (pr) {
          for (const e of exits) {
            if (e.axis === pr.axis && e.road === pr.road && e.dir === pr.dir) {
              pick = e;
              break;
            }
          }
        }
        if (!pick) {
          const pp = predictedPlayer(player, 0.7);
          let best = Infinity;
          for (const e of exits) {
            const d = Math.hypot(e.px - pp.x, e.py - pp.y);
            if (d < best) {
              best = d;
              pick = e;
            }
          }
        }
        if (pick) {
          car.axis = pick.axis;
          car.road = pick.road;
          car.dir = pick.dir;
        }
        car.decided = true;
      } else if (!car.decided) {
        car.decided = true;
        const atEdge =
          (car.axis === 'v' && ((car.dir > 0 && j.cy === 1900) || (car.dir < 0 && j.cy === 400))) ||
          (car.axis === 'h' && ((car.dir > 0 && j.cx === 2800) || (car.dir < 0 && j.cx === 400)));
        const roll = ctx.rng.next();
        const pick = roll > 0.76 || atEdge ? exits[roll > 0.88 ? 1 : 2] : exits[0];
        if (pick) {
          car.axis = pick.axis;
          car.road = pick.road;
          car.dir = pick.dir;
        }
      }
    } else {
      car.decided = false;
    }
  } else {
    const want = Math.atan2(dy, dx);
    car.heading += clamp(angleDiff(want, car.heading), -3.4 * dt, 3.4 * dt);
    const target = dist > 320 ? 380 : dist > 120 ? 300 : 170;
    const rate = target > car.speed ? 520 : 700;
    car.speed += clamp(target - car.speed, -rate * dt, rate * dt);
    car.x += Math.cos(car.heading) * car.speed * dt;
    car.y += Math.sin(car.heading) * car.speed * dt;
    updateLaneIdentity(car);
  }
  // Keep cruisers apart so they do not stack on top of each other.
  for (const o of police) {
    if (o === car) continue;
    const ox = car.x - o.x;
    const oy = car.y - o.y;
    const od = Math.hypot(ox, oy);
    if (od < 52 && od > 0.01) {
      car.x += (ox / od) * (52 - od) * 0.5;
      car.y += (oy / od) * (52 - od) * 0.5;
    }
  }
  if (world.resolveCircle(car, 20)) car.speed *= 0.5;
  // Off the end of a road, turn back into the city instead of driving into the bay.
  if (car.y < -40 || car.y > 2040 || car.x < -40 || car.x > WORLD_W + 40) {
    car.heading += Math.PI;
    car.x = clamp(car.x, 40, WORLD_W - 40);
    car.y = clamp(car.y, 40, 2000);
  }
}
