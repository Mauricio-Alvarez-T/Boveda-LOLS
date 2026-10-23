/**
 * Mensajes de WhatsApp de las acciones del Inicio (dueño 2026-10-23: la acción va donde se ve el problema).
 * Lógica pura, sin DOM. Todos terminan con el mismo pie y ninguno lleva RUT: van a grupos.
 */
import { fechaCorta, type TrabajadorPatron } from './resumenAsistenciaDetalle';
import type { AusenteHoy } from './resumenAsistenciaHoy';
import { reglasDe, REGLA_FALTA, type TrabajadorFaltas } from './resumenFaltasMes';
import { diaCorto, venceTenencia, type LoteResumen } from '../../documentos-fisicos/documentosFisicos';

export const PIE_WHATSAPP = '\n\n_Mensaje generado desde Bóveda LOLS_';

/** «a», «a y b», «a, b y c». */
export const enumerar = (partes: string[]) =>
    partes.length <= 1 ? (partes[0] ?? '') : `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`;

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** «viernes 23 de octubre» de 'YYYY-MM-DD' (en UTC, para que no se corra por zona horaria). */
export function fechaLarga(iso: string): string {
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    return `${DIAS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} de ${MESES[m - 1]}`;
}

const nombreCompleto = (p: { nombres: string; apellido_paterno: string }) =>
    [p.nombres, p.apellido_paterno].map(s => String(s ?? '').trim()).filter(Boolean).join(' ');
const conObra = (obra?: string | null) => (obra?.trim() ? ` (${obra.trim()})` : '');
const docs = (n: number) => `${n} ${n === 1 ? 'documento' : 'documentos'}`;

/** «Hola Jhoan» (primer nombre del portador) o «Hola» si no se sabe. */
function saludo(nombre: string | null | undefined): string {
    const n = String(nombre ?? '').trim().split(/\s+/)[0];
    return n ? `Hola ${n}` : 'Hola';
}

/**
 * Ficha de faltas reiteradas: preguntar al grupo de asistencia qué pasó con el trabajador. «Hola, consulta por
 * *Carla Simulado* (Obra Demo Sur): lleva 2 faltas sin justificar en octubre, el jueves 15 y hoy viernes 16
 * (2 días seguidos). ¿Alguien sabe qué pasó? …».
 */
export function mensajeGrupoFaltas(
    t: Pick<TrabajadorFaltas, 'nombres' | 'apellido_paterno' | 'obra_nombre' | 'total_faltas' | 'fechas' | 'alertas'>,
    hoyIso: string,
): string {
    const fechas = (t.fechas ?? []).map(f => f.slice(0, 10));
    const mes = MESES[Number((fechas[0] ?? hoyIso).slice(5, 7)) - 1] ?? '';
    const dias = fechas.map(f => {
        const [y, m, d] = f.split('-').map(Number);
        const dia = `${DIAS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d}`;
        return f === hoyIso ? `hoy ${dia}` : dia;
    });
    const cuando = dias.length > 0 ? `, ${dias[0].startsWith('hoy') ? '' : 'el '}${enumerar(dias)}` : '';
    const reglas = reglasDe(t).map(r => REGLA_FALTA[r].texto);
    const uno = t.total_faltas === 1;
    return `Hola, consulta por *${nombreCompleto(t)}*${conObra(t.obra_nombre)}: lleva ${t.total_faltas} ${uno ? 'falta' : 'faltas'} sin justificar en ${mes}`
        + `${cuando}${reglas.length > 0 ? ` (${enumerar(reglas)})` : ''}. ¿Alguien sabe qué pasó? `
        + `Si tuvo licencia o permiso, por favor envíen el respaldo para ${uno ? 'justificarla' : 'justificarlas'}.${PIE_WHATSAPP}`;
}

/** «Asistencia pendiente» del detalle: recordar a las obras que aún no guardan la de hoy. */
export function mensajeObrasSinGuardar(obras: string[], hoyIso: string): string {
    return `Hola, falta guardar la asistencia de hoy, ${fechaLarga(hoyIso)}, en ${enumerar(obras.map(o => `*${o}*`))}. `
        + `¿Pueden marcarla en Bóveda? Gracias.${PIE_WHATSAPP}`;
}

/** Fila «Falta» de «Hoy · ausentes por motivo»: preguntar al grupo por los que faltaron sin justificar hoy. */
export function mensajeFaltasHoy(personas: Pick<AusenteHoy, 'nombres' | 'apellido_paterno' | 'obra'>[], hoyIso: string): string {
    const uno = personas.length === 1;
    const lista = enumerar(personas.map(p => `*${nombreCompleto(p)}*${conObra(p.obra)}`));
    return `Hola, hoy ${fechaLarga(hoyIso)} ${uno ? 'faltó' : 'faltaron'} sin justificar ${lista}. ¿Alguien sabe qué pasó? `
        + `Si ${uno ? 'tiene' : 'tienen'} licencia o permiso, por favor envíen el respaldo para ${uno ? 'justificarla' : 'justificarlas'}.${PIE_WHATSAPP}`;
}

/** Patrón viernes-lunes: no es causal, pero conviene conversarlo (texto del aviso del detalle). */
export function mensajePatronFinde(t: Pick<TrabajadorPatron, 'nombres' | 'apellido_paterno' | 'obra' | 'n' | 'fechas'>, dias: number): string {
    return `Hola, consulta por *${nombreCompleto(t)}*${conObra(t.obra)}: en los últimos ${dias} días faltó ${t.n} ${t.n === 1 ? 'vez' : 'veces'} `
        + `junto al fin de semana (${enumerar(t.fechas.map(fechaCorta))}). ¿Alguien sabe si pasa algo? Sería bueno conversarlo.${PIE_WHATSAPP}`;
}

/** Lote armado que el portador aún no pasa a buscar. */
export function mensajeLoteOficina(l: Pick<LoteResumen, 'id' | 'total' | 'portador_nombre' | 'creado_en'>): string {
    return `${saludo(l.portador_nombre)}, tienes el lote #${l.id} con ${docs(l.total)} esperando en la oficina de RRHH `
        + `desde el ${diaCorto(l.creado_en)}. ¿Cuándo pasas a retirarlo?${PIE_WHATSAPP}`;
}

/** Lote en terreno: cuándo vence (o venció) su plazo de 4 días hábiles. */
export function mensajeLoteTerreno(l: Pick<LoteResumen, 'id' | 'total' | 'en_terreno' | 'portador_nombre' | 'retirado_en' | 'tenencia'>): string {
    const t = l.tenencia;
    const plazo = !t
        ? (l.retirado_en ? `está en terreno desde el ${diaCorto(l.retirado_en)}` : 'está en terreno')
        : t.atrasado ? `venció el ${venceTenencia(t)}: el máximo en terreno es ${t.max} días hábiles`
            : t.dia >= t.max ? `vence hoy${t.vence_hora ? ` a las ${t.vence_hora}` : ''}`
                : `vence el ${venceTenencia(t)}`;
    return `${saludo(l.portador_nombre)}, el lote #${l.id} (${docs(l.en_terreno || l.total)}) ${plazo}. `
        + `¿Cuándo devuelves los documentos firmados a RRHH?${PIE_WHATSAPP}`;
}
