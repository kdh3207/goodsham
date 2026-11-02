// 굿즈 위시함 — 화면 렌더링과 동작 전부. 라우팅은 location.hash 기반.
'use strict';

const RAINBOW = ['#ff5a5f', '#ff9f43', '#ffd93d', '#4cd17a', '#4d9bff', '#3d5afe', '#b06cf0']; // 빨주노초파남보

const state = {
  items: [],
  cats: [],
  filterCat: 'all',
  apis: { naver: false, claude: false },
  cols: (() => { try { return Number(localStorage.getItem('cols')) || 3; } catch { return 3; } })(),
  sort: (() => { try { return localStorage.getItem('sort') || 'recent'; } catch { return 'recent'; } })(),
  view: (() => { try { return localStorage.getItem('view') || ''; } catch { return ''; } })(),
  selecting: false,
  selected: new Set(),
  draft: null,
  search: { q: '', advOpen: false },
};

const $app = document.getElementById('app');
const $drawer = document.getElementById('drawer');
const $drawerBg = document.getElementById('drawer-backdrop');
const $sheet = document.getElementById('sheet');
const $sheetBg = document.getElementById('sheet-backdrop');
const $toast = document.getElementById('toast');

/* ───────── 유틸 ───────── */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const won = (n) => (n || n === 0) && n !== '' ? '₩' + Number(n).toLocaleString('ko-KR') : '-';
const toNum = (s) => { const d = String(s ?? '').replace(/[^\d]/g, ''); return d ? Number(d) : null; };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const fmtDate = (s) => { if (!s) return '-'; const [, m, d] = s.split('-'); return `${Number(m)}월 ${Number(d)}일`; };
const norm = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, '');
const catById = (id) => state.cats.find((c) => c.id === id);
// 카테고리 색(빨주노초파남보)을 옅게 깔아 파스텔 칩으로
const catChipStyle = (c) => `background: color-mix(in srgb, ${c.color} 24%, #fff); color: color-mix(in srgb, ${c.color} 35%, #3B2A33); border-color: transparent`;
const itemImage = (it) => (it.imageChoice === 'mine' || !it.webImage ? it.myPhoto : it.webImage) || it.webImage || '';

const ICON = {
  menu: '<svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h10"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6"/></svg>',
  palette: '<svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.5-.8 1.5-1.5 0-1.2-1-1.6-1-2.7 0-.9.7-1.6 1.6-1.6H16a5 5 0 0 0 5-5C21 6.3 17 3 12 3z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="14.5" cy="7" r="1"/></svg>',
  send: '<svg viewBox="0 0 24 24"><path d="M21 3L10 14M21 3l-7 18-4-7-7-4z"/></svg>',
  inbox: '<svg viewBox="0 0 24 24"><path d="M4 13l2.5-8h11L20 13v6H4z"/><path d="M4 13h4.5l1.5 2.5h4l1.5-2.5H20"/></svg>',
  download: '<svg viewBox="0 0 24 24"><path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19h14"/></svg>',
  upload: '<svg viewBox="0 0 24 24"><path d="M12 15V4M7.5 8.5L12 4l4.5 4.5M5 19h14"/></svg>',
  camera: '<svg viewBox="0 0 24 24"><path d="M4 8h3.5L9 5.5h6L16.5 8H20v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  image: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="M5 17l4.5-4.5 3 3 2.5-2.5L19 17"/></svg>',
};

function toast(msg) {
  $toast.textContent = msg;
  $toast.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => ($toast.hidden = true), 1800);
}

async function loadImage(src) {
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = src; });
  return img;
}

// 폰 사진의 회전 정보(EXIF)를 반영해 줄인 JPEG 로 만든다. 세로로 찍은 사진이 눕지 않게
async function fileToDataURL(file, max = 900) {
  let src;
  try {
    src = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    src = await loadImage(URL.createObjectURL(file));
  }
  const w = src.width || src.naturalWidth, h = src.height || src.naturalHeight;
  const scale = Math.min(1, max / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * scale);
  c.height = Math.round(h * scale);
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  if (src.close) src.close(); else URL.revokeObjectURL(src.src);
  return c.toDataURL('image/jpeg', 0.85);
}

// 시계 방향 90도 회전
async function rotateDataURL(dataURL) {
  const img = await loadImage(dataURL);
  const c = document.createElement('canvas');
  c.width = img.naturalHeight;
  c.height = img.naturalWidth;
  const ctx = c.getContext('2d');
  ctx.translate(c.width, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(img, 0, 0);
  return c.toDataURL('image/jpeg', 0.88);
}

const MAX_PHOTOS = 10;
// 예전 굿즈는 사진이 myPhoto/webImage 한 장이라 photos 배열로 맞춰 읽는다
const itemPhotos = (it) => (it.photos?.length ? it.photos : [itemImage(it)].filter(Boolean));

// 사진이 여러 장이면 옆으로 넘기는 슬라이드 + 점 표시
function slidesHTML(photos, cls = '') {
  if (photos.length <= 1) return `<img src="${esc(photos[0] || '')}" alt="" loading="lazy" data-hide-broken>`;
  return `
    <div class="slides ${cls}">${photos.map((p) => `<img src="${esc(p)}" alt="" loading="lazy">`).join('')}</div>
    <div class="dots">${photos.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div>`;
}
// 사진 크게 보기 (옆으로 넘기기, 아무 곳이나 탭하면 닫힘)
function openLightbox(photos, start = 0) {
  const box = document.createElement('div');
  box.className = 'lightbox';
  box.innerHTML = `
    <div class="slides">${photos.map((p) => `<img src="${esc(p)}" alt="">`).join('')}</div>
    ${photos.length > 1 ? `<div class="dots">${photos.map((_, i) => `<i class="${i === start ? 'on' : ''}"></i>`).join('')}</div>` : ''}
    <button class="icon-btn lb-close" aria-label="닫기">${ICON.close}</button>`;
  document.body.appendChild(box);
  const sl = box.querySelector('.slides');
  sl.scrollLeft = start * sl.clientWidth;
  box.addEventListener('click', () => box.remove());
}

// 사진을 못 불러오면 깨진 그림 대신 빈칸으로 (보안 설정상 onerror 같은 HTML 속 코드는 쓰지 않는다)
document.addEventListener('error', (e) => { if (e.target.matches?.('img[data-hide-broken]')) e.target.style.opacity = 0; }, true);

document.addEventListener('scroll', (e) => {
  const el = e.target;
  if (!el.classList?.contains('slides')) return;
  const i = Math.round(el.scrollLeft / el.clientWidth);
  el.parentElement.querySelectorAll('.dots i').forEach((d, j) => d.classList.toggle('on', i === j));
}, true);

async function load() {
  [state.items, state.cats] = await Promise.all([DB.all('items'), DB.all('categories')]);
  state.items.sort((a, b) => b.createdAt - a.createdAt);
  state.cats.sort((a, b) => a.createdAt - b.createdAt);
}

async function saveItem(it) {
  await DB.put('items', it);
  const i = state.items.findIndex((x) => x.id === it.id);
  if (i >= 0) state.items[i] = it; else state.items.unshift(it);
}

/* ───────── 라우터 ───────── */
function route() {
  closeDrawer();
  closeSheet();
  const [, page, id, sub] = location.hash.split('/');
  if (page !== 'wish') exitSelect(false);
  document.body.classList.toggle('has-nav', !page || page === 'wish'); // 아래 탭 바가 있는 화면
  document.documentElement.classList.toggle('page-clean', !page || page === 'wish' || page === 'item');
  if (page === 'item') return renderDetail(id);
  if (page === 'new') return renderForm(null);
  if (page === 'edit') return renderForm(id);
  if (page === 'search') return renderSearch();
  if (page === 'theme') return renderTheme();
  if (page === 'friend') return sub ? renderFriendItem(id, sub) : renderFriend(id);
  if (page === 'wish') return renderHome();
  renderDashboard();
}
const go = (hash) => { location.hash = hash; };
// 뒤로: 브라우저 기록 대신 화면 구조로 정한다 (앱 안에 끼워 열거나 홈 화면 앱으로 열어도 같은 동작)
function back() {
  const [, page, id, sub] = location.hash.split('/');
  go(page === 'edit' ? '#/item/' + id : page === 'theme' ? '#/' : page === 'friend' && sub ? '#/friend/' + id : '#/wish');
}

// 브라우저 기본 confirm() 은 일부 환경(앱 미리보기 등)에서 막혀 있어 직접 그린 확인 창을 쓴다
function ask(message, okLabel = '확인', danger = false) {
  return new Promise((resolve) => {
    openSheet(`
      <p class="sheet-msg">${esc(message).replace(/\n/g, '<br>')}</p>
      <div class="row" style="padding:0 16px">
        <button class="big-btn ghost" data-ask="0">취소</button>
        <button class="big-btn${danger ? ' danger-fill' : ''}" data-ask="1">${esc(okLabel)}</button>
      </div>`, (s) => {
      s.onclick = (e) => {
        const v = e.target.closest('[data-ask]')?.dataset.ask;
        if (v === undefined) return;
        closeSheet();
        resolve(v === '1');
      };
    });
    $sheetBg.onclick = () => { closeSheet(); resolve(false); };
  });
}

/* ───────── 카드 ───────── */
function cardHTML(it) {
  const cats = (it.categoryIds || []).map(catById).filter(Boolean);
  const meta = [cats.map((c) => c.name).join(', '), it.place, it.shop].filter(Boolean).join(' · ') || fmtDate(it.date);
  const price = it.myPrice ?? it.onlinePrice;
  const priceLabel = it.myPrice != null ? '발견가' : it.onlinePrice != null ? '온라인' : '';
  return `
    <div class="card${state.selected.has(it.id) ? ' selected' : ''}${it.purchased ? ' bought' : ''}" data-id="${it.id}">
      <div class="thumb">
        ${slidesHTML(itemPhotos(it))}
        ${it.purchased ? '<span class="stamp">구매<br>완료</span>' : ''}
        <span class="check"></span>
        ${it.affection ? `<span class="heart">♥${it.affection}</span>` : ''}
        ${it.soldout ? '<span class="badge">품절</span>' : ''}
        ${it.limited ? '<span class="badge limited">한정판</span>' : ''}
      </div>
      <div class="info">
        <div class="meta">${esc(meta)}</div>
        <div class="name">${esc(it.name)}</div>
        <div class="price">${price != null ? won(price) : '가격 미정'}${priceLabel ? `<small>${priceLabel}</small>` : ''}</div>
      </div>
    </div>`;
}

// 굿즈함 목록형 한 줄: 사진 · 이름(품절/한정판) · 정보 · 애정도 · 가격(구매 완료)
function rowHTML(it) {
  const cats = (it.categoryIds || []).map(catById).filter(Boolean);
  const meta = [cats.map((c) => c.name).join(', '), it.place, it.shop].filter(Boolean).join(' · ') || fmtDate(it.date);
  const price = it.myPrice ?? it.onlinePrice;
  const photo = itemPhotos(it)[0];
  const src = it.thumb && it.thumb.of === photo.length ? it.thumb.data : photo; // 작은 사진이 있으면 그걸로
  const tags = [it.soldout && '품절', it.limited && '한정판'].filter(Boolean);
  return `
    <div class="card wl-row${state.selected.has(it.id) ? ' selected' : ''}${it.purchased ? ' bought' : ''}" data-id="${it.id}">
      <span class="check"></span>
      <div class="wl-thumb">${photo ? `<img src="${esc(src)}" alt="" draggable="false" decoding="async">` : ''}</div>
      <div class="wl-txt">
        <div class="wl-name"><b>${esc(it.name)}</b>${tags.map((t) => `<span class="wl-tag">${t}</span>`).join('')}</div>
        <span class="wl-meta">${esc(meta)}</span>
        ${it.affection ? `<span class="wl-hearts" aria-label="애정도 ${it.affection}">${'♥'.repeat(it.affection)}</span>` : ''}
      </div>
      <div class="wl-right">
        <b>${price != null ? `${Number(price).toLocaleString('ko-KR')}원` : '가격 미정'}</b>
        ${it.purchased ? `<span class="wl-done"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>구매 완료</span>` : ''}
      </div>
    </div>`;
}

// 목록용 작은 사진(160px). 큰 사진을 64px 칸에 그대로 쓰면 아이폰이 빠르게 스크롤할 때
// 사진을 다시 풀어 그리느라 화면이 깜빡여서, 한 번 줄여 굿즈에 같이 저장해 둔다.
// of 는 대표 사진 글자 길이: 대표 사진이 바뀌면 다시 만든다.
async function ensureThumbs(items) {
  for (const it of items) {
    const photo = itemPhotos(it)[0];
    if (!photo || (it.thumb && it.thumb.of === photo.length)) continue;
    try {
      const img = await loadImage(photo);
      const scale = Math.min(1, 160 / Math.min(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * scale);
      c.height = Math.round(img.naturalHeight * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      it.thumb = { of: photo.length, data: c.toDataURL('image/jpeg', 0.8) };
      await DB.put('items', it);
      const el = $app.querySelector(`.wl-row[data-id="${it.id}"] .wl-thumb img`);
      if (el) el.src = it.thumb.data;
    } catch {}
  }
}

// 꾹 누르기(선택 모드 진입)와 탭을 하나의 그리드에서 처리한다.
function bindGrid(grid) {
  let timer = null, sx = 0, sy = 0, longPressed = false;
  const clear = () => { clearTimeout(timer); timer = null; };
  grid.addEventListener('pointerdown', (e) => {
    const card = e.target.closest('.card[data-id]');
    if (!card) return;
    longPressed = false;
    sx = e.clientX; sy = e.clientY;
    timer = setTimeout(() => {
      longPressed = true;
      bindGrid.suppressUntil = Date.now() + 500; // 다시 그려진 그리드에 떨어지는 손 뗀 클릭 무시
      navigator.vibrate?.(15);
      if (!state.selecting) enterSelect(card.dataset.id);
      else toggleSelect(card.dataset.id);
    }, 450);
  });
  grid.addEventListener('pointermove', (e) => { if (timer && Math.hypot(e.clientX - sx, e.clientY - sy) > 10) clear(); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => grid.addEventListener(t, clear));
  grid.addEventListener('contextmenu', (e) => e.preventDefault());
  grid.addEventListener('click', (e) => {
    if (e.target.closest('.card.empty')) return state.selecting ? undefined : go('#/new');
    const card = e.target.closest('.card[data-id]');
    if (!card) return;
    if (longPressed || Date.now() < (bindGrid.suppressUntil || 0)) { longPressed = false; return; }
    if (state.selecting) toggleSelect(card.dataset.id);
    else go('#/item/' + card.dataset.id);
  });
}

/* ───────── 홈 ───────── */
function visibleItems() {
  const items = state.filterCat === 'all' ? state.items
    : state.items.filter((it) => (it.categoryIds || []).includes(state.filterCat));
  return sortItems(byView(items));
}

/* ───────── 정렬 ───────── */
// 가격은 내가 본 가격을 먼저, 없으면 온라인 가격을 쓴다. 값이 없는 굿즈는 항상 맨 뒤로.
const itemPrice = (it) => it.myPrice ?? it.onlinePrice ?? null;
const SORTS = {
  recent: ['최근 추가순', (a, b) => b.createdAt - a.createdAt],
  name: ['이름순 (ㄱㄴㄷ)', (a, b) => a.name.localeCompare(b.name, 'ko')],
  priceAsc: ['가격 낮은순', (a, b) => nullsLast(itemPrice(a), itemPrice(b), 1)],
  priceDesc: ['가격 높은순', (a, b) => nullsLast(itemPrice(a), itemPrice(b), -1)],
  dateDesc: ['날짜 최신순', (a, b) => nullsLast(a.date || null, b.date || null, -1)],
  dateAsc: ['날짜 오래된순', (a, b) => nullsLast(a.date || null, b.date || null, 1)],
  heart: ['애정도 높은순', (a, b) => (b.affection || 0) - (a.affection || 0)],
  notBought: ['구매 미완료 먼저', (a, b) => (a.purchased ? 1 : 0) - (b.purchased ? 1 : 0)],
  bought: ['구매 완료 먼저', (a, b) => (b.purchased ? 1 : 0) - (a.purchased ? 1 : 0)],
};
function nullsLast(x, y, dir) {
  if (x == null) return y == null ? 0 : 1;
  if (y == null) return -1;
  return (x < y ? -1 : x > y ? 1 : 0) * dir;
}
function sortItems(items) {
  if (!SORTS[state.sort]) state.sort = 'recent';
  const [, cmp] = SORTS[state.sort] || SORTS.recent;
  // 값이 같으면 최근 추가순으로
  return [...items].sort((a, b) => cmp(a, b) || b.createdAt - a.createdAt);
}

function sortBarHTML() {
  return `<div class="sort-bar"><button class="sort-btn${state.view ? ' on' : ''}" data-act="sort">⇅ ${sortLabel()} ▾</button></div>`;
}

// 정렬 창 맨 위 '보기': 구매 여부로 골라 보기 (아래 정렬과 함께 적용, 다시 누르면 해제)
const VIEWS = { bought: '구매 완료만', notBought: '구매 미완료만' };
const byView = (items) => state.view === 'bought' ? items.filter((it) => it.purchased)
  : state.view === 'notBought' ? items.filter((it) => !it.purchased) : items;
const sortLabel = () => [VIEWS[state.view], SORTS[state.sort]?.[0] || SORTS.recent[0]].filter(Boolean).join(' · ');

function openSortSheet(onPick) {
  openSheet(`
    <h3>보기</h3>
    ${Object.entries(VIEWS).map(([k, label]) => `
      <button class="cat-item${state.view === k ? ' active' : ''}" data-view="${k}">
        ${label}${state.view === k ? '<span class="count">✓</span>' : ''}
      </button>`).join('')}
    <h3 style="margin-top:14px">정렬</h3>
    ${Object.entries(SORTS).map(([k, [label]]) => `
      <button class="cat-item${state.sort === k ? ' active' : ''}" data-sort="${k}">
        ${label}${state.sort === k ? '<span class="count">✓</span>' : ''}
      </button>`).join('')}
    <p class="hint" style="padding:4px 20px 0">가격은 내 발견 가격 기준이에요. 없으면 온라인 가격을 써요.</p>`, (s) => {
    s.onclick = (e) => {
      const k = e.target.closest('[data-sort]')?.dataset.sort;
      const v = e.target.closest('[data-view]')?.dataset.view;
      if (!k && !v) return;
      if (k) state.sort = k;
      if (v) state.view = state.view === v ? '' : v; // 다시 누르면 해제 → 전체
      try { localStorage.setItem('sort', state.sort); localStorage.setItem('view', state.view); } catch {}
      closeSheet();
      onPick();
    };
  });
}

function renderHome() {
  $app.onclick = null;
  const items = visibleItems();
  const cat = catById(state.filterCat);
  const title = cat ? cat.name : '전체 굿즈';
  const deleting = state.selecting === 'delete';
  const sharing = state.selecting === 'share';
  const n = state.selected.size;
  const bar = state.selecting
    ? `<button class="text-btn" data-act="cancel-select">취소</button>
       <h1 class="title-center">${n ? `${n}개 선택` : deleting ? '지울 굿즈 선택' : sharing ? '보낼 굿즈 선택' : '0개 선택'}</h1>
       ${deleting ? `<button class="text-btn danger" data-act="delete-selected" ${n ? '' : 'disabled'}>삭제</button>`
         : sharing ? `<button class="text-btn primary" data-act="share-selected" ${n ? '' : 'disabled'}>보내기</button>`
         : `<span class="bar-actions"><button class="text-btn" data-act="copy-selected" ${n ? '' : 'disabled'}>복사</button><button class="text-btn primary" data-act="add-to-cat" ${n ? '' : 'disabled'}>카테고리</button></span>`}`
    : `<button class="icon-btn" data-act="drawer" aria-label="더보기">${ICON.menu}</button>
       <h1>${esc(title)}</h1>
       ${items.length ? `<button class="icon-btn" data-act="trash" aria-label="여러 개 삭제">${ICON.trash}</button>` : ''}
       <button class="icon-btn" data-act="search" aria-label="검색">${ICON.search}</button>`;

  const want = items.filter((it) => !it.purchased);
  const wantSum = want.reduce((s, it) => s + (itemPrice(it) || 0), 0);
  $app.innerHTML = `
    <div class="home-head wl-head">
    <header class="topbar">${bar}</header>
    <div class="filter-row${state.selecting && !sharing ? ' disabled' : ''}">
      <div class="chip-row">
        <button class="cat-chip${state.filterCat === 'all' ? ' active all' : ''}" data-chip="all">전체</button>
        ${state.cats.map((c) => `<button class="cat-chip${state.filterCat === c.id ? ' active' : ''}" data-chip="${c.id}"><span class="dot" style="background:${c.color}"></span>${esc(c.name)}</button>`).join('')}
      </div>
    </div>
    </div>
    <main class="wl${state.selecting ? ' selecting' : ''}${deleting ? ' deleting' : ''}">
      ${items.length ? `
        <div class="wl-sum"><span>사고 싶은 굿즈 <b>${want.length}개</b></span><span>합계 <b>${Number(wantSum).toLocaleString('ko-KR')}원</b></span></div>
        <section class="wl-list">
          <div class="wl-bar"><span>${items.length}개</span><button class="sort-btn${state.view ? ' on' : ''}" data-act="sort"${state.selecting && !sharing ? ' disabled' : ''}>${sortLabel()} ▾</button></div>
          ${items.map(rowHTML).join('')}
        </section>`
      : `<p class="empty-msg">${cat ? '이 카테고리에 아직 굿즈가 없어요.<br>굿즈를 꾹 눌러 여러 개 선택한 뒤 추가해 보세요.' : '아래 ＋ 버튼을 눌러 처음 굿즈를 저장해 보세요.'}</p>`}
    </main>
    ${state.selecting ? '' : bottomNavHTML('wish')}`;

  bindGrid($app.querySelector('.wl'));
  ensureThumbs(items);
  // 카테고리 칩 줄: 많아지면 옆으로 넘겨서 본다. 다시 그려도 넘겨 둔 위치를 지키고, 고른 칩은 화면 안으로
  const chipRow = $app.querySelector('.chip-row');
  if (chipRow) {
    chipRow.scrollLeft = state.chipScroll || 0;
    const active = chipRow.querySelector('.cat-chip.active');
    if (active && (active.offsetLeft < chipRow.scrollLeft || active.offsetLeft + active.offsetWidth > chipRow.scrollLeft + chipRow.clientWidth)) {
      chipRow.scrollLeft = active.offsetLeft - 14;
    }
    const edge = () => {
      state.chipScroll = chipRow.scrollLeft;
      chipRow.classList.toggle('more-right', chipRow.scrollLeft + chipRow.clientWidth < chipRow.scrollWidth - 4);
      chipRow.classList.toggle('more-left', chipRow.scrollLeft > 4);
    };
    chipRow.addEventListener('scroll', edge, { passive: true });
    edge();
  }
  $app.querySelector('.wl-bar [data-act="sort"]')?.addEventListener('click', () => openSortSheet(renderHome));
  $app.querySelector('.filter-row')?.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-chip]')?.dataset.chip;
    // 이미 고른 카테고리를 한 번 더 누르면 해제 → 전체
    if (chip) { state.filterCat = state.filterCat === chip ? 'all' : chip; renderHome(); }
  });
  $app.querySelector('.topbar').addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'drawer') openDrawer();
    if (act === 'search') go('#/search');
    if (act === 'trash') enterSelect(null, 'delete');
    if (act === 'cancel-select') exitSelect();
    if (act === 'add-to-cat') openCatPicker([...state.selected], () => exitSelect());
    if (act === 'delete-selected') deleteSelected();
    if (act === 'share-selected') openShareSheet([...state.selected]);
    if (act === 'copy-selected') copySelected();
  });
}

// mode: 'cat' (꾹 눌러 카테고리에 추가) | 'delete' (휴지통으로 여러 개 삭제) | 'share' (친구에게 보낼 굿즈 고르기)
function enterSelect(id, mode = 'cat') {
  state.selecting = mode;
  state.selected = new Set(id ? [id] : []);
  renderHome();
}

// 같은 굿즈를 하나 더 사고 싶을 때: 고른 굿즈를 그대로 복사한다.
// 복사본은 항상 '구매 미완료'로 만들어서 예산·덕질비 계산에 두 번 잡히지 않게 한다.
async function copySelected() {
  const src = state.items.filter((it) => state.selected.has(it.id));
  let t = Date.now();
  for (const it of src) {
    await saveItem({ ...structuredClone(it), id: uid(), createdAt: t++, purchased: false, purchasedAt: null });
  }
  toast(`${src.length}개를 복사했어요 (구매 미완료로)`);
  exitSelect();
}

async function deleteSelected() {
  const ids = [...state.selected];
  if (!ids.length || !(await ask(`굿즈 ${ids.length}개를 삭제할까요?\n삭제하면 되돌릴 수 없어요.`, '삭제', true))) return;
  for (const id of ids) await DB.del('items', id);
  state.items = state.items.filter((x) => !state.selected.has(x.id));
  toast(`${ids.length}개를 삭제했어요`);
  exitSelect();
}
function toggleSelect(id) {
  state.selected.has(id) ? state.selected.delete(id) : state.selected.add(id);
  renderHome();
}
function exitSelect(rerender = true) {
  if (!state.selecting) return;
  state.selecting = false;
  state.selected.clear();
  if (rerender) renderHome();
}

/* ───────── 드로어 (더보기 / 카테고리) ───────── */
function renderDrawer() {
  const count = (id) => state.items.filter((it) => (it.categoryIds || []).includes(id)).length;
  $drawer.innerHTML = `
    <div class="drawer-head">
      <button class="icon-btn" data-act="close" aria-label="닫기">${ICON.menu}</button>
      <button class="icon-btn" data-act="new-cat" aria-label="카테고리 추가">${ICON.plus}</button>
    </div>
    <h2>카테고리</h2>
    <button class="cat-item${state.filterCat === 'all' ? ' active' : ''}" data-cat="all">
      <span class="dot" style="background:#fff"></span>전체<span class="count">${state.items.length}</span><span class="more blank">⋯</span>
    </button>
    ${state.cats.map((c) => `
      <div class="cat-item${state.filterCat === c.id ? ' active' : ''}" data-cat="${c.id}" role="button">
        <span class="dot" style="background:${c.color}"></span>${esc(c.name)}
        <span class="count">${count(c.id)}</span>
        <button class="more" data-more="${c.id}" aria-label="편집">⋯</button>
      </div>`).join('')}
    ${state.cats.length === 0 ? '<p class="hint" style="padding:6px 20px">＋ 버튼으로 카테고리(폴더)를 만들어 보세요.</p>' : ''}
    <h2 style="margin-top:28px">친구 굿즈</h2>
    ${state.friends.map((f) => `
      <div class="cat-item" data-friend="${f.id}" role="button">
        <span class="dot" style="background:var(--pink)"></span>${esc(friendTitle(f))}
        <span class="count">${f.items.length}</span>
        <button class="more" data-friend-del="${f.id}" aria-label="삭제">⋯</button>
      </div>`).join('')}
    <button class="cat-item" data-act="share">📤 친구에게 내 굿즈 공유하기</button>
    <label class="cat-item" style="cursor:pointer">📥 친구가 보낸 파일 열기<input type="file" accept=".json,application/json" data-import hidden></label>
    <h2 style="margin-top:28px">설정</h2>
    <button class="cat-item" data-act="theme">🎨 꾸미기 <span class="count" style="min-width:0">배경 · 효과</span></button>
    <h2 style="margin-top:20px">백업</h2>
    <button class="cat-item" data-act="export">📦 백업 파일로 내보내기</button>
    <label class="cat-item" style="cursor:pointer">📥 백업 파일 불러오기<input type="file" accept=".json,application/json" data-import hidden></label>
    <p class="hint" style="padding:0 20px">폰을 바꾸거나 앱을 다시 설치할 때 쓰세요. 사진도 함께 들어가요.</p>`;
}

function openDrawer() {
  renderDrawer();
  $drawerBg.hidden = false;
  requestAnimationFrame(() => { if (!$drawerBg.hidden) $drawer.classList.add('open'); });
}
function closeDrawer() { $drawer.classList.remove('open'); $drawerBg.hidden = true; }

$drawerBg.addEventListener('click', closeDrawer);
$drawer.addEventListener('click', (e) => {
  const more = e.target.closest('[data-more]');
  if (more) return openCatEdit(more.dataset.more);
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'close') return closeDrawer();
  if (act === 'new-cat') return openNewCat(() => { renderDrawer(); });
  if (act === 'export') return exportBackup();
  if (act === 'theme') { closeDrawer(); return go('#/theme'); }
  if (act === 'share') { closeDrawer(); return startShareSelect(); }
  const fdel = e.target.closest('[data-friend-del]')?.dataset.friendDel;
  if (fdel) return deleteFriend(fdel);
  const fr = e.target.closest('[data-friend]')?.dataset.friend;
  if (fr) { closeDrawer(); return go('#/friend/' + fr); }
  const cat = e.target.closest('[data-cat]');
  if (cat) {
    state.filterCat = cat.dataset.cat;
    closeDrawer();
    if (location.hash !== '#/wish') go('#/wish'); else renderHome();
  }
});

$drawer.addEventListener('change', (e) => {
  const input = e.target.closest('[data-import]');
  if (input?.files?.[0]) importBackup(input.files[0]).finally(() => { input.value = ''; });
});

/* ───────── 백업 ───────── */
async function exportBackup() {
  const data = { app: 'goods-wish', version: 1, exportedAt: new Date().toISOString(), items: state.items, categories: state.cats, theme: state.theme };
  const name = `굿즈함-백업-${today()}.json`;
  const file = new File([JSON.stringify(data)], name, { type: 'application/json' });
  // 폰에서는 공유 시트(파일에 저장/카톡 등)로, 안 되면 다운로드로
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ───────── 받은 파일 검사 ─────────
   백업 · 친구 공유 파일은 누가 만들었는지 모르는 남의 파일일 수 있다.
   저장하기 전에 아는 칸만 골라 담고, 글자 길이 · 숫자 범위 · 사진 형식 · 링크 주소를 모두 확인한다.
   (가짜 링크 javascript:… 나 색 칸에 숨긴 코드, 터무니없이 큰 값으로 앱을 멈추는 것을 막는다) */
const MAX_IMPORT_BYTES = 60 * 1024 * 1024;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const cleanStr = (v, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '');
const cleanNum = (v, min, max) => (v === null || v === '' || !Number.isFinite(Number(v)) ? null : Math.min(max, Math.max(min, Number(v))));
const cleanDate = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');
const cleanColor = (v) => (typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v) ? v : '#C9C4BE');
const isPhoto = (v) => typeof v === 'string' && v.length < 8e6 && /^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(v);
// 판매 페이지 링크는 http · https 주소만 받는다
const safeUrl = (u) => { try { const x = new URL(u); return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : ''; } catch { return ''; } };

function cleanItem(it) {
  if (!it || typeof it !== 'object' || !ID_RE.test(it.id)) return null;
  // 예전 백업은 사진이 photos 대신 myPhoto · webImage 칸에 있다
  const photos = (Array.isArray(it.photos) && it.photos.length ? it.photos : [itemImage(it)]).filter(isPhoto).slice(0, MAX_PHOTOS);
  return {
    id: it.id, createdAt: cleanNum(it.createdAt, 0, 9e15) ?? Date.now(),
    name: cleanStr(it.name, 100) || '이름 없는 굿즈', officialName: cleanStr(it.officialName, 200),
    photos, affection: Math.round(cleanNum(it.affection, 0, 5) ?? 0),
    date: cleanDate(it.date), place: cleanStr(it.place, 100), shop: cleanStr(it.shop, 100),
    myPrice: cleanNum(it.myPrice, 0, 1e10), onlinePrice: cleanNum(it.onlinePrice, 0, 1e10),
    onlineMall: cleanStr(it.onlineMall, 50), onlineLink: safeUrl(it.onlineLink),
    soldout: it.soldout === true, limited: it.limited === true, memo: cleanStr(it.memo, 2000),
    categoryIds: (Array.isArray(it.categoryIds) ? it.categoryIds : []).filter((c) => ID_RE.test(c)).slice(0, 50),
    purchased: it.purchased === true, purchasedAt: it.purchased === true ? cleanDate(it.purchasedAt) || null : null,
    ...(it.thumb && isPhoto(it.thumb.data) ? { thumb: { of: cleanNum(it.thumb.of, 0, 1e9), data: it.thumb.data } } : {}),
  };
}
function cleanCat(c) {
  if (!c || !ID_RE.test(c.id)) return null;
  return { id: c.id, name: cleanStr(c.name, 20) || '카테고리', color: cleanColor(c.color), createdAt: cleanNum(c.createdAt, 0, 9e15) ?? Date.now() };
}
function cleanTheme(t) {
  if (!t || typeof t !== 'object') return null;
  const out = {};
  if (typeof t.palette === 'string' && /^[a-z]{1,12}$/.test(t.palette)) out.palette = t.palette;
  for (const [k, min, max] of [['customHue', 0, 360], ['customLight', 30, 90], ['bgX', 0, 100], ['bgY', 0, 100], ['bgZoom', 1, 4], ['dim', 0, 1], ['blur', 0, 12]]) {
    const v = cleanNum(t[k], min, max);
    if (v !== null) out[k] = v;
  }
  if (t.bgImage === null || isPhoto(t.bgImage)) out.bgImage = t.bgImage;
  if (typeof t.fxOn === 'boolean') out.fxOn = t.fxOn;
  if (typeof t.fx === 'string' && /^[a-z]{1,12}$/.test(t.fx)) out.fx = t.fx;
  return out;
}
// 친구 공유 파일의 굿즈: 친구가 보낸 칸만 (카테고리는 이름으로 온다)
function cleanShareItem(it) {
  const c = cleanItem({ ...it, id: ID_RE.test(it?.id) ? it.id : uid(), categoryIds: [] });
  if (!c) return null;
  c.categoryNames = (Array.isArray(it.categoryNames) ? it.categoryNames : []).map((n) => cleanStr(n, 20)).filter(Boolean).slice(0, 20);
  return c;
}

async function importBackup(file) {
  let data;
  if (file.size > MAX_IMPORT_BYTES) return toast('파일이 너무 커요');
  try { data = JSON.parse(await file.text()); } catch { return toast('파일을 읽지 못했어요'); }
  if (data?.app === 'goods-wish-share') { closeDrawer(); return importShare(data); }
  if (data?.app !== 'goods-wish' || !Array.isArray(data.items)) return toast('굿즈함 백업 파일이 아니에요');
  const cats = (Array.isArray(data.categories) ? data.categories : []).map(cleanCat).filter(Boolean);
  data.items = data.items.slice(0, 5000).map(cleanItem).filter(Boolean);
  if (!(await ask(`굿즈 ${data.items.length}개, 카테고리 ${cats.length}개를 불러올까요?\n같은 굿즈가 이미 있으면 백업 내용으로 바뀌어요.`, '불러오기'))) return;
  for (const c of cats) await DB.put('categories', c);
  for (const it of data.items) await DB.put('items', it);
  const theme = cleanTheme(data.theme);
  if (theme) { state.theme = { ...state.theme, ...theme, id: 'theme' }; await saveTheme(); }
  await load();
  closeDrawer();
  toast(`굿즈 ${data.items.length}개를 불러왔어요`);
  route();
}

/* ───────── 바텀 시트 ───────── */
function openSheet(html, bind) {
  $sheet.innerHTML = `<div class="grabber"></div>${html}`;
  $sheet.onclick = null;
  $sheetBg.onclick = null;
  $sheetBg.hidden = false;
  requestAnimationFrame(() => { if (!$sheetBg.hidden) $sheet.classList.add('open'); });
  bind?.($sheet);
}
function closeSheet() { $sheet.classList.remove('open'); $sheetBg.hidden = true; }
$sheetBg.addEventListener('click', closeSheet);

async function createCategory(name) {
  const cat = { id: uid(), name, color: RAINBOW[Math.floor(Math.random() * RAINBOW.length)], createdAt: Date.now() };
  await DB.put('categories', cat);
  state.cats.push(cat);
  return cat;
}

function openNewCat(onCreated) {
  openSheet(`
    <h3>새 카테고리</h3>
    <div class="page" style="padding-bottom:0">
      <input class="field" id="cat-name" placeholder="예: 나루토, 원피스, 치이카와" maxlength="20" autocomplete="off">
      <div class="save-bar" style="position:static"><button class="big-btn" id="cat-ok">만들기</button></div>
    </div>`, (s) => {
    const input = s.querySelector('#cat-name');
    setTimeout(() => input.focus(), 250);
    const ok = async () => {
      const name = input.value.trim();
      if (!name) return input.focus();
      if (state.cats.some((c) => c.name === name)) return toast('이미 있는 카테고리예요');
      const cat = await createCategory(name);
      closeSheet();
      toast(`'${name}' 카테고리를 만들었어요`);
      onCreated?.(cat);
    };
    s.querySelector('#cat-ok').onclick = ok;
    input.onkeydown = (e) => { if (e.key === 'Enter') ok(); };
  });
}

function openCatEdit(id) {
  const cat = catById(id);
  openSheet(`
    <h3><span class="dot" style="display:inline-block;background:${cat.color};margin-right:8px"></span>${esc(cat.name)}</h3>
    <div class="page" style="padding-bottom:0">
      <input class="field" id="cat-rename" value="${esc(cat.name)}" maxlength="20">
      <div class="row" style="margin-top:12px">
        <button class="big-btn ghost" id="cat-color">색 다시 뽑기</button>
        <button class="big-btn" id="cat-save">이름 저장</button>
      </div>
      <button class="big-btn danger" id="cat-del" style="margin-top:12px">카테고리 삭제 (굿즈는 남아요)</button>
    </div>`, (s) => {
    const refresh = () => { renderDrawer(); route(); };
    s.querySelector('#cat-save').onclick = async () => {
      const name = s.querySelector('#cat-rename').value.trim();
      if (!name) return;
      cat.name = name;
      await DB.put('categories', cat);
      closeSheet(); refresh();
    };
    s.querySelector('#cat-color').onclick = async () => {
      const others = RAINBOW.filter((c) => c !== cat.color);
      cat.color = others[Math.floor(Math.random() * others.length)];
      await DB.put('categories', cat);
      closeSheet(); refresh();
    };
    s.querySelector('#cat-del').onclick = async () => {
      if (!(await ask(`'${cat.name}' 카테고리를 삭제할까요?\n안에 있던 굿즈는 지워지지 않아요.`, '삭제', true))) return;
      await DB.del('categories', id);
      state.cats = state.cats.filter((c) => c.id !== id);
      for (const it of state.items) {
        if ((it.categoryIds || []).includes(id)) {
          it.categoryIds = it.categoryIds.filter((x) => x !== id);
          await DB.put('items', it);
        }
      }
      if (state.filterCat === id) state.filterCat = 'all';
      closeSheet(); refresh();
    };
  });
}

// 선택한 굿즈들을 넣을 카테고리 고르기 (기존 목록 + 새 카테고리)
function openCatPicker(ids, onDone) {
  const inAll = (c) => ids.every((id) => (state.items.find((i) => i.id === id)?.categoryIds || []).includes(c.id));
  openSheet(`
    <h3>카테고리에 추가</h3>
    <p class="sheet-sub">굿즈 ${ids.length}개</p>
    ${state.cats.map((c) => `
      <button class="cat-item" data-pick="${c.id}">
        <span class="dot" style="background:${c.color}"></span>${esc(c.name)}
        ${inAll(c) ? '<span class="count">추가됨 ✓</span>' : ''}
      </button>`).join('')}
    <button class="cat-item new-cat" data-pick="new"><span style="width:12px;text-align:center">＋</span>새 카테고리</button>`, (s) => {
    s.onclick = async (e) => {
      const pick = e.target.closest('[data-pick]')?.dataset.pick;
      if (!pick) return;
      if (pick === 'new') return openNewCat(async (cat) => { await addToCat(ids, cat); onDone?.(); });
      await addToCat(ids, catById(pick));
      closeSheet();
      onDone?.();
    };
  });
}

async function addToCat(ids, cat) {
  for (const id of ids) {
    const it = state.items.find((i) => i.id === id);
    if (!it) continue;
    it.categoryIds = [...new Set([...(it.categoryIds || []), cat.id])];
    await DB.put('items', it);
  }
  toast(`'${cat.name}'에 ${ids.length}개 추가했어요`);
}

/* ───────── 상세 (도감) ───────── */
function renderDetail(id) {
  const it = state.items.find((x) => x.id === id);
  if (!it) return go('#/wish');
  const cats = (it.categoryIds || []).map(catById).filter(Boolean);
  let diff = '';
  if (it.myPrice != null && it.onlinePrice != null && it.myPrice !== it.onlinePrice) {
    const d = it.onlinePrice - it.myPrice;
    diff = d > 0
      ? `<div class="diff cheaper">발견 가격이 ${won(d)} 더 싸요</div>`
      : `<div class="diff pricier">온라인이 ${won(-d)} 더 싸요</div>`;
  }
  const where = [it.place, it.shop].filter(Boolean).join(' ');
  const photos = itemPhotos(it);
  const greet = `안녕! ${fmtDate(it.date)}에 ${where ? `「${esc(where)}」에서 ` : ''}만났지.`
    + (it.purchased ? ' 드디어 데려와 줘서 고마워! 잘 부탁해 ♥'
      : it.soldout ? ' 지금 온라인에선 품절이래… 보이면 꼭 데려가 줘!' : it.limited ? ' 나 한정판이라 금방 사라질지도 몰라!' : ' 언젠가 꼭 데리러 와 줘~');

  const heartsHTML = [1, 2, 3, 4, 5].map((n) => `<span class="${n <= (it.affection || 0) ? 'on' : ''}">♥</span>`).join('');
  const no = String(state.items.length - state.items.indexOf(it)).padStart(3, '0');

  const catLine = [cats.map((c) => c.name).join(', '), `No.${no}`].filter(Boolean).join(' · ');
  const wonA = (n) => (n != null ? `${Number(n).toLocaleString('ko-KR')}원` : '-');
  // 포토카드 창은 3:4. 사진은 자르지 않고 통째로 보이게 두고, 남는 곳은 같은 사진을 흐리게 깔아 채운다
  const pcSlide = (p) => `<div class="pc-slide"><img class="pc-blur" src="${esc(p)}" alt=""><img class="pc-img" src="${esc(p)}" alt=""></div>`;
  $app.innerHTML = `
    <header class="topbar dt-top">
      <button class="icon-btn" data-act="back" aria-label="뒤로">${ICON.back}</button>
      <h1 class="title-center"></h1>
      <button class="text-btn" data-act="edit">수정</button>
    </header>
    <main class="page dt">
      <div class="pc${it.purchased ? ' gold' : ''}">
        <div class="pc-inner">
          <div class="pc-top"><span>No.${no}</span><span class="pc-hearts" aria-label="애정도 ${it.affection || 0}">${heartsHTML}</span></div>
          <div class="pc-photo photo-frame" data-act="zoom" role="button" aria-label="사진 크게 보기">
            ${photos.length > 1
              ? `<div class="slides">${photos.map(pcSlide).join('')}</div><div class="dots">${photos.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div>`
              : photos.length ? pcSlide(photos[0]) : ''}
            <span class="pc-shine" aria-hidden="true"></span>
            <span class="pc-tags">${it.soldout ? '<span>품절</span>' : ''}${it.limited ? '<span>한정판</span>' : ''}</span>
            ${it.purchased ? `<span class="pc-done">구매 완료${it.purchasedAt ? ` · ${fmtDate(it.purchasedAt)}` : ''}</span>` : ''}
          </div>
          <div class="pc-bottom"><b>${esc(it.name)}</b><span>${esc(cats[0]?.name || '')}</span></div>
        </div>
      </div>

      <section class="dt-head">
        <span class="dt-cat">${esc(catLine)}</span>
        <h2>${esc(it.name)}</h2>
        ${it.officialName ? `<p>${esc(it.officialName)}</p>` : ''}
        ${friendWantHTML(it)}
      </section>

      <section class="dt-card dt-prices">
        <div><span>내가 본 가격</span><b>${wonA(it.myPrice)}</b></div>
        <div><span>온라인 가격${it.onlineMall ? ` · ${esc(it.onlineMall)}` : ''}</span><b class="sub">${wonA(it.onlinePrice)}</b>
          ${safeUrl(it.onlineLink) ? `<a href="${esc(safeUrl(it.onlineLink))}" target="_blank" rel="noopener noreferrer">판매 페이지 ↗</a>` : ''}</div>
        ${diff ? `<p class="dt-diff">${diff.replace(/<[^>]+>/g, '')}</p>` : ''}
      </section>

      <section class="dt-card dt-rows">
        <div><span>발견한 날</span><b>${fmtDate(it.date)}</b></div>
        <div><span>장소</span><b>${esc(it.place || '-')}</b></div>
        <div><span>가게</span><b>${esc(it.shop || '-')}</b></div>
      </section>

      ${it.memo ? `<section class="dt-memo"><h3>메모</h3><p>${esc(it.memo)}</p></section>` : ''}

      <div class="dt-speech">
        ${photos[0] ? `<img src="${esc(it.thumb?.data || photos[0])}" alt="">` : ''}
        <p><b>${esc(it.name)}</b> ${greet}</p>
      </div>

      <div class="dt-cats">
        ${cats.map((c) => `<button class="dt-chip" data-uncat="${c.id}"><span class="dot" style="background:${c.color}"></span>${esc(c.name)} ✕</button>`).join('')}
        <button class="dt-chip add" data-act="add-cat">＋ 카테고리</button>
      </div>

      <button class="dt-delete" data-act="delete">이 굿즈 삭제</button>
    </main>
    <div class="dt-bar">
      ${it.purchased
        ? '<button class="big-btn ghost" data-act="purchase">구매 완료 취소</button>'
        : '<button class="big-btn buy" data-act="purchase">구매 완료로 표시</button>'}
    </div>`;

  $app.onclick = async (e) => {
    const un = e.target.closest('[data-uncat]');
    if (un) {
      it.categoryIds = it.categoryIds.filter((x) => x !== un.dataset.uncat);
      await DB.put('items', it);
      return renderDetail(id);
    }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'back') back();
    if (act === 'edit') go('#/edit/' + id);
    if (act === 'add-cat') openCatPicker([id], () => renderDetail(id));
    if (act === 'purchase') {
      it.purchased = !it.purchased;
      it.purchasedAt = it.purchased ? today() : null;
      await saveItem(it);
      if (!it.purchased) toast('구매 완료를 취소했어요');
      renderDetail(id);
      if (it.purchased) document.querySelector('.pc')?.classList.add('pop');
    }
    if (act === 'zoom') {
      const sl = e.target.closest('.photo-frame').querySelector('.slides');
      openLightbox(photos, sl ? Math.round(sl.scrollLeft / sl.clientWidth) : 0);
    }
    if (act === 'delete' && await ask(`'${it.name}'을(를) 삭제할까요?`, '삭제', true)) {
      await DB.del('items', id);
      state.items = state.items.filter((x) => x.id !== id);
      toast('삭제했어요');
      go('#/wish');
    }
  };
}

/* ───────── 추가 / 수정 폼 ───────── */
function newDraft() {
  return {
    id: null, name: '', officialName: '', photos: [],
    affection: 3, date: today(), place: '', shop: '', myPrice: null,
    onlinePrice: null, onlineMall: '', onlineLink: '', soldout: false, limited: false,
    memo: '', categoryIds: state.filterCat !== 'all' ? [state.filterCat] : [],
  };
}

function renderForm(id) {
  if (id) {
    const it = state.items.find((x) => x.id === id);
    if (!it) return go('#/wish');
    if (state.draft?.id !== id) state.draft = { ...newDraft(), ...structuredClone(it), photos: [...itemPhotos(it)], candidates: [] };
  } else if (!state.draft || state.draft.id) {
    state.draft = newDraft();
  }
  const d = state.draft;
  const places = [...new Set(state.items.map((x) => x.place).filter(Boolean))];
  const shops = [...new Set(state.items.map((x) => x.shop).filter(Boolean))];

  $app.innerHTML = `
    <header class="topbar">
      <button class="icon-btn" data-act="back" aria-label="닫기">${ICON.close}</button>
      <h1 class="title-center">${d.id ? '굿즈 수정' : '사고 싶은 굿즈 추가'}</h1>
      <span style="width:42px"></span>
    </header>
    <main class="page">
      <div class="label">1. 사진</div>
      <div class="photo-actions">
        <label><b>📷</b>바로 찍기<input type="file" accept="image/*" capture="environment" data-photo></label>
        <label><b>🖼️</b>앨범에서 선택<input type="file" accept="image/*" multiple data-photo></label>
      </div>

      <div class="label">2. 사진 정리 <span class="label-sub">첫 번째 사진이 대표 사진이에요</span></div>
      <div class="candidates" id="cands"></div>
      <div class="hint" id="cand-hint"></div>

      <div class="label">3. 이름 (내가 부르는 이름)</div>
      <input class="field" id="f-name" value="${esc(d.name)}" autocomplete="off">

      <div class="label">판매 상태</div>
      <div class="toggle-row">
        <button class="toggle soldout${d.soldout ? ' on' : ''}" data-toggle="soldout">품절</button>
        <button class="toggle${d.limited ? ' on' : ''}" data-toggle="limited">한정판</button>
      </div>

      <div class="label">애정도</div>
      <div class="hearts" id="f-hearts">${[1, 2, 3, 4, 5].map((n) => `<button data-heart="${n}" class="${n <= d.affection ? 'on' : ''}">♥</button>`).join('')}</div>

      <div class="row">
        <div><div class="label">날짜</div><input class="field" type="date" id="f-date" value="${esc(d.date)}"></div>
        <div><div class="label">발견 장소</div><input class="field" id="f-place" list="place-list" value="${esc(d.place)}"></div>
      </div>
      <div class="label">가게 이름</div>
      <input class="field" id="f-shop" list="shop-list" value="${esc(d.shop)}">
      <datalist id="place-list">${places.map((p) => `<option value="${esc(p)}">`).join('')}</datalist>
      <datalist id="shop-list">${shops.map((p) => `<option value="${esc(p)}">`).join('')}</datalist>

      <div class="row">
        <div><div class="label">발견 가격</div><input class="field" id="f-myprice" inputmode="numeric" value="${d.myPrice ?? ''}"></div>
        <div><div class="label">온라인 가격</div><input class="field" id="f-online" inputmode="numeric" value="${d.onlinePrice ?? ''}"></div>
      </div>
      <div class="label">카테고리</div>
      <div class="cat-tags" id="f-cats">${state.cats.map((c) => `<button class="cat-chip${d.categoryIds.includes(c.id) ? ' active' : ''}" data-fcat="${c.id}"><span class="dot" style="background:${c.color}"></span>${esc(c.name)}</button>`).join('')}<button class="cat-chip" data-act="new-cat" style="color:var(--pink)">＋ 새 카테고리</button></div>

      <div class="label">메모</div>
      <textarea class="field" id="f-memo">${esc(d.memo)}</textarea>

      <div class="save-bar"><button class="big-btn" data-act="save">${d.id ? '수정 완료' : '굿즈함에 저장'}</button></div>
    </main>`;

  renderCandidates();
  bindForm();
}

function renderCandidates() {
  const d = state.draft;
  const box = document.getElementById('cands');
  const hint = document.getElementById('cand-hint');
  if (!box) return;
  // 사진마다: 회전 / 대표로 / 삭제. 맨 앞 사진이 대표
  // 사진을 탭하면 대표 사진(맨 앞, 금색 테두리)이 된다
  const cells = d.photos.map((p, i) => `
    <div class="cand${i === 0 ? ' main' : ''}" data-ph="first" data-i="${i}">
      <img src="${esc(p)}" alt="">
      ${i === 0 ? '<span class="tag main-tag">대표</span>' : ''}
      <div class="ph-tools">
        ${p.startsWith('data:') ? `<button data-ph="rotate" data-i="${i}" aria-label="회전">↻</button>` : ''}
        <button data-ph="remove" data-i="${i}" aria-label="삭제">✕</button>
      </div>
    </div>`);
  if (d.photos.length && d.photos.length < MAX_PHOTOS) {
    cells.push(`<label class="cand add-more"><span>＋<small>사진 추가</small></span><input type="file" accept="image/*" multiple data-photo hidden></label>`);
  }
  box.innerHTML = cells.join('') || '<div class="hint" style="grid-column:1/-1">위에서 사진을 찍거나 앨범에서 고르세요. 여러 장 올릴 수 있어요.</div>';
  hint.innerHTML = d.photos.length > 1 ? '사진을 탭하면 대표 사진이 돼요 · ↻ 회전 · ✕ 삭제'
    : d.photos.length ? '↻ 를 눌러 사진 방향을 돌릴 수 있어요.'
    : '';
}

function readFormFields() {
  const d = state.draft;
  const v = (id) => document.getElementById(id)?.value ?? '';
  d.name = v('f-name').trim();
  d.date = v('f-date');
  d.place = v('f-place').trim();
  d.shop = v('f-shop').trim();
  d.myPrice = toNum(v('f-myprice'));
  d.onlinePrice = toNum(v('f-online'));
  d.memo = v('f-memo');
}

function bindForm() {
  const d = state.draft;
  $app.onclick = async (e) => {
    const t = e.target;
    const ph = t.closest('[data-ph]');
    if (ph) {
      const i = Number(ph.dataset.i);
      if (ph.dataset.ph === 'remove') d.photos.splice(i, 1);
      if (ph.dataset.ph === 'first') {
        if (i === 0) return;
        d.photos.unshift(...d.photos.splice(i, 1));
      }
      if (ph.dataset.ph === 'rotate') {
        ph.disabled = true;
        d.photos[i] = await rotateDataURL(d.photos[i]);
      }
      return renderCandidates();
    }
    const heart = t.closest('[data-heart]');
    if (heart) {
      d.affection = Number(heart.dataset.heart);
      document.querySelectorAll('#f-hearts button').forEach((b) => b.classList.toggle('on', Number(b.dataset.heart) <= d.affection));
      return;
    }
    const tog = t.closest('[data-toggle]');
    if (tog) { d[tog.dataset.toggle] = !d[tog.dataset.toggle]; tog.classList.toggle('on'); return; }
    const fcat = t.closest('[data-fcat]');
    if (fcat) {
      const cid = fcat.dataset.fcat;
      d.categoryIds = d.categoryIds.includes(cid) ? d.categoryIds.filter((x) => x !== cid) : [...d.categoryIds, cid];
      fcat.classList.toggle('active');
      return;
    }
    const act = t.closest('[data-act]')?.dataset.act;
    if (act === 'back') { state.draft = null; back(); }
    if (act === 'save') saveDraft();
    if (act === 'new-cat') {
      readFormFields();
      openNewCat((cat) => {
        d.categoryIds = [...d.categoryIds, cat.id];
        const y = $app.scrollTop;
        renderForm(d.id);
        $app.scrollTop = y;
      });
    }
  };
  // 사진 추가 (찍기/앨범/＋칸 모두). 앨범에서는 여러 장을 한 번에 고를 수 있다
  $app.onchange = async (e) => {
    const input = e.target.closest('[data-photo]');
    if (!input || state.draft !== d) return;
    const files = [...(input.files || [])].slice(0, MAX_PHOTOS - d.photos.length);
    input.value = '';
    if (!files.length) return toast(`사진은 ${MAX_PHOTOS}장까지 올릴 수 있어요`);
    for (const f of files) d.photos.push(await fileToDataURL(f));
    renderCandidates();
  };
}

async function saveDraft() {
  readFormFields();
  const d = state.draft;
  if (!d.name) { toast('이름을 입력해 주세요'); return document.getElementById('f-name').focus(); }
  if (!d.photos.length) { toast('사진을 한 장 이상 올려 주세요'); return; }
  const prev = d.id ? state.items.find((x) => x.id === d.id) : null;
  // 새로 추가할 때 이름(또는 정식 제품명)이 비슷한 굿즈가 이미 있으면 한 번 확인 (까먹고 또 사는 것 방지)
  if (!prev) {
    const same = (a, b) => { a = norm(a); b = norm(b); return a.length >= 2 && b.length >= 2 && (a.includes(b) || b.includes(a)); };
    const dup = state.items.find((x) => same(x.name, d.name) || (d.officialName && same(x.officialName, d.officialName)));
    if (dup && !(await ask(`비슷한 굿즈 '${dup.name}'이(가) 이미 ${dup.purchased ? '구매 완료돼 있어요' : '굿즈함에 있어요'}.\n그래도 저장할까요?`, '저장'))) return;
  }
  const it = {
    id: d.id || uid(),
    createdAt: prev?.createdAt || Date.now(),
    purchased: !!prev?.purchased, purchasedAt: prev?.purchasedAt || null,
    name: d.name, officialName: d.officialName,
    photos: [...d.photos],
    affection: d.affection, date: d.date, place: d.place, shop: d.shop,
    myPrice: d.myPrice, onlinePrice: d.onlinePrice, onlineMall: d.onlineMall, onlineLink: d.onlineLink,
    soldout: d.soldout, limited: d.limited, memo: d.memo, categoryIds: d.categoryIds, aiNote: d.aiNote || prev?.aiNote || '',
  };
  await saveItem(it);
  state.draft = null;
  toast(prev ? '수정했어요' : '굿즈함에 저장했어요');
  // 수정 → 그 굿즈의 상세 화면으로, 새로 추가 → 메인 화면으로
  history.replaceState(null, '', prev ? '#/item/' + it.id : '#/wish');
  route();
}

/* ───────── 검색 ───────── */
// 검색창은 이름(내 이름·정식 제품명)만, 나머지 조건은 상세 검색에서 골라 함께 적용한다
const FILTERS = [
  ['price', '💰 가격'], ['place', '📍 장소·가게'], ['cat', '🗂 카테고리'],
  ['date', '📅 날짜'], ['heart', '♥ 애정도'], ['status', '🏷 판매 상태'],
];

function newSearchFilters() {
  return {
    on: {}, basis: 'my', min: '', max: '', place: '', cats: [],
    from: '', to: '', heart: 0, soldout: false, limited: false,
  };
}

function activeFilters() {
  const s = state.search, f = [];
  const min = toNum(s.min), max = toNum(s.max);
  if (s.on.price && (min != null || max != null)) f.push((it) => {
    const p = s.basis === 'my' ? it.myPrice : it.onlinePrice;
    return p != null && (min == null || p >= min) && (max == null || p <= max);
  });
  if (s.on.place && norm(s.place)) f.push((it) => norm(`${it.place ?? ''} ${it.shop ?? ''}`).includes(norm(s.place)));
  if (s.on.cat && s.cats.length) f.push((it) => s.cats.some((c) => (it.categoryIds || []).includes(c)));
  if (s.on.date && (s.from || s.to)) f.push((it) => it.date && (!s.from || it.date >= s.from) && (!s.to || it.date <= s.to));
  if (s.on.heart && s.heart) f.push((it) => (it.affection || 0) >= s.heart);
  if (s.on.status && (s.soldout || s.limited)) f.push((it) => (!s.soldout || it.soldout) && (!s.limited || it.limited));
  return f;
}

function searchResults() {
  const s = state.search;
  const q = norm(s.q);
  const filters = activeFilters();
  if (!q && !filters.length) return null;
  return state.items.filter((it) =>
    (!q || norm(it.name).includes(q) || norm(it.officialName).includes(q)) && filters.every((fn) => fn(it)));
}

function renderSearchResults() {
  const box = document.getElementById('search-results');
  const raw = searchResults();
  const res = raw && byView(raw);
  const n = activeFilters().length;
  const sum = document.querySelector('.adv summary');
  if (sum) sum.textContent = `상세 검색${n ? ` · 조건 ${n}개 적용 중` : ''}`;
  if (res === null) {
    box.innerHTML = '<p class="empty-msg">검색창에는 굿즈 이름을 입력하세요.<br>장소·카테고리·가격 등은 상세 검색에서 골라 함께 쓸 수 있어요.</p>';
    return;
  }
  box.innerHTML = `<div class="sort-bar"><span class="result-count" style="padding:0">${res.length}개 찾음</span>${res.length > 1 ? sortBarHTML().replace(/^<div class="sort-bar">|<\/div>$/g, '') : ''}</div>
    <div class="grid cols-${state.cols}">${sortItems(res).map(cardHTML).join('')}</div>
    ${res.length === 0 ? '<p class="empty-msg">조건에 맞는 굿즈가 없어요.</p>' : ''}`;
  box.querySelector('.sort-btn')?.addEventListener('click', () => openSortSheet(renderSearchResults));
  box.querySelector('.grid').addEventListener('click', (e) => {
    const card = e.target.closest('.card[data-id]');
    if (card) go('#/item/' + card.dataset.id);
  });
}

function filterPanelHTML(key) {
  const s = state.search;
  if (key === 'price') return `
    <div class="toggle-row">
      <button class="toggle${s.basis === 'my' ? ' on' : ''}" data-basis="my">내 발견 가격</button>
      <button class="toggle${s.basis === 'online' ? ' on' : ''}" data-basis="online">온라인 가격</button>
    </div>
    <div class="row" style="align-items:center;margin-top:8px">
      <input class="field" data-s="min" inputmode="numeric" placeholder="최소 (원)" value="${esc(s.min)}">
      <span style="flex:none;color:var(--sub)">~</span>
      <input class="field" data-s="max" inputmode="numeric" placeholder="최대 (원)" value="${esc(s.max)}">
    </div>`;
  if (key === 'place') {
    const places = [...new Set(state.items.map((x) => x.place).filter(Boolean))];
    return `
      <input class="field" data-s="place" placeholder="장소나 가게 이름 (예: 서면, 애니메이트)" value="${esc(s.place)}">
      ${places.length ? `<div class="cat-tags">${places.map((p) => `<button class="cat-chip${s.place === p ? ' active' : ''}" data-place="${esc(p)}">${esc(p)}</button>`).join('')}</div>` : ''}`;
  }
  if (key === 'cat') return state.cats.length
    ? `<div class="cat-tags" style="margin-top:0">${state.cats.map((c) => `<button class="cat-chip${s.cats.includes(c.id) ? ' active' : ''}" data-scat="${c.id}"><span class="dot" style="background:${c.color}"></span>${esc(c.name)}</button>`).join('')}</div>
       <div class="hint">여러 개 고르면 그중 하나라도 속한 굿즈가 나와요.</div>`
    : '<div class="hint">아직 카테고리가 없어요.</div>';
  if (key === 'date') return `
    <div class="row" style="align-items:center">
      <input class="field" type="date" data-s="from" value="${esc(s.from)}">
      <span style="flex:none;color:var(--sub)">~</span>
      <input class="field" type="date" data-s="to" value="${esc(s.to)}">
    </div>`;
  if (key === 'heart') return `
    <div class="hearts">${[1, 2, 3, 4, 5].map((n) => `<button data-sheart="${n}" class="${n <= s.heart ? 'on' : ''}">♥</button>`).join('')}</div>
    <div class="hint">${s.heart ? `애정도 ${s.heart} 이상` : '하트를 눌러 최소 애정도를 고르세요.'}</div>`;
  if (key === 'status') return `
    <div class="toggle-row">
      <button class="toggle soldout${s.soldout ? ' on' : ''}" data-sstat="soldout">품절</button>
      <button class="toggle${s.limited ? ' on' : ''}" data-sstat="limited">한정판</button>
    </div>`;
  return '';
}

function renderAdvBody() {
  const s = state.search;
  document.getElementById('adv-body').innerHTML = `
    <div class="cat-tags" style="margin-top:12px">
      ${FILTERS.map(([k, label]) => `<button class="cat-chip${s.on[k] ? ' active' : ''}" data-filter="${k}">${label}</button>`).join('')}
    </div>
    ${FILTERS.filter(([k]) => s.on[k]).map(([k, label]) => `
      <div class="filter-panel">
        <div class="label">${label}</div>
        ${filterPanelHTML(k)}
      </div>`).join('')}
    ${FILTERS.some(([k]) => s.on[k]) ? '<button class="text-btn" data-act="reset" style="margin-top:14px">조건 모두 지우기</button>' : ''}`;
}

function renderSearch() {
  const s = state.search;
  $app.innerHTML = `
    <header class="topbar">
      <button class="icon-btn" data-act="back" aria-label="뒤로">${ICON.back}</button>
      <input class="field" id="s-q" type="search" placeholder="굿즈 이름 검색" value="${esc(s.q)}" autocomplete="off" style="flex:1">
    </header>
    <details class="adv" ${s.advOpen ? 'open' : ''}>
      <summary>상세 검색</summary>
      <div id="adv-body"></div>
    </details>
    <div id="search-results"></div>`;
  renderAdvBody();

  const q = document.getElementById('s-q');
  if (!s.q) setTimeout(() => q.focus(), 50);
  q.addEventListener('input', () => { s.q = q.value; renderSearchResults(); });
  $app.querySelector('details').addEventListener('toggle', (e) => { s.advOpen = e.target.open; });
  // 패널 입력칸은 다시 그리지 않고 값만 반영해 포커스를 지킨다
  $app.querySelector('#adv-body').addEventListener('input', (e) => {
    const key = e.target.dataset.s;
    if (!key) return;
    s[key] = e.target.value;
    if (key === 'place') document.querySelectorAll('[data-place]').forEach((b) => b.classList.toggle('active', b.dataset.place === s.place));
    renderSearchResults();
  });
  $app.onclick = (e) => {
    const t = e.target;
    if (t.closest('[data-act="back"]')) return back();
    const f = t.closest('[data-filter]')?.dataset.filter;
    const basis = t.closest('[data-basis]')?.dataset.basis;
    const place = t.closest('[data-place]')?.dataset.place;
    const cat = t.closest('[data-scat]')?.dataset.scat;
    const heart = t.closest('[data-sheart]')?.dataset.sheart;
    const stat = t.closest('[data-sstat]')?.dataset.sstat;
    if (f) s.on[f] = !s.on[f];
    else if (basis) s.basis = basis;
    else if (place !== undefined) s.place = s.place === place ? '' : place;
    else if (cat) s.cats = s.cats.includes(cat) ? s.cats.filter((x) => x !== cat) : [...s.cats, cat];
    else if (heart) s.heart = s.heart === Number(heart) ? 0 : Number(heart);
    else if (stat) s[stat] = !s[stat];
    else if (t.closest('[data-act="reset"]')) Object.assign(s, newSearchFilters());
    else return;
    renderAdvBody();
    renderSearchResults();
  };
  renderSearchResults();
}

/* ───────── 시작 ───────── */
// 아이폰 사파리 탭 안에서 열었는지 (ios-browser): 홈 화면 앱과 다르게 다룰 곳이 있으면 쓴다.
{
  const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  if (ios && !standalone && window.top === window) document.documentElement.classList.add('ios-browser');
  // 새로고침했을 때 브라우저가 예전 스크롤 위치로 되돌리지 않게: 화면은 늘 맨 위에서 시작
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  addEventListener('pageshow', () => { $app.scrollTop = 0; });
}
Object.assign(state.search, newSearchFilters());
window.addEventListener('hashchange', () => { $app.onclick = null; route(); });
// 다른 스크립트(dashboard · share · theme)까지 다 읽은 뒤에 시작해야 홈을 그릴 함수가 준비돼 있다
addEventListener('DOMContentLoaded', () => load().then(route));
// 브라우저가 저장 공간이 부족할 때 이 앱 데이터를 임의로 지우지 않도록 요청
navigator.storage?.persist?.().catch(() => {});
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
