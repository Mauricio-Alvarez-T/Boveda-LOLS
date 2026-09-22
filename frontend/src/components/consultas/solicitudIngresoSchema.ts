/**
 * Ficha de ingreso digital — schema zod + helpers PUROS compartidos por los tres
 * formularios que la editan: `SolicitudIngresoForm` (terreno), `RevisarSolicitudModal`
 * (oficina, agrega empresa + categoría) y `WorkerForm` (los mismos "Datos
 * personales" en la ficha del trabajador).
 *
 * Decisión del dueño (2026-09-07): campos = solo los marcados a mano en la ficha
 * de papel. ○ obligatorios: RUT, nombres, apellido paterno, cargo, obra, fecha de
 * ingreso. — opcionales: los "Datos personales". EMPRESA la define la oficina al
 * aprobar (no está en la ficha de terreno).
 *
 * En el form los opcionales viven como STRING ('' = vacío) porque así los entrega
 * `register()`; `normalizarDatosPersonales` los traduce a la API ('' → null,
 * cargas → número). El backend (validateBody) acepta null en opcionales.
 */
import * as z from 'zod';
import { validateRut } from '../../utils/rut';
import { fmtFecha, normalizarFecha } from '../../utils/format';
import type { SolicitudIngreso } from '../../types/entities';
import { BANCO_CUENTA_RUT, TIPOS_CUENTA } from '../../config/catalogosPersonales';

export const ESTADO_CIVIL_OPTIONS = [
    { value: 'Soltero/a', label: 'Soltero/a' },
    { value: 'Casado/a', label: 'Casado/a' },
    { value: 'Conviviente civil', label: 'Conviviente civil' },
    { value: 'Divorciado/a', label: 'Divorciado/a' },
    { value: 'Viudo/a', label: 'Viudo/a' },
] as const;

export const CATEGORIA_REPORTE_OPTIONS = [
    { value: 'obra', label: 'Obra' },
    { value: 'operaciones', label: 'Operaciones' },
    { value: 'rotativo', label: 'Personal rotativo' },
] as const;

/** Avisos del check de RUT en vivo. Textos acordados con el dueño (2026-09-07): solo texto, sin link. */
export const avisoRutExiste = (nombre: string) =>
    `Ya existe un trabajador con este RUT (${nombre}). Revisa si hay un error en la digitación; si el RUT es correcto, contacta a administración vía WhatsApp.`;
export const AVISO_SOLICITUD_PENDIENTE = 'Ya hay una solicitud de ingreso pendiente para este RUT.';

/**
 * Campos opcionales de la ficha ("Datos personales" + tallas + pago). Todos string en
 * el form. `cuenta_rut` es 'si' | 'no' | '' (select) y viaja a la API como boolean|null.
 */
const tallaStr = (min: number, max: number) => z.string().optional()
    .refine(v => !v || (/^\d+$/.test(v.trim()) && Number(v) >= min && Number(v) <= max), `Entre ${min} y ${max}`);

export const datosPersonalesSchema = z.object({
    fecha_nacimiento: z.string().optional(),
    estado_civil: z.string().optional(),
    direccion: z.string().optional(),
    comuna: z.string().optional(),
    afp: z.string().optional(),
    salud: z.string().optional(),
    nacionalidad: z.string().optional(),
    telefono: z.string().optional(),
    cargas_familiares: z.string().optional()
        .refine(v => !v || /^\d+$/.test(v.trim()), 'Debe ser un número entero mayor o igual a 0'),
    talla_calzado: tallaStr(35, 47),
    talla_pantalon: tallaStr(38, 50),
    talla_polera: z.string().optional(),
    cuenta_rut: z.string().optional().refine(v => !v || v === 'si' || v === 'no', 'Selecciona Sí o No'),
    banco: z.string().optional(),
    tipo_cuenta: z.string().optional().refine(v => !v || v === 'vista' || v === 'corriente', 'Selecciona el tipo de cuenta'),
    numero_cuenta: z.string().optional()
        .refine(v => !v || /^[A-Za-z0-9-]{1,30}$/.test(v.trim()), 'Solo dígitos, letras y guiones (máx. 30)'),
});

/** Ficha que llena TERRENO (○ + —). Sin empresa: la pone la oficina al aprobar. */
export const solicitudIngresoSchema = datosPersonalesSchema.extend({
    rut: z.string().min(1, 'El RUT es requerido').refine(validateRut, 'RUT inválido'),
    nombres: z.string().trim().min(2, 'Requerido'),
    apellido_paterno: z.string().trim().min(2, 'Requerido'),
    apellido_materno: z.string().optional(),
    // Los IDs llegan como 0 cuando no hay selección — así el .min(1) muestra el mensaje en español.
    cargo_id: z.coerce.number().min(1, 'Selecciona un cargo'),
    obra_id: z.coerce.number().min(1, 'Selecciona una obra'),
    fecha_ingreso: z.string().min(1, 'La fecha de ingreso es requerida'),
    observaciones: z.string().optional(),
});

/** Ficha FINAL que aprueba la oficina: la de terreno + empresa obligatoria + categoría de reporte. */
export const aprobarSolicitudSchema = solicitudIngresoSchema.extend({
    empresa_id: z.coerce.number().min(1, 'Selecciona una empresa'),
    categoria_reporte: z.enum(['obra', 'operaciones', 'rotativo'], {
        error: () => ({ message: 'Selecciona una categoría de reporte' }),
    }),
});

export type DatosPersonalesFormValues = z.infer<typeof datosPersonalesSchema>;
export type SolicitudIngresoFormValues = z.infer<typeof solicitudIngresoSchema>;
export type AprobarSolicitudFormValues = z.infer<typeof aprobarSolicitudSchema>;

export type DatosPersonalesKey = keyof DatosPersonalesFormValues;

/** Orden y rótulo de los datos personales (form, quick-view y ficha en solo-lectura). */
export const DATOS_PERSONALES_LABELS: Record<DatosPersonalesKey, string> = {
    fecha_nacimiento: 'Fecha de nacimiento',
    estado_civil: 'Estado civil',
    nacionalidad: 'Nacionalidad',
    direccion: 'Dirección',
    comuna: 'Comuna',
    telefono: 'Teléfono',
    afp: 'AFP',
    salud: 'Salud',
    cargas_familiares: 'Cargas familiares',
    talla_calzado: 'Calzado',
    talla_pantalon: 'Pantalón',
    talla_polera: 'Polera',
    cuenta_rut: 'Cuenta RUT',
    banco: 'Banco',
    tipo_cuenta: 'Tipo de cuenta',
    numero_cuenta: 'N° de cuenta',
};

const etiquetaTipoCuenta = (v: string) => TIPOS_CUENTA.find(t => t.value === v)?.label ?? v;

/** '' / espacios / null → null; si no, el texto sin espacios en los bordes. */
const strOrNull = (v: string | null | undefined): string | null => {
    const t = (v ?? '').trim();
    return t ? t : null;
};

/**
 * Normaliza los opcionales para la API: '' → null, números a number (o null),
 * cuenta_rut 'si'/'no' → true/false. Con cuenta RUT = Sí el banco y el tipo van
 * fijos (BancoEstado / vista) y el número lo deriva el backend del RUT (va null).
 */
export function normalizarDatosPersonales(d: DatosPersonalesFormValues) {
    const cargas = strOrNull(d.cargas_familiares);
    const num = (v: string | null | undefined) => { const s = strOrNull(v); return s == null ? null : Number(s); };
    const cuentaRut = d.cuenta_rut === 'si' ? true : d.cuenta_rut === 'no' ? false : null;
    return {
        fecha_nacimiento: strOrNull(d.fecha_nacimiento),
        estado_civil: strOrNull(d.estado_civil),
        direccion: strOrNull(d.direccion),
        comuna: strOrNull(d.comuna),
        afp: strOrNull(d.afp),
        salud: strOrNull(d.salud),
        nacionalidad: strOrNull(d.nacionalidad),
        telefono: strOrNull(d.telefono),
        cargas_familiares: cargas == null ? null : Number(cargas),
        talla_calzado: num(d.talla_calzado),
        talla_pantalon: num(d.talla_pantalon),
        talla_polera: strOrNull(d.talla_polera),
        cuenta_rut: cuentaRut,
        banco: cuentaRut === true ? BANCO_CUENTA_RUT : strOrNull(d.banco),
        tipo_cuenta: cuentaRut === true ? 'vista' : strOrNull(d.tipo_cuenta),
        numero_cuenta: cuentaRut === true ? null : strOrNull(d.numero_cuenta),
    };
}

/** Body de POST /solicitudes-ingreso (ficha de terreno). */
export function buildSolicitudPayload(d: SolicitudIngresoFormValues) {
    return {
        rut: d.rut,
        nombres: d.nombres.trim(),
        apellido_paterno: d.apellido_paterno.trim(),
        apellido_materno: strOrNull(d.apellido_materno),
        cargo_id: d.cargo_id,
        obra_id: d.obra_id,
        fecha_ingreso: d.fecha_ingreso,
        observaciones: strOrNull(d.observaciones),
        ...normalizarDatosPersonales(d),
    };
}

/** Body de PUT /solicitudes-ingreso/:id/aprobar (ficha completa editada por la oficina). */
export function buildAprobarPayload(d: AprobarSolicitudFormValues) {
    return {
        ...buildSolicitudPayload(d),
        empresa_id: d.empresa_id,
        categoria_reporte: d.categoria_reporte,
    };
}

/** Fuente para precargar un form: la API entrega null/number, el form quiere strings. */
type DatosPersonalesApi = Partial<Record<DatosPersonalesKey, string | number | boolean | null | undefined>>;

/** Valores iniciales de los datos personales para `useForm` a partir de un registro de la API. */
export function datosPersonalesDefaults(src: DatosPersonalesApi | null | undefined): DatosPersonalesFormValues {
    const s = src ?? {};
    const txt = (v: string | number | boolean | null | undefined) => (v == null ? '' : String(v));
    return {
        fecha_nacimiento: normalizarFecha(txt(s.fecha_nacimiento)),
        estado_civil: txt(s.estado_civil),
        direccion: txt(s.direccion),
        comuna: txt(s.comuna),
        afp: txt(s.afp),
        salud: txt(s.salud),
        nacionalidad: txt(s.nacionalidad),
        telefono: txt(s.telefono),
        cargas_familiares: txt(s.cargas_familiares),
        talla_calzado: txt(s.talla_calzado),
        talla_pantalon: txt(s.talla_pantalon),
        talla_polera: txt(s.talla_polera),
        // boolean de la API (typeCast TINYINT(1)) → 'si' | 'no'; null → '' (sin dato).
        cuenta_rut: s.cuenta_rut === true ? 'si' : s.cuenta_rut === false ? 'no' : '',
        banco: txt(s.banco),
        tipo_cuenta: txt(s.tipo_cuenta),
        numero_cuenta: txt(s.numero_cuenta),
    };
}

/**
 * Pares rótulo/valor de los datos personales NO vacíos, en orden de la ficha —
 * para vistas de solo lectura (quick-view, solicitud resuelta). Las fechas se
 * muestran legibles; 0 cargas familiares SÍ es un dato (se muestra).
 */
export function listarDatosPersonales(src: DatosPersonalesApi | null | undefined): { key: DatosPersonalesKey; label: string; value: string }[] {
    if (!src) return [];
    const out: { key: DatosPersonalesKey; label: string; value: string }[] = [];
    for (const key of Object.keys(DATOS_PERSONALES_LABELS) as DatosPersonalesKey[]) {
        const raw = src[key];
        if (raw == null || raw === '') continue;
        const value = key === 'fecha_nacimiento' ? fmtFecha(normalizarFecha(String(raw)))
            : key === 'cuenta_rut' ? (raw === true || raw === 'si' ? 'Sí' : 'No')
            : key === 'tipo_cuenta' ? etiquetaTipoCuenta(String(raw))
            : String(raw);
        if (!value) continue;
        out.push({ key, label: DATOS_PERSONALES_LABELS[key], value });
    }
    return out;
}

/** Respuesta de PUT /solicitudes-ingreso/:id/aprobar (data). `solicitud` es la fila ya aprobada, con las correcciones de la oficina. */
export interface AprobacionResultado {
    solicitud: SolicitudIngreso;
    trabajador_id: number;
    /** Ficha en Word emitida post-commit; null si esa emisión falló (GET /:id/doc la genera al descargar). */
    solicitud_documento_id: number | null;
}
