// Keyboard input for Solmar Bay: held keys for moving and driving, one-shot presses for
// starting, pausing and getting in and out of cars, fighting, and loading a save.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER = 4;
export const ACTION_PUNCH = 8;
export const ACTION_SHOOT = 16;
export const ACTION_LOAD = 32;
export const ACTION_MUTE = 64;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CONFIRM = new Set(['Enter', 'Space']);
const PAUSE = new Set(['KeyP', 'Escape']);
const ENTER_CAR = new Set(['KeyE']);
const PUNCH = new Set(['KeyF']);
const SHOOT = new Set(['KeyG']);
const LOAD = new Set(['KeyL']);
const MUTE = new Set(['KeyM']);

export function createInput(canvas) {
  const held = new Set();
  let actions = 0;
  let click = null;

  window.addEventListener('keydown', (event) => {
    if (UP.has(event.code) || DOWN.has(event.code) || LEFT.has(event.code) || RIGHT.has(event.code)) {
      held.add(event.code);
      event.preventDefault();
    } else if (CONFIRM.has(event.code)) {
      // Space starts the game on the title screen and throws a punch in play;
      // the punch flag is spent on the starting frame, so it never lands twice.
      if (!event.repeat) actions |= ACTION_CONFIRM | ACTION_PUNCH;
      event.preventDefault();
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (ENTER_CAR.has(event.code)) {
      if (!event.repeat) actions |= ACTION_ENTER;
    } else if (PUNCH.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PUNCH;
    } else if (SHOOT.has(event.code)) {
      if (!event.repeat) actions |= ACTION_SHOOT;
    } else if (LOAD.has(event.code)) {
      if (!event.repeat) actions |= ACTION_LOAD;
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    }
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    held.clear();
  });
  canvas.addEventListener('pointerdown', (event) => {
    // A click starts the game on the title screen and shoots at that spot in play.
    actions |= ACTION_CONFIRM | ACTION_SHOOT;
    click = { x: event.clientX, y: event.clientY };
  });

  function has(set) {
    for (const code of set) if (held.has(code)) return true;
    return false;
  }

  return {
    get up() {
      return has(UP);
    },
    get down() {
      return has(DOWN);
    },
    get left() {
      return has(LEFT);
    },
    get right() {
      return has(RIGHT);
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** The last click point in screen pixels, if any, then forgotten. */
    takeClick() {
      const taken = click;
      click = null;
      return taken;
    },
  };
}
