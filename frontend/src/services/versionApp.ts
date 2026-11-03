/**
 * La versión de Bóveda (mig 150; Soporte → Errores «Arreglado en esta versión»). Versión = cada subida a producción;
 * se nombra por cuándo se compiló, en UTC: «AAAAMMDD-HHMM» (vite.config.ts), así se ordena sola.
 *   · `VERSION_APP`: la de ESTA pestaña (la que la persona tiene abierta; va con cada error).
 *   · `leerVersionPublicada()`: la que está arriba ahora (`/version.json`), aunque esta pestaña sea vieja.
 */
declare const __VERSION_APP__: string | undefined;

export const RE_VERSION = /^\d{8}-\d{4}$/;

export const VERSION_APP: string | null = typeof __VERSION_APP__ === 'string' && RE_VERSION.test(__VERSION_APP__) ? __VERSION_APP__ : null;

/** La versión publicada ahora; null si no se pudo leer. */
export async function leerVersionPublicada(): Promise<string | null> {
    try {
        const r = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!r.ok) return null;
        const v = (await r.json() as { version?: unknown }).version;
        return typeof v === 'string' && RE_VERSION.test(v) ? v : null;
    } catch {
        return null;
    }
}

/** «20261103-1950» (UTC) → «3-nov 16:50» (hora de Chile). Lo que no es una versión queda como está. */
export function versionLegible(v?: string | null): string {
    if (!v || !RE_VERSION.test(v)) return v || '';
    const d = new Date(Date.UTC(+v.slice(0, 4), +v.slice(4, 6) - 1, +v.slice(6, 8), +v.slice(9, 11), +v.slice(11, 13)));
    const p = new Intl.DateTimeFormat('es-CL', {
        timeZone: 'America/Santiago', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(d);
    const g = (t: string) => p.find(x => x.type === t)?.value ?? '';
    return `${g('day')}-${g('month').replace('.', '')} ${g('hour')}:${g('minute')}`;
}
