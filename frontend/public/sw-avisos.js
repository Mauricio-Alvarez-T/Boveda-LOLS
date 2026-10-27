/*
 * Avisos al celular de Bóveda (mig 143): solo recibe los avisos y abre la pantalla al tocarlos.
 * A propósito NO guarda nada en caché ni intercepta pedidos (sin `fetch`): así nunca deja una versión vieja de la app.
 * Lo registra services/avisosCelular.ts recién cuando la persona toca «Activar avisos».
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
    let d = {};
    try { d = e.data ? e.data.json() : {}; } catch { d = { cuerpo: e.data ? e.data.text() : '' }; }
    const titulo = d.titulo || 'Bóveda LOLS';
    e.waitUntil(self.registration.showNotification(titulo, {
        body: d.cuerpo || '',
        icon: '/icon-192.png',
        // La insignia de la barra: Android la pinta en blanco, así que es el logo en blanco sobre transparente.
        badge: '/aviso-insignia.png',
        tag: d.etiqueta || undefined,
        renotify: !!d.etiqueta,
        data: { url: typeof d.url === 'string' && d.url.startsWith('/') ? d.url : '/' },
    }));
});

self.addEventListener('notificationclick', (e) => {
    e.notification.close();
    const url = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin).href;
    e.waitUntil((async () => {
        const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const w of ventanas) {
            if (new URL(w.url).origin === self.location.origin) {
                try { await w.navigate(url); } catch { /* una ventana que no controla este archivo: se enfoca igual */ }
                return w.focus();
            }
        }
        return self.clients.openWindow(url);
    })());
});
