// 꾸미기: 파스텔 색 + 배경 사진(위치·확대) + 움직이는 효과(눈·벚꽃·하트·별).
// 설정은 IndexedDB settings 저장소의 'theme' 한 건.
'use strict';

const THEME_DEFAULT = {
  id: 'theme', palette: 'mint',
  bgImage: null, bgX: 50, bgY: 50, bgZoom: 1, dim: 0.55, blur: 0,
  fxOn: false, fx: 'snow',
};
const PALETTES = {
  pink: ['분홍', '#FFD3E1', '#F2709A'],
  sky: ['하늘', '#D3E6FB', '#5A9BE6'],
  mint: ['민트', '#CDEFE0', '#34A87F'],
  lavender: ['라벤더', '#E3D8FC', '#9273DB'],
  lemon: ['레몬', '#FCEDB8', '#F2C744'],
  peach: ['복숭아', '#FDDCCB', '#EE8456'],
};
const FX = { snow: '❄ 눈', sakura: '🌸 벚꽃', heart: '♥ 하트', star: '✦ 별', haki: '⚡ 패왕색', speed: '💥 집중선', aura: '🔥 오라', domain: '🌀 영역전개' };
state.theme = { ...THEME_DEFAULT };

async function loadTheme() {
  try { state.theme = { ...THEME_DEFAULT, ...(await DB.get('settings', 'theme')) }; } catch {}
  applyTheme();
}
async function saveTheme() {
  applyTheme();
  try { await DB.put('settings', state.theme); } catch { toast('설정을 저장하지 못했어요'); }
}

/* ───────── 배경 레이어 ───────── */
// 바탕(html) 위, 앱 화면 아래에 깔리는 고정 레이어 3장: 사진 → 반투명 막 → 효과 캔버스
function themeLayers() {
  let bg = document.getElementById('bg-photo');
  if (!bg) {
    bg = document.createElement('div'); bg.id = 'bg-photo';
    const dim = document.createElement('div'); dim.id = 'bg-dim';
    const fx = document.createElement('canvas'); fx.id = 'bg-fx'; fx.setAttribute('aria-hidden', 'true');
    document.body.prepend(bg, dim, fx);
  }
  return { bg, dim: document.getElementById('bg-dim') };
}

// 사진 원본 크기 (배치 계산용)
const bgDims = { src: '', w: 0, h: 0 };
async function ensureBgDims() {
  const src = state.theme.bgImage;
  if (!src || bgDims.src === src) return;
  const img = await loadImage(src);
  Object.assign(bgDims, { src, w: img.naturalWidth, h: img.naturalHeight });
}

// 틀(화면 또는 미리보기) 크기에 맞춰 사진을 꽉 채우고(cover) × 확대, 위치는 0~100%
function placeBg(el, fw, fh) {
  const t = state.theme;
  if (!t.bgImage || !bgDims.w) { el.style.backgroundImage = 'none'; return; }
  const s = Math.max(fw / bgDims.w, fh / bgDims.h) * t.bgZoom;
  el.style.backgroundImage = `url("${t.bgImage}")`;
  el.style.backgroundSize = `${bgDims.w * s}px ${bgDims.h * s}px`;
  el.style.backgroundPosition = `${t.bgX}% ${t.bgY}%`;
}

// 직접 고른 색(색상 h, 밝기 l)에서 파스텔 색 묶음을 만든다
const CUSTOM_VARS = ['--bg', '--panel-2', '--line', '--line-strong', '--pink', '--pink-deep', '--pink-soft', '--text', '--ink', '--sub', '--on-accent'];
function customPalette(h, l) {
  return {
    '--bg': `hsl(${h} 100% 97%)`, '--panel-2': `hsl(${h} 90% 93%)`, '--line': `hsl(${h} 60% 87%)`,
    '--line-strong': `hsl(${h} 65% 80%)`, '--pink': `hsl(${h} 70% ${l}%)`, '--pink-deep': `hsl(${h} 60% ${Math.max(25, l - 22)}%)`,
    '--pink-soft': `hsl(${h} 85% 90%)`, '--text': `hsl(${h} 30% 20%)`, '--ink': `hsl(${h} 30% 20%)`, '--sub': `hsl(${h} 15% 42%)`,
    '--on-accent': l >= 64 ? `hsl(${h} 30% 20%)` : '#FFFFFF',
  };
}

let lastThemeColor = '';
async function applyTheme() {
  const t = state.theme;
  const root = document.documentElement;
  root.dataset.palette = t.palette;
  const vars = t.palette === 'custom' ? customPalette(t.customHue ?? 330, t.customLight ?? 65) : null;
  for (const k of CUSTOM_VARS) vars ? root.style.setProperty(k, vars[k]) : root.style.removeProperty(k);
  const tc = getComputedStyle(root).getPropertyValue('--bg').trim();
  if (tc !== lastThemeColor) { // 사파리 주소창 색이 계속 다시 그려지지 않게 바뀔 때만 넣는다
    lastThemeColor = tc;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', tc);
  }
  await ensureBgDims();
  const { bg, dim } = themeLayers();
  placeBg(bg, bg.clientWidth, bg.clientHeight);
  bg.style.filter = t.blur ? `blur(${t.blur}px)` : 'none';
  bg.style.transform = t.blur ? 'scale(1.06)' : 'none'; // 흐리게 하면 가장자리가 비치지 않게 살짝 키움
  dim.style.opacity = t.bgImage ? t.dim : 0;
  document.body.classList.toggle('has-bg', !!t.bgImage);
  const pv = document.querySelector('.bg-preview');
  if (pv) placeBg(pv, pv.clientWidth, pv.clientHeight);
  if (t.fxOn) startFx(t.fx); else stopFx();
}
// 폰은 스크롤할 때 주소창이 줄었다 늘며 resize 가 자주 온다: 가로 폭이 바뀔 때만 다시 계산
let lastW = innerWidth;
addEventListener('resize', () => {
  if (innerWidth === lastW) return;
  lastW = innerWidth;
  applyTheme();
});

/* ───────── 움직이는 효과 ───────── */
// 작은 모양 수십 개를 1초에 60번씩 조금씩 옮겨 다시 그린다 (플립북 원리)
const fxState = { raf: 0, kind: '', parts: [], w: 0, h: 0, last: 0 };

function fxResize() {
  const c = document.getElementById('bg-fx');
  if (!c) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  fxState.w = c.clientWidth || innerWidth; fxState.h = c.clientHeight || innerHeight;
  c.width = fxState.w * dpr; c.height = fxState.h * dpr;
  c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener('resize', () => { if (fxState.raf && document.getElementById('bg-fx')?.clientWidth !== fxState.w) fxResize(); });

function newPart(kind, anywhere) {
  const { w, h } = fxState;
  const p = { x: Math.random() * w, y: anywhere ? Math.random() * h : -20, r: 0, rot: Math.random() * 6.28, seed: Math.random() * 100 };
  if (kind === 'snow') Object.assign(p, { r: 1.5 + Math.random() * 3, vy: 25 + Math.random() * 45, vx: 0 });
  if (kind === 'sakura') Object.assign(p, { r: 4 + Math.random() * 4, vy: 30 + Math.random() * 30, vx: 15 + Math.random() * 20, vr: (Math.random() - .5) * 2 });
  if (kind === 'heart') Object.assign(p, { r: 5 + Math.random() * 6, vy: -(18 + Math.random() * 22), vx: 0, y: anywhere ? Math.random() * h : h + 20 });
  if (kind === 'star') Object.assign(p, { r: 3 + Math.random() * 5, vy: 4 + Math.random() * 6, vx: 0, y: Math.random() * h });
  return p;
}

function drawPart(g, kind, p, t) {
  g.save();
  g.translate(p.x, p.y);
  if (kind === 'snow') {
    g.globalAlpha = .85; g.fillStyle = '#FFFFFF';
    g.shadowColor = 'rgba(120,110,130,.35)'; g.shadowBlur = 3;
    g.beginPath(); g.arc(0, 0, p.r, 0, 6.283); g.fill();
  } else if (kind === 'sakura') {
    g.rotate(p.rot); g.globalAlpha = .85; g.fillStyle = '#FFB3C8';
    g.beginPath(); g.ellipse(0, 0, p.r, p.r * .6, 0, 0, 6.283); g.fill();
    g.fillStyle = '#FF8FB0'; g.beginPath(); g.ellipse(p.r * .35, 0, p.r * .35, p.r * .2, 0, 0, 6.283); g.fill();
  } else if (kind === 'heart') {
    const s = p.r / 10;
    g.globalAlpha = .55 + .25 * Math.sin(t / 600 + p.seed); g.fillStyle = '#F2709A'; g.scale(s, s);
    g.beginPath(); g.moveTo(0, 3);
    g.bezierCurveTo(-10, -5, -5, -12, 0, -6); g.bezierCurveTo(5, -12, 10, -5, 0, 3); g.fill();
  } else if (kind === 'star') {
    const a = .25 + .75 * Math.abs(Math.sin(t / 700 + p.seed));
    g.globalAlpha = a; g.fillStyle = '#E6B84A'; g.rotate(p.rot);
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const rr = i % 2 ? p.r * .3 : p.r;
      g.lineTo(Math.cos(i * Math.PI / 4) * rr, Math.sin(i * Math.PI / 4) * rr);
    }
    g.closePath(); g.fill();
  }
  g.restore();
}

function fxFrame(t) {
  const c = document.getElementById('bg-fx');
  if (!c || !fxState.kind) return;
  const g = c.getContext('2d');
  const dt = Math.min(.05, (t - (fxState.last || t)) / 1000);
  fxState.last = t;
  const { w, h, kind } = fxState;
  g.clearRect(0, 0, w, h);
  const special = { haki: hakiFrame, speed: speedFrame, aura: auraFrame, domain: domainFrame }[kind];
  if (special) { special(g, t, dt); fxState.raf = requestAnimationFrame(fxFrame); return; }
  for (const p of fxState.parts) {
    p.y += p.vy * dt;
    p.x += (p.vx || 0) * dt + Math.sin(t / 1000 + p.seed) * (kind === 'star' ? 0 : .35);
    if (p.vr) p.rot += p.vr * dt;
    const out = p.vy > 0 ? p.y > h + 20 : p.y < -20;
    if (out || p.x > w + 20 || p.x < -20) Object.assign(p, newPart(kind, false));
    drawPart(g, kind, p, t);
  }
  fxState.raf = requestAnimationFrame(fxFrame);
}

/* 패왕색: 검은 번개에 붉은 빛이 감도는 줄기가 화면 가장자리에서 튀어나왔다 사라진다 */
// 두 점 사이를 반으로 나누며 중간점을 옆으로 흔들어 지그재그 번개 모양을 만든다
function boltPath(x1, y1, x2, y2, rough, depth) {
  if (depth === 0) return [[x1, y1], [x2, y2]];
  const mx = (x1 + x2) / 2 + (Math.random() - .5) * rough;
  const my = (y1 + y2) / 2 + (Math.random() - .5) * rough;
  const a = boltPath(x1, y1, mx, my, rough / 2, depth - 1);
  return a.concat(boltPath(mx, my, x2, y2, rough / 2, depth - 1).slice(1));
}

function newBolt() {
  const { w, h } = fxState;
  // 한쪽 가장자리에서 반대쪽 가장자리까지 화면을 가로질러 친다 (위↔아래, 왼↔오른, 대각선)
  const pt = (side) => [[Math.random() * w, -10], [w + 10, Math.random() * h], [Math.random() * w, h + 10], [-10, Math.random() * h]][side];
  const side = Math.floor(Math.random() * 4);
  const start = pt(side);
  const end = pt((side + 2) % 4);
  const len = Math.hypot(end[0] - start[0], end[1] - start[1]);
  const ang = Math.atan2(end[1] - start[1], end[0] - start[0]);
  const main = boltPath(start[0], start[1], end[0], end[1], Math.min(len * .3, Math.min(w, h) * .45), 7);
  const branches = [];
  for (let i = 0; i < 3 + Math.floor(Math.random() * 3); i++) {
    const [bx, by] = main[8 + Math.floor(Math.random() * (main.length - 16))];
    const ba = ang + (Math.random() < .5 ? -1 : 1) * (.4 + Math.random() * .8);
    const bl = Math.min(w, h) * (.2 + Math.random() * .3);
    branches.push(boltPath(bx, by, bx + Math.cos(ba) * bl, by + Math.sin(ba) * bl, bl * .4, 4));
  }
  return { lines: [main, ...branches], life: 0, max: .28 + Math.random() * .2 };
}

function strokeLines(g, lines) {
  for (const pts of lines) {
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.stroke();
  }
}

/* ── 화면 맨 위 연출 (임팩트 프레임 · 화면 흔들림 · 효과음 글자) ── */
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
function fxTop() {
  let el = document.getElementById('fx-top');
  if (!el) { el = document.createElement('div'); el.id = 'fx-top'; el.setAttribute('aria-hidden', 'true'); document.body.appendChild(el); }
  return el;
}
// 한 순간 화면 색을 흑백으로 뒤집어 번쩍 (큰 기술이 맞는 순간의 연출)
function impactFrame(ms = 110) {
  if (reducedMotion()) return;
  const el = fxTop();
  el.classList.add('impact');
  setTimeout(() => el.classList.remove('impact'), ms);
}
function shakeScreen() {
  if (reducedMotion()) return;
  const a = document.getElementById('app');
  a.classList.remove('shake'); void a.offsetWidth; a.classList.add('shake');
  setTimeout(() => a.classList.remove('shake'), 600);
}
function popWord(text, cls = '') {
  const s = document.createElement('span');
  s.className = `fx-word ${cls}`; s.textContent = text;
  fxTop().appendChild(s);
  setTimeout(() => s.remove(), 1000);
}

function drawBolt(g, b) {
  const k = 1 - b.life / b.max;
  const flicker = Math.random() < .25 ? .4 : 1; // 지직거리는 깜빡임
  g.globalAlpha = k * flicker;
  g.shadowColor = '#ff1a3c'; g.shadowBlur = 22;
  g.strokeStyle = 'rgba(210,10,40,.9)'; g.lineWidth = 7 * (b.thick || 1);
  strokeLines(g, b.lines);
  g.shadowBlur = 0;
  g.strokeStyle = '#140006'; g.lineWidth = 2.6 * (b.thick || 1);
  strokeLines(g, b.lines);
  g.strokeStyle = 'rgba(255,120,140,.7)'; g.lineWidth = .8;
  strokeLines(g, b.lines);
  g.globalAlpha = 1;
}

// 가운데서 바깥으로 뻗는 번개 (폭발 순간)
function burstBolt(ang) {
  const { w, h } = fxState;
  const len = Math.hypot(w, h) * (.45 + Math.random() * .25);
  const x1 = w / 2, y1 = h / 2, x2 = x1 + Math.cos(ang) * len, y2 = y1 + Math.sin(ang) * len;
  return { lines: [boltPath(x1, y1, x2, y2, len * .25, 6)], life: 0, max: .5 + Math.random() * .3, thick: 1.4 };
}

function redVignette(g, a) {
  const { w, h } = fxState;
  const v = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * .2, w / 2, h / 2, Math.max(w, h) * .75);
  v.addColorStop(0, 'rgba(120,0,20,0)');
  v.addColorStop(1, `rgba(120,0,20,${a})`);
  g.fillStyle = v;
  g.fillRect(0, 0, w, h);
}

// 패왕색: 잔잔 → 고조 → 폭발 → 여운 을 32초마다 반복
const HAKI = { cycle: 32, build: 18, boom: 26 };
function hakiFrame(g, t, dt) {
  const { w, h } = fxState;
  const prev = fxState.clock || 0;
  const now = (prev + dt) % HAKI.cycle;
  fxState.clock = now;
  const building = now >= HAKI.build && now < HAKI.boom;
  const after = now >= HAKI.boom;
  const p = building ? (now - HAKI.build) / (HAKI.boom - HAKI.build) : 0;

  // 폭발 순간 (한 번만)
  if (prev < HAKI.boom && now >= HAKI.boom) {
    impactFrame();
    setTimeout(shakeScreen, 110);
    for (let i = 0; i < 16; i++) fxState.bolts.push(burstBolt((i / 16) * Math.PI * 2 + Math.random() * .3));
    fxState.ring = { r: 0, life: 0 };
    fxState.flash = 1;
  }

  fxState.next = (fxState.next ?? .2) - dt;
  if (fxState.next <= 0) {
    fxState.bolts.push(newBolt());
    if (Math.random() < (building ? .6 : .3)) fxState.bolts.push(newBolt());
    fxState.next = building ? .5 - p * .38 + Math.random() * .2 : after ? 1.2 + Math.random() * 1.2 : .6 + Math.random() * 1;
    fxState.flash = Math.max(fxState.flash || 0, building ? .7 : .6);
  }

  // 붉은 기운: 번쩍임 + 고조될수록 짙어지고, 폭발 뒤에는 서서히 가라앉음
  fxState.flash = Math.max(0, (fxState.flash || 0) - dt * 3.5);
  const base = building ? p * .45 * (.85 + .15 * Math.sin(t / 90)) : after ? .5 * (1 - (now - HAKI.boom) / (HAKI.cycle - HAKI.boom)) : 0;
  const a = Math.max(base, .35 * fxState.flash);
  if (a > .01) redVignette(g, a);

  // 충격파 링
  if (fxState.ring) {
    const r = fxState.ring;
    r.life += dt;
    const k = r.life / .8;
    if (k >= 1) fxState.ring = null;
    else {
      const rad = Math.hypot(w, h) * .6 * (1 - Math.pow(1 - k, 3));
      g.globalAlpha = 1 - k;
      g.strokeStyle = 'rgba(200,10,40,.85)'; g.lineWidth = 22 * (1 - k) + 2;
      g.shadowColor = '#ff1a3c'; g.shadowBlur = 30;
      g.beginPath(); g.arc(w / 2, h / 2, rad, 0, 6.283); g.stroke();
      g.shadowBlur = 0; g.strokeStyle = '#140006'; g.lineWidth = 6 * (1 - k) + 1;
      g.beginPath(); g.arc(w / 2, h / 2, rad, 0, 6.283); g.stroke();
      g.globalAlpha = 1;
    }
  }

  g.lineJoin = 'round'; g.lineCap = 'round';
  fxState.bolts = fxState.bolts.filter((b) => (b.life += dt) < b.max);
  for (const b of fxState.bolts) drawBolt(g, b);
}

/* 집중선: 가장자리에서 가운데로 쏟아지는 선. 7초마다 1.5초 동안 확 몰아친다 */
function speedFrame(g, t, dt) {
  const { w, h } = fxState;
  fxState.clock = ((fxState.clock || 0) + dt) % 7;
  const hot = fxState.clock > 5.5;
  fxState.redraw = (fxState.redraw || 0) - dt;
  if (fxState.redraw > 0 && fxState.lines) { drawSpeed(g); return; }
  fxState.redraw = hot ? .05 : .12;
  const cx = w / 2, cy = h / 2, far = Math.hypot(w, h) / 2 + 20;
  const n = hot ? 90 : 40;
  fxState.lines = Array.from({ length: n }, () => ({
    ang: Math.random() * Math.PI * 2,
    inner: Math.min(w, h) * (hot ? .18 + Math.random() * .12 : .32 + Math.random() * .15),
    spread: (hot ? .012 : .007) + Math.random() * .01,
    far, cx, cy,
  }));
  fxState.lineAlpha = hot ? .55 : .18;
  drawSpeed(g);
}
function drawSpeed(g) {
  g.fillStyle = fxState.ink || '#3B2A33';
  g.globalAlpha = fxState.lineAlpha;
  for (const l of fxState.lines) {
    g.beginPath();
    g.moveTo(l.cx + Math.cos(l.ang - l.spread) * l.far, l.cy + Math.sin(l.ang - l.spread) * l.far);
    g.lineTo(l.cx + Math.cos(l.ang + l.spread) * l.far, l.cy + Math.sin(l.ang + l.spread) * l.far);
    g.lineTo(l.cx + Math.cos(l.ang) * l.inner, l.cy + Math.sin(l.ang) * l.inner);
    g.closePath(); g.fill();
  }
  g.globalAlpha = 1;
}

/* 오라: 화면 테두리를 따라 테마 색 기운이 불꽃처럼 타오른다 */
function auraPart() {
  const { w, h } = fxState;
  const e = Math.random();
  const x = e < .5 ? Math.random() * w : e < .75 ? Math.random() * 30 : w - Math.random() * 30;
  const y = e < .5 ? h + 10 : Math.random() * h;
  return { x, y, vy: -(60 + Math.random() * 90), vx: (Math.random() - .5) * 20, r: 14 + Math.random() * 22, life: 0, max: .6 + Math.random() * .8 };
}
function auraFrame(g, t, dt) {
  const { w, h } = fxState;
  for (const p of fxState.parts) {
    p.life += dt;
    if (p.life > p.max) Object.assign(p, auraPart());
    p.y += p.vy * dt; p.x += p.vx * dt + Math.sin(t / 120 + p.r) * .6;
    const k = 1 - p.life / p.max;
    const rr = p.r * (.4 + k * .6);
    const grd = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, rr);
    grd.addColorStop(0, `rgba(255,255,255,${.85 * k})`);
    grd.addColorStop(.3, fxState.accentA(.9 * k));
    grd.addColorStop(1, fxState.accentA(0));
    g.fillStyle = grd;
    g.beginPath(); g.ellipse(p.x, p.y, rr * .7, rr * 1.4, 0, 0, 6.283); g.fill();
  }
  // 테두리가 은은하게 빛나도록
  const glow = .45 + .15 * Math.sin(t / 300);
  g.strokeStyle = fxState.accentA(glow); g.lineWidth = 16; g.shadowColor = fxState.accentA(.8); g.shadowBlur = 25;
  g.strokeRect(0, 0, w, h);
  g.shadowBlur = 0;
}

/* 영역전개: 13초마다 가운데서 어두운 원이 펼쳐져 화면을 덮고, 고리와 바퀴살이 돌다가 걷힌다 */
function domainFrame(g, t, dt) {
  const { w, h } = fxState;
  const prev = fxState.clock || 0;
  const now = (prev + dt) % 13;
  fxState.clock = now;
  if (prev < 6 && now >= 6) impactFrame(90);
  if (now < 6) return;
  const full = Math.hypot(w, h) / 2 + 10;
  const r = now < 7 ? full * (1 - Math.pow(1 - (now - 6), 3)) : now < 11 ? full : full * (1 - (now - 11) / 1.2);
  if (r <= 0) return;
  const cx = w / 2, cy = h / 2;
  g.save();
  g.beginPath(); g.arc(cx, cy, r, 0, 6.283); g.clip();
  const bg = g.createRadialGradient(cx, cy, 0, cx, cy, full);
  bg.addColorStop(0, 'rgba(60,10,90,.75)'); bg.addColorStop(1, 'rgba(10,0,20,.9)');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  // 바퀴살
  g.strokeStyle = 'rgba(190,140,255,.25)'; g.lineWidth = 1;
  for (let i = 0; i < 24; i++) {
    const a = i / 24 * Math.PI * 2 + t / 4000;
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * full, cy + Math.sin(a) * full); g.stroke();
  }
  // 도는 고리
  for (let i = 1; i <= 4; i++) {
    g.setLineDash([6 + i * 4, 10]);
    g.lineDashOffset = (i % 2 ? 1 : -1) * t / 40;
    g.strokeStyle = `rgba(210,170,255,${.5 - i * .08})`; g.lineWidth = 2;
    g.beginPath(); g.arc(cx, cy, full * i / 5, 0, 6.283); g.stroke();
  }
  g.setLineDash([]);
  g.restore();
}

function startFx(kind) {
  if (fxState.kind === kind && fxState.raf) return;
  stopFx();
  fxResize();
  fxState.kind = kind;
  const n = Math.round(Math.min(60, (fxState.w * fxState.h) / 9000)) * (kind === 'star' ? .6 : 1);
  fxState.parts = ['haki', 'speed', 'domain'].includes(kind) ? []
    : kind === 'aura' ? Array.from({ length: 70 }, () => Object.assign(auraPart(), { life: Math.random() }))
    : Array.from({ length: Math.max(12, n | 0) }, () => newPart(kind, true));
  Object.assign(fxState, { bolts: [], next: .2, flash: 0, clock: 0, ring: null, lines: null, redraw: 0 });
  // 효과에 테마 색을 쓰기 위해 읽어 둔다
  const cs = getComputedStyle(document.documentElement);
  fxState.ink = cs.getPropertyValue('--ink').trim() || '#3B2A33';
  const probe = document.createElement('canvas').getContext('2d');
  probe.fillStyle = cs.getPropertyValue('--pink').trim() || '#F2709A';
  probe.fillRect(0, 0, 1, 1);
  const [cr, cg, cb] = probe.getImageData(0, 0, 1, 1).data;
  fxState.accentA = (a) => `rgba(${cr},${cg},${cb},${a})`;
  fxState.last = 0;
  fxState.raf = requestAnimationFrame(fxFrame);
}

function stopFx() {
  cancelAnimationFrame(fxState.raf);
  fxState.raf = 0; fxState.kind = '';
  const c = document.getElementById('bg-fx');
  c?.getContext('2d').clearRect(0, 0, c.width, c.height);
}

// 화면을 안 볼 때는 멈춰서 배터리를 아낀다
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopFx();
  else if (state.theme.fxOn) startFx(state.theme.fx);
});

/* ───────── 꾸미기 화면 ───────── */
function renderTheme() {
  const t = state.theme;
  const ratio = `${innerWidth} / ${innerHeight}`;
  $app.innerHTML = `
    <header class="topbar">
      <button class="icon-btn" data-act="back" aria-label="뒤로">${ICON.back}</button>
      <h1 class="title-center">꾸미기</h1>
      <span style="width:44px"></span>
    </header>
    <main class="page theme-page">
      <section class="theme-card">
        <div class="label">테마 색</div>
        <div class="palettes">
          ${Object.entries(PALETTES).map(([k, [name, soft, deep]]) => `
            <button class="palette${t.palette === k ? ' on' : ''}" data-palette="${k}" aria-label="${name}">
              <span class="sw" style="background: linear-gradient(135deg, ${soft} 50%, ${deep} 50%)"></span>${name}
            </button>`).join('')}
        </div>
        <div class="label">직접 고르기 <span class="label-sub">${t.palette === 'custom' ? '고른 색을 쓰는 중' : '눌러서 원하는 색을 고르세요'}</span></div>
        <div class="picker${t.palette === 'custom' ? ' on' : ''}">
          <canvas class="picker-canvas" aria-label="색 고르기 판"></canvas>
          ${t.palette === 'custom' ? `<span class="picker-dot" style="left:${((t.customHue ?? 330) / 360) * 100}%; top:${((82 - (t.customLight ?? 65)) / 40) * 100}%"></span>` : ''}
        </div>
      </section>

      <section class="theme-card">
        <div class="label">배경 사진${t.bgImage ? ' <span class="label-sub">사진을 끌어서 보일 부분을 고르세요</span>' : ''}</div>
        <div class="bg-preview${t.bgImage ? ' has' : ''}" style="aspect-ratio: ${ratio}">
          ${t.bgImage ? '<span class="pv-hint">↔ 끌어서 옮기기</span>' : '<span>아직 배경 사진이 없어요</span>'}
        </div>
        ${t.bgImage ? `
          <div class="label">확대</div>
          <input type="range" class="slider" id="t-zoom" min="1" max="3" step="0.05" value="${t.bgZoom}" aria-label="배경 사진 확대">` : ''}
        <div class="row" style="margin-top:10px">
          <label class="big-btn ghost file-btn">${t.bgImage ? '사진 바꾸기' : '사진 올리기'}<input type="file" accept="image/*" data-bg hidden></label>
          ${t.bgImage ? `
            <button class="big-btn ghost" data-act="bg-rotate" style="flex:0 0 64px" aria-label="배경 사진 회전">↻</button>
            <button class="big-btn ghost" data-act="bg-clear" style="flex:0 0 64px" aria-label="배경 사진 지우기">✕</button>` : ''}
        </div>
      </section>

      ${t.bgImage ? `
      <section class="theme-card">
        <div class="label">사진 위 막 진하기 <span class="label-sub">진할수록 글씨가 잘 보여요</span></div>
        <input type="range" class="slider" id="t-dim" min="0" max="0.9" step="0.05" value="${t.dim}" aria-label="막 진하기">
        <div class="label">사진 흐리게</div>
        <input type="range" class="slider" id="t-blur" min="0" max="12" step="1" value="${t.blur}" aria-label="흐림 정도">
      </section>` : ''}

      <section class="theme-card">
        <button class="ai-switch${t.fxOn ? ' on' : ''}" data-act="fx-toggle" role="switch" aria-checked="${t.fxOn}">
          <span class="knob"></span><b>움직이는 효과 ${t.fxOn ? 'ON' : 'OFF'}</b>
          <small>${t.fxOn ? '화면 뒤에서 계속 움직여요' : '켜면 배경 위로 눈·꽃잎 등이 흩날려요'}</small>
        </button>
        <div class="cat-tags fx-choices${t.fxOn ? '' : ' off'}">
          ${Object.entries(FX).map(([k, label]) => `<button class="cat-chip${t.fxOn && t.fx === k ? ' active' : ''}" data-fx="${k}">${label}</button>`).join('')}
        </div>
      </section>

      <div class="save-bar"><button class="big-btn" data-act="done">완료</button></div>
    </main>`;

  applyTheme();
  bindThemeControls();
}

function bindThemeControls() {
  const t = state.theme;
  const slider = (id, key) => {
    const el = document.getElementById(id);
    el?.addEventListener('input', () => { t[key] = Number(el.value); applyTheme(); });
    el?.addEventListener('change', saveTheme);
  };
  // 사각형 색 판: 가로 = 색상(빨→노→초→파→보→빨), 세로 = 밝기(위 연하게 → 아래 진하게)
  const pc = document.querySelector('.picker-canvas');
  if (pc) {
    const W = pc.clientWidth, H = pc.clientHeight, dpr = Math.min(devicePixelRatio || 1, 2);
    pc.width = W * dpr; pc.height = H * dpr;
    const g = pc.getContext('2d');
    g.scale(dpr, dpr);
    for (let x = 0; x < W; x += 2) {
      const h = (x / W) * 360;
      const grad = g.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, `hsl(${h} 70% 82%)`);
      grad.addColorStop(1, `hsl(${h} 70% 42%)`);
      g.fillStyle = grad;
      g.fillRect(x, 0, 2, H);
    }
    const pick = (e) => {
      const r = pc.getBoundingClientRect();
      const fx = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      const fy = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
      Object.assign(t, { palette: 'custom', customHue: Math.round(fx * 360), customLight: Math.round(82 - fy * 40) });
      let dot = document.querySelector('.picker-dot');
      if (!dot) { dot = document.createElement('span'); dot.className = 'picker-dot'; pc.parentElement.appendChild(dot); }
      dot.style.left = `${fx * 100}%`; dot.style.top = `${fy * 100}%`;
      applyTheme();
    };
    let picking = false;
    pc.addEventListener('pointerdown', (e) => { picking = true; try { pc.setPointerCapture(e.pointerId); } catch {} pick(e); });
    pc.addEventListener('pointermove', (e) => { if (picking) pick(e); });
    const done = () => {
      if (!picking) return;
      picking = false;
      saveTheme();
      const y = $app.scrollTop; renderTheme(); $app.scrollTop = y;
    };
    pc.addEventListener('pointerup', done);
    pc.addEventListener('pointercancel', done);
  }

  slider('t-zoom', 'bgZoom');
  slider('t-dim', 'dim');
  slider('t-blur', 'blur');

  // 미리보기를 끌면 사진이 손가락을 따라 움직인다 (보이는 부분 고르기)
  const pv = document.querySelector('.bg-preview.has');
  if (pv) {
    let drag = null;
    pv.addEventListener('pointerdown', (e) => {
      try { pv.setPointerCapture(e.pointerId); } catch {}
      drag = { x: e.clientX, y: e.clientY, bx: t.bgX, by: t.bgY };
    });
    pv.addEventListener('pointermove', (e) => {
      if (!drag || !bgDims.w) return;
      const fw = pv.clientWidth, fh = pv.clientHeight;
      const s = Math.max(fw / bgDims.w, fh / bgDims.h) * t.bgZoom;
      const extraW = bgDims.w * s - fw, extraH = bgDims.h * s - fh;
      const clamp = (v) => Math.max(0, Math.min(100, v));
      if (extraW > 1) t.bgX = clamp(drag.bx - ((e.clientX - drag.x) / extraW) * 100);
      if (extraH > 1) t.bgY = clamp(drag.by - ((e.clientY - drag.y) / extraH) * 100);
      applyTheme();
    });
    const end = () => { if (drag) { drag = null; saveTheme(); } };
    pv.addEventListener('pointerup', end);
    pv.addEventListener('pointercancel', end);
  }

  $app.onchange = async (e) => {
    const input = e.target.closest('[data-bg]');
    const file = input?.files?.[0];
    if (!file) return;
    Object.assign(t, { bgImage: await fileToDataURL(file, 1600), bgX: 50, bgY: 50, bgZoom: 1 });
    await saveTheme();
    renderTheme();
  };
  $app.onclick = async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    const fx = e.target.closest('[data-fx]')?.dataset.fx;
    const pal = e.target.closest('[data-palette]')?.dataset.palette;
    if (act === 'back') return back();
    if (act === 'done') { await saveTheme(); toast('꾸미기를 적용했어요'); return go('#/'); }
    if (act === 'bg-clear') t.bgImage = null;
    else if (act === 'bg-rotate') Object.assign(t, { bgImage: await rotateDataURL(t.bgImage), bgX: 50, bgY: 50 });
    else if (act === 'fx-toggle') t.fxOn = !t.fxOn;
    else if (fx) { if (t.fxOn && t.fx === fx) t.fxOn = false; else { t.fx = fx; t.fxOn = true; } }
    else if (pal) t.palette = pal;
    else return;
    await saveTheme();
    const y = $app.scrollTop;
    renderTheme();
    $app.scrollTop = y;
  };
}

loadTheme();
