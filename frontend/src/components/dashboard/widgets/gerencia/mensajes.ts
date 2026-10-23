import { plural } from '../fichasInicio';
import { tituloVehiculo, type Urgente, type VehiculoPapelesApi } from '../fichasVehiculosInicio';
import { cantidad, enLista, fraseItems } from '../inventarioPerfil/formato';
import { formatCLP } from '../../../../utils/currency';
import type { CausalFalta, DocumentosGerenciaApi, FaltasGerenciaApi, PapelLaboralApi, PerdidaApi, SolicitudTrabadaApi } from './tipos';
import type { EtapaDocumento } from '../../../documentos-fisicos/documentosAlertas';

/**
 * TODOS los textos de WhatsApp del «Inicio de gerencia» (dueño 2026-10-23): UN botón por tarjeta, en el pie, que abre
 * WhatsApp SIN número (don Luis elige el grupo o la persona; utils/whatsappShare.ts, `shareViaWhatsApp`) con TODO lo
 * pendiente de ese tema: un encabezado, una línea «•» por pendiente con lo esencial (quién o qué, qué falta o venció,
 * desde cuándo) y el cierre. Con muchos, tope de MAX_LINEAS líneas y «y N más» (el enlace de WhatsApp tiene largo
 * máximo). Lógica PURA con test (`mensajes.test.ts`). Los textos salen de los borradores aprobados por el dueño: si
 * cambian, se cambian AQUÍ y en su test.
 * Regla: solo datos que la app tiene. Si falta uno (obra, conductor, receptor, monto…), la frase lo omite con
 * naturalidad: nunca «undefined», «null», paréntesis vacíos ni dobles espacios.
 */

// ─────────────────────────────── Ayudas de texto ───────────────────────────────

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIAS_SEMANA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

const utc = (iso: string) => {
    const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
    return Date.UTC(a, (m || 1) - 1, d || 1);
};
/** '2026-10-05' → 'lun 5'. */
export const diaCorto = (iso: string) => `${DIAS_SEMANA[new Date(utc(iso)).getUTCDay()]} ${Number(iso.slice(8, 10))}`;
/** '2026-10-05' → '5 oct'. */
export const fechaCorta = (iso: string) => `${Number(iso.slice(8, 10))} ${MESES[Number(iso.slice(5, 7)) - 1] ?? ''}`.trim();
/** La fecha de hace `n` días desde `hoy` (negativo = dentro de n días), 'YYYY-MM-DD'. */
export const haceDias = (hoy: string, n: number) => new Date(utc(hoy) - n * 86_400_000).toISOString().slice(0, 10);

/** «1 día», «5 días». */
export const dias = (n: number) => `${n} ${plural(n, 'día', 'días')}`;
/** Quita espacios de más y los espacios antes de una coma o un punto. */
export const limpiar = (t: string) => t.replace(/[ \t]+/g, ' ').replace(/ ([,.;:)])/g, '$1').replace(/\( /g, '(').trim();
/** « (a, b)» o nada si no hay partes. */
const entreParentesis = (...partes: (string | null | undefined | false)[]) => {
    const p = partes.map(x => (typeof x === 'string' ? x.trim() : '')).filter(Boolean);
    return p.length ? ` (${p.join(', ')})` : '';
};
const texto = (t: string | null | undefined) => (t ?? '').trim();
/** «Revisión técnica» → «revisión técnica»; una sigla («SOAP») queda igual. */
export const minuscula = (s: string) => (/^[A-ZÁÉÍÓÚÑ][a-záéíóúñü]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);
/** «Contrato de Trabajo (Bóveda)» → «Contrato de Trabajo». */
export const sinSufijo = (t: string) => t.replace(/\s*\(Bóveda\)\s*$/i, '').trim();
/** «venció hace 23 días» / «vence hoy» / «vence en 9 días». */
export const textoVence = (d: number) => (d < 0 ? `venció hace ${dias(-d)}` : d === 0 ? 'vence hoy' : `vence en ${dias(d)}`);

// ─────────────────────────────── El mensaje de un tema ───────────────────────────────

/** Líneas «•» antes de «y N más» (el enlace de WhatsApp tiene un largo máximo). */
export const MAX_LINEAS = 20;

/**
 * Encabezado, una línea «•» por pendiente (hasta MAX_LINEAS) y el cierre. `total` = la cifra real del tema (la lista
 * puede venir con el tope del servidor): lo que no cabe va como «y N más».
 */
export function armarMensaje(encabezado: string, lineas: readonly string[], cierre: string, total: number = lineas.length): string {
    const vistas = lineas.slice(0, MAX_LINEAS);
    const resto = Math.max(0, total - vistas.length);
    return [
        encabezado,
        ...vistas.map(l => `• ${l}`),
        ...(resto > 0 ? [`• y ${resto} más`] : []),
        cierre,
    ].join('\n');
}

// ─────────────────────────────── 1. Faltas reiteradas ───────────────────────────────

/** Las causales, cortas, para la línea del mensaje. */
export const CAUSAL_CORTA: Record<CausalFalta, string> = {
    seguidos: '2 días seguidos',
    lunes: '2 lunes',
    tres: '3 o más',
};

type Falta = FaltasGerenciaApi['lista'][number];

/** «Jorge Contreras (Domeyko): faltó el lun 5, lun 12, mar 13 y lun 19 (4 faltas; 2 días seguidos, 2 lunes, 3 o más)». */
export function lineaFalta(r: Falta): string {
    const n = r.fechas.length;
    const cuando = n ? `faltó el ${enLista(r.fechas.map(diaCorto))}` : 'faltó';
    const detalle = [`${n} ${plural(n, 'falta', 'faltas')}`, r.causales.map(c => CAUSAL_CORTA[c]).join(', ')].filter(Boolean).join('; ');
    return limpiar(`${texto(r.nombre) || 'Trabajador sin nombre'}${entreParentesis(r.obra)}: ${cuando} (${detalle})`);
}

export function mensajeFaltas(lista: readonly Falta[], total: number = lista.length): string {
    const uno = total === 1;
    return armarMensaje(
        uno ? 'Hola, este trabajador cumple una causal del Art. 160 N°3 este mes:' : 'Hola, estos trabajadores cumplen una causal del Art. 160 N°3 este mes:',
        lista.map(lineaFalta),
        `¿Qué pasó? ¿Se conversó con ${uno ? 'él' : 'ellos'} o se va a preparar la carta? Me cuentan, por favor.`,
        total,
    );
}

// ─────────────────────────────── 2. Papeles de vehículos ───────────────────────────────

type Vehiculo = Pick<VehiculoPapelesApi, 'patente' | 'marca' | 'modelo' | 'conductor_nombre'>;
type PapelUrgente = Pick<Urgente, 'nombre' | 'conArticulo' | 'dias'>;

/** «vencido hace 23 días» / «por vencer hoy» / «por vencer en 9 días», concordando con el papel (la póliza → vencida). */
function estadoPapel(u: Pick<Urgente, 'conArticulo' | 'dias'>): string {
    const a = u.conArticulo.startsWith('la ') ? 'a' : 'o';
    if (u.dias < 0) return `vencid${a} hace ${dias(-u.dias)}`;
    return u.dias === 0 ? 'por vencer hoy' : `por vencer en ${dias(u.dias)}`;
}
const marcaModelo = (v: Vehiculo) => tituloVehiculo({ ...v, patente: '' } as VehiculoPapelesApi) || null;

/** «FZRC-35 (Hyundai Porter, lo maneja Marcelo Aguilera): permiso de circulación vencido hace 52 días». */
export function lineaVehiculo(v: Vehiculo, u: PapelUrgente): string {
    const conductor = texto(v.conductor_nombre);
    return limpiar(`${texto(v.patente).toUpperCase()}${entreParentesis(marcaModelo(v), conductor && `lo maneja ${conductor}`)}: ${minuscula(u.nombre)} ${estadoPapel(u)}`);
}

export function mensajeVehiculos(pendientes: readonly { v: Vehiculo; u: PapelUrgente }[], total: number = pendientes.length): string {
    const vencidos = pendientes.filter(p => p.u.dias < 0).length;
    const que = vencidos === pendientes.length ? 'vencidos' : vencidos === 0 ? 'por vencer' : 'vencidos o por vencer';
    const uno = total === 1;
    return armarMensaje(
        uno ? `Hola, este vehículo tiene un papel ${vencidos ? 'vencido' : 'por vencer'}:` : `Hola, estos vehículos tienen papeles ${que}:`,
        pendientes.map(p => lineaVehiculo(p.v, p.u)),
        `¿Qué pasó? Necesito que se ${uno ? 'renueve' : 'renueven'} esta semana. Me avisan cuando ${uno ? 'esté listo' : 'estén listos'}.`,
        total,
    );
}

// ─────────────────────────────── 3. Pérdidas en Inventario ───────────────────────────────

/**
 * «TRF-202610-0027 (Bodega Cerrillos → Gorbea 3082): llegaron 12 unidades de Placa terciado menos de lo que salió, unos
 * $407.880; lo recibió Carla Soto hace 7 días». El monto, solo con permiso de valores.
 */
export function lineaPerdida(p: PerdidaApi, conValores = false): string {
    const ruta = [texto(p.origen), texto(p.destino)].filter(Boolean).join(' → ');
    const monto = conValores && p.valor ? `, unos ${formatCLP(p.valor)}` : '';
    const cuando = p.dias <= 0 ? 'hoy' : `hace ${dias(p.dias)}`;
    const recibio = texto(p.recibio) ? `lo recibió ${texto(p.recibio)} ${cuando}` : `se recibió ${cuando}`;
    return limpiar(`${p.codigo}${ruta ? ` (${ruta})` : ''}: ${plural(p.faltan, 'llegó', 'llegaron')} ${cantidad(p.faltan, p.unidad)} de ${texto(p.descripcion) || 'un ítem'} menos de lo que salió${monto}; ${recibio}`);
}

/** `quien` = el primer nombre de quien aprueba (si es uno), para pedirle que las resuelva. `totalPesos` solo con valores. */
export function mensajePerdidas(
    lista: readonly PerdidaApi[],
    { total = lista.length, quien = null, conValores = false, totalPesos = null }:
        { total?: number; quien?: string | null; conValores?: boolean; totalPesos?: number | null } = {},
): string {
    const uno = total === 1;
    const pesos = conValores && totalPesos ? `, unos ${formatCLP(totalPesos)} en total` : '';
    return armarMensaje(
        uno
            ? `Hola, esta solicitud llegó con menos de lo que salió y sigue sin aclararse${pesos}:`
            : `Hola, estas solicitudes llegaron con menos de lo que salió y siguen sin aclararse${pesos}:`,
        lista.map(p => lineaPerdida(p, conValores)),
        `¿Qué pasó? ${quien ? `${quien}, ¿${uno ? 'la' : 'las'} puedes revisar y resolver?` : `¿Quién ${uno ? 'la' : 'las'} puede revisar y resolver?`}`,
        total,
    );
}

// ─────────────────────────────── 4. Documentos de trabajadores ───────────────────────────────

type Documento = DocumentosGerenciaApi['lista'][number];

/** «Iván Saavedra Lagos (Gorbea 3082): Examen preocupacional, venció hace 41 días». */
export const lineaDocumento = (d: Documento) =>
    limpiar(`${texto(d.nombre) || 'Trabajador sin nombre'}${entreParentesis(d.obra)}: ${texto(d.tipo) || 'un documento'}, ${textoVence(d.dias)}`);

export function mensajeDocumentos(lista: readonly Documento[], total: number = lista.length): string {
    const uno = total === 1;
    const vencidos = lista.filter(d => d.dias < 0).length;
    const que = vencidos === lista.length ? (uno ? 'vencido' : 'vencidos') : vencidos === 0 ? 'por vencer' : 'vencidos o por vencer';
    return armarMensaje(
        uno ? `Hola, este documento de un trabajador está ${que}:` : `Hola, estos documentos de trabajadores están ${que}:`,
        lista.map(lineaDocumento),
        `Si llega una fiscalización es multa. ¿Qué pasó? ¿Cuándo se ${uno ? 'renueva' : 'renuevan'}?`,
        total,
    );
}

// ─────────────────────────────── 5. Papeles laborales atrasados ───────────────────────────────

/** Dónde está el papel, dicho para un mensaje («impreso y sin portador»). */
export const ESTADO_PAPEL: Record<EtapaDocumento, string> = {
    sin_imprimir: 'sin imprimir',
    por_retirar: 'impreso y sin portador',
    por_confirmar: 'en oficina, esperando que lo retiren',
    en_terreno: 'en terreno sin volver firmado',
};

/** «hace 15 días»; en terreno cuentan días HÁBILES (tenencia de 4, documentosAlertas). */
const hacePapel = (p: Pick<PapelLaboralApi, 'etapa' | 'dias'>) =>
    (p.etapa === 'en_terreno' ? `hace ${p.dias} ${plural(p.dias, 'día hábil', 'días hábiles')}` : `hace ${dias(p.dias)}`);

/** «Contrato de Trabajo de Diego Morales (Gorbea 3082): impreso y sin portador hace 15 días». */
export const lineaPapel = (p: PapelLaboralApi) =>
    limpiar(`${sinSufijo(p.tipo_nombre) || 'Documento'} de ${texto(p.trabajador?.nombre) || 'un trabajador'}${entreParentesis(p.obra_nombre)}: ${ESTADO_PAPEL[p.etapa] ?? 'pendiente'} ${hacePapel(p)}`);

export function mensajePapeles(lista: readonly PapelLaboralApi[], total: number = lista.length): string {
    const uno = total === 1;
    return armarMensaje(
        uno ? 'Hola, este papel laboral sigue atrasado:' : 'Hola, estos papeles laborales siguen atrasados:',
        lista.map(lineaPapel),
        `¿Qué pasó? ¿Quién ${uno ? 'lo' : 'los'} puede resolver esta semana?`,
        total,
    );
}

// ─────────────────────────────── 6. Solicitudes trabadas ───────────────────────────────

/** «Carla Soto para Gorbea 3082 (Arnés de seguridad ×6 y Línea de vida ×2): 16 días esperando · TRF-202610-0012». */
export function lineaSolicitud(s: SolicitudTrabadaApi): string {
    const partes = [texto(s.solicitante), texto(s.destino) && `para ${texto(s.destino)}`].filter(Boolean).join(' ');
    const quien = partes ? partes.charAt(0).toUpperCase() + partes.slice(1) : 'Solicitud';
    const items = s.items.length
        ? ` (${fraseItems(s.items.map(i => ({ descripcion: i.descripcion ?? '', unidad: i.unidad, pedida: i.pedida })), { max: 3 })})`
        : '';
    return limpiar(`${quien}${items}: ${dias(s.dias)} esperando · ${s.codigo}`);
}

/** Dirigido a quien aprueba (`quien`, su primer nombre si es uno solo). */
export function mensajeSolicitudes(
    lista: readonly SolicitudTrabadaApi[],
    { total = lista.length, quien = null, diasLimite = 10 }: { total?: number; quien?: string | null; diasLimite?: number } = {},
): string {
    const uno = total === 1;
    return armarMensaje(
        `Hola${quien ? ` ${quien}` : ''}, ${uno ? 'esta solicitud de materiales lleva' : 'estas solicitudes de materiales llevan'} más de ${diasLimite} días esperando aprobación:`,
        lista.map(lineaSolicitud),
        `¿Qué pasó? ${quien ? `¿${uno ? 'La' : 'Las'} puedes aprobar o rechazar hoy?` : `¿Quién ${uno ? 'la' : 'las'} puede aprobar o rechazar hoy?`}`,
        total,
    );
}
