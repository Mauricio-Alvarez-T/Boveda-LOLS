import {
    resolverSeccion, seccionesDisponibles, esParamGrilla, tieneParamsGrilla, PARAMS_GRILLA,
    leerUltima, guardarUltima, CLAVE_ULTIMA, SECCION_LABEL,
    type PermisosGestiones,
} from './gestionesNav';

const TODO: PermisosGestiones = { trabajadores: true, solicitudes: true, fisicos: true };
const RRHH: PermisosGestiones = { trabajadores: true, solicitudes: true, fisicos: true };
const TERRENO: PermisosGestiones = { trabajadores: false, solicitudes: true, fisicos: false };
const PORTADOR: PermisosGestiones = { trabajadores: false, solicitudes: false, fisicos: true };
const NADA: PermisosGestiones = { trabajadores: false, solicitudes: false, fisicos: false };
const base = { tab: null, tieneParamsGrilla: false, ultima: null };

describe('gestionesNav (plan Gestiones B8)', () => {
    it('seccionesDisponibles: orden fijo trabajadores → solicitudes → fisicos', () => {
        expect(seccionesDisponibles(TODO)).toEqual(['trabajadores', 'solicitudes', 'fisicos']);
        expect(seccionesDisponibles({ trabajadores: false, solicitudes: true, fisicos: true })).toEqual(['solicitudes', 'fisicos']);
        expect(seccionesDisponibles(PORTADOR)).toEqual(['fisicos']);
        expect(seccionesDisponibles(NADA)).toEqual([]);
    });

    it('tab explícito válido y permitido gana sobre params de grilla y memoria', () => {
        expect(resolverSeccion({ ...base, tab: 'solicitudes', tieneParamsGrilla: true, ultima: 'fisicos', permisos: RRHH })).toBe('solicitudes');
        expect(resolverSeccion({ ...base, tab: 'trabajadores', ultima: 'fisicos', permisos: RRHH })).toBe('trabajadores');
        expect(resolverSeccion({ ...base, tab: 'inicio', ultima: 'fisicos', permisos: RRHH })).toBe('inicio');
    });

    it('tab inválido, vacío o sin permiso se ignora y sigue la cadena', () => {
        expect(resolverSeccion({ ...base, tab: 'basura', permisos: RRHH })).toBe('inicio');
        expect(resolverSeccion({ ...base, tab: '', ultima: 'solicitudes', permisos: RRHH })).toBe('solicitudes');
        expect(resolverSeccion({ ...base, tab: undefined, permisos: RRHH })).toBe('inicio');
        // Portador pide la grilla por URL: no tiene permiso → su única sección.
        expect(resolverSeccion({ ...base, tab: 'trabajadores', permisos: PORTADOR })).toBe('fisicos');
    });

    it('deep-link con params de grilla abre la grilla solo si tiene trabajadores.ver', () => {
        expect(resolverSeccion({ ...base, tieneParamsGrilla: true, ultima: 'fisicos', permisos: RRHH })).toBe('trabajadores');
        expect(resolverSeccion({ ...base, tieneParamsGrilla: true, permisos: { trabajadores: false, solicitudes: true, fisicos: true } })).toBe('inicio');
        expect(resolverSeccion({ ...base, tieneParamsGrilla: true, ultima: 'fisicos', permisos: { trabajadores: false, solicitudes: true, fisicos: true } })).toBe('fisicos');
    });

    it('memoria: última válida gana; sin permiso se descarta; sin memoria → portada con ≥2 secciones', () => {
        expect(resolverSeccion({ ...base, ultima: 'fisicos', permisos: RRHH })).toBe('fisicos');
        expect(resolverSeccion({ ...base, ultima: 'trabajadores', permisos: { trabajadores: false, solicitudes: true, fisicos: true } })).toBe('inicio');
        expect(resolverSeccion({ ...base, permisos: { trabajadores: true, solicitudes: true, fisicos: false } })).toBe('inicio');
    });

    it('una sola sección: nunca portada (ni con tab=inicio); cero permisos → null', () => {
        expect(resolverSeccion({ ...base, permisos: PORTADOR })).toBe('fisicos');
        expect(resolverSeccion({ ...base, tab: 'inicio', permisos: PORTADOR })).toBe('fisicos');
        expect(resolverSeccion({ ...base, permisos: TERRENO })).toBe('solicitudes');
        expect(resolverSeccion({ ...base, tieneParamsGrilla: true, permisos: TERRENO })).toBe('solicitudes');
        expect(resolverSeccion({ ...base, tab: 'inicio', permisos: NADA })).toBeNull();
    });

    it('esParamGrilla espeja los filtros de useConsultasFilters y rechaza tab/page', () => {
        expect([...PARAMS_GRILLA]).toEqual(['q', 'obra_id', 'empresa_id', 'cargo_id', 'categoria', 'activo', 'completitud', 'ausentes', 'aniversario10m', 'ingreso_desde', 'ingreso_hasta']);
        for (const k of PARAMS_GRILLA) expect(esParamGrilla(k)).toBe(true);
        expect(esParamGrilla('tab')).toBe(false);
        expect(esParamGrilla('page')).toBe(false);
        expect(tieneParamsGrilla(new URLSearchParams('tab=fisicos&completitud=faltantes'))).toBe(true);
        expect(tieneParamsGrilla(new URLSearchParams('tab=fisicos'))).toBe(false);
        expect(tieneParamsGrilla(new URLSearchParams(''))).toBe(false);
    });

    it('memoria por usuario: clave exacta, nunca guarda "inicio", tolera storage roto o valor corrupto', () => {
        const mem = new Map<string, string>();
        const st = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); } };
        expect(guardarUltima(7, 'fisicos', st)).toBe(true);
        expect(mem.get(`${CLAVE_ULTIMA}7`)).toBe('fisicos');
        expect(leerUltima(7, st)).toBe('fisicos');
        expect(guardarUltima(7, 'inicio', st)).toBe(false);
        expect(leerUltima(7, st)).toBe('fisicos');
        expect(leerUltima(8, st)).toBeNull();
        mem.set(`${CLAVE_ULTIMA}9`, 'basura');
        expect(leerUltima(9, st)).toBeNull();
        // Sin usuario o sin storage no se lee ni escribe.
        expect(guardarUltima(null, 'fisicos', st)).toBe(false);
        expect(leerUltima(undefined, st)).toBeNull();
        expect(guardarUltima(7, 'fisicos', null)).toBe(false);
        const roto = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('bloqueado'); } };
        expect(leerUltima(7, roto)).toBeNull();
        expect(guardarUltima(7, 'fisicos', roto)).toBe(false);
    });

    it('SECCION_LABEL cubre las cuatro secciones', () => {
        expect(Object.keys(SECCION_LABEL).sort()).toEqual(['fisicos', 'inicio', 'solicitudes', 'trabajadores']);
    });
});
