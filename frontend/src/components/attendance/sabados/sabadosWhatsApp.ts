import type { SabadoExtraDetalle, SabadoExtraTrabajador } from '../../../types/sabadosExtra';
// Re-exportamos los helpers centralizados (ahora en utils/fechas) para no romper
// imports externos que aún esperen estas funciones desde acá.
import { normalizarFecha, fmtFechaCorta, diaDelMes } from '../../../utils/fechas';
export { normalizarFecha, fmtFechaCorta, diaDelMes };

/**
 * Builders para mensajes WhatsApp de Sábados Extra.
 * Reusa el patrón de useAttendanceExport.handleShareWhatsApp:
 *   - Agrupa por cargo, ordena alfabético.
 *   - *bold*, _italic_, viñetas con "-".
 *   - Footer "_Generado con Bóveda LOLS_" para identificar mensajes auto-generados.
 *
 * Los emojis se omiten — el patrón actual del módulo de asistencia usa
 * texto plano para evitar problemas de encoding entre dispositivos.
 */

/**
 * Agrupa trabajadores por cargo en un Map ordenado alfabéticamente.
 */
function agruparPorCargo<T extends { cargo_nombre: string | null }>(
    items: T[]
): Array<{ cargo: string; items: T[] }> {
    const map: Record<string, T[]> = {};
    items.forEach(it => {
        const c = it.cargo_nombre || 'Sin Cargo';
        (map[c] = map[c] || []).push(it);
    });
    return Object.keys(map)
        .sort((a, b) => a.localeCompare(b, 'es'))
        .map(cargo => ({ cargo, items: map[cargo] }));
}

/**
 * Mensaje de CITACIÓN — antes del sábado.
 *
 * Formato:
 *   Buenos días
 *   *Personal citado* trabajo extraordinario sábado DD-MM-YYYY — Obra X
 *
 *   Total: N
 *
 *   *Cargo A* (3)
 *   - Apellido Nombre
 *   ...
 *
 *   *Trabajos a realizar:*
 *
 *   *Cargo A:* observación específica
 *   ...
 *
 *   Observación global (si hay)
 *
 *   Saludos cordiales
 *   _Generado con Bóveda LOLS_
 */
export function buildCitacionMessage(s: SabadoExtraDetalle): string {
    const fechaStr = fmtFechaCorta(s.fecha);
    const lines: string[] = [];
    lines.push('Buenos días');
    lines.push(`*Personal citado* trabajo extraordinario sábado ${fechaStr} — Obra ${s.obra_nombre}`);
    lines.push('');
    lines.push(`Total: ${s.trabajadores.length}`);
    lines.push('');

    // Listado por cargo (todos los citados)
    const grupos = agruparPorCargo(s.trabajadores);
    grupos.forEach(({ cargo, items }) => {
        lines.push(`*${cargo}* (${items.length})`);
        items.forEach(w => {
            const apellidoMaterno = w.apellido_materno ? ` ${w.apellido_materno}` : '';
            lines.push(`- ${w.apellido_paterno}${apellidoMaterno} ${w.nombres}`);
        });
        lines.push('');
    });

    // Trabajos a realizar (por cargo si hay observaciones específicas)
    const obs = s.observaciones_por_cargo || {};
    const cargosConObs = grupos.filter(g => {
        // Lookup por cargo_id del primer trabajador del grupo
        const cargoId = (s.trabajadores.find(w => (w.cargo_nombre || 'Sin Cargo') === g.cargo) as any)?.cargo_id;
        return cargoId !== undefined && cargoId !== null && obs[String(cargoId)];
    });

    if (cargosConObs.length > 0) {
        lines.push('*Trabajos a realizar:*');
        lines.push('');
        cargosConObs.forEach(({ cargo, items }) => {
            const cargoId = (items[0] as any).cargo_id;
            const texto = obs[String(cargoId)];
            if (texto) lines.push(`*${cargo}:* ${texto}`);
        });
        lines.push('');
    }

    if (s.observaciones_globales) {
        lines.push(s.observaciones_globales);
        lines.push('');
    }

    lines.push('Saludos cordiales');
    lines.push('');
    lines.push('_Generado con Bóveda LOLS_');
    return lines.join('\n');
}

/**
 * Mensaje de ASISTENCIA — al cierre del día.
 *
 * Formato:
 *   *Asistencia trabajo extraordinario*
 *   Obra X — sábado DD-MM-YYYY
 *
 *   Asistieron: N/M
 *
 *   *Cargo A*
 *   - Apellido Nombre (8h) _observación_
 *   ...
 *
 *   *No asistieron:* N
 *   - Apellido Nombre
 *   ...
 *
 *   Observación global (si hay)
 *
 *   _Generado con Bóveda LOLS_
 */
export function buildAsistenciaMessage(s: SabadoExtraDetalle): string {
    const fechaStr = fmtFechaCorta(s.fecha);
    const asistieron: SabadoExtraTrabajador[] = s.trabajadores.filter(w => w.asistio === 1);
    const noAsistieron: SabadoExtraTrabajador[] = s.trabajadores.filter(w => w.asistio === 0);

    const lines: string[] = [];
    lines.push('*Asistencia trabajo extraordinario*');
    lines.push(`Obra ${s.obra_nombre} — sábado ${fechaStr}`);
    lines.push('');
    lines.push(`Asistieron: ${asistieron.length}/${s.trabajadores.length}`);
    lines.push('');

    const grupos = agruparPorCargo(asistieron);
    grupos.forEach(({ cargo, items }) => {
        lines.push(`*${cargo}*`);
        items.forEach(w => {
            const horas = w.horas_trabajadas ?? s.horas_default;
            const horasStr = horas !== null && horas !== undefined ? ` (${horas}h)` : '';
            const apellidoMaterno = w.apellido_materno ? ` ${w.apellido_materno}` : '';
            let line = `- ${w.apellido_paterno}${apellidoMaterno} ${w.nombres}${horasStr}`;
            if (w.observacion) line += ` _${w.observacion}_`;
            lines.push(line);
        });
        lines.push('');
    });

    if (noAsistieron.length > 0) {
        lines.push(`*No asistieron:* ${noAsistieron.length}`);
        noAsistieron.forEach(w => {
            const apellidoMaterno = w.apellido_materno ? ` ${w.apellido_materno}` : '';
            lines.push(`- ${w.apellido_paterno}${apellidoMaterno} ${w.nombres}`);
        });
        lines.push('');
    }

    if (s.observaciones_globales) {
        lines.push(s.observaciones_globales);
        lines.push('');
    }

    lines.push('_Generado con Bóveda LOLS_');
    return lines.join('\n');
}
