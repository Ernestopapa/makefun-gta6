// Missions and the story of Solmar Bay. Rae's taxi was impounded by the city, so
// Rae is broke. Marls Voss, who runs the Bayview Café by Palm Park, offers courier
// work to pay off a debt to Deke Kline, who runs the bay's loan racket — and Sgt.
// Brina Cole's cruisers are always watching the roads.
//
// Five jobs, in order. Each one starts at the café, has a marker on the map, a way
// to win, a way to fail, and a reward the player can see. A failed job can be tried
// again by going back to the café.
export const CAFE = { x: 1300, y: 1010 };
export const LOCKUP = { x: 2500, y: 2000 };

// What the story is about: Rae owes Deke Kline $1,450, and the five jobs pay it off.
export const DEBT_TOTAL = 1450;

export const STORY = {
  player: 'Rae',
  giver: 'Marls Voss',
  rival: 'Deke Kline',
  officer: 'Sgt. Brina Cole',
};

const MISSIONS = [
  {
    id: 'first-fare',
    title: 'First Fare',
    giver: 'Marls',
    brief: "Marls: A friend needs a lift from the park gate to the harbourfront ferry. Don't keep her waiting.",
    goal: 'Park gate → harbourfront ferry',
    reward: 120,
    time: 60,
    type: 'drive',
    targets: [
      { x: 1300, y: 1400 },
      { x: 700, y: 1930 },
    ],
  },
  {
    id: 'the-package',
    title: 'The Package',
    giver: 'Marls',
    brief: 'Marls: Pick up a parcel at the Old Town junction, take it downtown. No questions, no peeking.',
    goal: 'Old Town parcel → Downtown',
    reward: 180,
    time: 60,
    type: 'drive',
    targets: [
      { x: 1000, y: 900 },
      { x: 2200, y: 1400 },
    ],
  },
  {
    id: 'borrowed-wheels',
    title: 'Borrowed Wheels',
    giver: 'Marls',
    brief: "Marls: Deke's nephew left his sports car by the harbour road. Bring it to the east lockup. Quietly.",
    goal: 'Steal the marked car → lockup',
    reward: 300,
    time: 90,
    type: 'steal',
    targets: [],
  },
  {
    id: 'the-getaway',
    title: 'The Getaway',
    giver: 'Marls',
    brief: 'Marls: Deke tipped off the police. They think you stole that car. Lose them, then come see me.',
    goal: 'Stay clear until the stars blink out',
    reward: 350,
    time: 240,
    type: 'escape',
    targets: [],
  },
  {
    id: 'payday',
    title: 'Payday',
    giver: 'Deke',
    brief: 'Deke: Time to settle up. Bring the money to my office on the east side. The police are already looking for you.',
    goal: 'Pay Deke at the east office',
    reward: 500,
    time: 150,
    type: 'payday',
    targets: [{ x: 2800, y: 1900 }],
  },
];

export function makeMissions() {
  return {
    // `armed` is false right after a job fails, so standing on the café marker
    // does not start the same job again at once: walk away and come back.
    list: MISSIONS.map((def) => ({ def, state: 'ready', stage: 0, timer: 0, markedCar: null, armed: true })),
    current: 0,
    storyDone: false,
  };
}

function startMission(missions, m, ctx) {
  m.state = 'active';
  m.stage = 0;
  m.timer = m.def.time;
  if (m.def.type === 'steal') {
    // The first sports car parked in the city is the one to take.
    m.markedCar = ctx.parkedCars.find((c) => c.type === 'sports' && c.driver === 'parked') || null;
  }
  if (m.def.type === 'escape') {
    ctx.addHeat(ctx.wanted, 2);
    // The goon-spawn banner would overwrite the Getaway hint within a frame:
    // hold the first spawn for four seconds so the hint is actually read.
    if (ctx.combat) ctx.combat.spawnTimer = 4;
  }
  if (m.def.type === 'payday') ctx.addHeat(ctx.wanted, 1);
  // The Getaway's win rule is nowhere else in the game, so the job opens with it:
  // stay clear of every cruiser until the stars blink out, and take a fast car.
  if (m.def.type === 'escape') {
    ctx.setBanner('Stay well clear of every cruiser until the stars blink out. A fast car helps.');
  } else {
    ctx.setBanner(`${m.def.title}. ${m.def.brief}`);
  }
}

function completeMission(missions, m, ctx) {
  m.state = 'done';
  ctx.wallet.money += m.def.reward;
  missions.current += 1;
  if (missions.current >= missions.list.length) {
    missions.storyDone = true;
    ctx.setBanner(`Debt paid. Solmar Bay is yours, ${STORY.player}.`);
  } else {
    ctx.setBanner(`Job done! +$${m.def.reward}. Next job at Marls' café.`);
  }
}

function failMission(missions, m, ctx, reason) {
  if (m.markedCar) m.markedCar = null;
  m.state = 'ready';
  m.stage = 0;
  m.timer = 0;
  m.armed = false;
  // A failed Getaway says why: the car was not fast enough to stay clear.
  if (m.def.type === 'escape') {
    ctx.setBanner(`${reason} A fast car helps. The sedan outruns them. Head back to Marls' café to try again.`);
    return;
  }
  ctx.setBanner(`${reason} Head back to Marls' café to try again.`);
}

// Called when the player is busted: an active job fails with them.
export function failActiveMission(missions, ctx, reason) {
  const m = missions.list[missions.current];
  if (m && m.state === 'active') failMission(missions, m, ctx, reason);
}

export function updateMissions(missions, dt, ctx) {
  const m = missions.list[missions.current];
  if (!m || missions.storyDone) return;
  const { player } = ctx;

  if (m.state === 'ready') {
    // Walk into the café marker to start the job. After a failed job, walk away
    // first: the marker only arms again once the player has left it behind.
    const d = Math.hypot(player.x - CAFE.x, player.y - CAFE.y);
    if (d > 120) m.armed = true;
    if (m.armed && d < 70) startMission(missions, m, ctx);
    return;
  }
  if (m.state !== 'active') return;

  m.timer -= dt;
  if (m.timer <= 0) {
    failMission(missions, m, ctx, 'Out of time.');
    return;
  }

  const near = (t) => Math.hypot(player.x - t.x, player.y - t.y) < 75;
  if (m.def.type === 'drive' || m.def.type === 'payday') {
    const target = m.def.targets[m.stage];
    // A drive job is won behind the wheel: walking to the target on foot
    // does not advance it, so the car is the point of the job.
    if (target && player.mode === 'car' && near(target)) {
      m.stage += 1;
      if (m.stage >= m.def.targets.length) completeMission(missions, m, ctx);
      else ctx.setBanner('Got it. Next stop is marked.');
    }
    return;
  }
  if (m.def.type === 'steal') {
    if (m.stage === 0 && player.mode === 'car' && player.car === m.markedCar) {
      m.stage = 1;
      ctx.setBanner('That is the one. Now get it to the lockup.');
    } else if (m.stage === 1 && m.markedCar && Math.hypot(m.markedCar.x - LOCKUP.x, m.markedCar.y - LOCKUP.y) < 90) {
      completeMission(missions, m, ctx);
    }
    return;
  }
  if (m.def.type === 'escape') {
    if (ctx.wanted.level === 0) completeMission(missions, m, ctx);
  }
}

// The car to steal while the Borrowed Wheels job is running, or null.
export function markedCar(missions) {
  const m = missions.list[missions.current];
  return m && m.state === 'active' && m.def.type === 'steal' ? m.markedCar : null;
}

// The lockup yard is drawn once the marked car is taken.
export function showLockup(missions) {
  const m = missions.list[missions.current];
  return Boolean(m && m.state === 'active' && m.def.type === 'steal' && m.stage === 1);
}

// The marker the renderer draws: the job's target while a job is running, the café
// while the next job waits. An escape job has nowhere to go, so it shows nothing.
export function currentMarker(missions) {
  const m = missions.list[missions.current];
  if (!m || missions.storyDone) return null;
  if (m.state === 'active') {
    if (m.def.type === 'steal') {
      if (m.stage === 0) {
        return m.markedCar
          ? { x: m.markedCar.x, y: m.markedCar.y, label: 'THE CAR', kind: 'target' }
          : null;
      }
      return { x: LOCKUP.x, y: LOCKUP.y, label: 'LOCKUP', kind: 'target' };
    }
    if (m.def.type === 'escape') return null;
    const t = m.def.targets[m.stage];
    return t ? { x: t.x, y: t.y, label: 'GO HERE', kind: 'target' } : null;
  }
  return { x: CAFE.x, y: CAFE.y, label: "MARLS' CAFÉ", kind: 'cafe' };
}

// What Rae still owes: the debt minus every finished job's reward.
export function debtLeft(missions) {
  let paid = 0;
  for (const m of missions.list) if (m.state === 'done') paid += m.def.reward;
  return DEBT_TOTAL - paid;
}

// What the HUD panel shows: the running job, the next job waiting, or the ending.
// Every panel names its job number, so the story's progress is always visible.
export function missionPanel(missions) {
  const m = missions.list[missions.current];
  const debt = debtLeft(missions);
  if (missions.storyDone) return { title: 'Story complete', goal: 'Solmar Bay is yours.', timer: 0, reward: 0, state: 'done', job: missions.list.length, total: missions.list.length, debtLeft: debt };
  if (!m) return null;
  const job = missions.current + 1;
  const total = missions.list.length;
  if (m.state === 'active') {
    return { title: `Job ${job} of ${total} · ${m.def.title}`, goal: m.def.goal, timer: Math.max(0, m.timer), reward: m.def.reward, state: 'active', job, total, debtLeft: debt };
  }
  return { title: `Next job (${job} of ${total}): ${m.def.title}`, goal: "Go to Marls' café to start", timer: 0, reward: m.def.reward, state: 'ready', job, total, debtLeft: debt };
}
