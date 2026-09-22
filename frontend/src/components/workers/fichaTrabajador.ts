/**
 * Lógica pura de la ficha rápida del trabajador (rediseño 2026-09-15): antigüedad del contrato y
 * porcentaje de documentación. Sin React ni fetch → testeable.
 */

/** Parsea 'YYYY-MM-DD' o un datetime de MySQL a Date local; null si no se puede. */
function aFecha(raw: string | null | undefined): Date | null {
    if (!raw) return null;
    const s = String(raw);
    const iso = s.includes('T') || s.includes(' ') ? s.replace(' ', 'T') : `${s}T00:00:00`;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
}

export interface Antiguedad {
    /** Meses completos cumplidos (0 si aún no cumple el primero). */
    meses: number;
    /** "1 año 2 meses", "10 meses", "12 días". */
    texto: string;
    /** El mes 10 es la señal de renovación del contrato (aviso de la portada de Gestiones). */
    porCumplir10Meses: boolean;
}

/**
 * Antigüedad entre el ingreso y el término (o hoy si sigue vigente). Devuelve null si no hay fecha de
 * ingreso válida o si el ingreso es posterior al corte (fichas con fecha futura).
 */
export function antiguedad(
    fechaIngreso: string | null | undefined,
    fechaTermino: string | null | undefined,
    hoy: Date = new Date(),
): Antiguedad | null {
    const ini = aFecha(fechaIngreso);
    if (!ini) return null;
    const fin = aFecha(fechaTermino) ?? hoy;
    if (fin < ini) return null;

    let meses = (fin.getFullYear() - ini.getFullYear()) * 12 + (fin.getMonth() - ini.getMonth());
    if (fin.getDate() < ini.getDate()) meses -= 1;
    if (meses < 0) meses = 0;

    let texto: string;
    if (meses === 0) {
        const dias = Math.max(0, Math.round(
            (Date.UTC(fin.getFullYear(), fin.getMonth(), fin.getDate()) - Date.UTC(ini.getFullYear(), ini.getMonth(), ini.getDate())) / 86_400_000,
        ));
        texto = dias === 1 ? '1 día' : `${dias} días`;
    } else if (meses < 12) {
        texto = meses === 1 ? '1 mes' : `${meses} meses`;
    } else {
        const anios = Math.floor(meses / 12);
        const resto = meses % 12;
        texto = `${anios} ${anios === 1 ? 'año' : 'años'}${resto ? ` ${resto} ${resto === 1 ? 'mes' : 'meses'}` : ''}`;
    }
    return { meses, texto, porCumplir10Meses: meses === 10 || meses === 11 };
}

/** Porcentaje de documentos obligatorios cubiertos (0-100). Sin obligatorios configurados → 100. */
export function porcentajeDocs(completos: number, totalObligatorios: number): number {
    if (totalObligatorios <= 0) return 100;
    return Math.max(0, Math.min(100, Math.round((completos / totalObligatorios) * 100)));
}
