import type { ActividadSugeridaDetalle, ActividadSugeridaTrabajador } from '../../../types/actividadesSugeridas';
import { flagOn, flagOff } from '../../../utils/flags';
import { fmtSemana } from '../../../utils/semanas';

/**
 * Builders de los mensajes WhatsApp de la "Lista de trabajadores en actividades
 * sugeridas". Funciones PURAS (sin efectos): el envío lo hace utils/whatsappShare.ts.
 *
 * Reglas:
 *   - Jefatura 2026-09-21: sin referencia a un día; la cabecera lleva la SEMANA
 *     ("Semana lun 21/09 – vie 25/09").
 *   - Jefatura 2026-08-17: la actividad de cada rubro va DEBAJO de su grupo; la
 *     observación global al final; sin horas.
 *   - *bold*, _italic_, viñetas con "-", footer "_Generado con Bóveda LOLS_",
 *     sin emojis (encoding entre dispositivos).
 */

export const TITULO_LISTA = 'Lista de trabajadores en actividades sugeridas';

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

/** Actividad del cargo: lookup en observaciones_por_cargo por el cargo_id del grupo. */
function actividadDelCargo(
    obs: Record<string, string> | null | undefined,
    items: Array<{ cargo_id: number | null }>
): string | null {
    const cargoId = items[0]?.cargo_id ?? null;
    if (cargoId === null || !obs) return null;
    return obs[String(cargoId)] || null;
}

const nombreLinea = (w: { apellido_paterno: string; apellido_materno: string | null; nombres: string }) =>
    `- ${w.apellido_paterno}${w.apellido_materno ? ` ${w.apellido_materno}` : ''} ${w.nombres}`;

/**
 * Mensaje de la LISTA (se envía al armarla).
 *
 *   Buenos días
 *   *Lista de trabajadores en actividades sugeridas*
 *   Semana lun 21/09 – vie 25/09 — Obra X
 *
 *   Total: N
 *
 *   *Cargo A* (3)
 *   _Actividad: lo que escribió quien armó la lista para ese cargo_
 *   - Apellido Nombre
 *
 *   Observación global (si hay)
 *
 *   Saludos cordiales
 *   _Generado con Bóveda LOLS_
 */
export function buildListaMessage(s: ActividadSugeridaDetalle): string {
    const obs = s.observaciones_por_cargo || {};
    const lines: string[] = [];
    lines.push('Buenos días');
    lines.push(`*${TITULO_LISTA}*`);
    lines.push(`${fmtSemana(s.semana)} — Obra ${s.obra_nombre}`);
    lines.push('');
    lines.push(`Total: ${s.trabajadores.length}`);
    lines.push('');

    agruparPorCargo(s.trabajadores).forEach(({ cargo, items }) => {
        lines.push(`*${cargo}* (${items.length})`);
        const actividad = actividadDelCargo(obs, items);
        if (actividad) lines.push(`_Actividad: ${actividad}_`);
        items.forEach(w => lines.push(nombreLinea(w)));
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
 * Mensaje de ASISTENCIA (al cerrar la lista).
 *
 *   *Asistencia a actividades sugeridas*
 *   Obra X — Semana lun 21/09 – vie 25/09
 *
 *   Asistieron: N/M
 *
 *   *Cargo A*
 *   _Actividad: …_
 *   - Apellido Nombre _observación_
 *
 *   *No asistieron:* N
 *   - Apellido Nombre
 *
 *   Observación global (si hay)
 *
 *   _Generado con Bóveda LOLS_
 */
export function buildAsistenciaMessage(s: ActividadSugeridaDetalle): string {
    const obs = s.observaciones_por_cargo || {};
    const asistieron: ActividadSugeridaTrabajador[] = s.trabajadores.filter(w => flagOn(w.asistio));
    const noAsistieron: ActividadSugeridaTrabajador[] = s.trabajadores.filter(w => flagOff(w.asistio));

    const lines: string[] = [];
    lines.push('*Asistencia a actividades sugeridas*');
    lines.push(`Obra ${s.obra_nombre} — ${fmtSemana(s.semana)}`);
    lines.push('');
    lines.push(`Asistieron: ${asistieron.length}/${s.trabajadores.length}`);
    lines.push('');

    agruparPorCargo(asistieron).forEach(({ cargo, items }) => {
        lines.push(`*${cargo}*`);
        const actividad = actividadDelCargo(obs, items);
        if (actividad) lines.push(`_Actividad: ${actividad}_`);
        items.forEach(w => {
            let line = nombreLinea(w);
            if (w.observacion) line += ` _${w.observacion}_`;
            lines.push(line);
        });
        lines.push('');
    });

    if (noAsistieron.length > 0) {
        lines.push(`*No asistieron:* ${noAsistieron.length}`);
        noAsistieron.forEach(w => lines.push(nombreLinea(w)));
        lines.push('');
    }

    if (s.observaciones_globales) {
        lines.push(s.observaciones_globales);
        lines.push('');
    }

    lines.push('_Generado con Bóveda LOLS_');
    return lines.join('\n');
}
