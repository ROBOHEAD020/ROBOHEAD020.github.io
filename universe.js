/* A small, dependency-free particle universe. All shapes are drawn, not screenshots. */
(() => {
  'use strict';
  const canvas = document.querySelector('#universe');
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return;
  const body = document.body;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const status = document.querySelector('#scene-status');
  const back = document.querySelector('#return-button');
  const motionButton = document.querySelector('#motion-toggle');
  const overlay = document.querySelector('#robot-overlay');
  const avatar = document.querySelector('#avatar');
  const TAU = Math.PI * 2;
  const colors = ['#e4f3ff', '#94cbe9', '#6c9bc7', '#ffd5aa', '#eab37d', '#b8cbc0', '#fff3cf'];
  let w = 0, h = 0, dpr = 1, mobile = false, count = 0;
  let scene = 'smile', pinned = null, hovered = null, focused = null, gbu = false;
  let paused = reduced.matches, frame = 0, last = 0, clock = 0, burst = 0;
  let outerBlend = 0, resizeTimer = 0, robotPinned = false, robotHover = false;
  let stars = [], galaxy = [], particles = [], targets = {}, outerMap;
  let pointer = { x: -9999, y: -9999, active: false };
  const rand = (a, b) => a + Math.random() * (b - a);
  const gaussian = () => Math.sqrt(-2 * Math.log(Math.max(.0001, Math.random()))) * Math.cos(TAU * Math.random());
  const glow = document.createElement('canvas');
  glow.width = colors.length * 40; glow.height = 32;
  const gc = glow.getContext('2d');
  colors.forEach((color, i) => {
    const x = i * 40 + 16;
    const g = gc.createRadialGradient(x, 16, 0, x, 16, 16);
    g.addColorStop(0, color); g.addColorStop(.08, color + 'ee');
    g.addColorStop(.22, color + '75'); g.addColorStop(.5, color + '18'); g.addColorStop(1, color + '00');
    gc.fillStyle = g; gc.fillRect(i * 40, 0, 32, 32);
  });
  const cloud = document.createElement('canvas');
  cloud.width = cloud.height = 256;
  const cc = cloud.getContext('2d');
  const cg = cc.createRadialGradient(128, 128, 0, 128, 128, 128);
  cg.addColorStop(0, '#4b729616'); cg.addColorStop(.4, '#34517b0c'); cg.addColorStop(1, '#34517b00');
  cc.fillStyle = cg; cc.fillRect(0, 0, 256, 256);

  function stamp(x, y, size, color, alpha = 1) {
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.drawImage(glow, color * 40, 0, 32, 32, x - size / 2, y - size / 2, size, size);
  }

  function textShape(text, font, width = 1000, height = 500) {
    const c = document.createElement('canvas'); c.width = width; c.height = height;
    const c2 = c.getContext('2d', { willReadFrequently: true });
    c2.fillStyle = '#e4f3ff'; c2.textAlign = 'center'; c2.textBaseline = 'middle'; c2.font = font;
    c2.fillText(text, width / 2, height / 2, width * .94);
    return sample(c, 3);
  }
  function sample(c, step) {
    const c2 = c.getContext('2d', { willReadFrequently: true });
    const pixels = c2.getImageData(0, 0, c.width, c.height).data;
    const points = [];
    for (let y = 0; y < c.height; y += step) for (let x = 0; x < c.width; x += step) {
      const k = (y * c.width + x) * 4;
      if (pixels[k + 3] > 65) {
        const r = pixels[k], g = pixels[k + 1], b = pixels[k + 2];
        const color = r > 240 && g > 195 ? 6 : r > b * 1.24 ? (r > 200 ? 3 : 4) : (g > r * 1.12 ? 5 : 0);
        points.push({ x: x + rand(-1.4, 1.4), y: y + rand(-1.4, 1.4), color });
      }
    }
    // Shuffle once so changing shapes doesn't reveal raster scan lines.
    for (let i = points.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1)); [points[i], points[j]] = [points[j], points[i]];
    }
    return points;
  }
  function fitPoints(points, sourceW, sourceH, cx, cy, width, height) {
    const s = Math.min(width / sourceW, height / sourceH);
    return points.map(p => ({ x: cx + (p.x - sourceW / 2) * s, y: cy + (p.y - sourceH / 2) * s, color: p.color }));
  }

  function flameShape(p, x, baseY, h, w, color) {
    p.fillStyle = color;
    p.beginPath();
    p.moveTo(x - w / 2, baseY);
    p.bezierCurveTo(x - w * .75, baseY - h * .32, x - w * .18, baseY - h * .55, x, baseY - h);
    p.bezierCurveTo(x + w * .18, baseY - h * .55, x + w * .75, baseY - h * .32, x + w / 2, baseY);
    p.quadraticCurveTo(x, baseY + w * .22, x - w / 2, baseY);
    p.fill();
  }

  function makeOuter() {
    const c = document.createElement('canvas');
    c.width = mobile ? 600 : 1150; c.height = mobile ? 850 : 700;
    const p = c.getContext('2d', { willReadFrequently: true });
    const cs = mobile ? .82 : 1;
    // Left: the expedition's name, warm and bright.
    const tx = mobile ? 300 : 285, ty = mobile ? 130 : 255;
    p.textAlign = 'center'; p.fillStyle = '#f2b87e';
    p.font = `400 ${mobile ? 42 : 58}px Georgia, serif`; p.fillText('O U T E R', tx, ty);
    p.font = `600 ${mobile ? 110 : 158}px Georgia, serif`; p.fillText('WILDS', tx, ty + (mobile ? 108 : 140));
    p.fillStyle = '#e6c8a2'; p.font = `${mobile ? 17 : 22}px "Microsoft YaHei", sans-serif`;
    p.fillText('星 际 拓 荒', tx, ty + (mobile ? 158 : 196));
    // Right: a campfire made of nothing but stars. Stone ring first.
    const fx = mobile ? 300 : 805, base = mobile ? 690 : 565;
    const ringX = 108 * cs, ringY = 34 * cs;
    for (let i = 0; i < 13; i++) {
      const a = i / 13 * TAU, sr = (13 + (i * 7) % 8) * cs;
      p.save(); p.translate(fx + Math.cos(a) * ringX, base + 26 * cs + Math.sin(a) * ringY); p.rotate(a + .4);
      p.fillStyle = i % 3 ? '#98a0a8' : '#7d8894';
      p.beginPath(); p.ellipse(0, 0, sr, sr * .78, 0, 0, TAU); p.fill(); p.restore();
    }
    // Crossed logs under the flame.
    p.strokeStyle = '#9a5a34'; p.lineWidth = 20 * cs; p.lineCap = 'round';
    p.beginPath(); p.moveTo(fx - 72 * cs, base + 22 * cs); p.lineTo(fx + 72 * cs, base - 6 * cs);
    p.moveTo(fx + 72 * cs, base + 22 * cs); p.lineTo(fx - 72 * cs, base - 6 * cs); p.stroke();
    p.strokeStyle = '#7c4a30'; p.beginPath(); p.moveTo(fx - 82 * cs, base + 14 * cs); p.lineTo(fx + 82 * cs, base + 14 * cs); p.stroke();
    // Ember bed: hot little stars where the logs meet.
    for (let i = 0; i < 46; i++) {
      const a = Math.random() * TAU, r = Math.random() * 34 * cs;
      p.fillStyle = ['#fff0c0', '#f09040', '#c2581a'][i % 3];
      p.beginPath(); p.arc(fx + Math.cos(a) * r * 1.3, base + 2 * cs + Math.sin(a) * r * .45, rand(1.5, 3.4) * cs, 0, TAU); p.fill();
    }
    // Layered flame: deep outer tongues, warm middle, near-white heart.
    flameShape(p, fx - 46 * cs, base, 148 * cs, 66 * cs, '#c2581a');
    flameShape(p, fx + 48 * cs, base, 128 * cs, 56 * cs, '#c2581a');
    flameShape(p, fx, base, 262 * cs, 122 * cs, '#c2581a');
    flameShape(p, fx - 8 * cs, base, 196 * cs, 78 * cs, '#f09040');
    flameShape(p, fx + 5 * cs, base, 126 * cs, 44 * cs, '#ffd88a');
    flameShape(p, fx - 5 * cs, base, 78 * cs, 26 * cs, '#fff2c8');
    // Sparks escaping upward.
    for (let i = 0; i < 22; i++) {
      const t = Math.random(), y = base - (250 + t * 130) * cs, drift = Math.sin(i * 2.4) * (8 + t * 30) * cs;
      p.fillStyle = i % 3 ? '#f09040' : '#fff0c0';
      p.beginPath(); p.arc(fx + drift, y, rand(1, 2.6) * cs, 0, TAU); p.fill();
    }
    const scale = Math.min(w * .94 / c.width, h * .76 / c.height);
    const ox = (w - c.width * scale) / 2, oy = (h - c.height * scale) / 2 - h * .035;
    outerMap = { scale, ox, oy, fx, fy: base, flameH: 262 * cs, flameW: 122 * cs };
    return sample(c, 3).map(pt => ({ x: ox + pt.x * scale, y: oy + pt.y * scale, color: pt.color }));
  }

  function layout() {
    const oldW = w, oldH = h;
    w = innerWidth; h = innerHeight; mobile = w <= 760;
    dpr = Math.min(devicePixelRatio || 1, 1.75);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    count = mobile ? 2800 : 5400;
    const rect = document.querySelector('main').getBoundingClientRect();
    const cx = mobile ? w * .5 : w * .755;
    const cy = mobile ? Math.min(h - 150, rect.bottom - 180) : h * .47;
    const sw = mobile ? Math.min(w * .78, 340) : Math.min(w * .42, h * .8, 720);
    targets.smile = fitPoints(textShape(':)', '300 390px "Segoe UI", sans-serif', 750, 550), 750, 550, cx, cy, sw, sw * 1.05);
    targets.interest = fitPoints(textShape('Interest', '400 175px Georgia, serif', 1000, 450), 1000, 450, cx, cy, mobile ? w * .86 : w * .5, sw * .8);
    targets.gbu = fitPoints(textShape('GBU', '600 290px "Bahnschrift", sans-serif'), 1000, 500, cx, mobile ? cy : h * .47, mobile ? w * .8 : w * .46, sw);
    targets.outer = makeOuter();
    stars = Array.from({ length: mobile ? 430 : 1000 }, () => ({ x: Math.random() * w, y: Math.random() * h, size: rand(.45, 1.5), phase: rand(0, TAU), color: Math.random() < .16 ? 3 : Math.floor(rand(0, 3)), depth: rand(.1, 1) }));
    galaxy = Array.from({ length: mobile ? 1800 : 3600 }, () => {
      const r = Math.pow(Math.random(), .65), arm = Math.floor(rand(0, 4));
      return { r, a: arm * TAU / 4 + r * 4.4 + gaussian() * (.14 + r * .09), z: gaussian() * .055, size: rand(.35, 1.0), color: Math.random() < .18 ? 3 : Math.floor(rand(0, 3)), phase: rand(0, TAU) };
    });
    const current = targets[scene];
    particles = Array.from({ length: count }, (_, i) => {
      const target = current[i % current.length];
      return { x: oldW && paused ? target.x : rand(0, w), y: oldH && paused ? target.y : rand(0, h), vx: 0, vy: 0, size: rand(.48, 1.35), phase: rand(0, TAU), color: Math.random() < .15 ? 3 : Math.floor(rand(0, 3)), light: Math.random() < .045 };
    });
    if (paused) settle();
    wake();
  }

  function drawBackground(time) {
    ctx.fillStyle = '#050910'; ctx.globalAlpha = 1; ctx.fillRect(0, 0, w, h);
    const centerX = mobile ? w * .58 : w * .66, centerY = h * .48;
    const radius = Math.max(w * .65, h * .75);
    ctx.globalAlpha = .8 - outerBlend * .55;
    ctx.drawImage(cloud, centerX - radius, centerY - radius * .55, radius * 2, radius * 1.1);
    const driftX = pointer.active ? (pointer.x - w / 2) * .004 : 0, driftY = pointer.active ? (pointer.y - h / 2) * .004 : 0;
    for (const s of stars) {
      const x = ((s.x + time * s.depth * .5) % w) + driftX * s.depth, y = s.y + driftY * s.depth;
      const a = (.35 + .25 * Math.sin(time * .35 + s.phase)) * (1 - outerBlend * .72);
      if (s.size > 1.35) stamp(x, y, s.size * 8, s.color, a);
      else { ctx.globalAlpha = a; ctx.fillStyle = colors[s.color]; ctx.fillRect(x, y, s.size, s.size); }
    }
    ctx.save(); ctx.translate(centerX, centerY); ctx.rotate(-.53);
    const gr = mobile ? w * .95 : Math.max(w * .58, h * .7);
    for (const s of galaxy) {
      const a = s.a + time * .012, x = Math.cos(a) * s.r * gr, y = (Math.sin(a) * s.r * .44 + s.z) * gr;
      const alpha = (.12 + (1 - s.r) * .32) * (1 - outerBlend * .88) * (.8 + Math.sin(time * .5 + s.phase) * .2);
      if (s.size > .975) stamp(x, y, 8, s.color, alpha * 1.6);
      else { ctx.globalAlpha = alpha; ctx.fillStyle = colors[s.color]; ctx.fillRect(x, y, s.size, s.size); }
    }
    ctx.restore(); ctx.globalAlpha = 1;
  }

  function updateParticles(dt, time, animate) {
    const shape = targets[scene];
    if (!shape?.length) return;
    const spring = burst > 0 ? .0015 : .019;
    const damp = Math.pow(burst > 0 ? .975 : .865, dt);
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i], target = shape[i % shape.length];
      if (animate) {
        const spread = scene === 'smile' ? 2.2 : .85;
        const tx = target.x + Math.sin(time * .38 + p.phase) * spread;
        const ty = target.y + Math.cos(time * .31 + p.phase * 1.5) * spread;
        p.vx += (tx - p.x) * spring * dt; p.vy += (ty - p.y) * spring * dt;
        if (pointer.active && !body.classList.contains('robot-open') && burst <= 0) {
          const dx = p.x - pointer.x, dy = p.y - pointer.y, dist = Math.hypot(dx, dy), range = mobile ? 80 : 135;
          if (dist < range && dist > .1) {
            const force = Math.pow(1 - dist / range, 2) * 4.5 * dt;
            p.vx += dx / dist * force; p.vy += dy / dist * force;
          }
        }
        p.vx *= damp; p.vy *= damp; p.x += p.vx * dt; p.y += p.vy * dt;
      }
      const alpha = .38 + .42 * (.5 + .5 * Math.sin(time * .7 + p.phase));
      const c = scene === 'outer' ? target.color : p.color;
      if (scene === 'outer') {
        // Every particle is a glowing star so the scene reads as a pure constellation.
        const a = .5 + .45 * (.5 + .5 * Math.sin(time * .7 + p.phase));
        stamp(p.x, p.y, p.size * 10, c, a);
        ctx.globalAlpha = a; ctx.fillStyle = colors[c];
        ctx.fillRect(p.x, p.y, Math.max(1, p.size * .8), Math.max(1, p.size * .8));
      } else if (p.light) stamp(p.x, p.y, p.size * 12, c, alpha);
      else { ctx.globalAlpha = alpha; ctx.fillStyle = colors[c]; ctx.fillRect(p.x, p.y, p.size, p.size); }
    }
    ctx.globalAlpha = 1;
  }
  function drawFire(time) {
    if (outerBlend < .01 || !outerMap) return;
    const m = outerMap;
    ctx.save();
    ctx.translate(m.ox + m.fx * m.scale, m.oy + m.fy * m.scale); ctx.scale(m.scale, m.scale);
    const pulse = 1 + Math.sin(time * 6.3) * .06;
    const midY = -m.flameH * .35;
    const light = ctx.createRadialGradient(0, midY, 4, 0, midY, m.flameH * 1.15 * pulse);
    light.addColorStop(0, '#ffb25b3d'); light.addColorStop(.45, '#fca04b14'); light.addColorStop(1, '#fca04b00');
    ctx.globalAlpha = outerBlend; ctx.fillStyle = light;
    ctx.fillRect(-m.flameH, -m.flameH * 1.8, m.flameH * 2, m.flameH * 2.4);
    // Three flickering flame layers echo the star-built flame and keep it alive.
    ctx.globalAlpha = outerBlend * .5;
    flameShape(ctx, Math.sin(time * 5.1) * 5, 0, m.flameH * pulse, m.flameW * (2 - pulse) * 1.05, '#e8763a');
    ctx.globalAlpha = outerBlend * .6;
    flameShape(ctx, Math.sin(time * 7.7 + 2) * 4, 0, m.flameH * .62 * (2 - pulse), m.flameW * .55, '#f5a04e');
    ctx.globalAlpha = outerBlend * .85;
    flameShape(ctx, Math.sin(time * 9.3) * 3, 0, m.flameH * .34 * pulse, m.flameW * .3, '#fff0c0');
    for (let i = 0; i < 26; i++) {
      const t = (time * .14 + i / 26) % 1;
      ctx.globalAlpha = outerBlend * (1 - t) * .9; ctx.fillStyle = i % 3 ? '#ffd99a' : '#f09040';
      ctx.fillRect(Math.sin(i * 4 + time * 1.3) * (4 + t * 28), -12 - t * m.flameH * 1.35, 1.6, 2.6);
    }
    ctx.restore(); ctx.globalAlpha = 1;
  }
  function render(now) {
    frame = 0;
    const elapsed = last ? Math.min((now - last) / 1000, .035) : .016;
    last = now;
    if (!paused) clock += elapsed;
    const dt = elapsed * 60;
    outerBlend += ((scene === 'outer' ? 1 : 0) - outerBlend) * (paused ? 1 : Math.min(1, dt * .045));
    drawBackground(clock);
    updateParticles(dt, clock, !paused);
    drawFire(clock);
    burst = Math.max(0, burst - elapsed);
    if (!paused && !document.hidden) frame = requestAnimationFrame(render);
  }
  function wake() { if (!frame && !document.hidden) { last = 0; frame = requestAnimationFrame(render); } }
  function settle() {
    const shape = targets[scene];
    particles.forEach((p, i) => { p.x = shape[i % shape.length].x; p.y = shape[i % shape.length].y; p.vx = p.vy = 0; });
  }
  function changeScene(next, explode = false) {
    if (next === scene) return;
    scene = next; body.classList.toggle('scene-outer', next === 'outer'); body.classList.toggle('scene-gbu', next === 'gbu');
    body.dataset.scene = next;
    back.hidden = next !== 'outer' && next !== 'gbu' && !pinned;
    document.querySelectorAll('[data-scene]').forEach(el => el.setAttribute('aria-pressed', String(pinned === el.dataset.scene)));
    document.querySelectorAll('[data-gbu]').forEach(el => el.setAttribute('aria-pressed', String(gbu)));
    const labels = {
      smile: ['A SMALL SMILE IN A BIG UNIVERSE', '拨动星光，给宇宙一点回应', '微笑星团已恢复。'],
      interest: ['CURIOSITY HAS ITS OWN GRAVITY', '保持好奇，尝试新事物', '右侧星群已组成 Interest。'],
      gbu: ['GOD BLESS YOU', '愿你所到之处，总有星光', '群星散开，重新组成 GBU。再次点击用户名或座右铭即可恢复。'],
      outer: ['', '', '星际拓荒：左侧是 OUTER WILDS，右侧是群星汇聚而成的篝火。']
    };
    document.querySelector('#scene-label').textContent = labels[next][0];
    document.querySelector('#scene-hint').textContent = labels[next][1]; status.textContent = labels[next][2];
    if (paused) settle();
    else if (explode) {
      burst = .72;
      particles.forEach(p => {
        const dx = p.x - w * (mobile ? .5 : .74), dy = p.y - h * .47;
        const angle = Math.atan2(dy, dx) + rand(-.35, .35), force = rand(9, 26);
        p.vx = Math.cos(angle) * force; p.vy = Math.sin(angle) * force;
      });
    }
    wake();
  }
  function resolve() { changeScene(gbu ? 'gbu' : (pinned || hovered || focused || 'smile')); }
  function reset() {
    gbu = false; pinned = hovered = focused = null;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    showRobot(false); robotPinned = robotHover = false;
    changeScene('smile'); back.hidden = true;
    document.querySelectorAll('[aria-pressed="true"]').forEach(el => { if (el !== motionButton) el.setAttribute('aria-pressed', 'false'); });
  }
  document.querySelectorAll('[data-gbu]').forEach(el => el.addEventListener('click', () => {
    gbu = !gbu; pinned = hovered = focused = null;
    changeScene(gbu ? 'gbu' : 'smile', true);
  }));
  document.querySelectorAll('[data-scene]').forEach(el => {
    const target = el.dataset.scene;
    el.addEventListener('pointerenter', event => {
      if (event.pointerType === 'touch' || !finePointer.matches) return;
      hovered = target; resolve();
    });
    el.addEventListener('pointerleave', () => { if (hovered === target) hovered = null; resolve(); });
    el.addEventListener('focus', () => { if (el.matches(':focus-visible')) { focused = target; resolve(); } });
    el.addEventListener('blur', () => { if (focused === target) focused = null; resolve(); });
    el.addEventListener('click', () => { gbu = false; pinned = pinned === target ? null : target; resolve(); });
  });
  // Interests has a generous hit area; About stays on its two explicit text controls.
  const interestSection = document.querySelector('.interests-chapter');
  interestSection.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch' && finePointer.matches) { hovered = 'interest'; resolve(); } });
  interestSection.addEventListener('pointerleave', () => { if (hovered === 'interest') hovered = null; resolve(); });

  function showRobot(open) {
    body.classList.toggle('robot-open', open); avatar.setAttribute('aria-expanded', String(open)); overlay.setAttribute('aria-hidden', String(!open));
    if (open) status.textContent = '更新最高指令...完成。保持温柔，保持好奇。';
    wake();
  }
  avatar.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch' && finePointer.matches) { robotHover = true; showRobot(true); } });
  avatar.addEventListener('pointerleave', () => { robotHover = false; showRobot(robotPinned); });
  avatar.addEventListener('focus', () => { if (avatar.matches(':focus-visible')) showRobot(true); });
  avatar.addEventListener('blur', () => { if (!robotHover) { robotPinned = false; showRobot(false); } });
  avatar.addEventListener('click', () => { robotPinned = !robotPinned; showRobot(robotPinned || robotHover); });
  document.addEventListener('pointerdown', event => { if (!avatar.contains(event.target) && robotPinned) { robotPinned = false; showRobot(false); } });
  back.addEventListener('click', reset);
  document.querySelector('.home-mark').addEventListener('click', reset);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') reset(); });
  document.addEventListener('pointermove', event => { pointer.x = event.clientX; pointer.y = event.clientY; pointer.active = true; });
  document.addEventListener('pointerout', event => { if (!event.relatedTarget) pointer.active = false; });
  document.addEventListener('pointerup', event => { if (event.pointerType === 'touch') pointer.active = false; });
  document.addEventListener('pointercancel', () => { pointer.active = false; });
  function syncMotion() {
    motionButton.setAttribute('aria-pressed', String(paused));
    motionButton.setAttribute('aria-label', paused ? '播放星空动画' : '暂停星空动画');
    motionButton.innerHTML = paused ? '播放动画 <span aria-hidden="true">▷</span>' : '暂停动画 <span aria-hidden="true">Ⅱ</span>';
    body.classList.toggle('motion-paused', paused);
  }
  motionButton.addEventListener('click', () => { paused = !paused; syncMotion(); wake(); });
  reduced.addEventListener('change', event => { paused = event.matches; if (paused) settle(); syncMotion(); wake(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { cancelAnimationFrame(frame); frame = 0; } else wake(); });
  addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(layout, 120); });
  // The mobile constellation is anchored below the profile, even on short screens.
  addEventListener('scroll', () => {
    if (!mobile || scene === 'outer') return;
    const rect = document.querySelector('main').getBoundingClientRect();
    const nextY = rect.bottom - 180;
    const shape = targets.smile;
    if (!shape?.length) return;
    const centerY = (Math.min(...shape.map(p => p.y)) + Math.max(...shape.map(p => p.y))) / 2;
    const offset = nextY - centerY;
    ['smile', 'interest', 'gbu'].forEach(key => targets[key].forEach(p => { p.y += offset; }));
    if (paused) settle(); wake();
  }, { passive: true });
  syncMotion(); body.dataset.scene = scene; layout();
  // Deep links such as ?scene=outer open directly on a scene; also handy for testing.
  const initial = new URLSearchParams(location.search).get('scene');
  if (['outer', 'interest', 'gbu'].includes(initial)) {
    if (initial === 'gbu') gbu = true; else pinned = initial;
    changeScene(initial, true);
  }
})();
