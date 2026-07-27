/**
 * Generador del mensaje de WhatsApp para un "uso de bomba de hormigón".
 *
 * Función PURA (sin efectos): el envío lo maneja `utils/whatsappShare.ts`.
 * Se extrajo desde `components/inventario/BombasHormigonTab.tsx` para poder
 * fijar por tests QUÉ debe decir el mensaje según los checkbox/dropdown
 * elegidos en el formulario (consistencia selección → mensaje), siguiendo el
 * mismo patrón que `transferenciaWhatsApp.ts`.
 *
 * ORDEN del mensaje (pedido por el jefe de obra, así se envía el día a día):
 *   Obra → Fecha → Tipo de trabajo → Tipo de hormigón → Tipo (de bomba) →
 *   Origen → el resto de los datos → Solicitante (quien pide, al final).
 *
 * REGLAS de formato (no cambiar sin actualizar el test):
 * - Título: "*Programación de hormigón*".
 * - Cada línea es `*Etiqueta:* valor` — etiqueta en NEGRITA y valor en la LETRA
 *   NORMAL de WhatsApp. Antes el valor iba en monoespaciado (```valor```) para
 *   que se viera gris, pero en obra reclamaron esa tipografía de máquina de
 *   escribir (angosta y difícil de leer en el celular) → se volvió a texto
 *   plano, que es lo que usan los otros mensajes (`transferenciaWhatsApp.ts`).
 *   La etiqueta del tipo de bomba es el nombre completo: "Tipo de bomba" (no "Tipo").
 * - `Fecha` se muestra DD/MM/YYYY (la fecha del form viene YYYY-MM-DD).
 * - Líneas SIEMPRE presentes: Tipo de bomba, Origen (Empresa/Externa),
 *   Toma de muestras, Traslado de bombas, Hidrófugo, Permiso de la calzada.
 * - **Hormigonado SIN bomba**: `tipo_bomba === BOMBA_NO_SOLICITADA` es el ÚNICO
 *   dato que marca "no se pidió bomba" (no hay columna nueva en BD; `es_externa`
 *   queda en false). En ese caso el Origen también dice "No solicitado" —
 *   decisión de obra: explícito, para que se lea "se decidió no pedir bomba" y
 *   no "faltó el dato". Son el MISMO hecho, por eso la UI sincroniza los dos
 *   dropdown y acá el Origen se DERIVA del tipo.
 * - Líneas CONDICIONALES (solo si hay dato): Tipo de trabajo, Tipo de hormigón,
 *   Cantidad, Hora de inicio, Frecuencia, Vibradores, Observaciones,
 *   Solicitante (usuario logueado que arma la programación; cierra el mensaje).
 */

/**
 * Valor de `tipo_bomba` que marca un hormigonado SIN bomba.
 * Fuente de verdad compartida con la UI (`BombasHormigonTab.tsx`): se guarda en
 * la columna `tipo_bomba` que ya existe, sin migración de BD.
 */
export const BOMBA_NO_SOLICITADA = 'No solicitado';

/** true si el registro/form corresponde a un hormigonado sin bomba. */
export const esBombaNoSolicitada = (tipoBomba?: string | null) =>
    (tipoBomba || '').trim().toLowerCase() === BOMBA_NO_SOLICITADA.toLowerCase();

/** Subconjunto del form de bomba que necesita el mensaje (sin `obra_id`: la obra entra como nombre). */
export interface BombaWhatsappForm {
    fecha: string;
    tipo_trabajo: string;
    tipo_bomba: string;
    hora_inicio: string;
    toma_muestras: boolean;
    traslado_bombas: boolean;
    vibradores_origen: string;
    vibradores_detalle: string;
    tipo_hormigon: string;
    cantidad_m3: string;
    frecuencia: string;
    hidrofugo: boolean;
    permiso_calzada: boolean;
    es_externa: boolean;
    observaciones: string;
}

/** Línea `*Etiqueta:* valor` — etiqueta en negrita, valor en la letra normal de WhatsApp. */
const linea = (etiqueta: string, valor: string) => `*${etiqueta}:* ${valor}`;

/** Construye el texto de la programación de hormigón para compartir por WhatsApp. */
export function buildBombaHormigonWhatsappText(form: BombaWhatsappForm, obraNombre: string, solicitanteNombre = ''): string {
    const lines = [
        '*Programación de hormigón*',
        linea('Obra', obraNombre),
        linea('Fecha', form.fecha ? form.fecha.split('-').reverse().join('/') : '—'),
    ];
    // Orden pedido: tipo de trabajo → tipo de hormigón → tipo de bomba → origen.
    if (form.tipo_trabajo.trim()) lines.push(linea('Tipo de trabajo', form.tipo_trabajo.trim()));
    if (form.tipo_hormigon.trim()) lines.push(linea('Tipo de hormigón', form.tipo_hormigon.trim()));
    lines.push(linea('Tipo de bomba', form.tipo_bomba || '—'));
    // Origen DERIVADO: sin bomba pedida, "Empresa (propia)" mentiría.
    lines.push(linea('Origen', esBombaNoSolicitada(form.tipo_bomba)
        ? BOMBA_NO_SOLICITADA
        : form.es_externa ? 'Externa (arriendo)' : 'Empresa (propia)'));
    // Resto de los datos.
    if (form.cantidad_m3.trim()) lines.push(linea('Cantidad', `${form.cantidad_m3} m³`));
    if (form.hora_inicio) lines.push(linea('Hora de inicio', form.hora_inicio));
    if (form.frecuencia.trim()) lines.push(linea('Frecuencia', form.frecuencia.trim()));
    lines.push(linea('Toma de muestras', form.toma_muestras ? 'Sí' : 'No'));
    lines.push(linea('Traslado de bombas', form.traslado_bombas ? 'Sí' : 'No'));
    lines.push(linea('Hidrófugo', form.hidrofugo ? 'Sí' : 'No'));
    lines.push(linea('Permiso de la calzada', form.permiso_calzada ? 'Sí' : 'No'));
    if (form.vibradores_origen || form.vibradores_detalle.trim()) lines.push(linea('Vibradores', [form.vibradores_origen, form.vibradores_detalle.trim()].filter(Boolean).join(' — ')));
    if (form.observaciones.trim()) lines.push(linea('Observaciones', form.observaciones.trim()));
    // Quien hace la solicitud (usuario logueado) cierra el mensaje.
    if (solicitanteNombre.trim()) lines.push(linea('Solicitante', solicitanteNombre.trim()));
    return lines.join('\n');
}
