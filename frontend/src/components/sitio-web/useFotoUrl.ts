import { useEffect, useState } from 'react';
import api from '../../services/api';

/**
 * La imagen de una foto del sitio para mostrarla en la Bóveda: `GET /sitio-web/fotos/:id/archivo?ancho=` es una
 * descarga autenticada (la ruta sale de la BD), así que se baja como blob y se muestra con una URL local.
 *
 * Caché por foto y ancho, compartida por toda la pantalla: los bytes de una foto nunca cambian (una subida nueva es
 * otra fila), así que la miniatura de la lista, la portada y la vista previa no la bajan dos veces. Se guardan las
 * últimas 60; las más viejas se liberan. `activo = false` (la tarjeta todavía no se ve) no pide nada.
 */

export type AnchoFoto = 800 | 1600 | 'maestra';

const MAX = 60;
const cache = new Map<string, Promise<string>>();

function pedir(id: number, ancho: AnchoFoto): Promise<string> {
    const clave = `${id}:${ancho}`;
    const hay = cache.get(clave);
    if (hay) {
        // Recién usada: al final de la cola.
        cache.delete(clave);
        cache.set(clave, hay);
        return hay;
    }
    const p = api.get<Blob>(`/sitio-web/fotos/${id}/archivo`, { params: { ancho }, responseType: 'blob' })
        .then(res => URL.createObjectURL(res.data));
    p.catch(() => cache.delete(clave));
    cache.set(clave, p);
    while (cache.size > MAX) {
        const [vieja, url] = cache.entries().next().value as [string, Promise<string>];
        cache.delete(vieja);
        url.then(u => URL.revokeObjectURL(u), () => { /* nunca llegó */ });
    }
    return p;
}

export function useFotoUrl(id: number | null, ancho: AnchoFoto, activo = true) {
    const [estado, setEstado] = useState<{ clave: string; url: string | null; error: boolean }>({ clave: '', url: null, error: false });
    const clave = id ? `${id}:${ancho}` : '';

    useEffect(() => {
        if (!id || !activo) return;
        let vivo = true;
        pedir(id, ancho)
            .then(url => { if (vivo) setEstado({ clave: `${id}:${ancho}`, url, error: false }); })
            .catch(() => { if (vivo) setEstado({ clave: `${id}:${ancho}`, url: null, error: true }); });
        return () => { vivo = false; };
    }, [id, ancho, activo]);

    // Lo de otra foto (cambió el id) no se muestra mientras llega la nueva.
    const propio = estado.clave === clave;
    return { url: propio ? estado.url : null, error: propio && estado.error, cargando: !!id && activo && !propio };
}
