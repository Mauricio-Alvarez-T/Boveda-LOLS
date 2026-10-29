/**
 * Sitio web (mig 147): los estados que también usa `utils/statusConfig.ts` (badges). Viven aquí, con los demás tipos
 * compartidos, y `components/sitio-web/tipos.ts` los vuelve a exportar junto con las formas de /api/sitio-web.
 */

/**
 * Cómo va una obra respecto del sitio (`estadoDerivado` del backend). `incompleta` = publicada, pero ahora le faltan
 * datos: el sitio mantiene la versión publicada hasta completarlos (publicar no la cambia).
 */
export type EstadoDerivado = 'borrador' | 'listo' | 'cambios' | 'incompleta' | 'publicando' | 'publicada' | 'no_llego' | 'retiro_pendiente';

export type EstadoFoto = 'vigente' | 'aprobada' | 'por_aprobar' | 'sin_confirmar' | 'rechazada';

export type EstadoPublicacion = 'en_curso' | 'ok' | 'sin_cambios' | 'simulada' | 'error' | 'interrumpida';
