// 친구와 굿즈 공유: 굿즈함에서 보낼 굿즈 고르기 → 공유 파일 만들기(가릴 정보) / 받은 파일을 '친구 굿즈'로 보관 / 내 굿즈함에 담기.
// 친구 목록은 IndexedDB friends 저장소에 { id, from, gift, receivedAt, items } 로 저장한다.
'use strict';

state.friends = [];
(async () => {
  try { state.friends = (await DB.all('friends')).sort((a, b) => b.receivedAt - a.receivedAt); } catch {}
})();

const friendTitle = (f) => `${f.from}의 ${f.gift ? '선물 리스트' : '굿즈'}`;

// 이름이 비슷하면(한쪽이 다른 쪽을 포함) 같은 굿즈로 본다
function similarName(a, b) {
  a = norm(a); b = norm(b);
  return a.length >= 2 && b.length >= 2 && (a.includes(b) || b.includes(a));
}
const sameGoods = (x, y) => similarName(x.name, y.name) || (x.officialName && y.officialName && similarName(x.officialName, y.officialName));

// 내 굿즈를 친구 중 누가 갖고 싶어 하는지 (친구 목록에 비슷한 굿즈가 있으면)
function friendsWanting(it) {
  return state.friends.filter((f) => f.items.some((x) => !x.purchased && sameGoods(x, it))).map((f) => f.from);
}
function friendWantHTML(it) {
  const names = [...new Set(friendsWanting(it))];
  return names.length ? `<p class="friend-want">♥ ${esc(names.join(', '))}도 갖고 싶어 해요</p>` : '';
}

/* ───────── 공유 파일 만들기 ───────── */
const SHARE_HIDE = { place: '발견 장소 · 가게', myPrice: '내가 본 가격', memo: '메모' };

// 보낼 굿즈 고르기: 굿즈함 화면을 그대로 써서 눌러 고른다 (굿즈가 많아도 카테고리 칩·정렬로 찾아가며 고르기 쉽게)
function startShareSelect() {
  state.selecting = 'share';
  state.selected = new Set();
  if (location.hash === '#/wish') renderHome(); else go('#/wish');
  toast('보낼 굿즈를 눌러 고르고 오른쪽 위 보내기를 누르세요');
}

// 고른 뒤: 보내는 사람 이름과 숨길 정보만 정하고 파일을 만든다
function openShareSheet(ids) {
  const opt = state.shareOpt || (state.shareOpt = {
    from: (() => { try { return localStorage.getItem('shareName') || ''; } catch { return ''; } })(),
    hide: { place: true, myPrice: true, memo: true },
  });
  const list = sortItems(state.items.filter((it) => ids.includes(it.id)));
  openSheet(`
    <h3>굿즈 ${list.length}개 보내기</h3>
    <p class="sheet-sub">파일을 카톡 등으로 보내면, 친구가 '친구가 보낸 파일 열기'로 볼 수 있어요. 배경·효과는 들어가지 않아요.</p>
    <div class="page share-sheet" style="padding-bottom:0">
      <div class="label">보내는 사람 이름</div>
      <input class="field" id="share-from" value="${esc(opt.from)}" placeholder="친구가 알아볼 이름" maxlength="12">
      <div class="label">숨길 정보 <span class="label-sub">켜 둔 정보는 친구에게 안 보여요</span></div>
      <div class="toggle-row wrap">
        ${Object.entries(SHARE_HIDE).map(([k, label]) => `<button class="toggle${opt.hide[k] ? ' on' : ''}" data-hide="${k}">${label}</button>`).join('')}
      </div>
    </div>
    <div class="sheet-foot"><button class="big-btn" data-act="make">파일 만들기</button></div>`, (s) => {
    const from = s.querySelector('#share-from');
    from.oninput = () => { opt.from = from.value.trim(); };
    s.onclick = async (e) => {
      const hide = e.target.closest('[data-hide]');
      if (hide) { opt.hide[hide.dataset.hide] = !opt.hide[hide.dataset.hide]; hide.classList.toggle('on'); return; }
      if (!e.target.closest('[data-act="make"]')) return;
      if (!opt.from) { toast('보내는 사람 이름을 적어 주세요'); return from.focus(); }
      try { localStorage.setItem('shareName', opt.from); } catch {}
      closeSheet();
      exitSelect();
      makeShareFile(opt, list);
    };
  });
}

// 공유 파일에는 대표 사진 한 장만 작게 줄여 넣는다 (파일이 너무 커지지 않게)
async function smallPhoto(src) {
  if (!src?.startsWith('data:')) return src || '';
  const img = await loadImage(src);
  const scale = Math.min(1, 600 / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.8);
}

async function makeShareFile(opt, list) {
  toast('파일을 만들고 있어요…');
  const items = [];
  for (const it of list) {
    items.push({
      id: it.id, name: it.name, officialName: it.officialName || '',
      photos: [await smallPhoto(itemPhotos(it)[0])],
      affection: it.affection || 0, date: it.date || '', purchased: !!it.purchased,
      soldout: !!it.soldout, limited: !!it.limited,
      onlinePrice: it.onlinePrice ?? null, onlineMall: it.onlineMall || '',
      categoryNames: (it.categoryIds || []).map((c) => catById(c)?.name).filter(Boolean),
      ...(opt.hide.place ? {} : { place: it.place || '', shop: it.shop || '' }),
      ...(opt.hide.myPrice ? {} : { myPrice: it.myPrice ?? null }),
      ...(opt.hide.memo ? {} : { memo: it.memo || '' }),
    });
  }
  const data = { app: 'goods-wish-share', version: 1, from: opt.from, createdAt: new Date().toISOString(), items };
  const name = `${opt.from}의-굿즈-${today()}.json`;
  const file = new File([JSON.stringify(data)], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('파일을 저장했어요. 카톡 등으로 보내 주세요');
}

/* ───────── 받은 파일 ───────── */
async function importShare(data) {
  if (!Array.isArray(data.items) || typeof data.from !== 'string' || !data.from.trim()) return toast('공유 파일이 아니에요');
  // 남이 만든 파일: 보낸 사람 이름 · 굿즈를 저장 전에 검사한다 (cleanShareItem: app.js)
  data = { ...data, from: cleanStr(data.from.trim(), 20), gift: data.gift === true, items: data.items.slice(0, 500).map(cleanShareItem).filter(Boolean) };
  const title = `${data.from}의 ${data.gift ? '선물 리스트' : '굿즈'}`;
  const prev = state.friends.find((f) => f.from === data.from && !!f.gift === !!data.gift);
  const q = prev ? `'${title}'을(를) 새로 받은 내용으로 바꿀까요?\n굿즈 ${data.items.length}개` : `'${title}' 굿즈 ${data.items.length}개를 받을까요?`;
  if (!(await ask(q, '받기'))) return;
  const f = { id: prev?.id || uid(), from: data.from, gift: !!data.gift, receivedAt: Date.now(), items: data.items };
  await DB.put('friends', f);
  state.friends = [f, ...state.friends.filter((x) => x.id !== f.id)];
  toast(`'${title}'을(를) 받았어요`);
  go('#/friend/' + f.id);
}

async function deleteFriend(id) {
  const f = state.friends.find((x) => x.id === id);
  if (!f || !(await ask(`'${friendTitle(f)}'을(를) 지울까요?\n내 굿즈함에 담은 굿즈는 그대로 남아요.`, '삭제', true))) return;
  await DB.del('friends', id);
  state.friends = state.friends.filter((x) => x.id !== id);
  renderDrawer();
  if (location.hash.startsWith('#/friend/' + id)) go('#/wish');
}

/* ───────── 친구 굿즈 보기 (보기 전용) ───────── */
function renderFriend(fid) {
  const f = state.friends.find((x) => x.id === fid);
  if (!f) return go('#/wish');
  $app.innerHTML = `
    <header class="topbar">
      <button class="icon-btn" data-act="back" aria-label="뒤로">${ICON.back}</button>
      <h1 class="title-center">${esc(friendTitle(f))}</h1>
      <span style="width:44px"></span>
    </header>
    <p class="friend-note">보기 전용이에요. 마음에 드는 굿즈를 눌러 내 굿즈함에 담을 수 있어요.</p>
    <main class="grid cols-${state.cols}">
      ${f.items.map((it, i) => {
        const mine = state.items.some((m) => sameGoods(m, it));
        return cardHTML({ ...it, categoryIds: [] })
          .replace('<div class="thumb">', `<div class="thumb">${f.gift ? `<span class="rank">${i + 1}</span>` : ''}${mine ? '<span class="mine-badge">내 굿즈함에 있음</span>' : ''}`);
      }).join('')}
    </main>`;
  $app.onclick = (e) => {
    if (e.target.closest('[data-act="back"]')) return back();
    const card = e.target.closest('.card[data-id]');
    if (card) go(`#/friend/${fid}/${card.dataset.id}`);
  };
}

function renderFriendItem(fid, itemId) {
  const f = state.friends.find((x) => x.id === fid);
  const it = f?.items.find((x) => x.id === itemId);
  if (!it) return go('#/friend/' + fid);
  const mine = state.items.find((m) => sameGoods(m, it));
  const hearts = [1, 2, 3, 4, 5].map((n) => `<span class="${n <= (it.affection || 0) ? 'on' : ''}">♥</span>`).join('');
  $app.innerHTML = `
    <header class="topbar">
      <button class="icon-btn" data-act="back" aria-label="뒤로">${ICON.back}</button>
      <h1 class="title-center dex-no">${esc(friendTitle(f))}</h1>
      <span style="width:44px"></span>
    </header>
    <main class="page detail">
      <div class="photo-frame" data-act="zoom" role="button" aria-label="사진 크게 보기">
        ${slidesHTML(it.photos || [])}
        ${it.soldout ? '<span class="sticker soldout">품절</span>' : ''}
        ${it.limited ? '<span class="sticker limited">한정판</span>' : ''}
      </div>
      <div class="d-head">
        <h2 class="d-name">${esc(it.name)}</h2>
        ${it.officialName ? `<p class="d-official">${esc(it.officialName)}</p>` : ''}
      </div>
      <div class="info-grid">
        <div class="info-box"><span class="k">애정도</span><span class="v d-hearts">${hearts}</span></div>
        <div class="info-box"><span class="k">날짜</span><span class="v">${fmtDate(it.date)}</span></div>
        ${'place' in it ? `
          <div class="info-box"><span class="k">발견 장소</span><span class="v">${esc(it.place || '-')}</span></div>
          <div class="info-box"><span class="k">가게</span><span class="v">${esc(it.shop || '-')}</span></div>` : ''}
      </div>
      <div class="info-grid prices">
        ${'myPrice' in it ? `<div class="info-box mine"><span class="k">${esc(f.from)}가 본 가격</span><span class="v">${won(it.myPrice)}</span></div>` : ''}
        <div class="info-box"><span class="k">온라인 가격${it.onlineMall ? ` · ${esc(it.onlineMall)}` : ''}</span><span class="v pink">${won(it.onlinePrice)}</span></div>
      </div>
      ${it.categoryNames?.length ? `<div class="cat-tags">${it.categoryNames.map((n) => `<span class="cat-chip">${esc(n)}</span>`).join('')}</div>` : ''}
      ${it.memo ? `<div class="label">메모</div><div class="memo">${esc(it.memo)}</div>` : ''}
      <div style="margin-top:20px;display:grid;gap:10px">
        ${mine
          ? `<a class="big-btn ghost" href="#/item/${mine.id}" style="text-align:center;text-decoration:none">✓ 이미 내 굿즈함에 있어요 · 보러 가기</a>`
          : '<button class="big-btn" data-act="take">♥ 내 굿즈함에 담기</button>'}
      </div>
    </main>`;
  $app.onclick = async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'back') return back();
    if (act === 'zoom') return openLightbox(it.photos || [], 0);
    if (act === 'take') {
      const copy = {
        id: uid(), createdAt: Date.now(), name: it.name, officialName: it.officialName || '', photos: [...(it.photos || [])],
        affection: it.affection || 3, date: today(), place: '', shop: '', myPrice: null,
        onlinePrice: it.onlinePrice ?? null, onlineMall: it.onlineMall || '', onlineLink: '',
        soldout: !!it.soldout, limited: !!it.limited, memo: `${f.from}의 굿즈에서 담음`, categoryIds: [],
        purchased: false, purchasedAt: null,
      };
      await saveItem(copy);
      toast('내 굿즈함에 담았어요');
      renderFriendItem(fid, itemId);
    }
  };
}
