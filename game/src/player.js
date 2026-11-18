// The player: on foot, or behind the wheel of a car they got into.
import { updatePlayerCar } from './cars.js';
import { ACTION_ENTER } from './input.js';

export function makePlayer() {
  return {
    x: 1400,
    y: 1010,
    heading: -Math.PI / 2,
    vx: 0,
    vy: 0,
    mode: 'foot',
    car: null,
  };
}

export function updatePlayer(player, input, actions, dt, world, parkedCars, traffic, onScare, onSteal) {
  if (player.mode === 'car') {
    const car = player.car;
    updatePlayerCar(car, input, dt, world, onScare);
    player.x = car.x;
    player.y = car.y;
    player.heading = car.heading;
    if ((actions & ACTION_ENTER) && Math.abs(car.speed) < 40) {
      // Step out beside the car, on its left, and leave it parked where it stopped.
      const px = -Math.sin(car.heading);
      const py = Math.cos(car.heading);
      player.x = car.x + px * 34;
      player.y = car.y + py * 34;
      player.vx = 0;
      player.vy = 0;
      player.mode = 'foot';
      car.driver = 'parked';
      car.speed = 0;
      car.vx = 0;
      car.vy = 0;
      player.car = null;
      world.resolveCircle(player, 14);
    }
    return;
  }

  // On foot: walk where the keys point, a little smoothing so it feels like feet.
  const mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  const moving = mx !== 0 || my !== 0;
  const len = Math.hypot(mx, my) || 1;
  const tvx = moving ? (mx / len) * 195 : 0;
  const tvy = moving ? (my / len) * 195 : 0;
  const k = Math.min(1, 12 * dt);
  player.vx += (tvx - player.vx) * k;
  player.vy += (tvy - player.vy) * k;
  player.x += player.vx * dt;
  player.y += player.vy * dt;
  if (Math.hypot(player.vx, player.vy) > 12) player.heading = Math.atan2(player.vy, player.vx);
  world.resolveCircle(player, 14);

  // Keep out of the cars parked at the kerb.
  for (const car of parkedCars) {
    if (car.driver !== 'parked') continue;
    const dx = player.x - car.x;
    const dy = player.y - car.y;
    const d = Math.hypot(dx, dy);
    if (d < 30 && d > 0.01) {
      player.x = car.x + (dx / d) * 30;
      player.y = car.y + (dy / d) * 30;
    }
  }

  if (actions & ACTION_ENTER) {
    // The nearest car within reach, parked or driving. A driving car still has its
    // driver in it: taking it is stealing, and the driver gets out and runs.
    let best = null;
    let bestD = 62;
    let bestTraffic = false;
    for (const car of parkedCars) {
      if (car.driver !== 'parked') continue;
      const d = Math.hypot(player.x - car.x, player.y - car.y);
      if (d < bestD) {
        bestD = d;
        best = car;
        bestTraffic = false;
      }
    }
    for (const car of traffic) {
      const d = Math.hypot(player.x - car.x, player.y - car.y);
      if (d < bestD) {
        bestD = d;
        best = car;
        bestTraffic = true;
      }
    }
    if (best) {
      if (bestTraffic) {
        // Out of the traffic: it stops driving itself and becomes the player's car.
        const i = traffic.indexOf(best);
        if (i >= 0) traffic.splice(i, 1);
        parkedCars.push(best);
        if (onSteal) onSteal(best, true);
      }
      best.driver = 'player';
      best.speed = 0;
      best.vx = 0;
      best.vy = 0;
      player.mode = 'car';
      player.car = best;
    }
  }
}
