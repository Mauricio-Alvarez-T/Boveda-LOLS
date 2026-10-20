/**
 * Datos INVENTADOS de la vista «Lo que viene» de Presupuestos (solo staging). Muestran a Rodrigo
 * cómo se verían las mejoras propuestas el 16-10-2026: estados de pago, avance vs costo, facturas
 * del SII, mano de obra desde Asistencia y curva de inversión. Ninguna cifra es de una obra real.
 * Las cuentas viven acá (funciones puras) para que todas las pestañas cuadren entre sí.
 */

export const RETENCION = 0.05;   // de cada estado de pago (ejemplo)
export const ANTICIPO = 0.10;    // del contrato, devuelto en proporción al avance (ejemplo)

export interface Capitulo {
    nombre: string;
    /** Precio al mandante (neto). */
    venta: number;
    /** Costo presupuestado. */
    costo: number;
    /** Costo real a la fecha (neto). */
    gastado: number;
    /** Avance acumulado (%) en el EP 7 y el propuesto para el EP 8. */
    av7: number;
    av8: number;
}

export const CAPITULOS: Capitulo[] = [
    { nombre: 'Obras preliminares', venta: 38e6, costo: 31e6, gastado: 33.9e6, av7: 100, av8: 100 },
    { nombre: 'Movimiento de tierra', venta: 52e6, costo: 42.5e6, gastado: 40.1e6, av7: 100, av8: 100 },
    { nombre: 'Obra gruesa', venta: 395e6, costo: 322e6, gastado: 271e6, av7: 72, av8: 80 },
    { nombre: 'Instalaciones', venta: 128e6, costo: 104e6, gastado: 41.6e6, av7: 30, av8: 38 },
    { nombre: 'Terminaciones', venta: 196e6, costo: 160.5e6, gastado: 30.5e6, av7: 8, av8: 15 },
    { nombre: 'Obras exteriores', venta: 36e6, costo: 29e6, gastado: 0, av7: 0, av8: 0 },
];

export const suma = (caps: Capitulo[], k: 'venta' | 'costo' | 'gastado') => caps.reduce((s, c) => s + c[k], 0);

/** Avance global (%) ponderado por el precio de venta de cada capítulo. */
export const avanceGlobal = (caps: Capitulo[], k: 'av7' | 'av8') =>
    (caps.reduce((s, c) => s + c.venta * c[k] / 100, 0) / suma(caps, 'venta')) * 100;

export type EstadoEP = 'Pagado' | 'Aprobado';

/** EP 1 a 6 con avance acumulado inventado; el EP 7 sale de los capítulos. */
export const EPS_BASE: { n: number; fecha: string; av: number | null; estado: EstadoEP }[] = [
    { n: 1, fecha: '31-03-2026', av: 4, estado: 'Pagado' },
    { n: 2, fecha: '30-04-2026', av: 11, estado: 'Pagado' },
    { n: 3, fecha: '29-05-2026', av: 19, estado: 'Pagado' },
    { n: 4, fecha: '30-06-2026', av: 28, estado: 'Pagado' },
    { n: 5, fecha: '31-07-2026', av: 37, estado: 'Pagado' },
    { n: 6, fecha: '31-08-2026', av: 44, estado: 'Pagado' },
    { n: 7, fecha: '30-09-2026', av: null, estado: 'Aprobado' },
];

export function montosEP(contrato: number, avPrev: number, avAct: number) {
    const bruto = contrato * (avAct - avPrev) / 100;
    const anticipo = bruto * ANTICIPO;
    const retencion = bruto * RETENCION;
    return { bruto, anticipo, retencion, liquido: bruto - anticipo - retencion };
}

/** Proyección al término de un capítulo: gastado ÷ avance; con < 25 % no es confiable → costo. */
export function proyeccion(c: Capitulo) {
    const confiable = c.av8 >= 25;
    // Redondeada a $100.000: es una estimación y no debe aparentar precisión al peso.
    const proy = c.av8 > 0 && confiable ? Math.round(c.gastado / (c.av8 / 100) / 1e5) * 1e5 : c.costo;
    return { confiable, proy, dif: proy - c.costo };
}

export type EstadoSII = 'auto' | 'pendiente' | 'duplicada';
export const FACTURAS_SII: { fecha: string; proveedor: string; folio: string; neto: number; asignacion: string; estado: EstadoSII }[] = [
    { fecha: '03-10', proveedor: 'Hormigones del Valle', folio: '10452', neto: 18420000, asignacion: 'Obra gruesa · Hormigón H-25', estado: 'auto' },
    { fecha: '05-10', proveedor: 'Aceros Andinos', folio: '88213', neto: 12960000, asignacion: 'Obra gruesa · Enfierradura', estado: 'auto' },
    { fecha: '06-10', proveedor: 'Ferretería Central', folio: '5521', neto: 845300, asignacion: '', estado: 'pendiente' },
    { fecha: '08-10', proveedor: 'Maderas del Sur', folio: '3390', neto: 3120000, asignacion: 'Obra gruesa · Moldajes', estado: 'auto' },
    { fecha: '09-10', proveedor: 'Arriendo Maquinaria Norte', folio: '1204', neto: 2400000, asignacion: 'Gastos generales', estado: 'auto' },
    { fecha: '10-10', proveedor: 'Combustibles Ruta 5', folio: '77812', neto: 612000, asignacion: 'Combustible', estado: 'auto' },
    { fecha: '12-10', proveedor: 'Hormigones del Valle', folio: '10501', neto: 9870000, asignacion: 'Obra gruesa · Hormigón H-25', estado: 'auto' },
    { fecha: '14-10', proveedor: 'Sanitarios Pacífico', folio: '2219', neto: 4380000, asignacion: 'Instalaciones · Agua potable', estado: 'auto' },
    { fecha: '15-10', proveedor: 'Eléctrica Los Andes', folio: '6630', neto: 3050000, asignacion: 'Instalaciones · Eléctricas', estado: 'auto' },
    { fecha: '16-10', proveedor: 'Ferretería Central', folio: '5588', neto: 1210000, asignacion: 'Obra gruesa · Moldajes', estado: 'duplicada' },
    { fecha: '17-10', proveedor: 'Cerámicas Atacama', folio: '9012', neto: 6540000, asignacion: 'Terminaciones · Cerámica', estado: 'auto' },
    { fecha: '18-10', proveedor: 'Servicios de Aseo Sur', folio: '450', neto: 380000, asignacion: '', estado: 'pendiente' },
];

export const LEYES_SOCIALES = 0.25;
export const MO_PRESUPUESTO_MES = 28000000;
export const CARGOS_MO: { cargo: string; personas: number; dias: number; sueldo: number }[] = [
    { cargo: 'Capataz', personas: 2, dias: 44, sueldo: 1500000 },
    { cargo: 'Maestro primera', personas: 8, dias: 168, sueldo: 1100000 },
    { cargo: 'Maestro segunda', personas: 6, dias: 120, sueldo: 900000 },
    { cargo: 'Ayudante', personas: 10, dias: 205, sueldo: 700000 },
    { cargo: 'Jornal', personas: 6, dias: 118, sueldo: 600000 },
    { cargo: 'Operador de grúa', personas: 1, dias: 21, sueldo: 1300000 },
];
export const costoDiario = (sueldo: number) => (sueldo / 30) * (1 + LEYES_SOCIALES);

export const MESES = ['Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
/** % del costo programado, acumulado por mes. */
export const PLAN_PCT = [3, 8, 16, 26, 37, 48, 59, 70, 86, 100];
/** Costo real acumulado de marzo a septiembre (octubre = lo gastado a la fecha). */
export const REAL_HASTA_SEP = [19e6, 52e6, 104e6, 168e6, 231e6, 289e6, 349e6];
