/**
 * Lógica pura de la ficha rápida del trabajador (rediseño 2026-09-15): antigüedad del contrato,
 * término del contrato a plazo fijo (mig 138, 2026-10-26) y porcentaje de documentación. Sin React ni fetch → testeable.
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

/** Días de anticipación del aviso «por vencer» del término del contrato (el mismo plazo del Inicio de gerencia). */
export const DIAS_AVISO_TERMINO = 30;

export interface TerminoContrato {
    /** 'YYYY-MM-DD'. */
    fecha: string;
    /** Días desde hoy hasta el término: negativo = ya venció; 0 = vence hoy. */
    dias: number;
    /** vencido (rojo) · por_vencer (en DIAS_AVISO_TERMINO o menos, ámbar) · vigente. */
    estado: 'vencido' | 'por_vencer' | 'vigente';
    /** «venció hace 6 días» · «vence hoy» · «vence en 9 días» · «plazo fijo». */
    aviso: string;
}

/**
 * Fecha de término del contrato (mig 138) leída para la ficha. Vacía = indefinido → null. Toma solo 'YYYY-MM-DD' (los
 * primeros 10 caracteres, como WorkerForm), así un DATE serializado en UTC no corre un día.
 */
export function terminoContrato(raw: string | null | undefined, hoy: Date = new Date()): TerminoContrato | null {
    const fecha = raw ? String(raw).slice(0, 10) : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null;
    const [a, m, d] = fecha.split('-').map(Number);
    const dias = Math.round((Date.UTC(a, m - 1, d) - Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())) / 86_400_000);
    if (Number.isNaN(dias)) return null;
    const enDias = (n: number) => (n === 1 ? '1 día' : `${n} días`);
    if (dias < 0) return { fecha, dias, estado: 'vencido', aviso: `venció hace ${enDias(-dias)}` };
    if (dias <= DIAS_AVISO_TERMINO) return { fecha, dias, estado: 'por_vencer', aviso: dias === 0 ? 'vence hoy' : `vence en ${enDias(dias)}` };
    return { fecha, dias, estado: 'vigente', aviso: 'plazo fijo' };
}

/** Porcentaje de documentos obligatorios cubiertos (0-100). Sin obligatorios configurados → 100. */
export function porcentajeDocs(completos: number, totalObligatorios: number): number {
    if (totalObligatorios <= 0) return 100;
    return Math.max(0, Math.min(100, Math.round((completos / totalObligatorios) * 100)));
}
