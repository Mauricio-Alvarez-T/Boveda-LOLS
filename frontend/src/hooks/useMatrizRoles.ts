/**
 * Estado de la matriz de roles (Configuración › Roles): todos los roles activos con sus permisos, lo que
 * se cambió sin guardar y el guardado rol por rol.
 *
 * Reusa la API de siempre — `GET /usuarios/roles`, `GET|POST /usuarios/roles/:id/permisos` — y el POST
 * ya sube `roles.version`, así que quien tenga un rol guardado vuelve a entrar solo. La lógica de niveles
 * vive pura en `config/permisosPantallas.ts`; acá solo se cablea.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
    ROL_SUPER_ADMIN, aplicarNivel, alternarClave, rolesGemelos, type Pantalla,
} from '../config/permisosPantallas';

export interface RolMatriz {
    id: number;
    nombre: string;
    descripcion?: string | null;
    activo: boolean;
    usuarios_count?: number;
}

type PermsPorRol = Record<number, string[]>;

const mismos = (a: string[] = [], b: string[] = []) => {
    if (a.length !== b.length) return false;
    const s = new Set(a);
    return b.every(c => s.has(c));
};

const diferencias = (a: string[] = [], b: string[] = []) => {
    const sa = new Set(a), sb = new Set(b);
    return a.filter(c => !sb.has(c)).length + b.filter(c => !sa.has(c)).length;
};

export function useMatrizRoles() {
    const { user } = useAuth();
    const [roles, setRoles] = useState<RolMatriz[]>([]);
    const [base, setBase] = useState<PermsPorRol>({});
    const [perms, setPerms] = useState<PermsPorRol>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [version, setVersion] = useState(0);

    useEffect(() => {
        let cancelado = false;
        (async () => {
            try {
                const res = await api.get('/usuarios/roles', { params: { limit: 200 } });
                const lista: RolMatriz[] = res.data?.data ?? [];
                // Super Admin primero: es la referencia de «todo».
                lista.sort((a, b) => (a.id === ROL_SUPER_ADMIN ? -1 : b.id === ROL_SUPER_ADMIN ? 1 : a.nombre.localeCompare(b.nombre, 'es')));
                const permisos = await Promise.all(
                    lista.map(r => api.get(`/usuarios/roles/${r.id}/permisos`).then(x => (x.data ?? []) as string[])),
                );
                if (cancelado) return;
                const mapa: PermsPorRol = {};
                lista.forEach((r, idx) => { mapa[r.id] = permisos[idx]; });
                setRoles(lista);
                setBase(mapa);
                setPerms(mapa);
            } catch (err) {
                if (cancelado) return;
                const e = err as { response?: { status?: number } };
                toast.error(`No se pudieron cargar los roles${e.response?.status ? ` (HTTP ${e.response.status})` : ''}`);
            } finally {
                if (!cancelado) setLoading(false);
            }
        })();
        return () => { cancelado = true; };
    }, [version]);

    const permsSet = useMemo(() => {
        const m = new Map<number, ReadonlySet<string>>();
        for (const r of roles) m.set(r.id, new Set(perms[r.id] ?? []));
        return m;
    }, [roles, perms]);

    const cambiados = useMemo(
        () => roles.filter(r => r.id !== ROL_SUPER_ADMIN && !mismos(perms[r.id], base[r.id])),
        [roles, perms, base],
    );

    const totalCambios = useMemo(
        () => cambiados.reduce((n, r) => n + diferencias(perms[r.id], base[r.id]), 0),
        [cambiados, perms, base],
    );

    const personasAfectadas = cambiados.reduce((n, r) => n + (r.usuarios_count ?? 0), 0);
    const cambiaMiRol = !!user && cambiados.some(r => r.id === Number(user.rol_id));

    const gemelos = useMemo(
        () => rolesGemelos(roles.filter(r => r.id !== ROL_SUPER_ADMIN), id => permsSet.get(id) ?? new Set()),
        [roles, permsSet],
    );

    const dirty = cambiados.length > 0;

    // Cambiar de pestaña o cerrar con cambios sin guardar: el navegador pregunta.
    useEffect(() => {
        if (!dirty) return;
        const avisar = (e: BeforeUnloadEvent) => { e.preventDefault(); };
        window.addEventListener('beforeunload', avisar);
        return () => window.removeEventListener('beforeunload', avisar);
    }, [dirty]);

    const setNivel = useCallback((rolId: number, p: Pantalla, nivel: number) => {
        setPerms(prev => ({ ...prev, [rolId]: aplicarNivel(prev[rolId] ?? [], p, nivel) }));
    }, []);

    const alternar = useCallback((rolId: number, p: Pantalla, clave: string) => {
        setPerms(prev => ({ ...prev, [rolId]: alternarClave(prev[rolId] ?? [], p, clave) }));
    }, []);

    const deshacer = useCallback(() => setPerms(base), [base]);

    const recargar = useCallback(() => {
        setLoading(true);
        setVersion(v => v + 1);
    }, []);

    const guardar = useCallback(async () => {
        setSaving(true);
        const fallidos: string[] = [];
        for (const r of cambiados) {
            try {
                await api.post(`/usuarios/roles/${r.id}/permisos`, { permisos: perms[r.id] ?? [] });
                setBase(prev => ({ ...prev, [r.id]: perms[r.id] ?? [] }));
            } catch {
                fallidos.push(r.nombre);
            }
        }
        setSaving(false);
        if (fallidos.length) {
            toast.error(`No se guardó: ${fallidos.join(', ')}. Lo demás quedó guardado.`);
        } else {
            toast.success(personasAfectadas
                ? `Permisos guardados. ${personasAfectadas === 1 ? 'La persona afectada vuelve' : `Las ${personasAfectadas} personas afectadas vuelven`} a entrar para verlos.`
                : 'Permisos guardados.');
        }
    }, [cambiados, perms, personasAfectadas]);

    return {
        state: {
            roles, loading, saving, dirty, totalCambios, cambiados, personasAfectadas, cambiaMiRol, gemelos,
            permsDe: (id: number) => permsSet.get(id) ?? new Set<string>(),
            cambioEn: (id: number, claves: string[]) => {
                const a = new Set(perms[id] ?? []), b = new Set(base[id] ?? []);
                return claves.some(c => a.has(c) !== b.has(c));
            },
        },
        actions: { setNivel, alternar, deshacer, guardar, recargar },
    };
}
