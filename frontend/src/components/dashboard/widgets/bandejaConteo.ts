/**
 * Conteo del encabezado de la Bandeja del día ("N pendientes · M críticas"), separado del
 * componente para poder testearlo sin DOM.
 *
 * Los grupos externos (vehículos, solicitudes, documentos físicos, inventario) entran como una
 * lista de listas. `BandejaDelDia` declara esos grupos UNA vez (`externos`) y de esa misma lista
 * salen este conteo y el render, así que un grupo nuevo no puede quedar pintado sin contar.
 * Antes cada grupo se sumaba a mano y los documentos físicos (B6/B7) quedaron fuera: el total no
 * los contaba, sus críticos tampoco, y quien solo tenía lotes pendientes veía "Bandeja vacía".
 */

type Severidad = 'critical' | 'warning' | 'info';

interface ConSeveridad {
    severity: Severidad;
}

export interface ConteoBandeja {
    total: number;
    criticas: number;
}

export function contarBandeja(
    tareas: ConSeveridad[],
    trabajadoresSinDocs: number,
    externos: ConSeveridad[][],
): ConteoBandeja {
    const filas = [...tareas, ...externos.flat()];
    // La fila sintética de "trabajadores sin documentos" es un aviso (ámbar), nunca crítica.
    const sinDocs = trabajadoresSinDocs > 0 ? 1 : 0;
    return {
        total: filas.length + sinDocs,
        criticas: filas.filter(f => f.severity === 'critical').length,
    };
}
