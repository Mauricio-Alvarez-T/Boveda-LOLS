import type { TonoTarjeta } from '../tarjetaActiva';
import { plural } from '../fichasInicio';
import { fichasVehiculos, tituloVehiculo, type PapelesFlotaApi } from '../fichasVehiculosInicio';
import { cantidad, enLista, fraseItems, nombreCorto, rutaDiferencia, rutaLista, rutaSolicitud, textoDiferencia } from '../inventarioPerfil/formato';
import { ETAPA_LABEL, type EtapaDocumento } from '../../../documentos-fisicos/documentosAlertas';
import { formatCLP } from '../../../../utils/currency';
import {
    diaCorto, dias, fechaCorta, haceDias, mensajeDocumentos, mensajeFaltas, mensajePapeles, mensajePerdidas, mensajeSolicitudes,
    mensajeVehiculos, sinSufijo, textoVence,
} from './mensajes';
import type {
    CausalFalta, DocumentosGerenciaApi, FaltasGerenciaApi, GerenciaApi, PapelLaboralApi, PapelesGerenciaApi, PerdidasApi, SolicitudesGerenciaApi,
} from './tipos';

export type * from './tipos';

/**
 * Lógica PURA del «Inicio de gerencia» (don Luis Lazcano; opción B «Tablero por tema» del lienzo,
 * boveda-diseno/frontend/src/preview/gerencia/opcionB.tsx, 2026-10-23). Con la respuesta de GET /api/dashboard/gerencia
 * arma los seis temas (número grande, bajada, «Qué se decide», sus filas de la más urgente a la menos, el enlace al
 * módulo y el ÚNICO WhatsApp de la tarjeta, con todo lo pendiente del tema) y la franja «N temas esperan una decisión».
 * Cada fila trae además qué falta en palabras (`detalle`, se ve al desplegar la tarjeta). Nada se decide aquí:
 * los botones NAVEGAN a donde se resuelve o abren WhatsApp sin número (la app no registra qué decide gerencia). Los
 * textos de WhatsApp viven en `mensajes.ts`. Test: `gerencia.modelo.test.ts`; dibujo: `InicioGerencia.tsx`; reglas:
 * docs/reglas/diseno.md § Inicio de gerencia.
 */

export type TemaKey = 'faltas' | 'vehiculos' | 'perdidas' | 'documentos' | 'papeles' | 'solicitudes';

export interface FilaTema {
    id: string;
    /** Lo principal: la persona, la patente o el ítem. */
    titulo: string;
    /** Debajo, en gris: obra, vehículo, qué faltó… */
    bajada: string;
    /** Qué falta, de quién y desde cuándo, en una o dos frases (se ve con la tarjeta desplegada). */
    detalle: string;
    /** Solo en faltas: las causales del Art. 160 N°3. */
    pildoras: { tono: TonoTarjeta; texto: string }[];
    cifra: string;
    /** Debajo de la cifra: «días vencido», «hace 7 días», «desde el lun 5». */
    nota: string;
    tono: TonoTarjeta;
    /** Adónde lleva tocar la fila (donde se resuelve). */
    ruta: string;
}

export interface TemaGerencia {
    key: TemaKey;
    titulo: string;
    tono: TonoTarjeta;
    /** La cifra grande (número o monto). */
    cifra: string;
    /** Un monto es largo: va un poco más chico que un número. */
    esMonto: boolean;
    /** Qué cuenta la cifra («trabajadores con causal»). */
    etiqueta: string;
    /** Una línea con el detalle de la cifra (sin punto final). */
    resumen: string;
    /** «Qué se decide: …» (sin punto final). */
    decision: string;
    /** Cuántos esperan una decisión (0 = el tema está al día). Puede ser más que las filas (tope del servidor). */
    total: number;
    /** De la más urgente a la menos (las 3 primeras son «Lo más urgente»). */
    filas: FilaTema[];
    /** El módulo donde se resuelve («Ver en Asistencia»). */
    enlace: { texto: string; ruta: string };
    /**
     * El ÚNICO WhatsApp de la tarjeta (pie): todos los pendientes del tema en un mensaje, sin número (don Luis elige el
     * grupo o la persona). null si no hay nada pendiente.
     */
    whatsapp: { texto: string; mensaje: string } | null;
    /** Para la franja de arriba: «5 trabajadores con causal». */
    franja: { cifra: string; texto: string };
}

/** Filas a la vista antes de desplegar la tarjeta. */
export const TOPE_URGENTE = 3;

const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
/** «octubre» del día de hoy de la respuesta. */
export const mesLargo = (hoy: string) => MESES_LARGOS[Number(hoy.slice(5, 7)) - 1] ?? '';

const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const orden = { rojo: 0, ambar: 1, azul: 2, verde: 3, neutro: 4 } as const;
/** La nota de la cifra de un vencimiento: «días vencido» / «días para vencer» / «vence hoy». */
const notaVence = (d: number) => (d < 0 ? plural(-d, 'día vencido', 'días vencido') : d === 0 ? 'vence hoy' : plural(d, 'día para vencer', 'días para vencer'));
/** «venció el 1 sep (hace 52 días)» / «vence hoy» / «vence el 27 oct (en 4 días)». */
const venceConFecha = (hoy: string, d: number) => {
    if (d === 0) return 'vence hoy';
    const f = fechaCorta(haceDias(hoy, -d));
    return d < 0 ? `venció el ${f} (hace ${dias(-d)})` : `vence el ${f} (en ${dias(d)})`;
};

type Aprobadores = GerenciaApi['aprobadores'];

/** Quién aprueba («Leonardo»; con dos, «Leonardo o Ana»); null sin nadie o con más de dos. */
export function quienAprueba(aprobadores: Aprobadores): string | null {
    const nombres = aprobadores.map(a => (a.nombre?.trim() ? nombreCorto(a.nombre) : '')).filter(Boolean);
    if (nombres.length === 0 || nombres.length > 2) return null;
    return nombres.join(' o ');
}
/** El primer nombre de quien aprueba si es UNO solo (para saludarlo en un mensaje). */
const unoQueAprueba = (aprobadores: Aprobadores) => (aprobadores.length === 1 ? quienAprueba(aprobadores) : null);
/** El nombre completo de quien aprueba (si es uno solo), para las bajadas: «Leonardo López». */
const aprobadorCompleto = (aprobadores: Aprobadores) =>
    (aprobadores.length === 1 && aprobadores[0].nombre?.trim() ? aprobadores[0].nombre.trim() : null);

// ─────────────────────────────── 1. Faltas reiteradas ───────────────────────────────

export const CAUSAL_TEXTO: Record<CausalFalta, string> = {
    seguidos: '2 días seguidos',
    lunes: '2 lunes en el mes',
    tres: '3 o más faltas',
};

function temaFaltas(f: FaltasGerenciaApi): TemaGerencia {
    const n = f.total;
    const filas = f.lista.map((r): FilaTema => ({
        id: `f-${r.trabajador_id}`,
        titulo: r.nombre || 'Trabajador sin nombre',
        bajada: [r.obra, enLista(r.fechas.map(diaCorto))].filter(Boolean).join(' · '),
        detalle: [
            r.fechas.length ? `Faltó el ${enLista(r.fechas.map(diaCorto))} sin justificación.` : '',
            r.causales.length ? `${mayuscula(enLista(r.causales.map(c => CAUSAL_TEXTO[c])))}.` : '',
        ].filter(Boolean).join(' '),
        pildoras: r.causales.length >= 3
            ? [{ tono: 'rojo', texto: 'Las 3 causales' }]
            : r.causales.map(c => ({ tono: 'rojo' as const, texto: CAUSAL_TEXTO[c] })),
        cifra: String(r.fechas.length),
        nota: r.fechas[0] ? `desde el ${diaCorto(r.fechas[0])}` : plural(r.fechas.length, 'falta', 'faltas'),
        tono: 'rojo',
        ruta: r.rut ? `/asistencia?q=${encodeURIComponent(r.rut)}` : '/asistencia',
    }));
    const tres = f.tres_causales;
    return {
        key: 'faltas', titulo: 'Faltas reiteradas', tono: n > 0 ? 'rojo' : 'verde',
        cifra: String(n), esMonto: false,
        etiqueta: plural(n, 'trabajador con causal', 'trabajadores con causal'),
        resumen: n === 0
            ? `Nadie suma 2 días seguidos, 2 lunes ni 3 faltas en ${MESES_LARGOS[f.mes - 1] ?? 'el mes'}`
            : tres > 0
                ? `${tres} ${plural(tres, 'cumple', 'cumplen')} las tres causales del Art. 160 N°3 este mes`
                : 'Art. 160 N°3: 2 días seguidos, 2 lunes o 3 faltas en el mes',
        decision: 'Amonestar, carta de despido o conversar: revísalo con RRHH',
        total: n, filas,
        enlace: { texto: 'Ver en Asistencia', ruta: '/asistencia' },
        whatsapp: n > 0 ? { texto: 'Apurar por WhatsApp', mensaje: mensajeFaltas(f.lista, n) } : null,
        franja: { cifra: String(n), texto: plural(n, 'trabajador con causal', 'trabajadores con causal') },
    };
}

// ─────────────────────────────── 2. Papeles de vehículos ───────────────────────────────

function temaVehiculos(data: PapelesFlotaApi, hoy: string): TemaGerencia {
    // Cada papel que requiere acción es una fila (un vehículo puede tener varias), del más vencido al más holgado.
    const pares = fichasVehiculos(data).flatMap(({ v, urg }) => urg.map((u, i) => ({ v, u, i })))
        .sort((a, b) => a.u.dias - b.u.dias);
    const filas = pares.map(({ v, u, i }): FilaTema => {
        const vehiculo = tituloVehiculo(v) !== v.patente ? tituloVehiculo(v) : null;
        const conductor = v.conductor_nombre?.trim() || null;
        return {
            id: `v-${v.vehiculo_id}-${u.clave ?? u.nombre}-${i}`,
            titulo: `${v.patente} · ${u.nombre}`,
            bajada: [vehiculo, conductor ?? 'sin conductor asignado'].filter(Boolean).join(' · '),
            detalle: `${mayuscula(u.nombre)}: ${venceConFecha(hoy, u.dias)}. ${conductor ? `Lo maneja ${conductor}.` : 'No tiene conductor asignado.'}`,
            pildoras: [],
            cifra: u.dias === 0 ? 'Hoy' : String(Math.abs(u.dias)),
            nota: notaVence(u.dias),
            tono: u.dias < 0 ? 'rojo' : 'ambar',
            ruta: `/vehiculos?vehiculo=${v.vehiculo_id}${u.clave ? `&papel=${u.clave}` : ''}`,
        };
    });
    const vencidos = filas.filter(f => f.tono === 'rojo').length;
    const porVencer = filas.length - vencidos;
    const conVencidos = vencidos > 0;
    const n = conVencidos ? vencidos : porVencer;
    return {
        key: 'vehiculos', titulo: 'Papeles de vehículos',
        tono: conVencidos ? 'rojo' : porVencer > 0 ? 'ambar' : 'verde',
        cifra: String(n), esMonto: false,
        etiqueta: conVencidos || filas.length === 0 ? plural(n, 'papel vencido', 'papeles vencidos') : plural(n, 'papel por vencer', 'papeles por vencer'),
        resumen: filas.length === 0
            ? `Nada vence en los próximos ${data.dias} días`
            : conVencidos
                ? `y ${porVencer} por vencer en ${data.dias} días`
                : `en los próximos ${data.dias} días; ninguno vencido`,
        decision: 'Sacar el vehículo de circulación o pedir que se renueve',
        total: filas.length, filas,
        enlace: { texto: 'Ver en Vehículos', ruta: '/vehiculos' },
        whatsapp: filas.length ? { texto: 'Apurar por WhatsApp', mensaje: mensajeVehiculos(pares) } : null,
        franja: conVencidos
            ? { cifra: String(vencidos), texto: plural(vencidos, 'papel de vehículo vencido', 'papeles de vehículos vencidos') }
            : { cifra: String(porVencer), texto: plural(porVencer, 'papel de vehículo por vencer', 'papeles de vehículos por vencer') },
    };
}

// ─────────────────────────────── 3. Pérdidas en Inventario ───────────────────────────────

function temaPerdidas(p: PerdidasApi, aprobadores: Aprobadores, hoy: string): TemaGerencia {
    const conValores = p.con_valores && typeof p.total === 'number';
    const quien = unoQueAprueba(aprobadores);
    const filas = p.lista.map((x): FilaTema => {
        const lugar = x.destino || x.origen || null;
        const ruta = [x.origen, x.destino].filter(Boolean).join(' → ');
        const unitario = conValores && x.valor_unitario ? ` (${formatCLP(x.valor_unitario)} cada uno)` : '';
        return {
            id: `p-${x.id}`,
            titulo: x.descripcion?.trim() || 'Ítem sin nombre',
            bajada: [textoDiferencia(x.faltan, x.unidad), lugar].filter(Boolean).join(' · '),
            detalle: [
                `${textoDiferencia(x.faltan, x.unidad)}${unitario} en la solicitud ${x.codigo}${ruta ? ` (${ruta})` : ''}.`,
                `${x.recibio ? `Lo recibió ${x.recibio}` : 'Se recibió'}${x.fecha ? ` el ${fechaCorta(x.fecha)}` : ''}${x.dias > 0 ? ` (hace ${dias(x.dias)})` : ' (hoy)'}.`,
                conValores && !x.valor ? 'El ítem no tiene valor de compra en el catálogo.' : '',
            ].filter(Boolean).join(' '),
            pildoras: [],
            cifra: conValores ? (x.valor ? formatCLP(x.valor) : 'Sin valor') : cantidad(x.faltan, x.unidad),
            nota: x.dias <= 0 ? 'de hoy' : `hace ${dias(x.dias)}`,
            tono: 'rojo',
            ruta: rutaDiferencia(x.transferencia_id),
        };
    });
    const n = p.n;
    const mes = mesLargo(hoy);
    const todasDelMes = p.n_mes === n;
    const completo = aprobadorCompleto(aprobadores);
    const extras: string[] = [];
    if (conValores && !todasDelMes && (p.total_mes ?? 0) > 0) extras.push(`${formatCLP(p.total_mes ?? 0)} son de ${mes}`);
    if (conValores && (p.sin_valor ?? 0) > 0) extras.push(`${p.sin_valor} sin valor de compra en el catálogo`);
    const cifra = conValores ? formatCLP(p.total ?? 0) : String(n);
    return {
        key: 'perdidas', titulo: 'Pérdidas en Inventario', tono: n > 0 ? 'rojo' : 'verde',
        cifra, esMonto: conValores,
        etiqueta: conValores
            ? (n > 0 && todasDelMes ? `sin resolver en ${mes}` : 'sin resolver')
            : plural(n, 'faltante sin resolver', 'faltantes sin resolver'),
        resumen: n === 0
            ? 'Todo lo enviado llegó completo o ya se resolvió'
            : [`${p.envios} ${plural(p.envios, 'envío llegó', 'envíos llegaron')} con menos de lo que salió de bodega`, ...extras].join('; '),
        decision: n === 0
            ? 'Nada por ahora'
            : `${plural(n, 'La resuelve', 'Las resuelve')} ${completo ?? 'quien aprueba en Inventario'}; tú decides si apurarlo`,
        total: n, filas,
        enlace: { texto: 'Ver en Inventario', ruta: rutaLista('discrepancias') },
        whatsapp: n > 0 ? {
            texto: quien ? `Pedir a ${quien}` : 'Apurar por WhatsApp',
            mensaje: mensajePerdidas(p.lista, { total: n, quien, conValores, totalPesos: conValores ? p.total ?? null : null }),
        } : null,
        franja: conValores
            ? { cifra, texto: 'perdidos en Inventario' }
            : { cifra: String(n), texto: plural(n, 'faltante en Inventario', 'faltantes en Inventario') },
    };
}

// ─────────────────────────────── 4. Documentos de trabajadores ───────────────────────────────

function temaDocumentos(d: DocumentosGerenciaApi, hoy: string): TemaGerencia {
    const filas = d.lista.map((x): FilaTema => ({
        id: `d-${x.documento_id}`,
        titulo: x.nombre || 'Trabajador sin nombre',
        bajada: [x.tipo || 'Documento', x.obra].filter(Boolean).join(' · '),
        detalle: `${x.tipo || 'Un documento'}: ${venceConFecha(hoy, x.dias)}.${x.rut ? ` RUT ${x.rut}.` : ''}`,
        pildoras: [],
        cifra: x.dias === 0 ? 'Hoy' : String(Math.abs(x.dias)),
        nota: notaVence(x.dias),
        tono: x.dias < 0 ? 'rojo' : 'ambar',
        ruta: x.rut ? `/consultas?q=${encodeURIComponent(x.rut)}` : '/consultas?tab=trabajadores',
    }));
    const total = d.vencidos + d.por_vencer;
    const conVencidos = d.vencidos > 0;
    const n = conVencidos ? d.vencidos : d.por_vencer;
    const semana = d.dias === 7 ? 'esta semana' : `en ${d.dias} días`;
    return {
        key: 'documentos', titulo: 'Documentos de trabajadores',
        tono: conVencidos ? 'rojo' : d.por_vencer > 0 ? 'ambar' : 'verde',
        cifra: String(n), esMonto: false,
        etiqueta: conVencidos || total === 0 ? plural(n, 'documento vencido', 'documentos vencidos') : plural(n, `vence ${semana}`, `vencen ${semana}`),
        resumen: total === 0
            ? `Ninguno vencido ni por vencer ${semana}`
            : conVencidos
                ? `y ${d.por_vencer} ${plural(d.por_vencer, 'vence', 'vencen')} ${semana} · riesgo ante una fiscalización`
                : 'ninguno vencido todavía · riesgo ante una fiscalización',
        decision: 'Pedir que se renueven antes de que llegue un fiscalizador',
        total, filas,
        enlace: { texto: 'Ver en Gestiones', ruta: `/consultas?tab=trabajadores&doc_vigencia=${conVencidos ? 'vencido' : '30'}` },
        whatsapp: total > 0 ? { texto: 'Apurar por WhatsApp', mensaje: mensajeDocumentos(d.lista, total) } : null,
        franja: conVencidos
            ? { cifra: String(d.vencidos), texto: plural(d.vencidos, 'documento de trabajador vencido', 'documentos de trabajadores vencidos') }
            : { cifra: String(d.por_vencer), texto: plural(d.por_vencer, 'documento de trabajador por vencer', 'documentos de trabajadores por vencer') },
    };
}

// ─────────────────────────────── 5. Papeles laborales atrasados ───────────────────────────────

/** Etapa en palabras (las de Documentos físicos; «En terreno firmándose» como el lienzo). */
export const ETAPA_GERENCIA: Record<EtapaDocumento, string> = { ...ETAPA_LABEL, en_terreno: 'En terreno firmándose' };

/** La cifra y su nota: en terreno cuentan días HÁBILES de atraso (tenencia de 4); antes, días desde que se generó. */
export function cifraPapel(p: PapelLaboralApi): { cifra: string; nota: string } {
    if (p.etapa === 'en_terreno') {
        if (!p.critical) return { cifra: String(p.dias), nota: 'último día en terreno' };
        const atraso = Math.max(1, p.dias - p.dias_aviso);
        return { cifra: String(atraso), nota: plural(atraso, 'día hábil de atraso', 'días hábiles de atraso') };
    }
    return { cifra: String(p.dias), nota: plural(p.dias, 'día', 'días') };
}

/** Qué pasa con el papel, en una frase (con la fecha en que se generó si se sabe). */
function detallePapel(p: PapelLaboralApi, hoy: string): string {
    const generado = p.etapa !== 'en_terreno' ? `Se generó el ${fechaCorta(haceDias(hoy, p.dias))}` : '';
    switch (p.etapa) {
        case 'sin_imprimir': return `${generado} y aún no se imprime.`;
        case 'por_retirar': return `${generado}; ya está impreso y nadie lo ha llevado a terreno.`;
        case 'por_confirmar': return `${generado}; está en un lote en oficina y el portador aún no lo retira.`;
        case 'en_terreno': {
            const quien = p.portador_nombre ? `Lo tiene ${p.portador_nombre}` : 'Está en terreno';
            return p.critical
                ? `${quien}; debía volver firmado en ${p.dias_aviso} días hábiles y lleva ${p.dias}.`
                : `${quien}; hoy es su último día para volver firmado.`;
        }
        default: return '';
    }
}

function temaPapeles(p: PapelesGerenciaApi, registra: boolean, hoy: string): TemaGerencia {
    const filas = p.lista.map((x): FilaTema => {
        const { cifra, nota } = cifraPapel(x);
        return {
            id: `l-${x.documento_id}`,
            titulo: `${sinSufijo(x.tipo_nombre)} · ${x.trabajador.nombre}`,
            bajada: [x.etapa === 'en_terreno' && x.portador_nombre ? `Lo tiene ${x.portador_nombre}` : ETAPA_GERENCIA[x.etapa], x.obra_nombre]
                .filter(Boolean).join(' · '),
            detalle: detallePapel(x, hoy),
            pildoras: [],
            cifra, nota,
            tono: x.critical ? 'rojo' : 'ambar',
            // Documentos físicos solo lo abre quien registra entregas; los demás, la ficha del trabajador.
            ruta: registra ? '/consultas?tab=fisicos' : x.trabajador.rut ? `/consultas?q=${encodeURIComponent(x.trabajador.rut)}` : '/consultas?tab=inicio',
        };
    });
    const n = p.total;
    return {
        key: 'papeles', titulo: 'Papeles laborales atrasados', tono: p.criticos > 0 ? 'rojo' : n > 0 ? 'ambar' : 'verde',
        cifra: String(n), esMonto: false,
        etiqueta: 'fuera de plazo',
        resumen: n === 0
            ? 'Contratos, anexos y finiquitos al día'
            : p.criticos > 0
                ? `Contratos, anexos y finiquitos; ${p.criticos} ya ${plural(p.criticos, 'pasó', 'pasaron')} el plazo máximo`
                : 'Contratos, anexos y finiquitos; ninguno pasó aún el plazo máximo',
        decision: 'Pedir a RRHH que los imprima, los mande o los traiga de vuelta',
        total: n, filas,
        enlace: { texto: 'Ver en Gestiones', ruta: registra ? '/consultas?tab=fisicos' : '/consultas?tab=inicio' },
        whatsapp: n > 0 ? { texto: 'Apurar por WhatsApp', mensaje: mensajePapeles(p.lista, n) } : null,
        franja: { cifra: String(n), texto: plural(n, 'papel laboral atrasado', 'papeles laborales atrasados') },
    };
}

// ─────────────────────────────── 6. Solicitudes trabadas ───────────────────────────────

function temaSolicitudes(s: SolicitudesGerenciaApi, aprobadores: Aprobadores): TemaGerencia {
    const quien = quienAprueba(aprobadores);
    const uno = unoQueAprueba(aprobadores);
    const completo = aprobadorCompleto(aprobadores);
    const filas = s.lista.map((x): FilaTema => {
        const items = x.items.map(i => ({ descripcion: i.descripcion ?? '', unidad: i.unidad, pedida: i.pedida }));
        return {
            id: `s-${x.id}`,
            titulo: [x.destino, x.solicitante].filter(Boolean).join(' · ') || x.codigo,
            bajada: items.length ? fraseItems(items) : x.codigo,
            detalle: [
                items.length ? `Pidió ${fraseItems(items, { max: 6 })}.` : '',
                `${x.cargo ? `${x.cargo}. ` : ''}Pedida el ${fechaCorta(x.fecha)} (${x.codigo}); lleva ${dias(x.dias)} sin aprobar.`,
            ].filter(Boolean).join(' '),
            pildoras: [],
            cifra: String(x.dias),
            nota: plural(x.dias, 'día esperando', 'días esperando'),
            tono: 'ambar',
            ruta: rutaSolicitud({ id: x.id, estado: 'pendiente' }),
        };
    });
    const n = s.total;
    const masAntigua = s.lista.reduce((m, x) => Math.max(m, x.dias), 0);
    return {
        key: 'solicitudes', titulo: 'Solicitudes de materiales trabadas', tono: n > 0 ? 'ambar' : 'verde',
        cifra: String(n), esMonto: false,
        etiqueta: plural(n, 'solicitud sin aprobar', 'solicitudes sin aprobar'),
        resumen: n === 0
            ? `Ninguna lleva más de ${s.dias_limite} días esperando`
            : `más de ${s.dias_limite} días esperando a ${completo ?? 'quien aprueba'}; la más antigua, ${dias(masAntigua)}`,
        decision: quien ? `Apurar a ${quien}` : 'Apurar a quien aprueba',
        total: n, filas,
        enlace: { texto: 'Ver en Inventario', ruta: rutaLista('pendiente') },
        whatsapp: n > 0 ? {
            texto: uno ? `Apurar a ${uno}` : 'Apurar por WhatsApp',
            mensaje: mensajeSolicitudes(s.lista, { total: n, quien: uno, diasLimite: s.dias_limite }),
        } : null,
        franja: { cifra: String(n), texto: plural(n, 'solicitud trabada', 'solicitudes trabadas') },
    };
}

// ─────────────────────────────── Todo junto ───────────────────────────────

/** Rojo antes que ámbar; dentro de cada tono, el orden que ya traen (el del servidor o el del tema). */
const porTono = (filas: FilaTema[]) => filas.map((f, i) => ({ f, i }))
    .sort((a, b) => orden[a.f.tono] - orden[b.f.tono] || a.i - b.i).map(x => x.f);

/**
 * Los temas que este perfil puede ver (un bloque null = sin permiso de ese módulo o falló: no se dibuja), siempre en el
 * orden del lienzo. `registraEntregas` = documentos.entrega.registrar (abre Documentos físicos).
 */
export function temasGerencia(api: GerenciaApi | null, { registraEntregas = false }: { registraEntregas?: boolean } = {}): TemaGerencia[] {
    if (!api) return [];
    const ap = api.aprobadores ?? [];
    const temas: TemaGerencia[] = [];
    if (api.faltas) temas.push(temaFaltas(api.faltas));
    if (api.vehiculos) temas.push(temaVehiculos(api.vehiculos, api.hoy));
    if (api.perdidas) temas.push(temaPerdidas(api.perdidas, ap, api.hoy));
    if (api.documentos) temas.push(temaDocumentos(api.documentos, api.hoy));
    if (api.papeles) temas.push(temaPapeles(api.papeles, registraEntregas, api.hoy));
    if (api.solicitudes) temas.push(temaSolicitudes(api.solicitudes, ap));
    return temas.map(t => ({ ...t, filas: porTono(t.filas) }));
}

/** Los temas con algo que decidir (la franja y el título). */
export const temasPendientes = (temas: readonly TemaGerencia[]) => temas.filter(t => t.total > 0);

/** «6 temas esperan una decisión» / «1 tema espera una decisión» / «Nada espera una decisión». */
export function tituloFranja(temas: readonly TemaGerencia[]): string {
    const n = temasPendientes(temas).length;
    if (n === 0) return 'Nada espera una decisión';
    return `${n} ${plural(n, 'tema espera', 'temas esperan')} una decisión`;
}

const femenino = (t: TemaGerencia) => t.key === 'solicitudes' || t.key === 'perdidas';

/** El botón que despliega la tarjeta: «Ver los 5» / «Ver las 6»; con 3 o menos, «Ver el detalle». */
export function textoDesplegar(t: TemaGerencia): string {
    if (t.filas.length <= TOPE_URGENTE) return 'Ver el detalle';
    return `Ver ${femenino(t) ? 'las' : 'los'} ${t.filas.length}`;
}

/** Si el servidor cortó la lista (tope), cuántos más hay en el módulo: «y 12 más en Asistencia». null si no. */
export function textoMasEnModulo(t: TemaGerencia): string | null {
    const resto = t.total - t.filas.length;
    if (resto <= 0) return null;
    return `y ${resto} más: ${t.enlace.texto.replace(/^Ver /, 'velos ')}`;
}

export { textoVence };
