/**
 * Utilidad para normalizar los detalles de los logs.
 * Soporta el nuevo formato compacto { cambios, resumen } y el legacy.
 */

const labelMap: Record<string, string> = {
    nombre: 'Nombre',
    email: 'Correo',
    email_corporativo: 'Correo Corp.',
    rol_id: 'Rol',
    obra_id: 'Obra',
    descripcion: 'Descripción',
    permisos: 'Permisos',
    trabajador_ids: 'Trabajadores',
    codigo: 'Código',
    activo: 'Estado',
    asunto: 'Asunto',
    destinatario_email: 'Enviar a',
    registros: 'Registros',
    fecha: 'Fecha',
    motivo: 'Motivo',
    monto: 'Monto',
    tipo_documento_id: 'Tipo Doc',
    rut: 'RUT',
    razon_social: 'Razón Social',
    direccion: 'Dirección',
    telefono: 'Teléfono',
    apellido_paterno: 'Apellido P.',
    apellido_materno: 'Apellido M.',
    nombres: 'Nombres',
    cargo_id: 'Cargo',
    empresa_id: 'Empresa',
    empresa: 'Empresa',
    obra: 'Obra',
    cargo: 'Cargo',
    fecha_nacimiento: 'F. Nacimiento',
    fecha_ingreso: 'F. Ingreso',
    estado_id: 'Estado',
    tipo_ausencia_id: 'Tipo Ausencia',
    observacion: 'Observación',
    hora_entrada: 'Hora Entrada',
    hora_salida: 'Hora Salida',
    horas_extra: 'Horas Extra',
    categoria_reporte: 'Categoría',
    trabajador_id: 'Trabajador',
    trabajador: 'Trabajador',
    obra_origen: 'Obra Origen',
    obra_destino: 'Obra Destino',
    comentario: 'Comentario',
    fecha_vencimiento: 'F. Vencimiento',
    resumen: 'Resumen',
    cambios: 'Cambios'
};

/**
 * Intenta reparar un JSON truncado cerrando llaves y corchetes pendientes.
 */
const repairTruncatedJson = (str: string): string => {
    if (!str) return "";
    try { JSON.parse(str); return str; } catch { /* proceed */ }

    let result = str.trim();

    // Manejar comillas abiertas
    let inString = false;
    let escaped = false;
    for (let i = 0; i < result.length; i++) {
        if (result[i] === '"' && !escaped) inString = !inString;
        escaped = result[i] === '\\' && !escaped;
    }
    if (inString) result += '"';

    result = result.replace(/,(\s*)$/, '$1').replace(/:(\s*)$/, '$1');

    // Balancear estructuras
    const stack: string[] = [];
    inString = false; escaped = false;
    for (let i = 0; i < result.length; i++) {
        if (result[i] === '"' && !escaped) inString = !inString;
        escaped = result[i] === '\\' && !escaped;
        if (!inString) {
            if (result[i] === '{') stack.push('}');
            else if (result[i] === '[') stack.push(']');
            else if (result[i] === '}' || result[i] === ']') stack.pop();
        }
    }
    while (stack.length > 0) result += stack.pop();

    try { JSON.parse(result); return result; } catch {
        const finalAttempt = result.replace(/,(\s*[}\]])/g, '$1');
        try { JSON.parse(finalAttempt); return finalAttempt; } catch { return str; }
    }
};

export type LogDetail = 
    | { type: 'compact'; cambios: Record<string, { de: any; a: any }>; resumen?: string; trabajador?: string; fecha?: string }
    | { type: 'summary'; resumen: string; datos?: Record<string, unknown> }
    | { type: 'diff'; antes: Record<string, any>; nuevo: Record<string, any> }
    | Record<string, unknown>
    | string 
    | null;

/**
 * Tipo de resultado normalizado:
 * - 'compact': Nuevo formato { cambios, resumen }
 * - 'summary': Solo resumen (CREATE, DELETE)
 * - 'diff': Legacy formato { antes, nuevo } (logs viejos con diff)
 * - 'object': Datos planos (CREATE legacy)
 * - 'string': Texto plano
 */
export const normalizeLogDetail = (detail: string | object | null): LogDetail => {
    if (!detail) return null;

    if (typeof detail === 'object') {
        const parsed = detail as any;
        if ('cambios' in parsed && parsed.cambios) return { type: 'compact', ...parsed } as LogDetail;
        if ('resumen' in parsed && !('cambios' in parsed) && Object.keys(parsed).length <= 3) {
            return { type: 'summary', resumen: parsed.resumen, datos: parsed.datos } as LogDetail;
        }
        if ('antes' in parsed && 'nuevo' in parsed) return { type: 'diff', antes: parsed.antes, nuevo: parsed.nuevo } as LogDetail;
        return parsed as LogDetail;
    }

    if (typeof detail !== 'string') return detail as LogDetail;
    if (detail.length > 50000) return "Detalle demasiado largo para parsear." as LogDetail;

    let parsed: any;
    try {
        parsed = JSON.parse(detail);
        // Parsear recursivamente si está doble-escapado
        let depth = 0;
        while (typeof parsed === 'string' && (parsed.trim().startsWith('{') || parsed.trim().startsWith('[')) && depth < 3) {
            try { parsed = JSON.parse(parsed); depth++; } catch { break; }
        }
    } catch {
        if (detail.includes('{') || detail.includes('[')) {
            try { 
                const repaired = repairTruncatedJson(detail);
                parsed = JSON.parse(repaired); 
            } catch { return detail; }
        } else {
            return detail;
        }
    }

    if (typeof parsed === 'string') return parsed;

    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        // NUEVO FORMATO: { cambios: {...}, resumen: "..." }
        if ('cambios' in parsed && parsed.cambios) {
            return { type: 'compact', ...parsed } as LogDetail;
        }
        // NUEVO FORMATO: solo resumen (CREATE, DELETE)
        if ('resumen' in parsed && !('cambios' in parsed) && Object.keys(parsed).length <= 3) {
            return { type: 'summary', resumen: parsed.resumen, datos: parsed.datos } as LogDetail;
        }
        // LEGACY: { antes, nuevo }
        if ('antes' in parsed && 'nuevo' in parsed) {
            return { type: 'diff', antes: parsed.antes, nuevo: parsed.nuevo } as LogDetail;
        }
    }

    return parsed as LogDetail;
};

export const getLabel = (key: string): string => labelMap[key] || key;
