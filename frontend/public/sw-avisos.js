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

/*
 * Al tocar el aviso: si hay una ventana de Bóveda, se trae al frente PRIMERO (el permiso para enfocar dura poco) y
 * después se lleva a la pantalla del aviso; si esa ventana no deja moverla (una pestaña abierta antes de activar los
 * avisos), se le pide a la página que se mueva sola (AvisoSoporte.tsx escucha 'boveda-abrir'). Si no hay ventana o
 * nada de eso funciona, se abre Bóveda nueva en esa pantalla. Nunca se queda sin abrir nada.
 */
self.addEventListener('notificationclick', (e) => {
    e.notification.close();
    const url = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin).href;
    e.waitUntil((async () => {
        const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        const propia = ventanas.find((w) => new URL(w.url).origin === self.location.origin);
        if (propia) {
            try {
                const enfocada = (await propia.focus()) || propia;
                try {
                    if ('navigate' in enfocada) { await enfocada.navigate(url); return; }
                } catch { /* no la controla este archivo: que se mueva sola */ }
                enfocada.postMessage({ tipo: 'boveda-abrir', url });
                return;
            } catch { /* no se pudo enfocar: se abre una nueva */ }
        }
        await self.clients.openWindow(url);
    })());
});
