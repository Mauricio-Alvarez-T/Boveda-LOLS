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

/** Campos opcionales de la ficha ("Datos personales"). Todos string en el form. */
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
};

/** '' / espacios / null → null; si no, el texto sin espacios en los bordes. */
const strOrNull = (v: string | null | undefined): string | null => {
    const t = (v ?? '').trim();
    return t ? t : null;
};

/** Normaliza los opcionales para la API: '' → null, cargas a número entero (o null). */
export function normalizarDatosPersonales(d: DatosPersonalesFormValues) {
    const cargas = strOrNull(d.cargas_familiares);
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
type DatosPersonalesApi = Partial<Record<DatosPersonalesKey, string | number | null | undefined>>;

/** Valores iniciales de los datos personales para `useForm` a partir de un registro de la API. */
export function datosPersonalesDefaults(src: DatosPersonalesApi | null | undefined): DatosPersonalesFormValues {
    const s = src ?? {};
    const txt = (v: string | number | null | undefined) => (v == null ? '' : String(v));
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
        const value = key === 'fecha_nacimiento' ? fmtFecha(normalizarFecha(String(raw))) : String(raw);
        if (!value) continue;
        out.push({ key, label: DATOS_PERSONALES_LABELS[key], value });
    }
    return out;
}
