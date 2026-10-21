/**
 * Tarjeta «Tus documentos» del Inicio del PORTADOR (perfil portador del lienzo, dueño 2026-10-21): lo que
 * tiene que llevar a firmar y devolver a RRHH va primero en su Inicio. Lógica pura (con test).
 */
import type { TonoTarjeta } from './tarjetaActiva';
import type { MisLotesRespuesta } from '../../documentos-fisicos/documentosFisicos';

export interface FilaTusDocumentos { clave: 'oficina' | 'mano' | 'devueltos'; titulo: string; sub: string; n: number; tono: 'rojo' | 'ambar' | 'neutro' | 'verde' }
export interface ResumenTusDocumentos { porEntregar: number; atrasados: number; tono: TonoTarjeta; filas: FilaTusDocumentos[] }

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

export function resumenTusDocumentos(m: MisLotesRespuesta): ResumenTusDocumentos {
    const enOficina = m.en_oficina.reduce((s, l) => s + l.pendientes, 0);
    const enMano = m.en_mano.reduce((s, l) => s + l.en_terreno, 0);
    const atrasados = m.en_mano.filter(l => l.tenencia?.atrasado).length;
    const ultimoDia = m.en_mano.some(l => l.tenencia && !l.tenencia.atrasado && l.tenencia.dia >= l.tenencia.max);
    const masAntiguo = m.en_mano.reduce((d, l) => Math.max(d, l.tenencia?.dia ?? 0), 0);
    const max = m.en_mano[0]?.tenencia?.max ?? 4;
    const nOfi = m.en_oficina.length;
    const nMano = m.en_mano.length;

    const tono: TonoTarjeta = atrasados > 0 ? 'rojo' : ultimoDia || nOfi > 0 ? 'ambar' : nMano > 0 ? 'azul' : 'verde';
    return {
        porEntregar: enOficina + enMano,
        atrasados,
        tono,
        filas: [
            {
                clave: 'oficina', titulo: 'Te esperan en la oficina', n: enOficina, tono: nOfi > 0 ? 'ambar' : 'neutro',
                sub: nOfi > 0 ? `${nOfi} ${plural(nOfi, 'lote', 'lotes')} · retíralo y confirma en Bóveda` : 'Nada por retirar',
            },
            {
                clave: 'mano', titulo: 'En tus manos', n: enMano, tono: atrasados > 0 ? 'rojo' : ultimoDia ? 'ambar' : 'neutro',
                sub: atrasados > 0 ? `${atrasados} ${plural(atrasados, 'lote', 'lotes')} fuera de plazo: devuélvelos a RRHH`
                    : nMano > 0 ? `${nMano} ${plural(nMano, 'lote', 'lotes')} · el más antiguo va en el día ${masAntiguo} de ${max}`
                        : 'Nada en terreno',
            },
            {
                clave: 'devueltos', titulo: 'Devueltos esta semana', n: m.devueltos_semana, tono: m.devueltos_semana > 0 ? 'verde' : 'neutro',
                sub: m.devueltos_semana > 0 ? 'Ya los recibió RRHH' : 'Aún nada esta semana',
            },
        ],
    };
}
