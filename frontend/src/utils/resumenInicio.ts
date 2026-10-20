/**
 * Estado de la asistencia de hoy por obra para el Inicio (nació con la tarjeta verde del 2026-10-16;
 * desde el 2026-10-20 el Inicio usa total / guardadas / sinGuardar / finDeSemana en el detalle de
 * Asistencia, y la frase queda disponible). Pura y sin DOM para poder testearla.
 *
 * La asistencia pendiente cuenta TODAS las obras activas que lista el backend
 * (`attendanceStatus`), igual que la Bandeja de antes: con una obra elegida en el
 * selector, la frase sigue avisando de las demás y el detalle cuenta cómo va la elegida.
 */

export interface EstadoObraHoy {
    nombre: string;
    guardada: boolean;
}

export interface ResumenDia {
    /** Obras activas con asistencia exigible hoy (las que lista el backend). */
    total: number;
    guardadas: number;
    /** Obras que aún no guardan la asistencia de hoy, en orden alfabético. */
    sinGuardar: string[];
    /** Sábado o domingo: la asistencia no se marca, así que no se cobra como pendiente. */
    finDeSemana: boolean;
    titulo: string;
    detalle: string;
}

interface Opciones {
    /** Obra elegida en el selector del encabezado (null = todas). */
    obraId?: number | null;
    /** Vencimientos de vehículos YA vencidos (los por vencer no van a la frase). */
    vehiculosVencidos: number;
    /** Pendientes que no son asistencia ni vehículos: la bandeja «Otros pendientes» más las alertas de documentos físicos. */
    otrosPendientes: number;
    /** `Date#getDay()` de hoy: 0 = domingo, 6 = sábado. */
    diaSemana: number;
}

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

export function resumenDelDia(estado: Record<string, EstadoObraHoy>, opciones: Opciones): ResumenDia {
    const { obraId = null, vehiculosVencidos, otrosPendientes, diaSemana } = opciones;
    const obras = Object.values(estado);
    const total = obras.length;
    const guardadas = obras.filter(o => o.guardada).length;
    const sinGuardar = obras
        .filter(o => !o.guardada)
        .map(o => o.nombre.trim())
        .sort((a, b) => a.localeCompare(b, 'es'));
    const finDeSemana = diaSemana === 0 || diaSemana === 6;

    const extraVehiculos = vehiculosVencidos > 0
        ? `Además hay ${vehiculosVencidos} ${plural(vehiculosVencidos, 'vencimiento', 'vencimientos')} de vehículos.`
        : '';
    const juntar = (...partes: string[]) => partes.filter(Boolean).join(' ');

    const base = { total, guardadas, sinGuardar, finDeSemana };

    if (finDeSemana) {
        return { ...base, titulo: 'Fin de semana', detalle: juntar('La asistencia se marca de lunes a viernes.', extraVehiculos) };
    }

    // Sin permiso de asistencia (o sin obras activas) la frase habla de la bandeja.
    if (total === 0) {
        return {
            ...base,
            titulo: otrosPendientes > 0
                ? `Tienes ${otrosPendientes} ${plural(otrosPendientes, 'pendiente', 'pendientes')} hoy`
                : 'Todo al día',
            detalle: extraVehiculos || 'Nada urgente por resolver.',
        };
    }

    if (sinGuardar.length > 0) {
        const n = sinGuardar.length;
        const elegida = obraId != null ? estado[String(obraId)] : undefined;
        let estadoObras: string;
        if (elegida) {
            estadoObras = elegida.guardada
                ? `${elegida.nombre.trim()} ya está lista.`
                : `${elegida.nombre.trim()} todavía no la guarda.`;
        } else if (guardadas === 0) {
            estadoObras = 'Ninguna obra la ha guardado todavía.';
        } else if (guardadas === 1) {
            const lista = obras.find(o => o.guardada);
            estadoObras = `${lista?.nombre.trim() ?? 'Una obra'} ya está lista.`;
        } else {
            estadoObras = `${guardadas} de ${total} obras ya están listas.`;
        }
        return {
            ...base,
            titulo: n === 1
                ? '1 obra aún no guarda la asistencia de hoy'
                : `${n} obras aún no guardan la asistencia de hoy`,
            detalle: juntar(estadoObras, extraVehiculos),
        };
    }

    return {
        ...base,
        titulo: 'Asistencia de hoy guardada en todas las obras',
        detalle: extraVehiculos || (otrosPendientes > 0
            ? `Quedan ${otrosPendientes} ${plural(otrosPendientes, 'pendiente', 'pendientes')} por revisar.`
            : 'Todo al día.'),
    };
}

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** «Viernes 16 de octubre» (fecha local del equipo, sin depender del locale del navegador). */
export function fechaDelDia(d: Date): string {
    return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`;
}
