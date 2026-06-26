/**
 * Generador del mensaje de WhatsApp para un "uso de bomba de hormigón".
 *
 * Función PURA (sin efectos): el envío lo maneja `utils/whatsappShare.ts`.
 * Se extrajo desde `components/inventario/BombasHormigonTab.tsx` para poder
 * fijar por tests QUÉ debe decir el mensaje según los checkbox/dropdown
 * elegidos en el formulario (consistencia selección → mensaje), siguiendo el
 * mismo patrón que `transferenciaWhatsApp.ts`.
 *
 * REGLAS de formato (no cambiar sin actualizar el test):
 * - `Fecha` se muestra DD/MM/YYYY (la fecha del form viene YYYY-MM-DD).
 * - Líneas SIEMPRE presentes: Toma de muestras, Traslado de bombas, Hidrófugo,
 *   Permiso de la calzada, Origen (Sí/No o Empresa/Externa).
 * - Líneas CONDICIONALES (solo si hay dato): Hora de inicio, Vibradores,
 *   Tipo de hormigón, Cantidad, Frecuencia, Observaciones.
 */

/** Subconjunto del form de bomba que necesita el mensaje (sin `obra_id`: la obra entra como nombre). */
export interface BombaWhatsappForm {
    fecha: string;
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
        `Tipo: ${form.tipo_bomba || '—'}`,
    ];
    if (form.hora_inicio) lines.push(`Hora de inicio: ${form.hora_inicio}`);
    lines.push(`Toma de muestras: ${form.toma_muestras ? 'Sí' : 'No'}`);
    lines.push(`Traslado de bombas: ${form.traslado_bombas ? 'Sí' : 'No'}`);
    if (form.vibradores_origen || form.vibradores_detalle.trim()) lines.push(`Vibradores: ${[form.vibradores_origen, form.vibradores_detalle.trim()].filter(Boolean).join(' — ')}`);
    if (form.tipo_hormigon.trim()) lines.push(`Tipo de hormigón: ${form.tipo_hormigon.trim()}`);
    if (form.cantidad_m3.trim()) lines.push(`Cantidad: ${form.cantidad_m3} m³`);
    if (form.frecuencia.trim()) lines.push(`Frecuencia: ${form.frecuencia.trim()}`);
    lines.push(`Hidrófugo: ${form.hidrofugo ? 'Sí' : 'No'}`);
    lines.push(`Permiso de la calzada: ${form.permiso_calzada ? 'Sí' : 'No'}`);
    lines.push(`Origen: ${form.es_externa ? 'Externa (arriendo)' : 'Empresa (propia)'}`);
    if (form.observaciones.trim()) lines.push(`Observaciones: ${form.observaciones.trim()}`);
    return lines.join('\n');
}
