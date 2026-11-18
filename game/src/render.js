// Drawing only: the city, the cars, the people, the HUD. Pixels out, no rules in.
import { PALETTE, clamp } from './config.js';
import {
  WORLD_W, WORLD_H, ROAD_HALF, VERTICAL_ROADS, HORIZONTAL_ROADS,
  WATER_Y, BEACH_Y, PARK, POND,
} from './world.js';
import { CAR_TYPES } from './cars.js';
import { DEBT_TOTAL } from './missions.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_DEAD = 'dead';
export const SCREEN_END = 'end';

export function makeCamera() {
  return { x: 1300, y: 1150, zoom: 1, tx: 1300, ty: 1150, tzoom: 1 };
}

export function updateCamera(cam, dt) {
  const k = Math.min(1, 5 * dt);
  cam.x += (cam.tx - cam.x) * k;
  cam.y += (cam.ty - cam.y) * k;
  cam.zoom += (cam.tzoom - cam.zoom) * k;
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let viewW = 0;
  let viewH = 0;
  let dpr = 1;

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    viewW = window.innerWidth;
    viewH = window.innerHeight;
    canvas.width = Math.round(viewW * dpr);
    canvas.height = Math.round(viewH * dpr);
  }
  resize();
  window.addEventListener('resize', resize);

  function text(value, x, y, size, color, align, weight) {
    ctx.font = `${weight || 400} ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    ctx.fillStyle = color;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(value, x, y);
  }

  function drawGround(time) {
    ctx.fillStyle = PALETTE.ground;
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    // The bay along the south edge, sand first, then water with slow wave lines.
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(0, BEACH_Y, WORLD_W, WATER_Y - BEACH_Y);
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(0, WATER_Y, WORLD_W, WORLD_H - WATER_Y);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i += 1) {
      const y = WATER_Y + 24 + i * 52;
      ctx.beginPath();
      for (let x = 0; x <= WORLD_W; x += 80) {
        const yy = y + Math.sin(x / 160 + time * 0.7 + i) * 5;
        if (x === 0) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    // Palm Park: grass, crossing paths, a pond.
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(PARK.x0, PARK.y0, PARK.x1 - PARK.x0, PARK.y1 - PARK.y0);
    ctx.fillStyle = PALETTE.parkPath;
    ctx.fillRect(1280, PARK.y0, 40, PARK.y1 - PARK.y0);
    ctx.fillRect(PARK.x0, 1130, PARK.x1 - PARK.x0, 40);
    ctx.fillStyle = PALETTE.waterDeep;
    ctx.beginPath();
    ctx.ellipse(POND.x, POND.y, POND.rx, POND.ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(POND.x, POND.y, POND.rx - 8, POND.ry - 6, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawRoads() {
    // Pavements first, so the asphalt sits inside them.
    ctx.fillStyle = PALETTE.sidewalk;
    for (const vx of VERTICAL_ROADS) ctx.fillRect(vx - ROAD_HALF - 16, 0, (ROAD_HALF + 16) * 2, BEACH_Y + 8);
    for (const hy of HORIZONTAL_ROADS) ctx.fillRect(0, hy - ROAD_HALF - 16, WORLD_W, (ROAD_HALF + 16) * 2);
    ctx.fillStyle = PALETTE.road;
    for (const vx of VERTICAL_ROADS) ctx.fillRect(vx - ROAD_HALF, 0, ROAD_HALF * 2, BEACH_Y + 8);
    for (const hy of HORIZONTAL_ROADS) ctx.fillRect(0, hy - ROAD_HALF, WORLD_W, ROAD_HALF * 2);
    // Centre dashes, skipped where roads cross.
    ctx.fillStyle = PALETTE.dash;
    for (const vx of VERTICAL_ROADS) {
      for (let y = 20; y < BEACH_Y; y += 56) {
        if (HORIZONTAL_ROADS.some((hy) => Math.abs(y + 16 - hy) < ROAD_HALF + 26)) continue;
        ctx.fillRect(vx - 3, y, 6, 28);
      }
    }
    for (const hy of HORIZONTAL_ROADS) {
      for (let x = 20; x < WORLD_W; x += 56) {
        if (VERTICAL_ROADS.some((vx) => Math.abs(x + 16 - vx) < ROAD_HALF + 26)) continue;
        ctx.fillRect(x, hy - 3, 28, 6);
      }
    }
    // Edge lines.
    ctx.fillStyle = PALETTE.roadLine;
    for (const vx of VERTICAL_ROADS) {
      ctx.fillRect(vx - ROAD_HALF + 2, 0, 2, BEACH_Y + 8);
      ctx.fillRect(vx + ROAD_HALF - 4, 0, 2, BEACH_Y + 8);
    }
    for (const hy of HORIZONTAL_ROADS) {
      ctx.fillRect(0, hy - ROAD_HALF + 2, WORLD_W, 2);
      ctx.fillRect(0, hy + ROAD_HALF - 4, WORLD_W, 2);
    }
  }

  function drawBuildings(world, view) {
    for (const b of world.buildings) {
      if (b.x > view.x1 || b.x + b.w < view.x0 || b.y > view.y1 || b.y + b.h < view.y0) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.20)';
      rr(ctx, b.x + 9, b.y + 11, b.w, b.h, 4);
      ctx.fill();
      ctx.fillStyle = b.color;
      rr(ctx, b.x, b.y, b.w, b.h, 4);
      ctx.fill();
      ctx.strokeStyle = PALETTE.roofLine;
      ctx.lineWidth = 3;
      rr(ctx, b.x + 2, b.y + 2, b.w - 4, b.h - 4, 3);
      ctx.stroke();
      // Rooftop details: a lighter inner slab and two small boxes.
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      rr(ctx, b.x + 10, b.y + 10, b.w - 20, b.h - 20, 3);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(b.x + 14, b.y + 14, 18, 12);
      ctx.fillRect(b.x + b.w - 32, b.y + b.h - 26, 18, 12);
    }
  }

  function drawTrees(world, view) {
    for (const t of world.trees) {
      if (t.x < view.x0 || t.x > view.x1 || t.y < view.y0 || t.y > view.y1) continue;
      ctx.fillStyle = PALETTE.trunk;
      ctx.fillRect(t.x - 2, t.y - 2, 4, 8);
      ctx.fillStyle = PALETTE.treeDark;
      ctx.beginPath();
      ctx.arc(t.x + 2, t.y + 2, t.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PALETTE.tree;
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath();
      ctx.arc(t.x - t.r * 0.3, t.y - t.r * 0.3, t.r * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const p of world.palms) {
      if (p.x < view.x0 || p.x > view.x1 || p.y < view.y0 || p.y > view.y1) continue;
      ctx.strokeStyle = PALETTE.trunk;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y + 10);
      ctx.lineTo(p.x + 3, p.y - 12);
      ctx.stroke();
      ctx.strokeStyle = PALETTE.palm;
      ctx.lineWidth = 3;
      for (let i = 0; i < 5; i += 1) {
        const a = (i / 5) * Math.PI * 2 + 0.4;
        ctx.beginPath();
        ctx.moveTo(p.x + 3, p.y - 12);
        ctx.lineTo(p.x + 3 + Math.cos(a) * 16, p.y - 12 + Math.sin(a) * 10 + 6);
        ctx.stroke();
      }
    }
  }

  function drawCar(car, isPlayer, time) {
    const t = CAR_TYPES[car.type];
    const L = t.len;
    const W = t.wid;
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.heading);
    if (car.type === 'motorbike') {
      // A bike is two wheels and a narrow frame, with a rider sitting on it.
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath();
      ctx.ellipse(2, 3, L / 2, W / 2 + 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1c1c22';
      ctx.beginPath();
      ctx.arc(-L / 2 + 4, 0, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(L / 2 - 4, 0, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = car.color;
      rr(ctx, -L / 2 + 2, -W / 2, L - 4, W, 5);
      ctx.fill();
      if (isPlayer) {
        ctx.strokeStyle = '#f2c94c';
        ctx.lineWidth = 2;
        rr(ctx, -L / 2 - 3, -W / 2 - 3, L + 6, W + 6, 7);
        ctx.stroke();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        rr(ctx, -L / 2 + 2, -W / 2, L - 4, W, 5);
        ctx.stroke();
      }
      // The rider: a dark helmet and shoulders over the frame.
      ctx.fillStyle = '#20242e';
      ctx.beginPath();
      ctx.arc(-2, 0, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffe9a8';
      ctx.beginPath();
      ctx.arc(L / 2 - 2, -2, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    rr(ctx, -L / 2 + 3, -W / 2 + 4, L, W, 7);
    ctx.fill();
    // Wheels.
    ctx.fillStyle = '#1c1c22';
    ctx.fillRect(-L / 2 + 5, -W / 2 - 3, 11, 5);
    ctx.fillRect(-L / 2 + 5, W / 2 - 2, 11, 5);
    ctx.fillRect(L / 2 - 16, -W / 2 - 3, 11, 5);
    ctx.fillRect(L / 2 - 16, W / 2 - 2, 11, 5);
    // Body, with a thick white ring and a gold outer ring when it is the player's
    // car, so it reads as yours even at a distance.
    ctx.fillStyle = car.color;
    rr(ctx, -L / 2, -W / 2, L, W, 7);
    ctx.fill();
    if (isPlayer) {
      ctx.strokeStyle = '#f2c94c';
      ctx.lineWidth = 4;
      rr(ctx, -L / 2 - 4, -W / 2 - 4, L + 8, W + 8, 9);
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 6;
      rr(ctx, -L / 2, -W / 2, L, W, 7);
      ctx.stroke();
    }
    ctx.fillStyle = PALETTE.glass;
    rr(ctx, -L / 2 + 9, -W / 2 + 4, L - 20, W - 8, 4);
    ctx.fill();
    ctx.fillStyle = car.color;
    rr(ctx, -L / 2 + 15, -W / 2 + 4, 9, W - 8, 2);
    ctx.fill();
    if (car.type === 'taxi') {
      ctx.fillStyle = '#f5d90a';
      ctx.fillRect(-6, -W / 2 - 2, 12, 5);
    }
    if (car.type === 'police') {
      // White doors down the middle, and a light bar on the roof that swaps
      // red and blue a few times a second.
      ctx.fillStyle = '#f2f2f2';
      ctx.fillRect(-9, -W / 2, 18, W);
      const swap = Math.floor(time * 3.5) % 2 === 0;
      ctx.fillStyle = swap ? '#ff3b30' : '#2f7bff';
      ctx.fillRect(-12, -W / 2 - 2, 9, 5);
      ctx.fillStyle = swap ? '#2f7bff' : '#ff3b30';
      ctx.fillRect(3, -W / 2 - 2, 9, 5);
      ctx.fillStyle = '#f5d90a';
      ctx.font = '700 8px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('POLICE', 0, 3);
    }
    // Headlights.
    ctx.fillStyle = '#ffe9a8';
    ctx.beginPath();
    ctx.arc(L / 2 - 2, -W / 2 + 5, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(L / 2 - 2, W / 2 - 5, 2.5, 0, Math.PI * 2);
    ctx.fill();
    // Brake lights.
    if (car.brake) {
      ctx.fillStyle = '#ff3b30';
      ctx.fillRect(-L / 2 - 1, -W / 2 + 4, 3, 5);
      ctx.fillRect(-L / 2 - 1, W / 2 - 9, 3, 5);
    }
    ctx.restore();
  }

// The mission marker: a pulsing ring, a pointer above it, and a label.
  function drawMarker(marker, time) {
    const pulse = 1 + Math.sin(time * 4) * 0.12;
    const color = marker.kind === 'cafe' ? '#2fb5a3' : '#f2c94c';
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(marker.x, marker.y, 34 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(marker.x, marker.y - 54);
    ctx.lineTo(marker.x + 11, marker.y - 38);
    ctx.lineTo(marker.x - 11, marker.y - 38);
    ctx.closePath();
    ctx.fill();
    ctx.font = '700 15px system-ui, -apple-system, "Segoe UI", sans-serif';
    const w = ctx.measureText(marker.label).width + 22;
    ctx.fillStyle = 'rgba(20,22,30,0.92)';
    rr(ctx, marker.x - w / 2, marker.y - 88, w, 26, 6);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(marker.label, marker.x, marker.y - 70);
  }

  // The lockup yard: a dashed outline on the sand where the stolen car goes.
  function drawLockupZone(lockup) {
    ctx.strokeStyle = '#f2c94c';
    ctx.lineWidth = 4;
    ctx.setLineDash([14, 10]);
    ctx.strokeRect(lockup.x - 90, lockup.y - 60, 180, 120);
    ctx.setLineDash([]);
    ctx.font = '700 15px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f2c94c';
    ctx.fillText('LOCKUP', lockup.x, lockup.y - 72);
  }

  function drawPed(p) {
    if (p.state === 'down') {
      // Lying flat where they fell, head to one side.
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 2, 11, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 11, 5, p.heading, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = p.skin;
      ctx.beginPath();
      ctx.arc(p.x + Math.cos(p.heading) * 13, p.y + Math.sin(p.heading) * 13, 4.5, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(p.x + 1, p.y + 3, 7, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = p.skin;
    ctx.beginPath();
    ctx.arc(p.x, p.y - 2, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Rae on foot: a gold ring and a pointer above her, so she is never a lone dot.
  function drawPlayerOnFoot(player, time) {
    const pulse = 1 + Math.sin(time * 4) * 0.1;
    ctx.strokeStyle = '#f2c94c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(player.x, player.y, 17 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#f2c94c';
    ctx.beginPath();
    ctx.moveTo(player.x, player.y - 30);
    ctx.lineTo(player.x + 7, player.y - 20);
    ctx.lineTo(player.x - 7, player.y - 20);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(player.x + 1, player.y + 4, 9, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e86a2c';
    ctx.beginPath();
    ctx.arc(player.x, player.y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(player.x, player.y, 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#f0c8a0';
    ctx.beginPath();
    ctx.arc(player.x, player.y - 2, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#e86a2c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(player.x, player.y);
    ctx.lineTo(player.x + Math.cos(player.heading) * 12, player.y + Math.sin(player.heading) * 12);
    ctx.stroke();
  }

  // One of Deke's crew: a heavier figure in dark red, with a red bandana.
  function drawGoon(g) {
    if (g.state === 'down') {
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      ctx.ellipse(g.x, g.y + 2, 12, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = g.color;
      ctx.beginPath();
      ctx.ellipse(g.x, g.y, 12, 5, g.heading, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = g.skin;
      ctx.beginPath();
      ctx.arc(g.x + Math.cos(g.heading) * 14, g.y + Math.sin(g.heading) * 14, 5, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(g.x + 1, g.y + 4, 10, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = g.color;
    ctx.beginPath();
    ctx.arc(g.x, g.y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c22f2f';
    ctx.beginPath();
    ctx.arc(g.x, g.y - 3, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = g.skin;
    ctx.beginPath();
    ctx.arc(g.x, g.y - 2, 4.5, 0, Math.PI * 2);
    ctx.fill();
    // A health bar over every goon from the start, so a fight reads at a glance.
    ctx.fillStyle = 'rgba(20,22,30,0.92)';
    ctx.fillRect(g.x - 14, g.y - 24, 28, 5);
    ctx.fillStyle = '#ff5a4a';
    ctx.fillRect(g.x - 13, g.y - 23, 26 * Math.max(0, g.health / g.maxHealth), 3);
  }

  // A bullet in flight: a short bright streak along its direction.
  function drawBullet(b) {
    const len = 14;
    const nx = b.vx / Math.hypot(b.vx, b.vy);
    const ny = b.vy / Math.hypot(b.vx, b.vy);
    ctx.strokeStyle = '#ffe9a8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(b.x - nx * len, b.y - ny * len);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(b.x, b.y, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // A punch landing: a big bright arc in front of the thrower, fading fast.
  function drawSwing(s) {
    const alpha = s.timer / s.max;
    ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(s.x, s.y, 46, s.heading - 0.9, s.heading + 0.9);
    ctx.stroke();
    ctx.strokeStyle = `rgba(242,201,76,${0.8 * alpha})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(s.x, s.y, 54, s.heading - 0.7, s.heading + 0.7);
    ctx.stroke();
  }

  // A hit spark: a small star where a punch or a bullet landed.
  function drawSpark(s) {
    const alpha = s.timer / s.max;
    ctx.strokeStyle = `rgba(255,233,168,${alpha})`;
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i += 1) {
      const a = (i / 4) * Math.PI * 2 + 0.6;
      ctx.beginPath();
      ctx.moveTo(s.x + Math.cos(a) * 3, s.y + Math.sin(a) * 3);
      ctx.lineTo(s.x + Math.cos(a) * 10, s.y + Math.sin(a) * 10);
      ctx.stroke();
    }
  }

  function drawHud(state, time) {
    const { player, world } = state;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const district = world.districtAt(player.x, player.y);
    ctx.fillStyle = 'rgb(20,22,30)';
    rr(ctx, 14, 14, 340, 86, 10);
    ctx.fill();
    text('SOLMAR BAY', 28, 42, 20, '#f5efe0', 'left', 700);
    text(district, 28, 66, 15, '#e8e0c0', 'left');
    if (player.mode === 'car') {
      const kmh = Math.round(Math.abs(player.car.speed) * 0.36);
      text(`${kmh} km/h  ·  driving`, 28, 88, 15, '#ffffff', 'left');
    } else {
      text('On foot  ·  E near a car to get in or take it', 28, 88, 15, '#ffffff', 'left');
    }
    // Wanted stars, top right. While the player is out of sight and losing heat,
    // the lit stars blink.
    if (state.wanted) {
      const w = state.wanted;
      ctx.fillStyle = 'rgb(20,22,30)';
      rr(ctx, viewW - 224, 14, 210, 44, 10);
      ctx.fill();
      const hiding = w.level > 0 && w.hideTimer > 0;
      const blink = hiding && Math.floor(time * 2.5) % 2 === 0;
      for (let i = 0; i < 5; i += 1) {
        const filled = i < w.level;
        const color = filled ? (blink ? 'rgba(242,201,76,0.4)' : '#f2c94c') : 'rgba(255,255,255,0.25)';
        text('★', viewW - 208 + i * 34, 46, 24, color, 'left', 700);
      }
      // Money underneath, with WANTED or HIDING beside it.
      ctx.fillStyle = 'rgb(20,22,30)';
      rr(ctx, viewW - 224, 66, 210, 36, 10);
      ctx.fill();
      if (state.wallet) text(`$${state.wallet.money}`, viewW - 208, 91, 18, '#7ddc8a', 'left', 700);
      if (w.level > 0) {
        text(hiding ? 'HIDING…' : 'WANTED', viewW - 30, 91, 13, hiding ? '#f2c94c' : '#ff8a7a', 'right', 700);
      }
      // While hiding, a bar shows how close the next star is to dropping.
      if (hiding) {
        const frac = Math.max(0, Math.min(1, w.hideTimer / 6));
        const secs = Math.max(0, Math.ceil(6 - w.hideTimer));
        ctx.fillStyle = 'rgb(20,22,30)';
        rr(ctx, viewW - 224, 110, 210, 38, 10);
        ctx.fill();
        text(`Losing them… star drops in ${secs}s`, viewW - 208, 126, 12, '#f2c94c', 'left', 700);
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        rr(ctx, viewW - 208, 132, 178, 8, 4);
        ctx.fill();
        ctx.fillStyle = '#f2c94c';
        if (frac > 0) {
          rr(ctx, viewW - 208, 132, Math.max(8, 178 * frac), 8, 4);
          ctx.fill();
        }
      }
    }
    // While muted, a red chip sits at the top centre of the HUD.
    if (state.muted) {
      ctx.font = '700 14px system-ui, -apple-system, "Segoe UI", sans-serif';
      const chipW = ctx.measureText('MUTED').width + 28;
      ctx.fillStyle = '#c22f2f';
      rr(ctx, viewW / 2 - chipW / 2, 14, chipW, 30, 8);
      ctx.fill();
      text('MUTED', viewW / 2, 35, 14, '#ffffff', 'center', 700);
    }
    // The running job, or the next one waiting: title, goal, time left, reward,
    // and the debt still to pay, falling as jobs are finished.
    if (state.panel) {
      const p = state.panel;
      ctx.fillStyle = 'rgb(20,22,30)';
      rr(ctx, 14, 110, 340, 100, 10);
      ctx.fill();
      text(p.title, 28, 136, 16, '#f2c94c', 'left', 700);
      text(p.goal, 28, 158, 14, '#ffffff', 'left');
      if (p.state === 'active') {
        const mm = Math.floor(p.timer / 60);
        const ss = String(Math.floor(p.timer % 60)).padStart(2, '0');
        const tcol = p.timer < 30 ? '#ff8a7a' : '#e8e0c0';
        text(`${mm}:${ss} left  ·  $${p.reward}`, 28, 178, 14, tcol, 'left', 700);
      } else if (p.state === 'ready') {
        text(`Reward $${p.reward}`, 28, 178, 14, '#e8e0c0', 'left', 700);
      }
      text(`Debt left: $${p.debtLeft.toLocaleString('en-US')}`, 28, 200, 14, '#e8e0c0', 'left');
    }
    // An arrow at the screen edge points at a marker that is out of view.
    if (state.marker) {
      const cam = state.camera;
      const sx = (state.marker.x - cam.x) * cam.zoom + viewW / 2;
      const sy = (state.marker.y - cam.y) * cam.zoom + viewH / 2;
      const margin = 46;
      if (sx < margin || sx > viewW - margin || sy < margin || sy > viewH - margin) {
        let cx = clamp(sx, margin, viewW - margin);
        let cy = clamp(sy, margin, viewH - margin);
        const ang = Math.atan2(sy - viewH / 2, sx - viewW / 2);
        const dist = Math.round(Math.hypot(state.marker.x - player.x, state.marker.y - player.y));
        // The distance label sits on the same dark pill as the marker labels.
        const label = `${dist}m`;
        // HUD panels the arrow and its label must stay clear of, so the label
        // never prints over HUD text.
        const panels = [
          { x: 14, y: 14, w: 340, h: 86 },
          { x: viewW - 224, y: 14, w: 210, h: 44 },
          { x: viewW - 224, y: 66, w: 210, h: 36 },
          { x: viewW - 224, y: 110, w: 210, h: 38 },
          { x: 14, y: 110, w: 340, h: 100 },
          { x: 14, y: viewH - 64, w: 210, h: 50 },
          { x: viewW - 200, y: viewH - 154, w: 186, h: 140 },
        ];
        if (state.banner && state.banner.timer > 0) {
          ctx.font = '700 18px system-ui, -apple-system, "Segoe UI", sans-serif';
          const bw = Math.min(viewW - 40, ctx.measureText(state.banner.text).width + 48);
          panels.push({ x: viewW / 2 - bw / 2, y: 226, w: bw, h: 40 });
        }
        if (state.muted) {
          ctx.font = '700 14px system-ui, -apple-system, "Segoe UI", sans-serif';
          const chipW = ctx.measureText('MUTED').width + 28;
          panels.push({ x: viewW / 2 - chipW / 2, y: 14, w: chipW, h: 30 });
        }
        // Road centre lines are obstacles for the label pill: a pale dash
        // behind the pill reads as a smudge at thumbnail size, so the pill
        // slides clear of the road's centre band (20 px wide in world space,
        // mapped to screen space through the camera). Only the pill rect is
        // checked, not the whole arrow+label box — the arrow is a solid
        // triangle and covers a line cleanly, while the pill is what carries
        // the glyphs. Checking the box against a full-frame line would pin
        // the arrow where a vertical and a horizontal line cross, because no
        // single-axis slide can clear both at once.
        const z = cam.zoom;
        const centreBands = [];
        for (const vx of VERTICAL_ROADS) {
          const sx = (vx - cam.x) * z + viewW / 2;
          centreBands.push({ x: sx - 10 * z, y: 0, w: 20 * z, h: viewH });
        }
        for (const hy of HORIZONTAL_ROADS) {
          const sy = (hy - cam.y) * z + viewH / 2;
          centreBands.push({ x: 0, y: sy - 10 * z, w: viewW, h: 20 * z });
        }
        // Road edge lines are obstacles for the label pill only: a pale edge
        // line behind the pill shows through it, so the pill must clear the
        // lines themselves. The band is exactly the 2 px line, no margin —
        // the arrow is solid and covers a line, so only the pill rect is
        // checked, not the whole arrow+label box, and a pill sitting flush
        // against a line (like the mission shot's) is not pushed for nothing.
        // An edge line sits 3 px inside the road's edge, so its centre is
        // ROAD_HALF - 3 from the road centre.
        const roadBands = [];
        for (const vx of VERTICAL_ROADS) {
          for (const off of [-1, 1]) {
            const sx = (vx + off * (ROAD_HALF - 3) - cam.x) * z + viewW / 2;
            roadBands.push({ x: sx - z, y: 0, w: 2 * z, h: viewH });
          }
        }
        for (const hy of HORIZONTAL_ROADS) {
          for (const off of [-1, 1]) {
            const sy = (hy + off * (ROAD_HALF - 3) - cam.y) * z + viewH / 2;
            roadBands.push({ x: 0, y: sy - z, w: viewW, h: 2 * z });
          }
        }
        ctx.font = '700 13px system-ui, -apple-system, "Segoe UI", sans-serif';
        const lw = ctx.measureText(label).width + 16;
        // Slide the arrow along the screen edge it sits on until the arrow
        // and its label pill clear everything. A slide only counts when the
        // position it lands on is clear of everything — the arrow+label box
        // clear of every HUD panel, and the label pill clear of every road
        // line (centre bands and edge lines). Checking only the one panel
        // being escaped lets the arrow ping-pong between two adjacent panels,
        // sliding away from one onto the other until the loop runs out.
        const clears = (nx, ny) => {
          const ux = nx - lw / 2;
          const uy = ny - 18;
          const boxOk = panels.every((p) => ux >= p.x + p.w || ux + lw <= p.x || uy >= p.y + p.h || uy + 62 <= p.y);
          const pillOk = [...centreBands, ...roadBands].every((p) => ux >= p.x + p.w || ux + lw <= p.x || ny + 20 >= p.y + p.h || ny + 44 <= p.y);
          return boxOk && pillOk;
        };
        for (let n = 0; n < 8; n += 1) {
          const ux = cx - lw / 2;
          const uy = cy - 18;
          // Every obstacle the arrow+label currently overlaps: HUD panels
          // with the arrow+label box, road lines (centre bands and edge
          // lines) with the label pill rect. Landing spots are offered just
          // past every blocker, not just the first one found — a slide away
          // from one panel that lands on the next is no escape at all.
          const blockers = panels.filter((p) => ux < p.x + p.w && ux + lw > p.x && uy < p.y + p.h && uy + 62 > p.y);
          for (const p of [...centreBands, ...roadBands]) {
            if (ux < p.x + p.w && ux + lw > p.x && cy + 20 < p.y + p.h && cy + 44 > p.y) blockers.push(p);
          }
          if (!blockers.length) break;
          const onTopBottom = cy <= margin + 0.5 || cy >= viewH - margin - 0.5;
          const onSide = cx <= margin + 0.5 || cx >= viewW - margin - 0.5;
          // Slide along the edge the arrow sits on first; a road line spanning
          // the whole frame cannot be escaped that way, so fall back to
          // sliding across it. Landing spots are offered just past every
          // obstacle, not just the ones the arrow currently overlaps — a spot
          // just past one panel can land on the next, and only a spot past
          // all of them is an escape.
          const slideX = () => {
            const options = [];
            for (const b of [...panels, ...centreBands, ...roadBands]) {
              options.push(clamp(b.x - 8 - lw / 2, margin, viewW - margin));
              options.push(clamp(b.x + b.w + 8 + lw / 2, margin, viewW - margin));
            }
            const good = [...new Set(options)].filter((v) => v !== cx && clears(v, cy));
            if (!good.length) return false;
            cx = good.reduce((best, v) => (Math.abs(v - cx) < Math.abs(best - cx) ? v : best), good[0]);
            return true;
          };
          const slideY = () => {
            const options = [];
            for (const b of [...panels, ...centreBands, ...roadBands]) {
              options.push(clamp(b.y - 8 - 44, margin, viewH - margin));
              options.push(clamp(b.y + b.h + 8 + 18, margin, viewH - margin));
            }
            const good = [...new Set(options)].filter((v) => v !== cy && clears(cx, v));
            if (!good.length) return false;
            cy = good.reduce((best, v) => (Math.abs(v - cy) < Math.abs(best - cy) ? v : best), good[0]);
            return true;
          };
          let moved = false;
          if (onTopBottom) moved = slideX() || slideY();
          else if (onSide) moved = slideY() || slideX();
          else moved = slideX() || slideY();
          if (!moved) break;
        }
        ctx.fillStyle = state.marker.kind === 'cafe' ? '#2fb5a3' : '#f2c94c';
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(ang);
        ctx.beginPath();
        ctx.moveTo(16, 0);
        ctx.lineTo(-10, -11);
        ctx.lineTo(-10, 11);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = 'rgba(20,22,30,0.92)';
        rr(ctx, cx - lw / 2, cy + 20, lw, 24, 6);
        ctx.fill();
        text(label, cx, cy + 36, 13, '#ffffff', 'center', 700);
      }
    }
    // A short message below the HUD panels, fading after a few seconds. It sits
    // low enough never to cover the district box, the stars or the job panel.
    if (state.banner && state.banner.timer > 0) {
      const alpha = Math.min(1, state.banner.timer);
      ctx.font = '700 18px system-ui, -apple-system, "Segoe UI", sans-serif';
      const w = Math.min(viewW - 40, ctx.measureText(state.banner.text).width + 48);
      ctx.fillStyle = `rgba(20,22,30,${alpha})`;
      rr(ctx, viewW / 2 - w / 2, 226, w, 40, 10);
      ctx.fill();
      text(state.banner.text, viewW / 2, 254, 18, `rgba(255,255,255,${alpha})`, 'center', 700);
    }
    // Health, bottom left: a bar that drains from green to red.
    if (state.combat) {
      const c = state.combat;
      const frac = Math.max(0, c.health / c.maxHealth);
      const col = frac > 0.5 ? '#7ddc8a' : frac > 0.25 ? '#f2c94c' : '#ff5a4a';
      ctx.fillStyle = 'rgb(20,22,30)';
      rr(ctx, 14, viewH - 64, 210, 50, 10);
      ctx.fill();
      text('HEALTH', 28, viewH - 40, 12, '#e8e0c0', 'left', 700);
      text(`${Math.ceil(c.health)}`, 210, viewH - 40, 13, '#ffffff', 'right', 700);
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      rr(ctx, 28, viewH - 32, 182, 12, 6);
      ctx.fill();
      ctx.fillStyle = col;
      if (frac > 0) {
        rr(ctx, 28, viewH - 32, Math.max(8, 182 * frac), 12, 6);
        ctx.fill();
      }
    }
    // The minimap, bottom right: the whole city at a glance — roads, the bay,
    // the park, the player, the police, and the gold marker.
    {
      const mw = 186;
      const mh = 140;
      const mx = viewW - mw - 14;
      const my = viewH - mh - 14;
      const s = mw / WORLD_W;
      ctx.fillStyle = 'rgb(20,22,30)';
      rr(ctx, mx, my, mw, mh, 10);
      ctx.fill();
      ctx.save();
      ctx.beginPath();
      rr(ctx, mx, my, mw, mh, 10);
      ctx.clip();
      ctx.fillStyle = '#8a7a5c';
      ctx.fillRect(mx, my, mw, mh);
      ctx.fillStyle = '#39a0c2';
      ctx.fillRect(mx, my + WATER_Y * s, mw, mh);
      ctx.fillStyle = '#86b364';
      ctx.fillRect(mx + PARK.x0 * s, my + PARK.y0 * s, (PARK.x1 - PARK.x0) * s, (PARK.y1 - PARK.y0) * s);
      ctx.fillStyle = '#55545c';
      for (const vx of VERTICAL_ROADS) ctx.fillRect(mx + vx * s - 2, my, 4, mh);
      for (const hy of HORIZONTAL_ROADS) ctx.fillRect(mx, my + hy * s - 2, mw, 4);
      for (const car of state.traffic || []) {
        ctx.fillStyle = 'rgba(223,227,230,0.75)';
        ctx.fillRect(mx + car.x * s - 1, my + car.y * s - 1, 2, 2);
      }
      for (const pc of state.police || []) {
        ctx.fillStyle = '#2f7bff';
        ctx.beginPath();
        ctx.arc(mx + pc.x * s, my + pc.y * s, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      if (state.markedCar) {
        ctx.strokeStyle = '#f2c94c';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(mx + state.markedCar.x * s, my + state.markedCar.y * s, 4, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (state.marker) {
        const pulse = 1 + Math.sin(time * 4) * 0.25;
        ctx.fillStyle = state.marker.kind === 'cafe' ? '#2fb5a3' : '#f2c94c';
        ctx.beginPath();
        ctx.arc(mx + state.marker.x * s, my + state.marker.y * s, 3.5 * pulse, 0, Math.PI * 2);
        ctx.fill();
      }
      // The player: a white arrow pointing where Rae faces.
      ctx.fillStyle = '#ffffff';
      ctx.save();
      ctx.translate(mx + player.x * s, my + player.y * s);
      ctx.rotate(player.heading);
      ctx.beginPath();
      ctx.moveTo(6, 0);
      ctx.lineTo(-4, -4);
      ctx.lineTo(-4, 4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.restore();
      text('SOLMAR BAY', mx + 8, my + mh - 8, 11, 'rgba(255,255,255,0.75)', 'left', 700);
    }
    if (state.screen === SCREEN_TITLE) {
      ctx.fillStyle = 'rgba(20,22,30,0.55)';
      ctx.fillRect(0, 0, viewW, viewH);
      text('SOLMAR BAY', viewW / 2, viewH / 2 - 70, 64, '#f5efe0', 'center', 800);
      text('An original open-world city game', viewW / 2, viewH / 2 - 30, 22, '#e8e0c0', 'center');
      text('Walk with WASD or arrows  ·  E gets in and out of cars', viewW / 2, viewH / 2 + 14, 18, '#ffffff', 'center');
      text('Drive with W to speed up, S to brake, A and D to steer', viewW / 2, viewH / 2 + 42, 18, '#ffffff', 'center');
      text('Space or F to punch, G or click to shoot. Deke’s crew fights back', viewW / 2, viewH / 2 + 70, 18, '#ffffff', 'center');
      text('Five jobs wait at Marls’ café, by the park. The story starts there', viewW / 2, viewH / 2 + 98, 18, '#f2c94c', 'center');
      text(`Rae owes Deke Kline $${DEBT_TOTAL.toLocaleString('en-US')}. Five jobs will pay it off.`, viewW / 2, viewH / 2 + 126, 18, '#f2c94c', 'center');
      if (state.saveInfo) {
        text(`Saved game: $${state.saveInfo.money}  ·  Job ${Math.min(state.saveInfo.current + 1, 5)} of 5  ·  press L to continue`, viewW / 2, viewH / 2 + 156, 18, '#7ddc8a', 'center', 700);
        text('Press Enter or click to start', viewW / 2, viewH / 2 + 186, 20, '#f2c94c', 'center', 700);
        text('M to mute the sound', viewW / 2, viewH / 2 + 214, 16, '#e8e0c0', 'center');
      } else {
        text('Press Enter or click to start', viewW / 2, viewH / 2 + 156, 20, '#f2c94c', 'center', 700);
        text('M to mute the sound', viewW / 2, viewH / 2 + 184, 16, '#e8e0c0', 'center');
      }
    } else if (state.screen === SCREEN_PAUSED) {
      ctx.fillStyle = 'rgba(20,22,30,0.55)';
      ctx.fillRect(0, 0, viewW, viewH);
      text('Paused', viewW / 2, viewH / 2 - 20, 48, '#f5efe0', 'center', 700);
      text('Progress saved. Pick up where you left off', viewW / 2, viewH / 2 + 18, 18, '#7ddc8a', 'center');
      text('Press Esc or P to carry on', viewW / 2, viewH / 2 + 48, 20, '#ffffff', 'center');
      text('WASD move and drive  ·  E car  ·  Space or F punch  ·  G or click shoot', viewW / 2, viewH / 2 + 80, 16, '#e8e0c0', 'center');
      text('M to mute the sound', viewW / 2, viewH / 2 + 108, 16, '#e8e0c0', 'center');
    } else if (state.screen === SCREEN_DEAD) {
      ctx.fillStyle = 'rgba(20,22,30,0.62)';
      ctx.fillRect(0, 0, viewW, viewH);
      text('Rae is down', viewW / 2, viewH / 2 - 30, 52, '#f5efe0', 'center', 800);
      text('Deke’s crew got the better of you.', viewW / 2, viewH / 2 + 8, 20, '#ffffff', 'center');
      const fine = state.combat ? state.combat.deathFine : 0;
      text(`They took $${fine} from your wallet.`, viewW / 2, viewH / 2 + 38, 20, '#ff8a7a', 'center');
      text('Press Enter to wake up at Marls’ café', viewW / 2, viewH / 2 + 76, 20, '#f2c94c', 'center', 700);
    } else if (state.screen === SCREEN_END) {
      ctx.fillStyle = 'rgba(20,22,30,0.55)';
      ctx.fillRect(0, 0, viewW, viewH);
      text('Debt paid', viewW / 2, viewH / 2 - 110, 56, '#f5efe0', 'center', 800);
      text('Solmar Bay is yours, Rae.', viewW / 2, viewH / 2 - 68, 22, '#f2c94c', 'center');
      const t = state.endTotals || { earned: 0 };
      const kills = state.combat ? state.combat.kills : 0;
      const walletMoney = state.wallet ? state.wallet.money : 0;
      text('Jobs finished: 5 of 5', viewW / 2, viewH / 2 - 24, 20, '#ffffff', 'center');
      text(`Money earned: $${t.earned}`, viewW / 2, viewH / 2 + 6, 20, '#7ddc8a', 'center', 700);
      text(`Goons beaten: ${kills}`, viewW / 2, viewH / 2 + 36, 20, '#ffffff', 'center');
      text(`Wallet: $${walletMoney}`, viewW / 2, viewH / 2 + 66, 20, '#ffffff', 'center');
      text('The city is yours. Free roam. Press Enter to keep driving.', viewW / 2, viewH / 2 + 112, 20, '#f2c94c', 'center', 700);
    }
  }

  // Skid marks behind sliding cars, and smoke puffs from exhaust and collisions.
  function drawSkidsAndSmoke(state) {
    for (const m of state.skids || []) {
      const alpha = Math.max(0, m.timer / m.max) * 0.5;
      ctx.strokeStyle = `rgba(20,20,24,${alpha})`;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(m.x1, m.y1);
      ctx.lineTo(m.x2, m.y2);
      ctx.stroke();
    }
    for (const p of state.smoke || []) {
      const frac = 1 - Math.max(0, p.timer / p.max);
      const alpha = (1 - frac) * 0.35;
      ctx.fillStyle = `rgba(200,200,205,${alpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r + frac * 14, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawSunTint() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const g = ctx.createRadialGradient(viewW * 0.72, viewH * 0.12, 40, viewW * 0.72, viewH * 0.12, Math.max(viewW, viewH));
    g.addColorStop(0, 'rgba(255,214,130,0.10)');
    g.addColorStop(1, 'rgba(255,214,130,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, viewW, viewH);
  }

  /** Paint one frame: the city, then the cars and people, then the HUD. */
  function draw(state, time) {
    const { world, player, traffic, parkedCars, peds, camera } = state;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = PALETTE.ground;
    ctx.fillRect(0, 0, viewW, viewH);
    const s = dpr * camera.zoom;
    ctx.setTransform(s, 0, 0, s, dpr * (viewW / 2 - camera.x * camera.zoom), dpr * (viewH / 2 - camera.y * camera.zoom));
    const view = {
      x0: camera.x - viewW / 2 / camera.zoom - 80,
      x1: camera.x + viewW / 2 / camera.zoom + 80,
      y0: camera.y - viewH / 2 / camera.zoom - 80,
      y1: camera.y + viewH / 2 / camera.zoom + 80,
    };
    drawGround(time);
    drawRoads();
    drawBuildings(world, view);
    drawTrees(world, view);
    drawSkidsAndSmoke(state);
    for (const car of parkedCars) {
      if (car.driver === 'parked') drawCar(car, false, time);
    }
    for (const car of traffic) drawCar(car, false, time);
    for (const car of state.police || []) drawCar(car, false, time);
    if (player.mode === 'car') drawCar(player.car, true, time);
    for (const p of peds) drawPed(p);
    if (player.mode === 'foot') drawPlayerOnFoot(player, time);
    if (state.combat) {
      for (const g of state.combat.enemies) drawGoon(g);
      for (const b of state.combat.bullets) drawBullet(b);
      for (const s of state.combat.swings) drawSwing(s);
      for (const s of state.combat.sparks) drawSpark(s);
    }
    // The stolen car gets a gold ring so the player can find it in a crowd.
    if (state.markedCar) {
      const pulse = 1 + Math.sin(time * 4) * 0.12;
      ctx.strokeStyle = '#f2c94c';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(state.markedCar.x, state.markedCar.y, 40 * pulse, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (state.lockupZone) drawLockupZone(state.lockupZone);
    // The mission marker waits until the game starts: on the title screen
    // the café marker sits behind the title and the title strikes through it.
    // And when the marker is out of view the HUD edge arrow points at it
    // instead: drawing the marker anyway puts its label pill in-frame while
    // its ring sits below the frame, and the arrow's triangle lands on the
    // label's letters ("GO HERE" reads "GO ▽ERE"). So the marker only draws
    // while its point is inside the same margin the edge arrow uses.
    let markerOnScreen = false;
    if (state.marker) {
      const sx = (state.marker.x - camera.x) * camera.zoom + viewW / 2;
      const sy = (state.marker.y - camera.y) * camera.zoom + viewH / 2;
      markerOnScreen = sx >= 46 && sx <= viewW - 46 && sy >= 46 && sy <= viewH - 46;
    }
    if (state.marker && state.screen !== SCREEN_TITLE && markerOnScreen) drawMarker(state.marker, time);
    drawSunTint();
    // A red edge flash while Rae is taking hits.
    if (state.combat && state.combat.hitFlash > 0) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const a = Math.min(0.4, state.combat.hitFlash * 0.55);
      const g = ctx.createRadialGradient(viewW / 2, viewH / 2, Math.min(viewW, viewH) * 0.32, viewW / 2, viewH / 2, Math.max(viewW, viewH) * 0.72);
      g.addColorStop(0, 'rgba(200,30,30,0)');
      g.addColorStop(1, `rgba(200,30,30,${a})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, viewW, viewH);
    }
    drawHud(state, time);
  }

  return { draw, resize };
}
