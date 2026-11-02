// IndexedDB 저장소: 굿즈(items), 카테고리(categories), 꾸미기·예산 설정(settings), 친구에게 받은 굿즈 목록(friends). 사진은 dataURL 문자열로 함께 저장한다.
const DB = (() => {
  let dbp;
  function open() {
    if (!dbp) {
      dbp = new Promise((resolve, reject) => {
        const req = indexedDB.open('goods-wish', 3);
        req.onupgradeneeded = () => {
          const db = req.result;
          for (const name of ['items', 'categories', 'settings', 'friends']) {
            if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
          }
        };
        req.onsuccess = () => {
          const db = req.result;
          // 다른 탭이 저장소를 새 버전으로 바꾸려 하면 이 탭은 연결을 놓고 새로고침 (그쪽이 멈추지 않게)
          db.onversionchange = () => { db.close(); location.reload(); };
          resolve(db);
        };
        req.onerror = () => reject(req.error);
        // 예전 버전 앱이 열린 탭이 있으면 저장소 업그레이드가 막힌다: 빈 화면 대신 이유를 보여 준다
        req.onblocked = () => {
          const app = document.getElementById('app');
          if (app) app.innerHTML = `<p class="empty-msg" style="margin-top:80px">앱이 업데이트됐어요.<br>
            이 앱이 열린 <b>다른 탭을 모두 닫고</b><br>이 화면을 새로고침해 주세요.</p>`;
        };
      });
    }
    return dbp;
  }
  async function tx(store, mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      const s = t.objectStore(store);
      const r = fn(s);
      t.oncomplete = () => resolve(r && 'result' in r ? r.result : undefined);
      t.onerror = () => reject(t.error);
    });
  }
  return {
    all: (store) => tx(store, 'readonly', (s) => s.getAll()),
    get: (store, id) => tx(store, 'readonly', (s) => s.get(id)),
    put: (store, obj) => tx(store, 'readwrite', (s) => s.put(obj)),
    del: (store, id) => tx(store, 'readwrite', (s) => s.delete(id)),
  };
})();
