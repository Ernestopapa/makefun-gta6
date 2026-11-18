// Boot and the one loop: Solmar Bay. The title screen, then play, with Esc to pause.
//
// ?seed=N fixes the city. ?shot=start|play|end (with &seed=N) stages that scene, runs it
// forward a fixed number of steps, paints it and sets window.__shotReady for a screenshot.
import { makeRng } from './random.js';
import { createWorld } from './world.js';
import { createInput, ACTION_CONFIRM, ACTION_PAUSE, ACTION_ENTER, ACTION_PUNCH, ACTION_SHOOT, ACTION_LOAD, ACTION_MUTE } from './input.js';
import { makePlayer, updatePlayer } from './player.js';
import { makeCar, updateTrafficCar, CAR_COLORS } from './cars.js';
import { makePeds, updatePeds } from './pedestrians.js';
import { makeWanted, addHeat, clearWanted, updateWanted } from './wanted.js';
import { makePoliceCar, policeSpawnBehind, policeSpawnPoint, updatePoliceCar } from './police.js';
import { makeMissions, updateMissions, failActiveMission, currentMarker, missionPanel, markedCar, showLockup, LOCKUP, CAFE } from './missions.js';
import { makeCombat, updateCombat, spawnGoon } from './combat.js';
import { saveGame, loadGame, clearSave } from './save.js';
import { createSound } from './sound.js';
import { createRenderer, makeCamera, updateCamera, SCREEN_TITLE, SCREEN_PLAY, SCREEN_PAUSED, SCREEN_DEAD, SCREEN_END } from './render.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot') || '';
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 1;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(seed);
const simRng = makeRng((seed ^ 0x9e3779b9) >>> 0);
const input = createInput(canvas);
const renderer = createRenderer(canvas);
const camera = makeCamera();
const player = makePlayer();

const parkedCars = world.parkedSpots.map((s) =>
  makeCar({ x: s.x, y: s.y, heading: s.heading, type: s.type, color: s.color, driver: 'parked' }),
);
const traffic = [];
for (let i = 0; i < 12; i += 1) {
  const sp = world.randomTrafficSpawn(simRng);
  traffic.push(
    makeCar({
      x: sp.x,
      y: sp.y,
      heading: sp.heading,
      axis: sp.axis,
      road: sp.road,
      dir: sp.dir,
      type: simRng.pick(['sedan', 'sedan', 'van', 'sports', 'taxi', 'motorbike']),
      color: simRng.pick(CAR_COLORS),
      driver: 'traffic',
      cruise: simRng.range(130, 200),
    }),
  );
}
const peds = makePeds(world, simRng, 40);
const wanted = makeWanted();
const police = [];
const wallet = { money: 40 };
const missions = makeMissions();
const combat = makeCombat();
const sound = createSound();
const skidMarks = [];
const smoke = [];
const totals = { earned: 0 };
let prevBullets = 0;
let prevSwings = 0;
let prevKills = 0;
let prevEnemies = 0;
let soundMission = 0;
let soundStoryDone = false;
let smokeTimer = 0;
const savedGame = loadGame();

let screen = SCREEN_TITLE;
let started = false;
let paused = false;
let scares = [];
let banner = { text: '', timer: 0 };
let aim = null;
let prevMission = 0;
let prevStoryDone = false;
// Staging flags a screenshot scene sets: the chase frame has no goons and no
// café marker, so the frame is the chase and nothing else.
let noGoonsStage = false;
let hideMarkerStage = false;

function setBanner(text) {
  banner = { text, timer: 3.2 };
}

// What the save holds: where Rae stands, what Rae owns, and how the story stands.
// Cars reset to their seeded spots on load; the story and the money are what continue.
function snapshot() {
  return {
    x: player.x,
    y: player.y,
    heading: player.heading,
    money: wallet.money,
    wanted: wanted.level,
    health: Math.round(combat.health),
    current: missions.current,
    states: missions.list.map((m) => ({ state: m.state, stage: m.stage, timer: m.timer, armed: m.armed })),
    storyDone: missions.storyDone,
    // The end screen reads these two, so a continue must carry them too:
    // without them the totals restart at zero and the kills vanish.
    earned: totals.earned,
    kills: combat.kills,
  };
}

function saveProgress() {
  saveGame(snapshot());
}

function applySave(data) {
  player.x = data.x;
  player.y = data.y;
  player.heading = data.heading;
  player.vx = 0;
  player.vy = 0;
  player.mode = 'foot';
  player.car = null;
  wallet.money = data.money;
  wanted.level = data.wanted;
  wanted.hideTimer = 0;
  wanted.bustedTimer = 0;
  combat.health = data.health;
  combat.enemies.length = 0;
  combat.bullets.length = 0;
  combat.swings.length = 0;
  combat.dead = false;
  missions.current = data.current;
  missions.storyDone = data.storyDone;
  totals.earned = typeof data.earned === 'number' ? data.earned : 0;
  combat.kills = typeof data.kills === 'number' ? data.kills : 0;
  // The first frame after load must not re-add a reward: the counters start
  // where the save left them, so a finished save does not add job 1's $120
  // again and a mid-game save does not replay the jobs already done.
  prevMission = data.current;
  prevStoryDone = data.storyDone;
  data.states.forEach((s, i) => {
    const m = missions.list[i];
    if (!m) return;
    m.state = s.state;
    m.stage = s.stage;
    m.timer = s.timer;
    m.armed = s.armed;
    m.markedCar = null;
    // A loaded steal job needs its car marked again.
    if (m.def.type === 'steal' && m.state === 'active') {
      m.markedCar = parkedCars.find((c) => c.type === 'sports' && c.driver === 'parked') || null;
    }
  });
  camera.x = player.x;
  camera.y = player.y;
  camera.tx = player.x;
  camera.ty = player.y;
}

// Waking up after going down: half the wallet goes to Deke's crew, the heat clears,
// the job in progress fails, and Rae is back on foot at Marls' café, whole again.
function respawn() {
  const fine = combat.deathFine;
  wallet.money -= fine;
  clearWanted(wanted);
  police.length = 0;
  failActiveMission(missions, { wallet, setBanner }, "Rae went down!");
  if (player.mode === 'car') {
    const car = player.car;
    player.car = null;
    car.driver = 'parked';
    car.speed = 0;
    car.vx = 0;
    car.vy = 0;
  }
  player.mode = 'foot';
  player.x = CAFE.x;
  player.y = CAFE.y;
  player.heading = Math.PI / 2;
  player.vx = 0;
  player.vy = 0;
  world.resolveCircle(player, 14);
  combat.health = combat.maxHealth;
  combat.dead = false;
  combat.enemies.length = 0;
  combat.bullets.length = 0;
  combat.swings.length = 0;
  combat.paydayGuards = false;
  combat.lastHurtAt = -999;
  camera.x = player.x;
  camera.y = player.y;
  camera.tx = player.x;
  camera.ty = player.y;
  screen = SCREEN_PLAY;
  setBanner(`You woke up at Marls' café. Deke's crew took $${fine}.`);
  saveProgress();
}

function onScare(x, y) {
  scares.push({ x, y });
}

function onSteal(car, wasDriving) {
  if (wasDriving) {
    // The driver gets out where the car stopped and runs for the pavement.
    peds.push({
      x: car.x,
      y: car.y,
      heading: car.heading + Math.PI,
      axis: 'v',
      road: 0,
      side: 1,
      dir: 1,
      speed: 70,
      state: 'flee',
      timer: 2.2,
      decided: false,
      color: '#d96a7f',
      skin: '#e8b88a',
    });
    scares.push({ x: car.x, y: car.y });
    // Taking a car with its driver in it is stealing, and the law notices.
    addHeat(wanted, 1);
    setBanner('You took the car!  +1 star');
    return;
  }
  setBanner('You took the car!');
}

// Busted: a cruiser sits on the player while they are slow or on foot, and
// Sgt. Cole books them. The fine comes out of the wallet, the stars clear,
// the cruisers leave, and any job in progress fails with them.
function doBusted() {
  const fine = Math.min(wallet.money, 100);
  wallet.money -= fine;
  clearWanted(wanted);
  police.length = 0;
  failActiveMission(missions, { wallet, setBanner }, 'Busted by Sgt. Cole!');
  if (player.mode === 'car') {
    const car = player.car;
    player.x = car.x;
    player.y = car.y;
    player.mode = 'foot';
    player.car = null;
    car.driver = 'parked';
    car.speed = 0;
    car.vx = 0;
    car.vy = 0;
    world.resolveCircle(player, 14);
  }
  setBanner(`Busted! Sgt. Cole fines you $${fine}.`);
}

function stepWorld(dt, scripted, actions) {
  scares = [];
  if (banner.timer > 0) banner.timer -= dt;
  if (!scripted && (actions & ACTION_PAUSE) && started) {
    paused = !paused;
    if (paused) saveProgress();
  }
  if (paused) return;
  const inputState = scripted || input;
  // The Getaway is job 4 running: the police rules change while it runs.
  const escapeMission = missions.list[missions.current];
  const escapeActive = Boolean(escapeMission && escapeMission.def.type === 'escape' && escapeMission.state === 'active');
  const speedBefore = player.mode === 'car' ? Math.hypot(player.car.vx, player.car.vy) : 0;
  updatePlayer(player, inputState, scripted ? 0 : actions, dt, world, parkedCars, traffic, onScare, onSteal);

  // Skid marks when the player's car slides sideways or brakes hard at speed, and
  // exhaust smoke when it pulls away hard. A sudden speed loss is a collision:
  // a burst of smoke where it happened. Marks and puffs fade; both are drawn
  // by the renderer, and all of it comes from the simulation, nothing random.
  if (player.mode === 'car') {
    const car = player.car;
    const speed = Math.hypot(car.vx, car.vy);
    const lateral = Math.abs(-car.vx * Math.sin(car.heading) + car.vy * Math.cos(car.heading));
    if (speed > 12) {
      if ((lateral > 80 && speed > 150) || (car.brake && speed > 200)) {
        const bx = Math.cos(car.heading + Math.PI);
        const by = Math.sin(car.heading + Math.PI);
        const px = -Math.sin(car.heading);
        const py = Math.cos(car.heading);
        for (const side of [-1, 1]) {
          const x = car.x + bx * 14 + px * side * 10;
          const y = car.y + by * 14 + py * side * 10;
          skidMarks.push({ x1: x, y1: y, x2: x - car.vx * dt * 2, y2: y - car.vy * dt * 2, timer: 6, max: 6 });
        }
        if (skidMarks.length > 240) skidMarks.splice(0, skidMarks.length - 240);
      }
      smokeTimer -= dt;
      if (smokeTimer <= 0 && speed < 120 && Math.abs(car.speed) > 60) {
        smokeTimer = 0.12;
        const bx = Math.cos(car.heading + Math.PI);
        const by = Math.sin(car.heading + Math.PI);
        smoke.push({ x: car.x + bx * 24, y: car.y + by * 24, r: 5, timer: 0.9, max: 0.9 });
      }
      if (speedBefore - speed > 80) {
        for (let i = 0; i < 3; i += 1) {
          smoke.push({ x: car.x + (i - 1) * 10, y: car.y - 8, r: 6, timer: 0.8, max: 0.8 });
        }
      }
    }
  }
  for (const m of skidMarks) m.timer -= dt;
  for (let i = skidMarks.length - 1; i >= 0; i -= 1) if (skidMarks[i].timer <= 0) skidMarks.splice(i, 1);
  for (const p of smoke) p.timer -= dt;
  for (let i = smoke.length - 1; i >= 0; i -= 1) if (smoke[i].timer <= 0) smoke.splice(i, 1);

  // The player driving close and fast past people scares them.
  if (player.mode === 'car' && Math.abs(player.car.speed) > 140) {
    for (const p of peds) {
      const dx = p.x - player.car.x;
      const dy = p.y - player.car.y;
      if (dx * dx + dy * dy < 70 * 70) {
        scares.push({ x: player.car.x, y: player.car.y });
        break;
      }
    }
  }

  const others = [...traffic, ...police];
  for (const car of traffic) {
    updateTrafficCar(car, dt, { world, rng: simRng, others, player, peds });
  }

  // The player's car shoving a traffic car: push them apart and scare the street.
  if (player.mode === 'car') {
    const pc = player.car;
    for (const car of traffic) {
      const dx = pc.x - car.x;
      const dy = pc.y - car.y;
      const d = Math.hypot(dx, dy);
      if (d < 46 && d > 0.01) {
        const push = (46 - d) / 2;
        const nx = dx / d;
        const ny = dy / d;
        pc.x += nx * push;
        pc.y += ny * push;
        car.x -= nx * push;
        car.y -= ny * push;
        const hard = Math.abs(pc.speed) > 150;
        pc.speed *= 0.6;
        car.speed *= 0.6;
        if (hard) scares.push({ x: pc.x, y: pc.y });
      }
    }
    player.x = pc.x;
    player.y = pc.y;
  }

  // The player's car hitting someone on foot: they go down, and the law notices.
  // Only a moving car hits someone — a pedestrian wandering into a parked car
  // is not the driver's fault.
  if (player.mode === 'car') {
    for (const p of peds) {
      if (p.state === 'down') continue;
      const d = Math.hypot(p.x - player.car.x, p.y - player.car.y);
      if (d < 26 && Math.abs(player.car.speed) > 40) {
        p.state = 'down';
        p.timer = 3;
        p.heading = Math.atan2(p.y - player.car.y, p.x - player.car.x);
        scares.push({ x: p.x, y: p.y });
        // During the Getaway a hit adds no heat: the escape must not snowball.
        if (escapeActive) setBanner('You hit someone!');
        else {
          addHeat(wanted, 1);
          setBanner('You hit someone!  +1 star');
        }
      }
    }
  }

  // Police: one cruiser per star, up to four, arriving from off-screen.
  // During the Getaway they only arrive once the player is driving, 300 to
  // 450 px away — close enough to chase, far enough to outrun.
  const wantPolice = wanted.level === 0 ? 0 : Math.min(wanted.level, 4);
  if (!escapeActive || player.mode === 'car') {
    while (police.length < wantPolice) {
      const sp = escapeActive
        ? (policeSpawnBehind(world, simRng, player, 300, 450)
          || policeSpawnPoint(world, simRng, player, 300, 450, true))
        : policeSpawnPoint(world, simRng, player, 650, 950);
      police.push(makePoliceCar(sp.x, sp.y, sp.heading, sp.axis, sp.road, sp.dir));
    }
  }
  if (wanted.level === 0) police.length = 0;
  // A cruiser that has fallen far behind reappears closer in, behind the player.
  for (const pc of police) {
    if (Math.hypot(pc.x - player.x, pc.y - player.y) > 1500) {
      const sp = policeSpawnBehind(world, simRng, player, 650, 950)
        || policeSpawnPoint(world, simRng, player, 650, 950, true);
      pc.x = sp.x;
      pc.y = sp.y;
      pc.heading = sp.heading;
      pc.speed = 0;
      pc.axis = sp.axis;
      pc.road = sp.road;
      pc.dir = sp.dir;
      pc.decided = false;
      pc.ramTimer = 0;
    }
  }
  for (const pc of police) updatePoliceCar(pc, dt, { world, player, police, escapeActive, rng: simRng });
  // A cruiser ramming the player's car shoves it and slows it down — but only
  // once a second per cruiser, so a rammed car can drive away instead of being
  // pinned under a ram every frame.
  if (player.mode === 'car') {
    for (const pc of police) {
      const dx = player.car.x - pc.x;
      const dy = player.car.y - pc.y;
      const d = Math.hypot(dx, dy);
      if (d < 50 && d > 0.01 && (pc.ramTimer || 0) <= 0) {
        player.car.x += (dx / d) * 3;
        player.car.y += (dy / d) * 3;
        player.car.speed *= 0.75;
        player.car.vx *= 0.75;
        player.car.vy *= 0.75;
        pc.ramTimer = 1;
      }
    }
  }

  // Busted: a cruiser sitting on the player while they are slow or on foot.
  if (wanted.level > 0) {
    const slow = player.mode === 'foot' || Math.abs(player.car.speed) < 60;
    let touching = false;
    for (const pc of police) {
      if (Math.hypot(pc.x - player.x, pc.y - player.y) < 40 && slow) touching = true;
    }
    if (touching) wanted.bustedTimer += dt;
    else wanted.bustedTimer = Math.max(0, wanted.bustedTimer - dt * 2);
    if (wanted.bustedTimer > 2) doBusted();
  }
  // Out of sight, the heat cools: six quiet seconds and a star drops.
  // During the Getaway, out of sight means more than 450 px from every cruiser.
  let visible = false;
  const hideDist = escapeActive ? 450 : 650;
  for (const pc of police) {
    if (Math.hypot(pc.x - player.x, pc.y - player.y) < hideDist) visible = true;
  }
  // During the Getaway, hiding only counts in a car that is actually moving:
  // on foot, or sitting still in a car, the player is always visible, so
  // waiting the job out at the café can never win it.
  if (escapeActive) {
    const speed = player.mode === 'car' ? Math.hypot(player.car.vx, player.car.vy) : 0;
    if (speed <= 40) visible = true;
  }
  updateWanted(wanted, dt, visible);

  // Jobs: start at the café, win or fail by the rules of the running job.
  updateMissions(missions, dt, { player, parkedCars, traffic, world, wanted, wallet, combat, addHeat, setBanner });
  // A job finished or the story ended: the save keeps up with the story, the
  // earnings total grows, and finishing the story opens the end screen.
  if (missions.current !== prevMission || missions.storyDone !== prevStoryDone) {
    if (missions.current > prevMission) {
      const done = missions.list[prevMission];
      if (done) totals.earned += done.def.reward;
    }
    prevMission = missions.current;
    prevStoryDone = missions.storyDone;
    saveProgress();
    if (missions.storyDone && screen === SCREEN_PLAY) screen = SCREEN_END;
  }

  // Fighting: Rae's fists, the pistol, and Deke's crew answering the wanted level.
  updateCombat(combat, dt, {
    player, world, wanted, wallet, missions, rng: simRng, addHeat, setBanner,
    punch: Boolean(actions & ACTION_PUNCH),
    shoot: Boolean(actions & ACTION_SHOOT),
    aim, noGoons: noGoonsStage,
  });
  aim = null;
  // Going down freezes the game on the dead screen until Rae wakes up.
  if (combat.dead && screen !== SCREEN_DEAD) {
    combat.deathFine = Math.floor(wallet.money / 2);
    screen = SCREEN_DEAD;
  }

  updatePeds(peds, dt, { world, rng: simRng, scares, cars: parkedCars, player });
  // The camera looks ahead of a moving car, so the road in front is what you see.
  if (player.mode === 'car') {
    camera.tx = player.x + player.car.vx * 0.35;
    camera.ty = player.y + player.car.vy * 0.35;
  } else {
    camera.tx = player.x;
    camera.ty = player.y;
  }
  camera.tzoom = 1;
  updateCamera(camera, dt);
}

// Stage one of the screenshot scenes: put the pieces where the frame wants them, then run
// the rules forward so the cars and people are mid-motion, not standing at their spawns.
function stageShot(name) {
  const idle = { up: false, down: false, left: false, right: false };
  if (name === 'play') {
    started = true;
    screen = SCREEN_PLAY;
    // The player, already in a sports car, rolling down the main road with traffic around.
    const car = parkedCars.find((c) => c.type === 'sports') || parkedCars[0];
    car.x = 1570;
    car.y = 620;
    car.heading = Math.PI / 2;
    car.driver = 'player';
    car.speed = 150;
    car.vx = 0;
    car.vy = 150;
    car.axis = 'v';
    car.road = 1600;
    car.dir = 1;
    player.mode = 'car';
    player.car = car;
    player.x = car.x;
    player.y = car.y;
    player.heading = car.heading;
    // Traffic on the same road and the roads crossing it, so the frame is busy.
    const extra = [
      { x: 1570, y: 420, heading: Math.PI / 2, axis: 'v', road: 1600, dir: 1 },
      { x: 1630, y: 900, heading: -Math.PI / 2, axis: 'v', road: 1600, dir: -1 },
      { x: 900, y: 1430, heading: 0, axis: 'h', road: 1400, dir: 1 },
      { x: 2100, y: 1370, heading: Math.PI, axis: 'h', road: 1400, dir: -1 },
      { x: 970, y: 500, heading: Math.PI / 2, axis: 'v', road: 1000, dir: 1 },
    ];
    extra.forEach((e, i) => {
      const c = traffic[i % traffic.length];
      c.x = e.x;
      c.y = e.y;
      c.heading = e.heading;
      c.axis = e.axis;
      c.road = e.road;
      c.dir = e.dir;
      c.speed = 150;
      c.cruise = 160;
    });
    camera.x = player.x;
    camera.y = player.y;
    camera.tx = player.x;
    camera.ty = player.y;
    for (let i = 0; i < 120; i += 1) stepWorld(STEP, { up: true, down: false, left: false, right: false }, 0);
  } else if (name === 'mission') {
    started = true;
    screen = SCREEN_PLAY;
    // On foot at Marls' café: the first job starts, the park-gate marker waits.
    player.x = CAFE.x;
    player.y = CAFE.y;
    player.heading = Math.PI / 2;
    camera.x = player.x;
    camera.y = player.y;
    camera.tx = player.x;
    camera.ty = player.y;
    for (let i = 0; i < 30; i += 1) stepWorld(STEP, idle, 0);
  } else if (name === 'chase') {
    started = true;
    screen = SCREEN_PLAY;
    // Two stars, two cruisers closing in: the player in a red sports car, mid-escape.
    // No goons in this frame, and no café marker — the frame is the chase.
    noGoonsStage = true;
    hideMarkerStage = true;
    const car = parkedCars.find((c) => c.type === 'sports') || parkedCars[0];
    car.x = 1570;
    car.y = 620;
    car.heading = Math.PI / 2;
    car.driver = 'player';
    car.color = '#c94f42';
    car.speed = 200;
    car.vx = 0;
    car.vy = 200;
    car.axis = 'v';
    car.road = 1600;
    car.dir = 1;
    player.mode = 'car';
    player.car = car;
    player.x = car.x;
    player.y = car.y;
    player.heading = car.heading;
    addHeat(wanted, 2);
    const sp1 = policeSpawnPoint(world, simRng, player, 300, 500);
    const sp2 = policeSpawnPoint(world, simRng, player, 300, 500);
    police.push(makePoliceCar(sp1.x, sp1.y, sp1.heading, sp1.axis, sp1.road, sp1.dir));
    police.push(makePoliceCar(sp2.x, sp2.y, sp2.heading, sp2.axis, sp2.road, sp2.dir));
    camera.x = player.x;
    camera.y = player.y;
    camera.tx = player.x;
    camera.ty = player.y;
    for (let i = 0; i < 90; i += 1) stepWorld(STEP, { up: true, down: false, left: false, right: false }, 0);
    // Restage the frame: the player low in the frame with its ring visible,
    // both cruisers directly astern in the player's own lane — one 70 px back,
    // the second 130 px back — so the chase reads at a glance.
    if (police[0]) {
      police[0].x = player.x;
      police[0].y = player.y - 70;
      police[0].heading = Math.PI / 2;
      police[0].speed = 200;
      police[0].axis = car.axis;
      police[0].road = car.road;
      police[0].dir = car.dir;
    }
    if (police[1]) {
      police[1].x = player.x;
      police[1].y = player.y - 130;
      police[1].heading = Math.PI / 2;
      police[1].speed = 200;
      police[1].axis = car.axis;
      police[1].road = car.road;
      police[1].dir = car.dir;
    }
    // Zoom 3.0, as the fight shot does: at 2.2 the road is a thin strip and
    // the beige lot east of it fills half the frame, so the thumbnail reads as
    // a city map. At 3.0 each car is ~130 px long on screen and the three cars
    // in formation are the picture. The camera sits on the player's lane, not
    // 100 px east of it, so the eastern lot is a side strip instead of half
    // the frame; and the frame is centred on the formation (camera 66 px north
    // of the player) so the top cruiser clears the frame edge.
    camera.x = player.x;
    camera.y = player.y - 66;
    camera.tx = player.x;
    camera.ty = player.y - 66;
    camera.zoom = 3.0;
    camera.tzoom = 3.0;
  } else if (name === 'city') {
    started = true;
    screen = SCREEN_PLAY;
    // A wide look over the city from the park, the way the title sees it but
    // without the title over it: Rae on the grass east of the café, the pond
    // below her. The staging point sits clear of the café marker, so the first
    // job does not start by itself while the frame is staged.
    player.x = 1400;
    player.y = 1010;
    player.heading = Math.PI / 2;
    camera.x = player.x;
    camera.y = player.y;
    camera.tx = player.x;
    camera.ty = player.y;
    for (let i = 0; i < 300; i += 1) stepWorld(STEP, idle, 0);
  } else if (name === 'bike') {
    started = true;
    screen = SCREEN_PLAY;
    // On foot beside the parked motorbike on the harbour road, traffic passing.
    const bike = parkedCars.find((c) => c.type === 'motorbike') || parkedCars[0];
    player.x = bike.x + 40;
    player.y = bike.y + 30;
    player.heading = -Math.PI / 2;
    camera.x = player.x;
    camera.y = player.y;
    camera.tx = player.x;
    camera.ty = player.y;
    for (let i = 0; i < 120; i += 1) stepWorld(STEP, idle, 0);
  } else if (name === 'end') {
    started = true;
    // The story is done: every job finished, the debt paid, the end screen up.
    for (const m of missions.list) {
      m.state = 'done';
      m.stage = 0;
      m.timer = 0;
    }
    missions.current = missions.list.length;
    missions.storyDone = true;
    totals.earned = 120 + 180 + 300 + 350 + 500;
    wallet.money = 40 + totals.earned;
    combat.kills = 2;
    // Keep the job accounting in stepWorld from adding a reward again: the
    // story is already finished, so the counters start finished too.
    prevMission = missions.list.length;
    prevStoryDone = true;
    screen = SCREEN_END;
    // A wide look over the central junction, the player on foot at its corner.
    player.x = 1520;
    player.y = 1300;
    player.heading = Math.PI / 2;
    for (let i = 0; i < 300; i += 1) stepWorld(STEP, idle, 0);
    camera.x = 1600;
    camera.y = 1400;
    camera.tx = 1600;
    camera.ty = 1400;
    camera.zoom = 0.55;
    camera.tzoom = 0.55;
  } else if (name === 'fight') {
    started = true;
    screen = SCREEN_PLAY;
    // On foot at the central junction, two of Deke's crew flanking at punch range.
    player.x = 1560;
    player.y = 1360;
    player.heading = Math.PI / 2;
    combat.health = 82;
    addHeat(wanted, 2);
    const g1 = spawnGoon(combat, 1584.75, 1335.25);
    const g2 = spawnGoon(combat, 1535.25, 1384.75);
    g1.heading = Math.atan2(player.y - g1.y, player.x - g1.x);
    g2.heading = Math.atan2(player.y - g2.y, player.x - g2.x);
    camera.x = player.x;
    camera.y = player.y;
    camera.tx = player.x;
    camera.ty = player.y;
    // Long enough for the cruisers to close in and show in the frame, short
    // enough that none of them can sit on Rae long enough to bust them.
    for (let i = 0; i < 90; i += 1) stepWorld(STEP, idle, 0);
    // Restage closer: zoom in, one goon hurt, a bullet streak in the frame.
    // Zoom 3.0, not 2.0: at 2.0 the goons are still small at thumbnail size
    // and the frame does not read as a fight. At 3.0 the goons, their health
    // bars and the swing arc fill the frame; the junction falls out of it,
    // and the fight is the whole picture.
    camera.zoom = 3.0;
    camera.tzoom = 3.0;
    g1.health = 26;
    player.heading = Math.atan2(g1.y - player.y, g1.x - player.x);
    combat.swings.push({ x: player.x, y: player.y, heading: player.heading, timer: 0.18, max: 0.18 });
    const bdir = Math.atan2(g2.y - player.y, g2.x - player.x);
    combat.bullets.push({
      x: player.x + Math.cos(bdir) * 40,
      y: player.y + Math.sin(bdir) * 40,
      vx: Math.cos(bdir) * 720,
      vy: Math.sin(bdir) * 720,
      life: 0.5,
    });
  } else {
    // start: the title screen over the park, people strolling, traffic passing.
    // Rae stands on the grass east of the café, clear of the pond.
    player.x = 1400;
    player.y = 1010;
    camera.x = 1300;
    camera.y = 1150;
    camera.tx = 1300;
    camera.ty = 1150;
    for (let i = 0; i < 300; i += 1) stepWorld(STEP, idle, 0);
  }
}

function runGame() {
  let last = performance.now();

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(MAX_FRAME, (now - last) / 1000);
    last = now;
    const actions = input.takeActions();
    const click = input.takeClick();
    // Sound starts on the first input, and keeps following the game after that.
    if (actions || click) {
      sound.ensure();
      sound.resume();
    }
    // M works on every screen: title, paused, or playing.
    if (actions & ACTION_MUTE) sound.toggleMuted();
    if (click) {
      // A click during play is a shot: turn the screen point into a world point.
      aim = {
        x: camera.x + (click.x - window.innerWidth / 2) / camera.zoom,
        y: camera.y + (click.y - window.innerHeight / 2) / camera.zoom,
      };
    }
    if (!started) {
      if ((actions & ACTION_LOAD) && savedGame) {
        applySave(savedGame);
        started = true;
        screen = SCREEN_PLAY;
        // A finished save opens its end screen again, with the restored
        // totals — otherwise a completed game would continue into free roam
        // and the player would never see what they earned.
        if (missions.storyDone) screen = SCREEN_END;
        status.textContent = 'Welcome back, Rae. Walk with WASD, E gets in a car.';
      } else if (actions & ACTION_CONFIRM) {
        clearSave();
        started = true;
        screen = SCREEN_PLAY;
        status.textContent = 'Playing. Walk with WASD, E gets in a car.';
      } else {
        // Title backdrop: the city lives behind the title.
        stepWorld(dt, { up: false, down: false, left: false, right: false }, 0);
        camera.tx = 1300;
        camera.ty = 1150;
        camera.tzoom = 1;
        updateCamera(camera, dt);
      }
    } else if (screen === SCREEN_DEAD) {
      if (actions & ACTION_CONFIRM) respawn();
    } else if (screen === SCREEN_END) {
      // The story is over: Enter goes back to free roam in the city.
      if (actions & ACTION_CONFIRM) screen = SCREEN_PLAY;
    } else {
      stepWorld(dt, null, actions);
      // Event sounds: a new bullet is a shot, a new swing is a punch, a new
      // goon is a warning, a finished job is the jingle.
      if (combat.bullets.length > prevBullets) sound.shot();
      if (combat.swings.length > prevSwings) sound.punch();
      if (combat.enemies.length > prevEnemies) sound.alert();
      if (combat.kills > prevKills) sound.thud();
      if (missions.current > soundMission || (missions.storyDone && !soundStoryDone)) {
        sound.jingle();
        soundMission = missions.current;
        soundStoryDone = missions.storyDone;
      }
      prevBullets = combat.bullets.length;
      prevSwings = combat.swings.length;
      prevEnemies = combat.enemies.length;
      prevKills = combat.kills;
    }
    // The engine hum follows the car's speed; the siren runs while wanted.
    sound.setEngine(player.mode === 'car' ? Math.abs(player.car.speed) / 430 : 0);
    sound.setSiren(wanted.level > 0);
    renderer.draw({ world, player, traffic, parkedCars, peds, police, wanted, wallet, banner, marker: hideMarkerStage ? null : currentMarker(missions), markedCar: markedCar(missions), lockupZone: showLockup(missions) ? LOCKUP : null, panel: missionPanel(missions), combat, saveInfo: savedGame ? { money: savedGame.money, current: savedGame.current } : null, camera, screen: paused ? SCREEN_PAUSED : screen, skids: skidMarks, smoke, endTotals: totals, muted: sound.isMuted() }, now / 1000);
  }

  // Leaving the tab pauses a running game rather than letting traffic drive unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && started && !paused) {
      paused = true;
      saveProgress();
    }
  });

  status.textContent = savedGame
    ? 'Solmar Bay. Press Enter for a new game, or L to continue your saved game.'
    : 'Solmar Bay. Press Enter or click to start.';
  requestAnimationFrame(frame);
}

window.__solmar = { player, traffic, peds, world, wanted, police, wallet, missions, combat };

if (shot) {
  stageShot(shot);
  let painted = 0;
  function paint() {
    renderer.draw({ world, player, traffic, parkedCars, peds, police, wanted, wallet, banner, marker: hideMarkerStage ? null : currentMarker(missions), markedCar: markedCar(missions), lockupZone: showLockup(missions) ? LOCKUP : null, panel: missionPanel(missions), combat, saveInfo: savedGame ? { money: savedGame.money, current: savedGame.current } : null, camera, screen, skids: skidMarks, smoke, endTotals: totals, muted: sound.isMuted() }, performance.now() / 1000);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
} else {
  runGame();
}
