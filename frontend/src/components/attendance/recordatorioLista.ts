/**
 * Recordatorio de listas olvidadas para el jefe de obra (Marcos 2026-11-19: «a los supervisores tendría que aparecer
 * un cartelito en asistencia que diga te olvidaste ayer o X días de pasar lista como recordatorio y cuando lo tome
 * desaparece»). Toma los días sin lista de la obra (GET /dashboard/asistencia/sin-lista) y separa los que todavía
 * puede pasar (los del mes en curso, `asistencia.dias_pasados_mes`) de los que ya cerraron (esos los pasa RR.HH.).
 */
import { diaCerradoPara } from '../../utils/fechaChile';
import { fechaLarga } from '../dashboard/widgets/mensajesWhatsApp';
import { cuando, type ObraSinLista } from '../dashboard/widgets/resumenSinLista';

export interface Recordatorio {
    /** Días que todavía puede pasar, del más reciente al más antiguo. */
    pendientes: string[];
    /** Días sin lista que ya cerraron para él (de un mes anterior). */
    cerradas: string[];
}

const mayuscula = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
/** «lunes 16» (sin el mes: los días que puede pasar son todos del mes en curso). */
const diaSinMes = (fecha: string) => fechaLarga(fecha).replace(/ de \S+$/, '');
const mesDe = (fecha: string) => fechaLarga(fecha).split(' de ')[1] ?? '';

/** null si no le queda ningún día por pasar (entonces no hay cartel, aunque haya días cerrados). */
export function recordatorioLista(o: ObraSinLista | undefined, hoy: string, puede: (clave: string) => boolean): Recordatorio | null {
    if (!o) return null;
    const pendientes: string[] = [];
    const cerradas: string[] = [];
    for (const d of o.dias) (diaCerradoPara(d.fecha, puede, hoy).cerrado ? cerradas : pendientes).push(d.fecha);
    return pendientes.length > 0 ? { pendientes, cerradas } : null;
}

/** Texto del botón de cada día: «Ayer», «Anteayer», «Lunes 16». */
export function etiquetaDia(fecha: string, hoy: string): string {
    const c = cuando(fecha, hoy);
    return mayuscula(c === 'ayer' || c === 'anteayer' ? c : diaSinMes(fecha));
}

/** «Se le olvidó pasar la lista de ayer» / «… del lunes 16» / «… en 13 días de este mes». */
export function tituloRecordatorio(pendientes: string[], hoy: string): string {
    if (pendientes.length > 1) return `Se le olvidó pasar la lista en ${pendientes.length} días de este mes`;
    const c = cuando(pendientes[0], hoy);
    return `Se le olvidó pasar la lista ${c === 'ayer' || c === 'anteayer' ? `de ${c}` : `del ${diaSinMes(pendientes[0])}`}`;
}

/** «Los 7 días de octubre ya cerraron: esos los pasa RR.HH.» ('' si no hay). */
export function textoCerradas(cerradas: string[]): string {
    if (cerradas.length === 0) return '';
    if (cerradas.length === 1) return `El ${fechaLarga(cerradas[0])} ya cerró: ese día lo pasa RR.HH.`;
    const meses = [...new Set([...cerradas].sort().map(mesDe))];
    const deMeses = meses.length === 1 ? meses[0] : `${meses.slice(0, -1).join(', ')} y ${meses[meses.length - 1]}`;
    return `Los ${cerradas.length} días de ${deMeses} ya cerraron: esos los pasa RR.HH.`;
}
