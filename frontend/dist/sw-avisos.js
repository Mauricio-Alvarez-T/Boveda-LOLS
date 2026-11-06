/*
 * Avisos de Bóveda (mig 143/145) en el celular o el computador: recibe los avisos, abre la pantalla al tocarlos y
 * confirma solo qué pasó con cada uno (centro de avisos de Soporte): le apareció, lo abrió, lo deslizó, o no se mostró
 * porque ya tenía Bóveda al frente en el computador (los recordatorios; al celular llegan siempre).
 * A propósito NO guarda nada en caché ni intercepta pedidos (sin `fetch`): así nunca deja una versión vieja de la app.
 * Lo registra services/avisosCelular.ts recién cuando la persona toca «Activar avisos».
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

/* El acuse va sin sesión, con la clave de un solo uso que trae el aviso. Si no hay internet, se pierde: no reintenta. */
function acuse(aviso, evento) {
    if (!aviso || !aviso.id || !aviso.t) return Promise.resolve();
    return fetch('/api/avisos-celular/acuse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: aviso.id, t: aviso.t, evento }),
        keepalive: true,
        credentials: 'omit',
    }).catch(() => undefined);
}

/* ¿Tiene Bóveda abierto y al frente (la ventana activa)? Solo entonces se omite: si no, el navegador mostraría su
 * propio aviso genérico. */
async function estaEnBoveda() {
    const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    return ventanas.some((w) => w.focused && new URL(w.url).origin === self.location.origin);
}

self.addEventListener('push', (e) => {
    let d = {};
    try { d = e.data ? e.data.json() : {}; } catch { d = { cuerpo: e.data ? e.data.text() : '' }; }
    const titulo = d.titulo || 'Bóveda LOLS';
    e.waitUntil((async () => {
        if (d.siEstaEnBoveda === 'omitir' && await estaEnBoveda()) {
            await acuse(d.aviso, 'en_pantalla');
            return;
        }
        await self.registration.showNotification(titulo, {
            body: d.cuerpo || '',
            icon: '/icon-192.png',
            // La insignia de la barra: Android la pinta en blanco, así que es el logo en blanco sobre transparente.
            badge: '/aviso-insignia.png',
            tag: d.etiqueta || undefined,
            renotify: !!d.etiqueta,
            data: { url: typeof d.url === 'string' && d.url.startsWith('/') ? d.url : '/', aviso: d.aviso || null },
        });
        await acuse(d.aviso, 'mostrado');
    })());
});

/* Lo deslizó (o lo cerró) sin abrirlo. */
self.addEventListener('notificationclose', (e) => {
    e.waitUntil(acuse(e.notification.data && e.notification.data.aviso, 'descartado'));
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
    const aviso = e.notification.data && e.notification.data.aviso;
    e.waitUntil((async () => {
        const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        const propia = ventanas.find((w) => new URL(w.url).origin === self.location.origin);
        let abierta = false;
        if (propia) {
            try {
                const enfocada = (await propia.focus()) || propia;
                abierta = true;
                try {
                    if ('navigate' in enfocada) await enfocada.navigate(url);
                    else enfocada.postMessage({ tipo: 'boveda-abrir', url });
                } catch {
                    /* no la controla este archivo: que se mueva sola */
                    enfocada.postMessage({ tipo: 'boveda-abrir', url });
                }
            } catch { abierta = false; /* no se pudo enfocar: se abre una nueva */ }
        }
        if (!abierta) await self.clients.openWindow(url);
        await acuse(aviso, 'abierto');
    })());
});
