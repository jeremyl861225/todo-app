/* 待辦事項 — 極簡 service worker
 *
 * 這個 app 需要即時的雲端資料，刻意「不做任何快取」：
 *   - 只提供 fetch handler，讓瀏覽器願意把它當成可安裝的 PWA
 *   - 不建立 Cache Storage，因此永遠不會刪到同網域其他 PWA 的快取
 *   - 不會有「更新後拿到舊版」的問題
 */
self.addEventListener('install',  e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',    e => { /* 直接走網路，不攔截 */ });
