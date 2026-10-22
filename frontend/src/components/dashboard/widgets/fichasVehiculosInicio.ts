import type { TonoTarjeta } from './tarjetaActiva';
import { nombreCorto, plural } from './fichasInicio';

/**
 * Lógica sin dibujo de «Vehículos · fichas por vehículo» del detalle del Inicio (2026-10-22, Marcos eligió la
 * opción A del lienzo). Los datos vienen de `GET /vehiculos/papeles?dias=30`: por vehículo, sus cinco papeles
 * (el registro más reciente de cada uno) más lo que requiere acción fuera de esos cinco. El dibujo vive en
 * `DetalleVehiculos.tsx`.
 */

// ── Contrato de la API ────────────────────────────────────────────────────────

export type PapelClave = 'permiso' | 'poliza' | 'tecnica' | 'gases' | 'mantencion';
export type EstadoPapel = 'vencido' | 'por_vencer' | 'vigente' | 'sin_fecha' | 'sin_registro';

/** Uno de los cinco papeles del semáforo (siempre llegan los cinco, en el orden de PAPELES_META). */
export interface PapelApi {
    clave: PapelClave;
    /** Según la fecha real, avise o no. */
    estado: EstadoPapel;
    categoria: 'documento' | 'revision' | 'mantencion' | 'seguro' | 'permiso' | null;
    subtipo: string | null;
    registro_id: number | null;
    fecha_vencimiento: string | null;
    dias_restantes: number | null;
    /** El aviso de 30 días está prendido: solo así cuenta en «requiere acción». */
    avisa: boolean;
}

/** Lo que requiere acción y no es uno de los cinco (seguro a terceros, revisión mecánica, fin de leasing…). */
export interface PapelOtroApi {
    categoria: string;
    subtipo: string | null;
    /** Texto legible: «Seguro a terceros», «Revisión mecánica», «Fin de leasing»… */
    nombre: string;
    registro_id: number | null;
    fecha_vencimiento: string;
    dias_restantes: number;
    estado: 'vencido' | 'por_vencer';
}

export interface VehiculoPapelesApi {
    vehiculo_id: number;
    patente: string;
    marca: string;
    modelo: string | null;
    tipo: string | null;
    empresa_id: number | null;
    empresa_nombre: string | null;
    conductor_id: number | null;
    conductor_nombre: string | null;
    papeles: PapelApi[];
    otros: PapelOtroApi[];
    /** Cuántos de papeles + otros están vencidos o por vencer Y avisan. */
    requiere_accion: number;
    /** Ídem, solo vencidos. */
    vencidos: number;
    peor_dias: number | null;
}

export interface PapelesFlotaApi {
    dias: number;
    total_vehiculos: number;
    vehiculos: VehiculoPapelesApi[];
}

// ── Los cinco papeles ─────────────────────────────────────────────────────────

/** Tipo del formulario de `VehiculoDocumentos` (arreglo TIPOS) que abre «Subir el nuevo». */
export type TipoDocumentoPapel = 'permiso_circulacion' | 'poliza' | 'revision_tecnica' | 'revision_gases' | 'mantencion';

export interface MetaPapel {
    clave: PapelClave;
    nombre: string;
    /** Etiqueta del semáforo y de la píldora. */
    corto: string;
    /** Para la frase: «Vence la póliza de seguro en 6 días». */
    conArticulo: string;
    tipoDocumento: TipoDocumentoPapel;
}

/** En el orden del semáforo. */
export const PAPELES_META: readonly MetaPapel[] = [
    { clave: 'permiso', nombre: 'Permiso de circulación', corto: 'Permiso', conArticulo: 'el permiso de circulación', tipoDocumento: 'permiso_circulacion' },
    { clave: 'poliza', nombre: 'Póliza de seguro', corto: 'Póliza', conArticulo: 'la póliza de seguro', tipoDocumento: 'poliza' },
    { clave: 'tecnica', nombre: 'Revisión técnica', corto: 'Técnica', conArticulo: 'la revisión técnica', tipoDocumento: 'revision_tecnica' },
    { clave: 'gases', nombre: 'Revisión de gases', corto: 'Gases', conArticulo: 'la revisión de gases', tipoDocumento: 'revision_gases' },
    { clave: 'mantencion', nombre: 'Mantención', corto: 'Mant.', conArticulo: 'la mantención', tipoDocumento: 'mantencion' },
];

const META = {} as Record<PapelClave, MetaPapel>;
for (const m of PAPELES_META) META[m.clave] = m;

/** `?papel=` de la URL → clave válida, o null si no es uno de los cinco. */
export const papelDesdeUrl = (valor: string | null | undefined): PapelClave | null =>
    PAPELES_META.find(m => m.clave === valor)?.clave ?? null;

export const tipoDocumentoDePapel = (clave: PapelClave): TipoDocumentoPapel => META[clave].tipoDocumento;

// ── Lo urgente de un vehículo ─────────────────────────────────────────────────

/** Un papel vencido o por vencer que avisa (de los cinco o de «otros»), ya listo para la frase y la píldora. */
export interface Urgente {
    /** null = no es de los cinco (viene de `otros`). */
    clave: PapelClave | null;
    nombre: string;
    corto: string;
    conArticulo: string;
    dias: number;
}

/** Píldora corta de lo que no es de los cinco; si no está, va su nombre entero. */
const CORTO_OTRO: Record<string, string> = {
    seguro_terceros: 'Seguro a terceros',
    mecanica: 'Mecánica',
    fin_leasing: 'Leasing',
    primera_inscripcion: 'Inscripción',
    certificado_primera_inscripcion: 'Certificado',
};

/** «Revisión mecánica» → «revisión mecánica»; una sigla («SOAP») queda igual. */
const minuscula = (s: string) => (/^[A-ZÁÉÍÓÚÑ][a-záéíóúñü]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);

/** Artículo por la primera palabra: «la» si termina en -a, -ión, -dad o -tud (póliza, revisión); si no, «el». */
const articulo = (nombre: string) => (/(a|ión|dad|tud)$/i.test(nombre.trim().split(/\s+/)[0] ?? '') ? 'la' : 'el');

const urgenteDeOtro = (o: PapelOtroApi): Urgente => {
    const leasing = o.categoria === 'leasing' || o.subtipo === 'fin_leasing';
    return {
        clave: null,
        nombre: o.nombre,
        corto: (o.subtipo && CORTO_OTRO[o.subtipo]) || (leasing ? 'Leasing' : o.nombre),
        // «Vence el leasing en 20 días» (no «el fin de leasing»).
        conArticulo: leasing ? 'el leasing' : `${articulo(o.nombre)} ${minuscula(o.nombre)}`,
        dias: o.dias_restantes,
    };
};

/**
 * Lo que requiere acción: los cinco papeles vencidos o por vencer QUE AVISAN, más `otros`, del más vencido
 * al más holgado (a igual plazo, primero los cinco en su orden). Un papel con el aviso apagado igual se pinta
 * en el semáforo, pero no entra acá (como el número del menú).
 */
export const urgentes = (v: VehiculoPapelesApi): Urgente[] => [
    ...v.papeles
        .filter(p => (p.estado === 'vencido' || p.estado === 'por_vencer') && p.avisa && p.dias_restantes != null)
        .map(p => {
            const { clave, nombre, corto, conArticulo } = META[p.clave];
            return { clave, nombre, corto, conArticulo, dias: p.dias_restantes as number };
        }),
    ...v.otros.map(urgenteDeOtro),
].sort((a, b) => a.dias - b.dias);

const dias = (n: number) => `${n} ${plural(n, 'día', 'días')}`;

/** «Venció la revisión de gases hace 124 días. Vence la póliza de seguro en 6 días.» */
export const fraseVehiculo = (urg: Urgente[]) =>
    urg.map(u => (u.dias < 0
        ? `Venció ${u.conArticulo} hace ${dias(-u.dias)}.`
        : `Vence ${u.conArticulo} ${u.dias === 0 ? 'hoy' : `en ${dias(u.dias)}`}.`)).join(' ');

/** «Gases · vencido» en rojo; «Póliza · hoy» o «Póliza · 6 d» en ámbar. */
export const pildora = (u: Urgente): { texto: string; tono: TonoTarjeta } => ({
    texto: `${u.corto} · ${u.dias < 0 ? 'vencido' : u.dias === 0 ? 'hoy' : `${u.dias} d`}`,
    tono: u.dias < 0 ? 'rojo' : 'ambar',
});

/** Rojo si algo venció; si no, ámbar (la ficha solo existe si algo requiere acción). */
export const tonoFicha = (v: VehiculoPapelesApi): TonoTarjeta => (v.vencidos > 0 ? 'rojo' : 'ambar');

/** Las fichas del detalle: cada vehículo con lo urgente; uno sin nada urgente no va (en el orden del servidor). */
export const fichasVehiculos = (data: PapelesFlotaApi | null) =>
    (data?.vehiculos ?? []).map(v => ({ v, urg: urgentes(v) })).filter(f => f.urg.length > 0);

// ── Semáforo de los cinco papeles ─────────────────────────────────────────────

/** Cuadro del semáforo: sin verde (al día = gris, como el día hábil de Asistencia); sin registro = punteado. */
export type TonoCelda = 'rojo' | 'ambar' | 'neutro' | 'punteado';

export const tonoCelda = (estado: EstadoPapel): TonoCelda =>
    estado === 'vencido' ? 'rojo' : estado === 'por_vencer' ? 'ambar' : estado === 'sin_registro' ? 'punteado' : 'neutro';

export const ESTADO_EN_PALABRAS: Record<EstadoPapel, string> = {
    vencido: 'vencido',
    por_vencer: 'por vencer',
    vigente: 'al día',
    sin_fecha: 'sin fecha',
    sin_registro: 'sin registro',
};

/** Los cinco en el orden del semáforo; si alguno no llegó, cuenta como sin registro. */
export const ordenSemaforo = (papeles: PapelApi[]): PapelApi[] =>
    PAPELES_META.map(m => papeles.find(p => p.clave === m.clave) ?? {
        clave: m.clave, estado: 'sin_registro', categoria: null, subtipo: null,
        registro_id: null, fecha_vencimiento: null, dias_restantes: null, avisa: false,
    });

/** «Permiso de circulación: al día, Póliza de seguro: vencido, …» (lector de pantalla). */
export const ariaSemaforo = (papeles: PapelApi[]) =>
    ordenSemaforo(papeles).map(p => `${META[p.clave].nombre}: ${ESTADO_EN_PALABRAS[p.estado]}`).join(', ');

// ── Textos de la ficha ────────────────────────────────────────────────────────

/** Primer nombre del conductor, bien escrito aunque el catálogo lo tenga en mayúsculas («JUAN PÉREZ» → «Juan»). */
export const primerNombre = (nombre: string | null | undefined) => {
    const n = nombreCorto(nombre ?? '');
    return n.length > 1 && n === n.toUpperCase() && n !== n.toLowerCase() ? n[0] + n.slice(1).toLowerCase() : n;
};

/** «Toyota Hilux» (sin modelo, solo la marca). */
export const tituloVehiculo = (v: VehiculoPapelesApi) => [v.marca, v.modelo].filter(Boolean).join(' ').trim() || v.patente;

/** «KDPW-31 · conduce Óscar Núñez» o «KDPW-31 · sin conductor asignado». */
export const bajadaVehiculo = (v: VehiculoPapelesApi) =>
    `${v.patente} · ${v.conductor_nombre?.trim() ? `conduce ${v.conductor_nombre.trim()}` : 'sin conductor asignado'}`;

/** No hay teléfono del conductor en ninguna tabla: WhatsApp se abre con el texto y la persona elige a quién. */
export const textoAvisar = (v: VehiculoPapelesApi) => {
    const n = primerNombre(v.conductor_nombre);
    return n ? `Avisar a ${n}` : 'Avisar por WhatsApp';
};

/** «a», «a y b», «a, b y c». */
const enumerar = (partes: string[]) =>
    partes.length <= 1 ? (partes[0] ?? '') : `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`;

/**
 * «Hola Óscar, al KDPW-31 se le venció la revisión de gases hace 124 días y le vence la póliza de seguro en
 * 6 días. Coordinemos para dejarlo al día.» Sin conductor: «Hola, al …».
 */
export const mensajeWhatsApp = (v: VehiculoPapelesApi, urg: Urgente[]) => {
    const n = primerNombre(v.conductor_nombre);
    const saludo = n ? `Hola ${n}` : 'Hola';
    const patente = v.patente.toUpperCase();
    if (urg.length === 0) return `${saludo}, revisemos los papeles del ${patente}.`;
    const lista = enumerar(urg.map(u => (u.dias < 0
        ? `se le venció ${u.conArticulo} hace ${dias(-u.dias)}`
        : `le vence ${u.conArticulo} ${u.dias === 0 ? 'hoy' : `en ${dias(u.dias)}`}`)));
    return `${saludo}, al ${patente} ${lista}. Coordinemos para dejarlo al día.`;
};

/**
 * «Subir el nuevo» / «Ver vehículo»: abre Vehículos en ese vehículo y, si lo más urgente es uno de los cinco,
 * en su papel (`urg` en el orden de `urgentes`). `?papel=` solo acepta los cinco: lo de `otros` (seguro a
 * terceros, revisión mecánica, fin de leasing) va solo al vehículo.
 */
export const rutaSubir = (v: VehiculoPapelesApi, urg: Urgente[]) => {
    const clave = urg[0]?.clave;
    return `/vehiculos?vehiculo=${v.vehiculo_id}${clave ? `&papel=${clave}` : ''}`;
};

/** Categorías que Vehículos sabe renovar desde el enlace (las tablas antiguas de seguros y permisos no). */
const RENOVABLES: ReadonlyArray<PapelApi['categoria']> = ['documento', 'revision', 'mantencion'];

/**
 * ¿El enlace abrirá un formulario? Así el botón dice «Subir el nuevo» solo si es verdad (si no, «Ver vehículo»).
 * Mismo criterio que `abrirPorEnlace` de VehiculoDocumentos: si el papel más urgente ya tiene registro en las
 * tablas actuales se renueva (pide editar); si no tiene, o viene de una tabla antigua, se agrega (pide crear).
 */
export const abreFormulario = (v: VehiculoPapelesApi, urg: Urgente[], puede: { editar: boolean; crear: boolean }) => {
    const clave = urg[0]?.clave;
    if (!clave) return false;
    const reg = v.papeles.find(p => p.clave === clave);
    const renueva = !!reg && reg.registro_id != null && RENOVABLES.includes(reg.categoria);
    return renueva ? puede.editar : puede.crear;
};

// ── Calendario (Marcos 2026-10-22: la opción B «Calendario» + la ficha de la opción A al tocar) ─────────

/** Un papel vencido o por vencer que avisa, con su fecha: lo que va en el calendario y en sus listas. */
export interface EventoPapel {
    key: string;
    vehiculo_id: number;
    patente: string;
    /** «HINO FC 1118 AT». */
    vehiculo: string;
    /** 'YYYY-MM-DD'. */
    fecha: string;
    /** Negativo = vencido hace N días; 0 = hoy. */
    dias: number;
    /** «Revisión técnica», «Fin de leasing»… */
    papel: string;
    /** null = no es de los cinco (viene de `otros`). */
    clave: PapelClave | null;
    estado: 'vencido' | 'por_vencer';
}

/** Lo mismo que las fichas (vencido o por vencer, y avisa), papel por papel y con fecha. */
export function eventosFlota(data: PapelesFlotaApi | null): EventoPapel[] {
    if (!data) return [];
    const out: EventoPapel[] = [];
    for (const v of data.vehiculos) {
        const base = { vehiculo_id: v.vehiculo_id, patente: v.patente, vehiculo: tituloVehiculo(v) };
        for (const p of v.papeles) {
            if ((p.estado !== 'vencido' && p.estado !== 'por_vencer') || !p.avisa || !p.fecha_vencimiento || p.dias_restantes == null) continue;
            out.push({ ...base, key: `${v.vehiculo_id}-${p.clave}`, fecha: p.fecha_vencimiento.slice(0, 10), dias: p.dias_restantes,
                papel: META[p.clave].nombre, clave: p.clave, estado: p.estado });
        }
        v.otros.forEach((o, i) => out.push({ ...base, key: `${v.vehiculo_id}-otro-${o.categoria}-${o.subtipo ?? ''}-${o.registro_id ?? i}`,
            fecha: o.fecha_vencimiento.slice(0, 10), dias: o.dias_restantes, papel: o.nombre, clave: null, estado: o.estado }));
    }
    return out.sort((a, b) => a.dias - b.dias || a.patente.localeCompare(b.patente, 'es') || a.papel.localeCompare(b.papel, 'es'));
}

/** «venció hace 124 días» · «vence hoy» · «vence en 8 días». */
export const textoPlazo = (d: number) =>
    (d < 0 ? `venció hace ${dias(-d)}` : d === 0 ? 'vence hoy' : `vence en ${dias(d)}`);

/** La urgencia de ESE papel, para el WhatsApp de una fila («Hola Juan, al PRLG-45 le vence…»). */
export const urgenteDeEvento = (v: VehiculoPapelesApi, e: EventoPapel): Urgente[] =>
    urgentes(v).filter(u => (e.clave ? u.clave === e.clave : u.clave == null && u.nombre === e.papel)).slice(0, 1);

/** Hoy en la hora local, 'YYYY-MM-DD'. */
export const hoyIso = (d: Date = new Date()) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const aUtc = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const deUtc = (t: number) => new Date(t).toISOString().slice(0, 10);

/** «24 oct». */
export const fechaCorta = (iso: string) => `${Number(iso.slice(8, 10))} ${MESES_CORTOS[Number(iso.slice(5, 7)) - 1]}`;
/** «vie 6 nov». */
export const fechaConDia = (iso: string) => `${DIAS_CORTOS[new Date(aUtc(iso)).getUTCDay()]} ${fechaCorta(iso)}`;

export interface DiaCalendario {
    iso: string;
    /** Número del día del mes. */
    num: number;
    /** Ya pasó (antes de hoy). */
    pasado: boolean;
    hoy: boolean;
    /** Lo que vence ese día (por vencer; lo ya vencido va en la lista de la izquierda). */
    eventos: EventoPapel[];
}

/** Cinco semanas desde el lunes de esta semana (como el lienzo): ~30 días hacia adelante. */
export function diasCalendario(hoy: string, eventos: EventoPapel[], semanas = 5): DiaCalendario[] {
    const t0 = aUtc(hoy);
    const lunes = t0 - ((new Date(t0).getUTCDay() + 6) % 7) * 86_400_000;
    const porDia = new Map<string, EventoPapel[]>();
    for (const e of eventos) if (e.estado === 'por_vencer') porDia.set(e.fecha, [...(porDia.get(e.fecha) ?? []), e]);
    return Array.from({ length: semanas * 7 }, (_, i) => {
        const iso = deUtc(lunes + i * 86_400_000);
        return { iso, num: Number(iso.slice(8, 10)), pasado: iso < hoy, hoy: iso === hoy, eventos: porDia.get(iso) ?? [] };
    });
}

