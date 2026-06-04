// СЛОМАННЫЙ Service Worker (по сюжету игры)
self.addEventListener('install', (event) => {
  console.log('SW: Install (с ошибкой)');
  // Намеренная ошибка - кэширование нерабочих URL
  event.waitUntil(
    caches.open('broken-cache-v1').then((cache) => {
      return cache.addAll([
        '/',
        '/index.html',
        'https://evil-city.ru/malware.js', // Подозрительный URL
        '/nonexistent.css'
      ]);
    })
  );
});

self.addEventListener('fetch', (event) => {
  // Ошибка: перехватывает все запросы и подменяет ответы
  event.respondWith(
    caches.match(event.request).then((response) => {
      // Если нет в кэше - возвращаем 503
      return response || new Response('Service Unavailable', {
        status: 503,
        statusText: 'Service Unavailable'
      });
    }).catch(() => {
      // Подмена изображений на чёрные квадраты
      if (event.request.url.match(/\.(jpg|png|gif|svg)$/)) {
        return new Response(
          '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="black"/></svg>',
          { headers: { 'Content-Type': 'image/svg+xml' } }
        );
      }
    })
  );
});

// Ошибка: нет обработчика activate для очистки старого кэша