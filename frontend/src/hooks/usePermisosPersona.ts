/**
 * Permisos de UNA persona «en frases» (Configuración › Usuarios › permisos, opción E, Marcos 2026-10-28).
 *
 * Se edita lo que la persona TIENE (rol + propios − quitados), con los mismos niveles e interruptores que un rol
 * (`permisosPantallas.ts`). Al guardar, `overridesAlGuardar` lo convierte en los overrides de siempre
 * (`POST /usuarios/user-overrides/:id`), tocando solo lo que cambió. Desde la mig 146 el backend cierra la sesión
 * SOLO de esa persona (antes subía la versión de todo su rol).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import api from '../services/api';
import { GRUPOS, aplicarNivel, alternarClave, clavesPantalla, type Pantalla } from '../config/permisosPantallas';
import { cambiosEntre, comoSuRol, efectivos, overridesAlGuardar, respetarPuertas, type Override } from '../config/frasesPermisos';

interface Args {
    usuarioId: number;
    rolId: number;
    /** Primer nombre, para los mensajes. */
    primer: string;
}

export function usePermisosPersona({ usuarioId, rolId, primer }: Args) {
    const [rolPerms, setRolPerms] = useState<string[]>([]);
    const [overrides, setOverrides] = useState<Override[]>([]);
    const [base, setBase] = useState<string[]>([]);
    const [perms, setPerms] = useState<string[]>([]);
    // «Dejar todo como su rol»: al guardar se arman los overrides de cero (se van también los redundantes).
    const [desdeCero, setDesdeCero] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        let cancelado = false;
        setLoading(true);
        setError(null);
        Promise.all([
            api.get(`/usuarios/roles/${rolId}/permisos`),
            api.get(`/usuarios/user-overrides/${usuarioId}`),
        ])
            .then(([r, o]) => {
                if (cancelado) return;
                const rp: string[] = Array.isArray(r.data) ? r.data : [];
                const ov: Override[] = (Array.isArray(o.data) ? o.data : []).filter(
                    (x: Override) => x && typeof x.permiso_clave === 'string' && (x.tipo === 'grant' || x.tipo === 'deny'),
                );
                const ef = efectivos(rp, ov);
                setRolPerms(rp);
                setOverrides(ov);
                setBase(ef);
                setPerms(ef);
                setDesdeCero(false);
            })
            .catch(err => {
                if (cancelado) return;
                const status = (err as { response?: { status?: number } })?.response?.status;
                setError(`No se pudieron cargar los permisos${status ? ` (HTTP ${status})` : ''}.`);
            })
            .finally(() => { if (!cancelado) setLoading(false); });
        return () => { cancelado = true; };
    }, [usuarioId, rolId]);

    const permsSet = useMemo(() => new Set(perms), [perms]);
    const baseSet = useMemo(() => new Set(base), [base]);
    const rolSet = useMemo(() => new Set(rolPerms), [rolPerms]);
    const cambios = useMemo(() => cambiosEntre(perms, base), [perms, base]);
    const dirty = cambios > 0;

    // Cerrar el modal (o la pestaña) con cambios sin guardar: se pregunta (Modal lee data-modal-dirty).
    useEffect(() => {
        document.body.setAttribute('data-modal-dirty', dirty ? 'true' : 'false');
        if (!dirty) return () => document.body.setAttribute('data-modal-dirty', 'false');
        const avisar = (e: BeforeUnloadEvent) => { e.preventDefault(); };
        window.addEventListener('beforeunload', avisar);
        return () => {
            window.removeEventListener('beforeunload', avisar);
            document.body.setAttribute('data-modal-dirty', 'false');
        };
    }, [dirty]);

    // Cada cambio toca SOLO su pantalla y, si corresponde, la entrada de su módulo (`respetarPuertas`): las entradas de
    // los otros módulos quedan como estaban, así no se pierde ni se inventa un propio/quitado que nadie tocó.
    // En la fila puerta (Asistencia diaria, Trabajadores y reportes) se dice cómo debe quedar la entrada: un nivel ≥ 1
    // la incluye; apagar justo la entrada la saca; encender otra acción la pone (sin «ver» no sirve); apagar otra acción
    // la deja como estaba (no revive un «quitado» de la entrada).
    const setNivel = useCallback((p: Pantalla, n: number) => setPerms(prev =>
        respetarPuertas(prev, aplicarNivel(prev, p, n), p, { puerta: p.puerta ? n !== 0 : undefined, guardado: baseSet })), [baseSet]);
    const alternar = useCallback((p: Pantalla, c: string) => setPerms(prev => {
        const entrada = GRUPOS.find(g => g.id === p.grupo)?.puerta;
        const puerta = p.puerta && entrada
            ? (c === entrada ? !prev.includes(c) : !prev.includes(c) || prev.includes(entrada))
            : undefined;
        return respetarPuertas(prev, alternarClave(prev, p, c), p, { puerta, guardado: baseSet });
    }), [baseSet]);
    const volver = useCallback((p: Pantalla) => setPerms(prev => comoSuRol(prev, rolSet, p)), [rolSet]);
    /** La entrada a un módulo (p. ej. `inventario.ver`) tal cual: se da o se quita, sin reglas automáticas. */
    const alternarPuerta = useCallback((clave: string) => setPerms(prev => (prev.includes(clave) ? prev.filter(c => c !== clave) : [...prev, clave])), []);
    const todoComoSuRol = useCallback(() => { setPerms(rolPerms); setDesdeCero(true); }, [rolPerms]);
    const deshacer = useCallback(() => { setPerms(base); setDesdeCero(false); }, [base]);

    const guardar = useCallback(async () => {
        const nuevos = overridesAlGuardar({ antes: baseSet, ahora: permsSet, rol: rolSet, actuales: overrides, desdeCero });
        setSaving(true);
        try {
            await api.post(`/usuarios/user-overrides/${usuarioId}`, { overrides: nuevos, rol_id: rolId });
            setOverrides(nuevos);
            setBase(perms);
            setDesdeCero(false);
            toast.success(`Permisos de ${primer} guardados. ${primer} vuelve a entrar y ve los cambios.`);
        } catch (err) {
            const e = err as { response?: { status?: number; data?: { error?: string } } };
            toast.error(`No se guardaron los permisos${e.response?.data?.error ? `: ${e.response.data.error}` : e.response?.status ? ` (HTTP ${e.response.status})` : ''}.`);
        } finally {
            setSaving(false);
        }
    }, [baseSet, permsSet, rolSet, overrides, desdeCero, usuarioId, rolId, perms, primer]);

    return {
        loading, error, saving, dirty, cambios,
        perms: permsSet,
        rol: rolSet,
        sinGuardarEn: (p: Pantalla) => clavesPantalla(p).some(c => permsSet.has(c) !== baseSet.has(c)),
        /** ¿La entrada a un módulo (`inventario.ver`) cambió y no se guardó? */
        puertaSinGuardar: (clave: string) => permsSet.has(clave) !== baseSet.has(clave),
        /** Cómo quedaría esa pantalla con «Como su rol» (para no mostrar el botón si no cambiaría nada). */
        comoSuRolCambia: (p: Pantalla) => cambiosEntre(comoSuRol(perms, rolSet, p), perms) > 0,
        setNivel, alternar, volver, alternarPuerta, todoComoSuRol, deshacer, guardar,
    };
}
