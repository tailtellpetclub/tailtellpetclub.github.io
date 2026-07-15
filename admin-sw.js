// 尾尾道來 Admin - Service Worker
// 使用固定版本號，避免無限更新循環
const CACHE_VERSION = '20260714-v5';
const CACHE_NAME = `ttpc-admin-${CACHE_VERSION}`;
const OLD_CACHE_PREFIX = 'ttpc-admin-'; // 用於清除舊版本

const urlsToCache = [
    '/admin.html',
    'https://fcsmbnhnknwzdffcogwm.supabase.co/storage/v1/object/public/logo/logo.jpg',
    'https://fcsmbnhnknwzdffcogwm.supabase.co/storage/v1/object/public/logo/logo2.png',
    'https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@200;300;400;600&display=swap',
    'https://cdn.tailwindcss.com',
    'https://unpkg.com/lucide@latest',
    'https://unpkg.com/@supabase/supabase-js@2',
    'https://unpkg.com/react@18/umd/react.production.min.js',
    'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js',
    'https://unpkg.com/@babel/standalone/babel.min.js'
];

// 安裝事件 - 快取核心資源
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log(`[SW] 快取資源中 (${CACHE_VERSION})...`);
                return cache.addAll(urlsToCache);
            })
            .then(() => {
                console.log('[SW] 安裝完成，跳過等待，直接啟用新版本');
                return self.skipWaiting();
            })
            .catch(err => {
                console.warn('[SW] 部分資源快取失敗:', err);
                // 即使部分失敗也繼續安裝
                return self.skipWaiting();
            })
    );
});

// 啟動事件 - 立即接管頁面並清除舊快取
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    // 刪除所有以 OLD_CACHE_PREFIX 開頭但不是目前版本的快取
                    if (cacheName.startsWith(OLD_CACHE_PREFIX) && cacheName !== CACHE_NAME) {
                        console.log('[SW] 刪除舊快取:', cacheName);
                        return caches.delete(cacheName);
                    }
                    return Promise.resolve();
                })
            );
        }).then(() => {
            console.log('[SW] 已啟動，準備接管所有頁面');
            // 取得所有客戶端並通知它們更新
            return self.clients.claim().then(() => {
                // 通知所有已連接的客戶端重新整理
                return self.clients.matchAll().then(clients => {
                    clients.forEach(client => {
                        client.postMessage({ type: 'SW_ACTIVATED' });
                    });
                });
            });
        })
    );
});

// 訊息事件
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        console.log('[SW] 收到 SKIP_WAITING，跳過等待');
        self.skipWaiting();
    }
    if (event.data && event.data.type === 'CHECK_UPDATE') {
        // 檢查是否有新版本
        self.skipWaiting();
    }
});

// 請求攔截
self.addEventListener('fetch', event => {
    const requestUrl = new URL(event.request.url);
    
    // 跳過 Supabase API 請求
    if (requestUrl.hostname.includes('supabase.co') && requestUrl.pathname.includes('/rest/v1/')) {
        event.respondWith(fetch(event.request));
        return;
    }
    
    // 跳過 Resend API
    if (requestUrl.hostname.includes('resend.com')) {
        event.respondWith(fetch(event.request));
        return;
    }
    
    // 跳過 Supabase Storage 圖片（避免快取舊 logo）
    if (requestUrl.hostname.includes('supabase.co') && requestUrl.pathname.includes('/storage/v1/object/public/')) {
        event.respondWith(
            fetch(event.request, { cache: 'no-cache' })
                .catch(() => caches.match(event.request))
        );
        return;
    }
    
    // HTML 請求：優先網路，備用快取
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request, { cache: 'no-store' })
                .then(response => {
                    // 不主動快取 HTML，讓它始終保持最新
                    return response;
                })
                .catch(() => {
                    return caches.match('/admin.html');
                })
        );
        return;
    }
    
    // 其他靜態資源：快取優先，網路備用
    event.respondWith(
        caches.match(event.request)
            .then(cachedResponse => {
                if (cachedResponse) {
                    return cachedResponse;
                }
                return fetch(event.request)
                    .then(response => {
                        if (response && response.status === 200 && response.type === 'basic') {
                            const clonedResponse = response.clone();
                            caches.open(CACHE_NAME).then(cache => {
                                cache.put(event.request, clonedResponse);
                            });
                        }
                        return response;
                    })
                    .catch(() => {
                        if (event.request.destination === 'document') {
                            return caches.match('/admin.html');
                        }
                        return new Response('離線中，請檢查網路連線', {
                            status: 503,
                            statusText: 'Service Unavailable'
                        });
                    });
            })
    );
});