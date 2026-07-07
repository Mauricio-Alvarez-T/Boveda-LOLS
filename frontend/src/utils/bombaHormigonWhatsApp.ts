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
 *   Origen → y luego el resto de los datos.
 *
 * REGLAS de formato (no cambiar sin actualizar el test):
 * - `Fecha` se muestra DD/MM/YYYY (la fecha del form viene YYYY-MM-DD).
 * - Líneas SIEMPRE presentes: Tipo (de bomba), Origen (Empresa/Externa),
 *   Toma de muestras, Traslado de bombas, Hidrófugo, Permiso de la calzada.
 * - Líneas CONDICIONALES (solo si hay dato): Tipo de trabajo, Tipo de hormigón,
 *   Cantidad, Hora de inicio, Frecuencia, Vibradores, Observaciones.
 */

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

/** Construye el texto del registro de uso de bomba para compartir por WhatsApp. */
export function buildBombaHormigonWhatsappText(form: BombaWhatsappForm, obraNombre: string): string {
    const lines = [
        '*Registro de uso de bomba*',
        `Obra: ${obraNombre}`,
        `Fecha: ${form.fecha ? form.fecha.split('-').reverse().join('/') : '—'}`,
    ];
    // Orden pedido: tipo de trabajo → tipo de hormigón → tipo de bomba → origen.
    if (form.tipo_trabajo.trim()) lines.push(`Tipo de trabajo: ${form.tipo_trabajo.trim()}`);
    if (form.tipo_hormigon.trim()) lines.push(`Tipo de hormigón: ${form.tipo_hormigon.trim()}`);
    lines.push(`Tipo: ${form.tipo_bomba || '—'}`);
    lines.push(`Origen: ${form.es_externa ? 'Externa (arriendo)' : 'Empresa (propia)'}`);
    // Resto de los datos.
    if (form.cantidad_m3.trim()) lines.push(`Cantidad: ${form.cantidad_m3} m³`);
    if (form.hora_inicio) lines.push(`Hora de inicio: ${form.hora_inicio}`);
    if (form.frecuencia.trim()) lines.push(`Frecuencia: ${form.frecuencia.trim()}`);
    lines.push(`Toma de muestras: ${form.toma_muestras ? 'Sí' : 'No'}`);
    lines.push(`Traslado de bombas: ${form.traslado_bombas ? 'Sí' : 'No'}`);
    lines.push(`Hidrófugo: ${form.hidrofugo ? 'Sí' : 'No'}`);
    lines.push(`Permiso de la calzada: ${form.permiso_calzada ? 'Sí' : 'No'}`);
    if (form.vibradores_origen || form.vibradores_detalle.trim()) lines.push(`Vibradores: ${[form.vibradores_origen, form.vibradores_detalle.trim()].filter(Boolean).join(' — ')}`);
    if (form.observaciones.trim()) lines.push(`Observaciones: ${form.observaciones.trim()}`);
    return lines.join('\n');
}
