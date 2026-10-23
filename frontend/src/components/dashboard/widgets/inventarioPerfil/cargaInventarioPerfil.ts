import type { InventarioPerfilApi } from './tipos';

/** Ruta del detalle «Inventario» del Inicio por perfil (relativa a la base `/api` de services/api). */
export const RUTA_INVENTARIO_PERFIL = '/transferencias/inicio/perfil';

/** Resultado de una carga, marcado con la `version` y el `intento` que la pidieron. */
export interface CargaInventarioPerfil {
    version: unknown;
    intento: number;
    datos: InventarioPerfilApi | null;
    error: boolean;
}

/** Lo que ve la vista. */
export interface EstadoInventarioPerfil {
    /** Lo último que llegó bien (se mantiene mientras recarga o si una recarga falla). */
    datos: InventarioPerfilApi | null;
    /** Hay una carga en curso para esta `version` / `intento`. */
    cargando: boolean;
    /** La última carga falló (si había datos, siguen en `datos`). */
    error: boolean;
}

/** La respuesta trae un detalle utilizable (no un cuerpo vacío o de otra forma). */
export const esInventarioPerfil = (x: unknown): x is InventarioPerfilApi => {
    if (!x || typeof x !== 'object') return false;
    const d = x as Partial<InventarioPerfilApi>;
    return typeof d.hoy === 'string' && Array.isArray(d.solicitudes) && !!d.circuito && !!d.puede;
};

/** Carga que terminó bien. */
export const cargaLista = (version: unknown, intento: number, datos: InventarioPerfilApi): CargaInventarioPerfil =>
    ({ version, intento, datos, error: false });

/** Carga que falló: conserva lo que ya se veía. */
export const cargaFallida = (previa: CargaInventarioPerfil | null, version: unknown, intento: number): CargaInventarioPerfil =>
    ({ version, intento, datos: previa?.datos ?? null, error: true });

/**
 * Estado para la vista. Está «cargando» mientras la última carga no sea de esta `version` (p. ej. el `lastUpdated` de
 * «Actualizar» del Inicio; tiene que ser un valor estable, no un objeto nuevo en cada render) y de este `intento`
 * («Reintentar»).
 */
export function estadoInventarioPerfil(carga: CargaInventarioPerfil | null, version: unknown, intento: number): EstadoInventarioPerfil {
    const cargando = !carga || !Object.is(carga.version, version) || carga.intento !== intento;
    return { datos: carga?.datos ?? null, cargando, error: !cargando && !!carga?.error };
}
