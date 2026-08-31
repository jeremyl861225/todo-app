/* 待辦事項 — service worker
 *
 * 目的：讓 App 外殼（HTML/JS/圖示）離線也開得起來，不用每次開都重抓。
 *
 * 同網域下還有其他 PWA（Clinical-Tools、題庫等），所以這裡嚴格自我約束：
 *   - 快取名稱一律用 PREFIX 開頭，清理時只刪自己的，絕不動別人的
 *   - 只處理本 scope（/todo-app/）底下的同源 GET
 *   - Supabase 的 API 一律不碰，永遠走網路
 *   - precache 逐一 add，單一檔案缺漏不會讓整個安裝失敗
 */
const PREFIX = 'todo-app-';
const CACHE  = PREFIX + 'v10';

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

self.addEventListener('install', e=>{
  e.waitUntil((async ()=>{
    const c = await caches.open(CACHE);
    // 逐一加入：某個檔案 404 時只少那一個，不會整包安裝失敗
    await Promise.all(PRECACHE.map(u =>
      c.add(new Request(u, {cache:'reload'})).catch(err =>
        console.warn('[sw] precache 略過', u, err.message))));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e=>{
  e.waitUntil((async ()=>{
    const keys = await caches.keys();
    // 只刪自己前綴的舊版本
    await Promise.all(keys
      .filter(k => k.startsWith(PREFIX) && k !== CACHE)
      .map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

const scopePath = new URL(self.registration.scope).pathname;

self.addEventListener('fetch', e=>{
  const req = e.request;
  if(req.method !== 'GET') return;

  const url = new URL(req.url);
  if(url.origin !== self.location.origin) return;      // Supabase 等外部一律走網路
  if(!url.pathname.startsWith(scopePath)) return;      // 不碰同網域其他 App
  if(url.search) return;                               // 帶查詢字串的不快取

  // stale-while-revalidate：先給快取，背景更新，下次開就是新版
  e.respondWith((async ()=>{
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req);
    const fresh = fetch(req).then(res=>{
      if(res && res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    }).catch(()=> null);

    if(hit){ e.waitUntil(fresh); return hit; }

    const res = await fresh;
    if(res) return res;
    // 離線又沒快取：導覽請求就回首頁，其餘照實失敗
    if(req.mode === 'navigate'){
      const shell = await cache.match('./index.html') || await cache.match('./');
      if(shell) return shell;
    }
    return new Response('離線，且這個資源沒有快取。', {
      status: 503, headers: {'Content-Type':'text/plain; charset=utf-8'}
    });
  })());
});
