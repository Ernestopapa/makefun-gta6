// Combat in Solmar Bay: Rae's fists, a pistol, and Deke Kline's crew.
// The player punches up close and shoots at a distance; the crew chases Rae on
// foot and punches back. Health comes back slowly when nobody is hitting Rae.
import { clamp, angleDiff } from './config.js';

export const MAX_HEALTH = 100;
const PUNCH_RANGE = 48;
const PUNCH_ARC = 1.0;
const PUNCH_DAMAGE = 25;
const PUNCH_COOLDOWN = 0.45;
const BULLET_SPEED = 720;
const BULLET_LIFE = 0.75;
const BULLET_DAMAGE = 34;
const SHOOT_COOLDOWN = 0.35;
const GOON_HEALTH = 125;
const GOON_SPEED = 150;
const GOON_DAMAGE = 5;
const GOON_PUNCH_RANGE = 30;
const GOON_PUNCH_COOLDOWN = 1.0;
const KILL_REWARD = 15;
// After a goon dies, no replacement spawns for fifteen seconds, so a fight
// Rae wins does not restart with a fresh goon already on top of her.
const KILL_RESPITE = 15;
const REGEN_DELAY = 8;
const REGEN_RATE = 3;

export function makeCombat() {
  return {
    health: MAX_HEALTH,
    maxHealth: MAX_HEALTH,
    enemies: [],
    bullets: [],
    swings: [],
    sparks: [],
    punchTimer: 0,
    shootTimer: 0,
    heatTimer: 0,
    spawnTimer: 0,
    clock: 0,
    lastHurtAt: -999,
    hitFlash: 0,
    dead: false,
    deathFine: 0,
    kills: 0,
    paydayGuards: false,
  };
}

// One of Deke's crew, on foot: chases Rae and punches when close enough.
export function spawnGoon(combat, x, y) {
  const goon = {
    x,
    y,
    heading: 0,
    health: GOON_HEALTH,
    maxHealth: GOON_HEALTH,
    state: 'chase',
    timer: 0,
    punchTimer: 0,
    speed: GOON_SPEED,
    color: '#8a2f2f',
    skin: '#c98d5f',
  };
  combat.enemies.push(goon);
  return goon;
}

function spawnNearPlayer(combat, ctx) {
  const { world, rng, player } = ctx;
  for (let i = 0; i < 12; i += 1) {
    const sp = world.randomTrafficSpawn(rng);
    const d = Math.hypot(sp.x - player.x, sp.y - player.y);
    if (d >= 350 && d <= 700) return spawnGoon(combat, sp.x, sp.y);
  }
  // Fallback: a point off to one side of the player, kept inside the city.
  const x = clamp(player.x + 450, 60, 3140);
  const y = clamp(player.y - 200, 60, 2000);
  return spawnGoon(combat, x, y);
}

function hurtPlayer(combat, amount) {
  combat.health = Math.max(0, combat.health - amount);
  combat.lastHurtAt = combat.clock;
  combat.hitFlash = 0.55;
  if (combat.health <= 0) combat.dead = true;
}

function killGoon(combat, goon, ctx) {
  const i = combat.enemies.indexOf(goon);
  if (i >= 0) combat.enemies.splice(i, 1);
  combat.kills += 1;
  // A kill buys a breather: the spawn timer is pushed out so the next goon
  // does not arrive before Rae has caught her breath.
  combat.spawnTimer = KILL_RESPITE;
  ctx.wallet.money += KILL_REWARD;
  combat.sparks.push({ x: goon.x, y: goon.y, timer: 0.25, max: 0.25 });
}

function damageGoon(combat, goon, amount, fromX, fromY, ctx) {
  goon.health -= amount;
  const dx = goon.x - fromX;
  const dy = goon.y - fromY;
  const d = Math.hypot(dx, dy) || 1;
  goon.x += (dx / d) * 26;
  goon.y += (dy / d) * 26;
  combat.sparks.push({ x: goon.x, y: goon.y, timer: 0.18, max: 0.18 });
  if (goon.health <= 0) killGoon(combat, goon, ctx);
}

export function updateCombat(combat, dt, ctx) {
  const { player, actions, aim } = ctx;
  combat.clock += dt;
  if (combat.punchTimer > 0) combat.punchTimer -= dt;
  if (combat.shootTimer > 0) combat.shootTimer -= dt;
  if (combat.heatTimer > 0) combat.heatTimer -= dt;
  if (combat.spawnTimer > 0) combat.spawnTimer -= dt;
  if (combat.hitFlash > 0) combat.hitFlash -= dt;
  for (const s of combat.swings) s.timer -= dt;
  combat.swings = combat.swings.filter((s) => s.timer > 0);
  for (const s of combat.sparks) s.timer -= dt;
  combat.sparks = combat.sparks.filter((s) => s.timer > 0);

  // The Getaway is job 4 running: while the escape is active, hitting someone
  // adds no heat and no goons spawn, so a clean escape cannot snowball into
  // a five-star chase. The rest of the game is untouched.
  const escapeMission = ctx.missions.list[ctx.missions.current];
  const escapeActive = Boolean(escapeMission && escapeMission.def.type === 'escape' && escapeMission.state === 'active');

  // Slow healing when nobody has hurt Rae for a while.
  if (!combat.dead && combat.health < combat.maxHealth && combat.clock - combat.lastHurtAt > REGEN_DELAY) {
    combat.health = Math.min(combat.maxHealth, combat.health + REGEN_RATE * dt);
  }
  if (combat.dead) return;

  // The punch: on foot only, aimed at the nearest goon in reach. Standing
  // still, Rae's heading is wherever she last walked, so the punch goes where
  // the nearest goon is, not where she faces. Up close the arc is a full
  // circle: a goon at arm's length is hit whichever way Rae faces.
  if (ctx.punch && player.mode === 'foot' && combat.punchTimer <= 0) {
    combat.punchTimer = PUNCH_COOLDOWN;
    let aimDir = player.heading;
    let nearestD = 120;
    for (const goon of combat.enemies) {
      if (goon.state === 'down') continue;
      const d = Math.hypot(goon.x - player.x, goon.y - player.y);
      if (d < nearestD) {
        nearestD = d;
        aimDir = Math.atan2(goon.y - player.y, goon.x - player.x);
      }
    }
    combat.swings.push({ x: player.x, y: player.y, heading: aimDir, timer: 0.18, max: 0.18 });
    // One swing lands on one goon: the nearest in range and arc. Hitting the
    // whole crew at once ended a two-goon fight in a single swing.
    let target = null;
    let targetD = Infinity;
    for (const goon of combat.enemies) {
      if (goon.state === 'down') continue;
      const d = Math.hypot(goon.x - player.x, goon.y - player.y);
      if (d > PUNCH_RANGE) continue;
      const ang = Math.abs(angleDiff(Math.atan2(goon.y - player.y, goon.x - player.x), aimDir));
      if (ang > (d < 36 ? Math.PI : PUNCH_ARC)) continue;
      if (d < targetD) {
        targetD = d;
        target = goon;
      }
    }
    if (target) damageGoon(combat, target, PUNCH_DAMAGE, player.x, player.y, ctx);
  }

  // The pistol: a bullet in the direction Rae faces, toward where they clicked,
  // or at the nearest goon in reach when neither is given.
  // Gunfire draws the law: one star, at most once every four seconds.
  if (ctx.shoot && combat.shootTimer <= 0) {
    combat.shootTimer = SHOOT_COOLDOWN;
    let dir = player.heading;
    if (aim) dir = Math.atan2(aim.y - player.y, aim.x - player.x);
    else {
      let nearestD = 600;
      for (const goon of combat.enemies) {
        if (goon.state === 'down') continue;
        const d = Math.hypot(goon.x - player.x, goon.y - player.y);
        if (d < nearestD) {
          nearestD = d;
          dir = Math.atan2(goon.y - player.y, goon.x - player.x);
        }
      }
    }
    combat.bullets.push({
      x: player.x + Math.cos(dir) * 18,
      y: player.y + Math.sin(dir) * 18,
      vx: Math.cos(dir) * BULLET_SPEED,
      vy: Math.sin(dir) * BULLET_SPEED,
      life: BULLET_LIFE,
    });
    if (combat.heatTimer <= 0 && ctx.wanted.level < 5) {
      ctx.addHeat(ctx.wanted, 1);
      combat.heatTimer = 4;
      ctx.setBanner('Gunfire!  +1 star');
    }
  }

  // Bullets fly, stop at walls, and hit the first goon they touch.
  for (const b of combat.bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (ctx.world.isSolidAt(b.x, b.y)) {
      b.life = 0;
      combat.sparks.push({ x: b.x, y: b.y, timer: 0.15, max: 0.15 });
    }
    for (const goon of [...combat.enemies]) {
      if (b.life <= 0) break;
      if (goon.state === 'down') continue;
      if (Math.hypot(goon.x - b.x, goon.y - b.y) < 16) {
        b.life = 0;
        damageGoon(combat, goon, BULLET_DAMAGE, b.x - b.vx * 0.02, b.y - b.vy * 0.02, ctx);
      }
    }
  }
  combat.bullets = combat.bullets.filter((b) => b.life > 0);

  // Deke's crew answers the wanted level: two stars brings them out, two at most.
  // They arrive one at a time, and Rae gets a warning before the first punch lands.
  // A staged scene can switch them off, so a chase frame stays a chase.
  const alive = combat.enemies.filter((g) => g.state !== 'flee').length;
  if (!ctx.noGoons && !escapeActive && ctx.wanted.level >= 2 && alive < 2 && combat.spawnTimer <= 0) {
    spawnNearPlayer(combat, ctx);
    combat.spawnTimer = 5;
    ctx.setBanner("Deke's crew is coming");
  }
  // During Payday, two of Deke's men stand guard at his east-side office.
  const m = ctx.missions.list[ctx.missions.current];
  if (!combat.paydayGuards && m && m.def.type === 'payday' && m.state === 'active') {
    combat.paydayGuards = true;
    spawnGoon(combat, 2740, 1860);
    spawnGoon(combat, 2860, 1940);
    ctx.setBanner("Deke's crew is coming");
  }

  // The crew chases Rae and punches when they get close. A car is no shelter
  // from being followed, but they can only land a punch on foot.
  for (const goon of [...combat.enemies]) {
    if (goon.state === 'down') {
      goon.timer -= dt;
      if (goon.timer <= 0) {
        goon.state = 'flee';
        goon.timer = 2.5;
        goon.heading = Math.atan2(goon.y - player.y, goon.x - player.x);
      }
      continue;
    }
    if (goon.state === 'flee') {
      goon.timer -= dt;
      goon.x += Math.cos(goon.heading) * 250 * dt;
      goon.y += Math.sin(goon.heading) * 250 * dt;
      ctx.world.resolveCircle(goon, 10);
      if (goon.timer <= 0) {
        const i = combat.enemies.indexOf(goon);
        if (i >= 0) combat.enemies.splice(i, 1);
      }
      continue;
    }
    if (goon.punchTimer > 0) goon.punchTimer -= dt;
    const dx = player.x - goon.x;
    const dy = player.y - goon.y;
    const d = Math.hypot(dx, dy) || 1;
    goon.heading = Math.atan2(dy, dx);
    if (d > 34) {
      goon.x += (dx / d) * goon.speed * dt;
      goon.y += (dy / d) * goon.speed * dt;
      ctx.world.resolveCircle(goon, 10);
    } else if (player.mode === 'foot' && goon.punchTimer <= 0) {
      goon.punchTimer = GOON_PUNCH_COOLDOWN;
      combat.swings.push({ x: goon.x, y: goon.y, heading: goon.heading, timer: 0.18, max: 0.18 });
      hurtPlayer(combat, GOON_DAMAGE);
    }
    // On foot, Rae and a goon keep 26 px apart: neither walks through the
    // other. In a car the run-down rule owns the contact instead.
    if (player.mode === 'foot') {
      const sx = player.x - goon.x;
      const sy = player.y - goon.y;
      const sd = Math.hypot(sx, sy);
      if (sd < 26) {
        const push = 26 - sd;
        if (sd > 0.01) {
          goon.x -= (sx / sd) * push;
          goon.y -= (sy / sd) * push;
        } else {
          goon.x -= push;
        }
        ctx.world.resolveCircle(goon, 10);
      }
    }
  }

  // Rae's car running a goon down: he goes flat, then runs, and the law notices.
  if (player.mode === 'car') {
    for (const goon of combat.enemies) {
      if (goon.state === 'down') continue;
      if (Math.hypot(goon.x - player.car.x, goon.y - player.car.y) < 26) {
        goon.state = 'down';
        goon.timer = 3;
        goon.heading = Math.atan2(goon.y - player.car.y, goon.x - player.car.x);
        if (escapeActive) ctx.setBanner('You hit someone!');
        else {
          ctx.addHeat(ctx.wanted, 1);
          ctx.setBanner('You hit someone!  +1 star');
        }
      }
    }
  }
}
