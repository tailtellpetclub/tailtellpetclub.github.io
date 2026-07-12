// sw.js - Service Worker for 尾尾道來寵物俱樂部 PWA
const CACHE_NAME = 'tailtell-pet-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index2.html',
  'https://fcsmbnhnknwzdffcogwm.supabase.co/storage/v1/object/public/logo/logo2.png',
  'https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@200;300;400;600&display=swap',
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/react@18/umd/react.production.min.js',
  'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js',
  'https://unpkg.com/@babel/standalone/babel.min.js',
  'https://cdn.jsdelivr.net/npm/signature_pad@4.1.7/dist/signature_pad.umd.min.js',
  'https://unpkg.com/lucide@latest',
  'https://unpkg.com/@supabase/supabase-js@2'
];

// 安裝 Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] 快取資源中...');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => {
        console.log('[SW] 快取完成');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[SW] 快取失敗:', error);
      })
  );
});

// 啟動 Service Worker
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => {
              console.log('[SW] 刪除舊快取:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW] 已啟動，接管頁面');
        return self.clients.claim();
      })
  );
});

// 攔截請求 - Stale-While-Revalidate 策略
self.addEventListener('fetch', (event) => {
  const request = event.request;

  // 跳過非 GET 請求
  if (request.method !== 'GET') {
    event.respondWith(fetch(request));
    return;
  }

  // 跳過 Supabase API 請求（即時資料不應快取）
  if (request.url.includes('supabase.co')) {
    event.respondWith(fetch(request));
    return;
  }

  // 跳過 Google Fonts CSS 請求（避免快取版本過舊）
  if (request.url.includes('fonts.googleapis.com')) {
    event.respondWith(fetch(request));
    return;
  }

  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        // 如果有快取，先回傳快取，同時在背景更新
        if (cachedResponse) {
          // 背景更新（Stale-While-Revalidate）
          fetch(request)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                caches.open(CACHE_NAME)
                  .then((cache) => {
                    cache.put(request, networkResponse.clone());
                  });
              }
            })
            .catch(() => {});
          return cachedResponse;
        }

        // 無快取，從網路取得
        return fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const responseClone = networkResponse.clone();
              caches.open(CACHE_NAME)
                .then((cache) => {
                  cache.put(request, responseClone);
                });
            }
            return networkResponse;
          })
          .catch((error) => {
            console.error('[SW] 請求失敗:', error);
            // 如果是 HTML 請求，嘗試回傳離線頁面
            if (request.headers.get('accept') && request.headers.get('accept').includes('text/html')) {
              return caches.match('/offline.html');
            }
            return new Response('網路連線異常，請稍後再試', {
              status: 503,
              statusText: 'Service Unavailable'
            });
          });
      })
  );
});

// 監聽 SKIP_WAITING 訊息
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});