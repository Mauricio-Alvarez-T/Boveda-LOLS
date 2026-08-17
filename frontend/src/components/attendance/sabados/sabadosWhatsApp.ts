import type { SabadoExtraDetalle, SabadoExtraTrabajador } from '../../../types/sabadosExtra';
// Re-exportamos los helpers centralizados (ahora en utils/fechas) para no romper
// imports externos que aún esperen estas funciones desde acá.
import { normalizarFecha, fmtFechaCorta, diaDelMes } from '../../../utils/fechas';
import { flagOn, flagOff } from '../../../utils/flags';
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
 * El generic exige `cargo_nombre` y `cargo_id` para que el lookup posterior
 * de observaciones_por_cargo[cargo_id] no requiera casts.
 */
function agruparPorCargo<T extends { cargo_nombre: string | null; cargo_id: number | null }>(
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
 * Tarea del cargo: lookup en observaciones_por_cargo usando el cargo_id del
 * primer trabajador del grupo (todos los del grupo comparten cargo).
 */
function tareaDelCargo(
    obs: Record<string, string> | null | undefined,
    items: Array<{ cargo_id: number | null }>
): string | null {
    const cargoId = items[0]?.cargo_id ?? null;
    if (cargoId === null || !obs) return null;
    return obs[String(cargoId)] || null;
}

/**
 * Mensaje de CITACIÓN — antes del sábado.
 *
 * Formato (jefatura 2026-08-17: la tarea de cada rubro va DEBAJO de su grupo):
 *   Buenos días
 *   *Personal citado* trabajo extraordinario sábado DD-MM-YYYY — Obra X
 *
 *   Total: N
 *
 *   *Cargo A* (3)
 *   _Tarea: observación específica del cargo_
 *   - Apellido Nombre
 *   ...
 *
 *   Observación global (si hay)
 *
 *   Saludos cordiales
 *   _Generado con Bóveda LOLS_
 */
export function buildCitacionMessage(s: SabadoExtraDetalle): string {
    const fechaStr = fmtFechaCorta(s.fecha);
    const obs = s.observaciones_por_cargo || {};
    const lines: string[] = [];
    lines.push('Buenos días');
    lines.push(`*Personal citado* trabajo extraordinario sábado ${fechaStr} — Obra ${s.obra_nombre}`);
    lines.push('');
    lines.push(`Total: ${s.trabajadores.length}`);
    lines.push('');

    // Listado por cargo (todos los citados), con la tarea del rubro bajo el header
    const grupos = agruparPorCargo(s.trabajadores);
    grupos.forEach(({ cargo, items }) => {
        lines.push(`*${cargo}* (${items.length})`);
        const tarea = tareaDelCargo(obs, items);
        if (tarea) lines.push(`_Tarea: ${tarea}_`);
        items.forEach(w => {
            const apellidoMaterno = w.apellido_materno ? ` ${w.apellido_materno}` : '';
            lines.push(`- ${w.apellido_paterno}${apellidoMaterno} ${w.nombres}`);
        });
        lines.push('');
    });

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
 * Sin horas: jefatura 2026-08-17 — para el sábado solo importa asistió/no asistió.
 * La tarea de cada rubro va debajo de su grupo (mismo patrón que la citación).
 *
 * Formato:
 *   *Asistencia trabajo extraordinario*
 *   Obra X — sábado DD-MM-YYYY
 *
 *   Asistieron: N/M
 *
 *   *Cargo A*
 *   _Tarea: observación específica del cargo_
 *   - Apellido Nombre _observación_
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
    const obs = s.observaciones_por_cargo || {};
    const asistieron: SabadoExtraTrabajador[] = s.trabajadores.filter(w => flagOn(w.asistio));
    const noAsistieron: SabadoExtraTrabajador[] = s.trabajadores.filter(w => flagOff(w.asistio));

    const lines: string[] = [];
    lines.push('*Asistencia trabajo extraordinario*');
    lines.push(`Obra ${s.obra_nombre} — sábado ${fechaStr}`);
    lines.push('');
    lines.push(`Asistieron: ${asistieron.length}/${s.trabajadores.length}`);
    lines.push('');

    const grupos = agruparPorCargo(asistieron);
    grupos.forEach(({ cargo, items }) => {
        lines.push(`*${cargo}*`);
        const tarea = tareaDelCargo(obs, items);
        if (tarea) lines.push(`_Tarea: ${tarea}_`);
        items.forEach(w => {
            const apellidoMaterno = w.apellido_materno ? ` ${w.apellido_materno}` : '';
            let line = `- ${w.apellido_paterno}${apellidoMaterno} ${w.nombres}`;
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
