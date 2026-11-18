// KataloG Admin - Service Worker para Alertas y Notificaciones PWA
const CACHE_NAME = 'katalog-admin-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Manejo del toque / clic en la notificación del sistema
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = (event.notification.data && event.notification.data.url) || '/admin/inventory/?tab=orders';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Si ya hay una ventana del admin abierta, enfocarla
      for (const client of clientList) {
        if (client.url && client.url.includes('/admin/')) {
          if ('focus' in client) {
            client.focus();
            client.postMessage({ type: 'KATALOG_NAVIGATE_TAB', tab: 'orders' });
            return;
          }
        }
      }
      // Si no hay ventana abierta, abrir una nueva
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

// Soporte para recepción de eventos Web Push
self.addEventListener('push', (event) => {
  let data = {
    title: '📦 ¡Nuevo Pedido en KataloG!',
    body: 'Se ha recibido una nueva solicitud en el catálogo.',
    url: '/admin/inventory/?tab=orders',
  };

  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch (e) {
    if (event.data) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: '/icon-192.png',
    badge: '/icon-32.png',
    vibrate: [200, 100, 200, 100, 300],
    data: {
      url: data.url || '/admin/inventory/?tab=orders',
    },
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});
