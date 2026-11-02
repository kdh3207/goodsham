// 새 홈(대시보드): 이번 달 덕질비 · 월 예산 막대 · 카테고리별 지출 · 최근 구매.
// 지출은 '구매 완료'한 굿즈의 가격(내가 본 가격, 없으면 온라인 가격)을 구매한 달로 더한다.
'use strict';

state.budget = 0;
(async () => {
  try { state.budget = (await DB.get('settings', 'budget'))?.monthly || 0; } catch {}
  if (document.querySelector('.dash')) renderDashboard(); // 홈이 먼저 그려졌으면 예산을 반영해 다시
})();

const paid = (it) => it.myPrice ?? it.onlinePrice ?? 0;
const monthOf = (it) => (it.purchased && it.purchasedAt ? it.purchasedAt.slice(0, 7) : '');

// 아래 탭 바: 홈 · 굿즈 추가 · 위시함
function bottomNavHTML(active) {
  return `
    <nav class="bottom-nav" aria-label="화면 이동">
      <a href="#/" class="${active === 'home' ? 'on' : ''}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z"/></svg>홈
      </a>
      <a href="#/new" class="nav-add" aria-label="굿즈 추가">＋</a>
      <a href="#/wish" class="${active === 'wish' ? 'on' : ''}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4.5" y="3.5" width="15" height="16" rx="2.5"/><path d="M4.5 9h15M4.5 14.5h15M10.5 6.3h3M10.5 11.8h3M10.5 17.2h3M7 19.5v1.5M17 19.5v1.5"/></svg>굿즈함
      </a>
    </nav>`;
}

function renderDashboard() {
  $app.onclick = null;
  const now = today().slice(0, 7);
  const monthLabel = `${Number(now.slice(5))}월`;
  const bought = state.items.filter((it) => monthOf(it) === now);
  const spent = bought.reduce((s, it) => s + paid(it), 0);
  const budget = state.budget;
  const pct = budget ? Math.round((spent / budget) * 100) : 0;
  const wishLeft = state.items.filter((it) => !it.purchased);
  const wishSum = wishLeft.reduce((s, it) => s + paid(it), 0);

  // 예산 사용 비율별 한마디 (덕질 밈 말투)
  const msg = !budget ? '월 예산을 정하면 얼마나 썼는지 막대로 보여 줘요.'
    : spent === 0 ? '지갑이 깨끗해요. 아직은요.'
    : pct > 200 ? '혹시… 굿즈샵 차리실 건가요? 🏪'
    : spent > budget ? `예산 초과 ${won(spent - budget)}… 그래도 최애가 행복하면 됐죠?`
    : pct >= 80 ? '지갑: "나… 조금 아파…"'
    : pct >= 50 ? '통장이 슬슬 눈치 보기 시작했어요 👀'
    : `남은 예산 ${won(budget - spent)}. 랜덤박스 몇 개 열 수 있을까요?`;

  // 카테고리별 이번 달 지출 (여러 카테고리에 속하면 각각에 더함, 없으면 '미분류')
  const byCat = new Map();
  for (const it of bought) {
    const ids = (it.categoryIds || []).filter((c) => catById(c));
    for (const c of ids.length ? ids : ['none']) byCat.set(c, (byCat.get(c) || 0) + paid(it));
  }
  const catRows = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
  const catMax = Math.max(1, ...catRows.map(([, v]) => v));

  // 최근 6개월 덕질비
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - (5 - i));
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return { key, label: `${d.getMonth() + 1}월`, sum: state.items.filter((it) => monthOf(it) === key).reduce((s, it) => s + paid(it), 0) };
  });
  const monthMax = Math.max(1, ...months.map((m) => m.sum));

  const recent = state.items.filter((it) => it.purchased && it.purchasedAt)
    .sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt) || b.createdAt - a.createdAt).slice(0, 5);

  const wonA = (n) => `${Number(n).toLocaleString('ko-KR')}원`;
  $app.innerHTML = `
    <header class="topbar da-top">
      <button class="icon-btn" data-act="drawer" aria-label="더보기">${ICON.menu}</button>
      <h1>덕질 기록</h1>
      <button class="icon-btn" data-act="search" aria-label="검색">${ICON.search}</button>
    </header>
    <main class="page dash da">
      <section class="da-card da-budget${pct > 100 ? ' over' : ''}">
        <div class="da-k">${monthLabel}에 쓴 덕질비</div>
        <div class="da-big">${wonA(spent)}</div>
        ${budget ? `
          <div class="da-bar" role="img" aria-label="예산 ${pct}% 사용"><i style="width:${Math.min(100, pct)}%"></i></div>
          <div class="da-legend">
            <span><b>${pct}%</b> 사용</span>
            <button class="da-link" data-act="budget">예산 ${wonA(budget)} ›</button>
          </div>` : '<button class="da-link da-set" data-act="budget">월 예산 정하기 ›</button>'}
        <p class="da-msg">${msg}</p>
      </section>

      <section class="da-card da-stats">
        <div><span>이번 달 구매</span><b>${bought.length}개</b></div>
        <div><span>평균 가격</span><b>${bought.length ? wonA(Math.round(spent / bought.length)) : '-'}</b></div>
        <div><span>남은 굿즈</span><b>${wishLeft.length}개</b></div>
      </section>

      <section class="da-card">
        <h2 class="da-title">카테고리별</h2>
        ${catRows.length ? catRows.map(([id, v]) => {
          const c = catById(id);
          const color = c ? c.color : 'var(--da-line-strong)';
          return `
            <div class="da-cat">
              <div class="da-cat-row"><span class="dot" style="background:${color}"></span><span class="da-cat-name">${esc(c ? c.name : '미분류')}</span><b>${wonA(v)}</b></div>
              <div class="da-bar thin"><i style="width:${(v / catMax) * 100}%; background:${color}"></i></div>
            </div>`;
        }).join('') : '<p class="da-empty">이번 달에 구매 완료한 굿즈가 아직 없어요.</p>'}
      </section>

      <section class="da-card">
        <h2 class="da-title">월별 덕질비</h2>
        <div class="da-months">
          ${months.map((m, i) => `
            <div class="da-month${i === months.length - 1 ? ' now' : ''}" aria-label="${m.label} ${wonA(m.sum)}">
              <i style="height:${Math.max(4, Math.round((m.sum / monthMax) * 94))}px"></i><span>${m.label}</span>
            </div>`).join('')}
        </div>
      </section>

      <section class="da-card da-recent">
        <div class="da-title-row"><h2 class="da-title">최근 구매</h2><a href="#/wish">전체 ›</a></div>
        ${recent.length ? recent.map((it) => `
          <a class="da-item" href="#/item/${it.id}">
            <img src="${esc(itemPhotos(it)[0] || '')}" alt="">
            <span class="da-item-txt"><b>${esc(it.name)}</b><small>${[(it.categoryIds || []).map((c) => catById(c)?.name).filter(Boolean).join(', '), fmtDate(it.purchasedAt)].filter(Boolean).join(' · ')}</small></span>
            <b class="da-item-price">${wonA(paid(it))}</b>
          </a>`).join('') : '<p class="da-empty">굿즈함에서 굿즈를 열고 \'구매 완료\'를 누르면 여기에 쌓여요.</p>'}
      </section>
    </main>
    ${bottomNavHTML('home')}`;

  $app.onclick = (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'drawer') openDrawer();
    if (act === 'search') go('#/search');
    if (act === 'budget') openBudgetSheet();
  };
}

function openBudgetSheet() {
  openSheet(`
    <h3>월 예산</h3>
    <p class="sheet-sub">한 달에 덕질비로 쓸 금액을 정해요. 비우고 저장하면 예산을 끕니다.</p>
    <div class="page" style="padding-bottom:0">
      <input class="field" id="budget-in" inputmode="numeric" value="${state.budget || ''}" placeholder="예: 300000">
      <div class="save-bar" style="position:static"><button class="big-btn" id="budget-ok">저장</button></div>
    </div>`, (s) => {
    const input = s.querySelector('#budget-in');
    setTimeout(() => input.focus(), 250);
    const ok = async () => {
      state.budget = toNum(input.value) || 0;
      try { await DB.put('settings', { id: 'budget', monthly: state.budget }); } catch {}
      closeSheet();
      toast(state.budget ? `월 예산을 ${won(state.budget)}으로 정했어요` : '월 예산을 껐어요');
      renderDashboard();
    };
    s.querySelector('#budget-ok').onclick = ok;
    input.onkeydown = (e) => { if (e.key === 'Enter') ok(); };
  });
}
