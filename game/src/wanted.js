// The wanted level: stars the player earns by breaking the law, and loses by hiding.
// One star per bad act, up to five. Out of sight, the heat cools: six quiet seconds
// and a star drops. The level is what the police answer to.
export function makeWanted() {
  return { level: 0, hideTimer: 0, bustedTimer: 0 };
}

export function addHeat(wanted, amount) {
  wanted.level = Math.min(5, wanted.level + amount);
  wanted.hideTimer = 0;
}

export function clearWanted(wanted) {
  wanted.level = 0;
  wanted.hideTimer = 0;
  wanted.bustedTimer = 0;
}

// `visible` is true while any police cruiser can still see the player.
export function updateWanted(wanted, dt, visible) {
  if (wanted.level === 0) return;
  if (visible) {
    wanted.hideTimer = 0;
    return;
  }
  wanted.hideTimer += dt;
  if (wanted.hideTimer >= 6) {
    wanted.hideTimer = 0;
    wanted.level -= 1;
  }
}
