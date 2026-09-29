/* 待辦事項 — service worker
 *
 * 目的：讓 App 外殼（HTML/JS/圖示）離線也開得起來，不用每次開都重抓。網路只拿來同步資料。
 *
 * 同網域下還有其他 PWA（Clinical-Tools、題庫、Checkly 等），所以這裡嚴格自我約束：
 *   - 快取名稱一律用 PREFIX 開頭，清理時只刪自己的，絕不動別人的（Checkly 用 'checkly-'，互不相干）
 *   - 只處理本 scope（/todo-app/）底下的同源 GET
 *   - Supabase 的 API 一律不碰，永遠走網路
 *
 * 「一代」＝一份 sw.js（CACHE 名稱）＋它 PRECACHE 的檔案。規則：
 *   - PRECACHE 是外殼必備檔：整批 addAll，少一個就整個安裝失敗、舊版繼續服務（不會裝出一個缺檔的新版）
 *   - 外殼（./、index.html，以及 ./?d=…、./?demo=1 這種導覽）先給快取、背景更新，下次開就是新版；
 *     但伺服器上 sw.js 也換了時不寫進這一代——新外殼可能要新版的檔，留給新版 SW 自己 precache
 *   - vendor/ 的檔名帶版本號、內容永不改變：快取優先，不在背景重抓
 *   - 其他檔（圖示、manifest）stale-while-revalidate
 *   - 快取被別人清掉（同網域其他 App 的 SW 早期寫法會刪掉所有不是自己的快取）：每次開 App 順手檢查，
 *     缺的從網路補回這一代；連線上開一次就恢復離線可用
 *   - META 記著「目前啟用的是哪一代」：舊版 SW 在新版接手後還沒跑完的背景工作，不會把東西寫回已經刪掉的舊快取
 *
 * 改了 PRECACHE 裡任何一個非 HTML 的檔（或新增要離線用的檔），就把 CACHE 的版本號加一。
 * 只改 index.html 不用動這裡。
 */
const PREFIX = 'todo-app-';
const CACHE  = PREFIX + 'v11';
const META   = PREFIX + 'meta';   // 只放一筆「目前啟用的是哪一代」；不是資料快取，清理與查找都跳過它

const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './vendor/supabase-2.111.0.min.js',
  './mark.png',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
  './maskable-512.png'
];

const scopeUrl  = self.registration.scope;
const scopePath = new URL(scopeUrl).pathname;
const abs = u => new URL(u, scopeUrl).href;
const SHELL_KEYS = [abs('./'), abs('./index.html')];
const isShellPath = p => p === scopePath || p === scopePath + 'index.html';
const isVendorPath = p => p.startsWith(scopePath + 'vendor/');
const okBasic = res => !!res && res.ok && res.type === 'basic' && !res.redirected;
const NET_TIMEOUT_MS = 15000;     // 背景工作（補檔、更新外殼）等網路最多這麼久：連得上 Wi‑Fi 卻沒網路時不要一直掛著

/** 帶逾時的 fetch（只用在背景工作；回給頁面的請求不設逾時，交給瀏覽器） */
function fetchT(req){
  const ctl = new AbortController();
  const t = setTimeout(()=>ctl.abort(), NET_TIMEOUT_MS);
  return fetch(req, {signal: ctl.signal}).finally(()=>clearTimeout(t));
}

/* ---------- 自己的快取 ---------- */
async function ownCaches(){
  return (await caches.keys()).filter(k => k.startsWith(PREFIX) && k !== META);
}
/** 自己的快取裡找：先找目前這一代，沒有再找其他代。
    用 caches.match({cacheName})：不存在的快取不會像 caches.open 那樣被「復活」成一個空快取 */
async function matchOwn(req, opts){
  const hit = await caches.match(req, {...opts, cacheName: CACHE});
  if(hit) return hit;
  for(const n of (await ownCaches()).filter(k => k !== CACHE).reverse()){
    const r = await caches.match(req, {...opts, cacheName: n});
    if(r) return r;
  }
  return null;
}
const META_KEY = abs('./__sw-generation');
async function readMeta(){
  try{ const r = await caches.match(META_KEY, {cacheName: META}); return r ? await r.text() : null; }catch(e){ return null; }
}
async function writeMeta(v){
  try{ await (await caches.open(META)).put(META_KEY, new Response(v)); }catch(e){}
}
/** 這個 SW 還是目前啟用的那一代嗎？（新版接手後，舊版還沒跑完的背景工作不能再寫快取）
    紀錄不見了（被別人清掉）就當作是。只有 activate 會寫紀錄：這裡若也補寫，
    萬一補寫的是一個已經過時的舊 SW，真正在用的那一代反而會以為自己過時、再也不補檔 */
async function isCurrentGen(){
  const m = await readMeta();
  return m === null || m === CACHE;
}
/** 寫進這一代。回應要在交給頁面「之前」就 clone 好再傳進來（交出去之後再 clone 會丟例外） */
async function putCurrent(pairs){
  if(!(await isCurrentGen())) return;
  const c = await caches.open(CACHE);
  await Promise.all(pairs.map(([k, res]) => c.put(k, res)));
}
/** 伺服器上是不是已經有新版的 sw.js（正在安裝或等著接手）。查不到（離線）也當成「有」，寧可先不寫 */
async function newerPending(){
  try{ await self.registration.update(); }catch(e){ return true; }
  return !!(self.registration.installing || self.registration.waiting);
}

/* ---------- 安裝／啟用 ---------- */
self.addEventListener('install', e=>{
  e.waitUntil((async ()=>{
    const existed = await caches.has(CACHE);
    const c = await caches.open(CACHE);
    // 必備檔一次抓齊（cache:'reload' 繞過 HTTP 快取，避免混到舊檔）。
    // 任何一個失敗 addAll 就整批不寫入、install 失敗 → 這個新版被丟掉，舊 SW 與舊快取照常服務。
    try{
      await c.addAll(PRECACHE.map(u => new Request(u, {cache:'reload'})));
    }catch(err){
      // 剛剛 open 出來的空快取要收掉，免得留下一個空殼
      if(!existed) await caches.delete(CACHE);
      throw err;
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e=>{
  e.waitUntil((async ()=>{
    // 只刪自己前綴的舊版本（META 除外），別的 App 的快取一個都不碰
    const old = (await ownCaches()).filter(k => k !== CACHE);
    await Promise.all(old.map(k => caches.delete(k)));
    await writeMeta(CACHE);
    await self.clients.claim();
  })());
});

/* ---------- 自我修復：這一代的檔被別人清掉時補回來 ---------- */
let healP = null, healedAt = 0;
function healSoon(){
  if(healP) return healP;
  if(Date.now() - healedAt < 30000) return Promise.resolve();   // 剛確認過是完整的
  healP = heal().then(done => { if(done) healedAt = Date.now(); })
                .catch(()=>{}).finally(()=>{ healP = null; });
  return healP;
}
/** 回傳 true＝這一代現在是完整的（沒補齊的話，下次開 App 再試，不節流） */
async function heal(){
  const miss = [];
  for(const u of PRECACHE) if(!(await caches.match(abs(u), {cacheName: CACHE}))) miss.push(u);
  if(!miss.length) return true;
  if(!(await isCurrentGen())) return true;       // 已經不是目前這一代：不歸我管
  const c = await caches.open(CACHE);             // 整個快取被刪時，這裡會重建（它就是目前這一代）
  let htmlOk = null;                              // 外殼要補的話，先確認伺服器上不是已經換了一版
  let left = 0;
  for(const u of miss){
    try{
      const shell = SHELL_KEYS.includes(abs(u));
      if(shell){
        if(htmlOk === null) htmlOk = !(await newerPending());
        if(!htmlOk){ left++; continue; }          // 新版 SW 會自己 precache 新外殼
      }
      const res = await fetchT(new Request(abs(u), {cache:'no-cache'}));
      if(!okBasic(res)){ left++; continue; }
      await c.put(abs(u), res);
    }catch(err){ left++; }                          // 離線：下次開再補
  }
  return left === 0;
}

/* ---------- 外殼 ---------- */
async function cachedShell(){
  return (await caches.match(SHELL_KEYS[0], {cacheName: CACHE})) ||
         (await caches.match(SHELL_KEYS[1], {cacheName: CACHE})) ||
         (await matchOwn(SHELL_KEYS[0])) || (await matchOwn(SHELL_KEYS[1]));
}
let revalP = null;
/** 背景更新外殼：只改了 index.html 的部署下次開就生效；伺服器上 sw.js 也換了時不寫（見檔頭） */
function revalidateShell(){
  if(revalP) return revalP;
  revalP = (async ()=>{
    const res = await fetchT(new Request(SHELL_KEYS[0], {cache:'no-cache'}));
    if(!okBasic(res)) return;
    const body = await res.clone().text();
    const cur = await caches.match(SHELL_KEYS[0], {cacheName: CACHE});
    if(cur && (await cur.text()) === body) return;  // 沒變（最常見）：不用寫，也不用去問 sw.js
    if(await newerPending()) return;
    const copy = res.clone();
    await putCurrent([[SHELL_KEYS[0], res], [SHELL_KEYS[1], copy]]);
  })().catch(()=>{}).finally(()=>{ revalP = null; });
  return revalP;
}
const offline503 = () => new Response('離線，且這個資源沒有快取。', {
  status: 503, headers: {'Content-Type':'text/plain; charset=utf-8'}
});
const offlinePage = () => new Response(
  '<!doctype html><html lang="zh-Hant"><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<title>待辦事項 — 離線</title>' +
  '<body style="font:16px/1.6 system-ui,-apple-system,sans-serif;padding:32px 20px;max-width:34em;margin:auto;color:#133E50;background:#F8F7F2">' +
  '<h1 style="font-size:20px">目前離線，App 的離線檔案不在這台裝置上</h1>' +
  '<p>可能是瀏覽器清掉了網站資料。連上網路後重新開啟一次，就會重新下載並恢復離線可用；' +
  '你的待辦資料存在另一個地方，不受影響。</p></body></html>',
  { status: 503, headers: {'Content-Type':'text/html; charset=utf-8'} });

async function serveShell(e){
  const req = e.request;
  if(req.mode === 'navigate') e.waitUntil(healSoon());
  const hit = await cachedShell();
  if(hit){
    e.waitUntil(revalidateShell());
    return hit;
  }
  // 連外殼都沒有（第一次、或快取被清掉）：只能等網路；拿到的順手存成外殼
  try{
    const res = await fetch(req);
    if(okBasic(res)){
      const a = res.clone(), b = res.clone();       // 交給頁面之前就 clone 好
      e.waitUntil(putCurrent([[SHELL_KEYS[0], a], [SHELL_KEYS[1], b]]).catch(()=>{}));
    }
    return res;
  }catch(err){
    return req.mode === 'navigate' ? offlinePage() : offline503();
  }
}

/* ---------- 其他檔 ---------- */
/** vendor/：檔名帶版本號，內容永不改變 → 快取優先（這一代→其他代），都沒有才上網 */
async function serveImmutable(e){
  const req = e.request;
  const hit = await matchOwn(req);
  if(hit) return hit;
  try{
    const res = await fetch(req);
    if(okBasic(res)){
      const copy = res.clone();
      e.waitUntil(putCurrent([[req, copy]]).catch(()=>{}));
    }
    return res;
  }catch(err){ return offline503(); }
}
/** 其他同 scope 的檔：stale-while-revalidate */
async function serveOther(e){
  const req = e.request;
  const hit = await caches.match(req, {cacheName: CACHE});
  let saved = Promise.resolve();
  const fresh = fetch(req).then(res=>{
    if(okBasic(res)) saved = putCurrent([[req, res.clone()]]).catch(()=>{});
    return res;
  }).catch(()=> null);

  if(hit){ e.waitUntil(fresh.then(()=> saved)); return hit; }

  const res = await fresh;
  if(res){ e.waitUntil(saved); return res; }
  // 離線又不在目前這一代：其他代有的話先頂著用
  const older = await matchOwn(req);
  if(older) return older;
  return req.mode === 'navigate' ? offlinePage() : offline503();
}

self.addEventListener('fetch', e=>{
  const req = e.request;
  if(req.method !== 'GET') return;

  const url = new URL(req.url);
  if(url.origin !== self.location.origin) return;      // Supabase 等外部一律走網路
  if(!url.pathname.startsWith(scopePath)) return;      // 不碰同網域其他 App

  // App 外殼：桌面小工具的深連結 ./?d=2026-09-26、試用模式 ./?demo=1 也是它，一律先給快取的外殼
  // （不先等網路：Wi‑Fi 連得上卻沒網路時不會乾等）
  if(isShellPath(url.pathname) && (req.mode === 'navigate' || !url.search)){
    e.respondWith(serveShell(e));
    return;
  }
  if(url.search){
    // 其他帶查詢字串的資源不進快取（同一個檔會因查詢字串不同被存成好幾份）
    if(req.mode !== 'navigate') return;
    e.respondWith(fetch(req).catch(()=> offlinePage()));
    return;
  }
  if(isVendorPath(url.pathname)){ e.respondWith(serveImmutable(e)); return; }
  e.respondWith(serveOther(e));
});
