/**
 * Mensaje del botón «Sincronizar feriados nacionales» (Configuración → Feriados). Puro y testeable: el
 * jest del front solo corre *.test.ts sin JSX.
 */
export interface ResultadoSync {
    year: number;
    fuente: 'gobierno' | 'boostr' | 'tabla' | 'nager';
    fuenteNombre: string;
    parcial: boolean;
    count: number;
    nuevos: number;
    actualizados: number;
    respetados: number;
}

export interface ResumenSync {
    tono: 'ok' | 'aviso';
    titulo: string;
    detalle: string;
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export function resumenSync(r: ResultadoSync): ResumenSync {
    const cambios = r.nuevos + r.actualizados;
    const titulo = cambios === 0
        ? `Los feriados de ${r.year} ya estaban al día`
        : `${r.year}: ${[
            r.nuevos ? plural(r.nuevos, 'feriado agregado', 'feriados agregados') : '',
            r.actualizados ? plural(r.actualizados, 'actualizado', 'actualizados') : '',
        ].filter(Boolean).join(' · ')}`;
    const partes = [`${plural(r.count, 'feriado nacional', 'feriados nacionales')} según ${r.fuenteNombre}.`];
    if (r.respetados) partes.push(`${plural(r.respetados, 'fecha ya tenía', 'fechas ya tenían')} un feriado de obra: se dejó como estaba.`);
    if (r.parcial) {
        // Nager.Date no conoce los feriados adicionales por ley (p. ej. el 17 de septiembre cuando el 18 cae sábado).
        return {
            tono: 'aviso',
            titulo,
            detalle: [...partes, 'Esta fuente puede omitir feriados adicionales por ley (como un 17 de septiembre): revisa el calendario oficial y agrégalos a mano si falta alguno.'].join(' '),
        };
    }
    return { tono: 'ok', titulo, detalle: partes.join(' ') };
}
