/**
 * Hook centralizado para el estado del editor de permisos.
 * Modos soportados:
 *   - 'rol': editor de permisos de un rol (binario: incluido/excluido).
 *   - 'usuario': editor de overrides de usuario (tristate: grant/default/deny).
 *
 * Centraliza:
 *  - Fetch del catálogo + permisos del rol + (modo usuario) overrides actuales
 *  - Estado de búsqueda, sección activa, filtro diff-only
 *  - Cálculo del árbol jerárquico (memoizado)
 *  - Tracking de cambios pendientes (dirty + counter)
 *  - Guardado con toast + cierre del modal
 */

import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import {
    buildTree,
    filterTree,
    diffTree,
    type CatalogoGrouped,
    type SeccionNode,
} from '../utils/permisosTree';
import {
    DEFAULT_SECCION,
    runHierarchyDevCheck,
    type Seccion,
} from '../config/permisosHierarchy';

export type Mode = 'rol' | 'usuario';

export interface Override {
    permiso_clave: string;
    tipo: 'grant' | 'deny';
}

interface Args {
    mode: Mode;
    rolId: number;
    usuarioId?: number;
    onSaved?: () => void;
}

interface State {
    catalogo: CatalogoGrouped | null;
    activeSeccion: Seccion;
    search: string;
    diffOnly: boolean;
    loading: boolean;
    saving: boolean;
    // Modo 'rol':
    permisosOriginales: string[]; // snapshot al cargar (para detectar dirty)
    permisosActivos: string[];    // estado actual editable
    // Modo 'usuario':
    rolePerms: string[];
    overridesOriginales: Override[];
    overrides: Override[];
}

type Action =
    | { type: 'LOAD_OK_ROL'; catalogo: CatalogoGrouped; perms: string[] }
    | { type: 'LOAD_OK_USER'; catalogo: CatalogoGrouped; rolePerms: string[]; overrides: Override[] }
    | { type: 'LOAD_ERR' }
    | { type: 'SET_SEARCH'; value: string }
    | { type: 'SET_ACTIVE_SECCION'; value: Seccion }
    | { type: 'TOGGLE_DIFF' }
    | { type: 'TOGGLE_PERMISO'; clave: string }
    | { type: 'BULK_TOGGLE'; claves: string[]; activate: boolean }
    | { type: 'SET_OVERRIDE'; clave: string; tipo: 'grant' | 'deny' | 'default' }
    | { type: 'SAVING_START' }
    | { type: 'SAVING_END' }
    | { type: 'SAVE_OK_ROL' }
    | { type: 'SAVE_OK_USER' };

function initialState(): State {
    return {
        catalogo: null,
        activeSeccion: DEFAULT_SECCION,
        search: '',
        diffOnly: false,
        loading: true,
        saving: false,
        permisosOriginales: [],
        permisosActivos: [],
        rolePerms: [],
        overridesOriginales: [],
        overrides: [],
    };
}

function reducer(state: State, action: Action): State {
    switch (action.type) {
        case 'LOAD_OK_ROL':
            return {
                ...state,
                loading: false,
                catalogo: action.catalogo,
                permisosOriginales: action.perms,
                permisosActivos: action.perms,
            };
        case 'LOAD_OK_USER':
            return {
                ...state,
                loading: false,
                catalogo: action.catalogo,
                rolePerms: action.rolePerms,
                overridesOriginales: action.overrides,
                overrides: action.overrides,
            };
        case 'LOAD_ERR':
            return { ...state, loading: false };
        case 'SET_SEARCH':
            return { ...state, search: action.value };
        case 'SET_ACTIVE_SECCION':
            // Salir de diff-only al navegar a una sección específica para evitar
            // confusión ("¿por qué no veo nada?")
            return { ...state, activeSeccion: action.value, diffOnly: false };
        case 'TOGGLE_DIFF':
            return { ...state, diffOnly: !state.diffOnly };
        case 'TOGGLE_PERMISO': {
            const exists = state.permisosActivos.includes(action.clave);
            return {
                ...state,
                permisosActivos: exists
                    ? state.permisosActivos.filter(c => c !== action.clave)
                    : [...state.permisosActivos, action.clave],
            };
        }
        case 'BULK_TOGGLE': {
            const setNuevo = new Set(state.permisosActivos);
            for (const c of action.claves) {
                if (action.activate) setNuevo.add(c);
                else setNuevo.delete(c);
            }
            return { ...state, permisosActivos: Array.from(setNuevo) };
        }
        case 'SET_OVERRIDE': {
            const filtered = state.overrides.filter(o => o.permiso_clave !== action.clave);
            if (action.tipo === 'default') return { ...state, overrides: filtered };
            return {
                ...state,
                overrides: [...filtered, { permiso_clave: action.clave, tipo: action.tipo }],
            };
        }
        case 'SAVING_START':
            return { ...state, saving: true };
        case 'SAVING_END':
            return { ...state, saving: false };
        case 'SAVE_OK_ROL':
            return {
                ...state,
                saving: false,
                permisosOriginales: state.permisosActivos,
            };
        case 'SAVE_OK_USER':
            return {
                ...state,
                saving: false,
                overridesOriginales: state.overrides,
            };
        default:
            return state;
    }
}

export function usePermissionsEditor(args: Args) {
    const { mode, rolId, usuarioId, onSaved } = args;
    const { token } = useAuth();
    const [state, dispatch] = useReducer(reducer, undefined, initialState);
    const apiBaseUrl = import.meta.env.VITE_API_URL;
    const devCheckRan = useRef(false);

    // Fetch inicial
    useEffect(() => {
        let cancelled = false;
        const config = { headers: { Authorization: `Bearer ${token}` } };

        const run = async () => {
            try {
                if (mode === 'rol') {
                    const [resCat, resPerms] = await Promise.all([
                        axios.get(`${apiBaseUrl}/usuarios/permisos/catalogo`, config),
                        axios.get(`${apiBaseUrl}/usuarios/roles/${rolId}/permisos`, config),
                    ]);
                    if (cancelled) return;
                    dispatch({ type: 'LOAD_OK_ROL', catalogo: resCat.data, perms: resPerms.data });
                } else {
                    if (!usuarioId) {
                        throw new Error('usuarioId requerido en modo usuario');
                    }
                    const [resCat, resRole, resOver] = await Promise.all([
                        axios.get(`${apiBaseUrl}/usuarios/permisos/catalogo`, config),
                        axios.get(`${apiBaseUrl}/usuarios/roles/${rolId}/permisos`, config),
                        axios.get(`${apiBaseUrl}/usuarios/user-overrides/${usuarioId}`, config),
                    ]);
                    if (cancelled) return;
                    dispatch({
                        type: 'LOAD_OK_USER',
                        catalogo: resCat.data,
                        rolePerms: resRole.data,
                        overrides: resOver.data,
                    });
                }
            } catch (err) {
                if (cancelled) return;
                console.error('Error fetching permissions:', err);
                const e = err as { response?: { status?: number; data?: { error?: string } }; message?: string };
                const status = e?.response?.status;
                const detail = e?.response?.data?.error || e?.message;
                toast.error(`Error al cargar datos de permisos${status ? ` (HTTP ${status})` : ''}${detail ? `: ${detail}` : ''}`);
                dispatch({ type: 'LOAD_ERR' });
            }
        };

        run();
        return () => { cancelled = true; };
    }, [mode, rolId, usuarioId, token, apiBaseUrl]);

    // Dev-only check de drift entre catálogo y mapping
    useEffect(() => {
        if (state.catalogo && !devCheckRan.current) {
            devCheckRan.current = true;
            const claves = Object.values(state.catalogo).flat().map(p => p.clave);
            runHierarchyDevCheck(claves);
        }
    }, [state.catalogo]);

    // Predicado de "activo" según el modo. En modo usuario considera role + override.
    const isActive = useCallback((clave: string): boolean => {
        if (mode === 'rol') {
            return state.permisosActivos.includes(clave);
        }
        const override = state.overrides.find(o => o.permiso_clave === clave);
        if (override?.tipo === 'grant') return true;
        if (override?.tipo === 'deny') return false;
        return state.rolePerms.includes(clave);
    }, [mode, state.permisosActivos, state.overrides, state.rolePerms]);

    // Árbol completo (sin filtros)
    const treeRaw = useMemo<SeccionNode[]>(() => {
        if (!state.catalogo) return [];
        return buildTree(state.catalogo, isActive);
    }, [state.catalogo, isActive]);

    // Claves modificadas (para diff-only)
    const modifiedClaves = useMemo<Set<string>>(() => {
        if (mode === 'rol') {
            const orig = new Set(state.permisosOriginales);
            const now = new Set(state.permisosActivos);
            const diff = new Set<string>();
            for (const c of orig) if (!now.has(c)) diff.add(c);
            for (const c of now) if (!orig.has(c)) diff.add(c);
            return diff;
        }
        // Modo usuario: cambios desde override anterior OR cualquier override no-default
        const set = new Set<string>();
        for (const o of state.overrides) set.add(o.permiso_clave);
        for (const o of state.overridesOriginales) {
            if (!state.overrides.find(x => x.permiso_clave === o.permiso_clave)) {
                set.add(o.permiso_clave);
            }
        }
        return set;
    }, [mode, state.permisosOriginales, state.permisosActivos, state.overrides, state.overridesOriginales]);

    // Árbol filtrado (search + diff)
    const tree = useMemo<SeccionNode[]>(() => {
        let t = treeRaw;
        if (state.diffOnly) t = diffTree(t, modifiedClaves);
        if (state.search.trim()) t = filterTree(t, state.search);
        return t;
    }, [treeRaw, state.diffOnly, state.search, modifiedClaves]);

    // Counter de cambios pendientes
    const pendingChangesCount = useMemo(() => {
        if (mode === 'rol') {
            const orig = new Set(state.permisosOriginales);
            const now = new Set(state.permisosActivos);
            let n = 0;
            for (const c of orig) if (!now.has(c)) n++;
            for (const c of now) if (!orig.has(c)) n++;
            return n;
        }
        const origMap = new Map(state.overridesOriginales.map(o => [o.permiso_clave, o.tipo]));
        const nowMap = new Map(state.overrides.map(o => [o.permiso_clave, o.tipo]));
        let n = 0;
        for (const [k, v] of origMap) if (nowMap.get(k) !== v) n++;
        for (const [k] of nowMap) if (!origMap.has(k)) n++;
        return n;
    }, [mode, state.permisosOriginales, state.permisosActivos, state.overrides, state.overridesOriginales]);

    const dirty = pendingChangesCount > 0;

    // Action creators
    const setSearch = useCallback((v: string) => dispatch({ type: 'SET_SEARCH', value: v }), []);
    const setActiveSeccion = useCallback((v: Seccion) => dispatch({ type: 'SET_ACTIVE_SECCION', value: v }), []);
    const toggleDiffOnly = useCallback(() => dispatch({ type: 'TOGGLE_DIFF' }), []);
    const togglePermiso = useCallback((clave: string) => dispatch({ type: 'TOGGLE_PERMISO', clave }), []);
    const bulkToggle = useCallback((claves: string[], activate: boolean) =>
        dispatch({ type: 'BULK_TOGGLE', claves, activate }), []);
    const setOverride = useCallback((clave: string, tipo: 'grant' | 'deny' | 'default') =>
        dispatch({ type: 'SET_OVERRIDE', clave, tipo }), []);

    // Get the tipo del override (o 'default')
    const getOverrideTipo = useCallback((clave: string): 'grant' | 'deny' | 'default' => {
        const o = state.overrides.find(x => x.permiso_clave === clave);
        return o?.tipo ?? 'default';
    }, [state.overrides]);

    // Sincronizar atributo data-modal-dirty para que el Modal de UI active
    // el confirm de cambios sin guardar.
    useEffect(() => {
        document.body.setAttribute('data-modal-dirty', dirty ? 'true' : 'false');
        return () => document.body.setAttribute('data-modal-dirty', 'false');
    }, [dirty]);

    // Save
    const save = useCallback(async () => {
        dispatch({ type: 'SAVING_START' });
        try {
            const config = { headers: { Authorization: `Bearer ${token}` } };
            if (mode === 'rol') {
                await axios.post(
                    `${apiBaseUrl}/usuarios/roles/${rolId}/permisos`,
                    { permisos: state.permisosActivos },
                    config
                );
                dispatch({ type: 'SAVE_OK_ROL' });
                toast.success('Permisos del rol actualizados');
            } else {
                await axios.post(
                    `${apiBaseUrl}/usuarios/user-overrides/${usuarioId}`,
                    { overrides: state.overrides, rol_id: rolId },
                    config
                );
                dispatch({ type: 'SAVE_OK_USER' });
                toast.success('Overrides guardados. El usuario deberá re-iniciar sesión.');
            }
            onSaved?.();
        } catch (err) {
            console.error('Error saving permissions:', err);
            toast.error('Error al guardar cambios');
            dispatch({ type: 'SAVING_END' });
        }
    }, [mode, rolId, usuarioId, token, apiBaseUrl, state.permisosActivos, state.overrides, onSaved]);

    return {
        state: {
            loading: state.loading,
            saving: state.saving,
            catalogo: state.catalogo,
            tree,
            treeRaw,
            modifiedClaves,
            activeSeccion: state.activeSeccion,
            search: state.search,
            diffOnly: state.diffOnly,
            rolePerms: state.rolePerms,
            permisosActivos: state.permisosActivos,
            overrides: state.overrides,
            dirty,
            pendingChangesCount,
        },
        actions: {
            setSearch,
            setActiveSeccion,
            toggleDiffOnly,
            togglePermiso,
            bulkToggle,
            setOverride,
            getOverrideTipo,
            isActive,
            save,
        },
    };
}
