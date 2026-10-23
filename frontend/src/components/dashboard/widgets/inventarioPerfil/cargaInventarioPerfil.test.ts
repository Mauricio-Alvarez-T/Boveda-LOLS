import { cargaFallida, cargaLista, esInventarioPerfil, estadoInventarioPerfil } from './cargaInventarioPerfil';
import type { InventarioPerfilApi } from './tipos';

const DATOS: InventarioPerfilApi = {
    hoy: '2026-10-22',
    perfil: 'obra',
    super_admin: false,
    alcance: { todas: false, bodega_id: null },
    obra: { id: 3, nombre: 'Domeyko' },
    puede: { aprobar: false, ver_diferencias: false, resolver_diferencias: false, solicitar: true, recibir: true, sod_bypass: false },
    aprobadores: [{ id: 7, nombre: 'Leonardo López' }],
    circuito: {
        pedida: { total: 2, dias: 6 }, aprobada: { total: 1, dias: 4 }, despachada: { total: 1, dias: 1 },
        recibida: { total: 2, ultima: '2026-10-08' }, diferencias: { total: 1, dias: 14, items: 1 },
    },
    solicitudes: [],
    diferencias: null,
    limites: { en_curso: 200, recibidas: 100, recibidas_recientes: 10, rechazadas: 50, diferencias: 100, aprobadores: 10 },
};

describe('carga del detalle «Inventario» por perfil', () => {
    test('sin carga, o de otra versión o intento: cargando', () => {
        expect(estadoInventarioPerfil(null, 1, 0)).toEqual({ datos: null, cargando: true, error: false });
        const lista = cargaLista(1, 0, DATOS);
        expect(estadoInventarioPerfil(lista, 2, 0)).toEqual({ datos: DATOS, cargando: true, error: false });
        expect(estadoInventarioPerfil(lista, 1, 1)).toMatchObject({ cargando: true });
        expect(estadoInventarioPerfil(lista, 1, 0)).toEqual({ datos: DATOS, cargando: false, error: false });
    });

    test('si una recarga falla se queda lo que ya se veía y marca el error', () => {
        const fallo = cargaFallida(cargaLista(1, 0, DATOS), 2, 0);
        expect(estadoInventarioPerfil(fallo, 2, 0)).toEqual({ datos: DATOS, cargando: false, error: true });
        expect(estadoInventarioPerfil(cargaFallida(null, 1, 0), 1, 0)).toEqual({ datos: null, cargando: false, error: true });
    });

    test('solo acepta un cuerpo con la forma del contrato', () => {
        expect(esInventarioPerfil(DATOS)).toBe(true);
        expect(esInventarioPerfil(undefined)).toBe(false);
        expect(esInventarioPerfil({ data: [] })).toBe(false);
        expect(esInventarioPerfil({ ...DATOS, solicitudes: null })).toBe(false);
    });
});
