/**
 * Usuarios autorizados a VER y CONFIGURAR las alertas de vencimiento de
 * vehículos (los campos "Días antes / Email alerta" de seguros, revisiones
 * y mantenciones).
 *
 * Se controla por USUARIO y no por rol: varios usuarios comparten el rol
 * "Super Administrador", pero solo estas personas deben configurar alertas.
 * El resto del personal no ve esos campos, y la configuración guardada se
 * mantiene intacta (el formulario simplemente no toca esos datos).
 *
 * ▶ Para autorizar a alguien más: agrega su email corporativo en MINÚSCULAS.
 */
export const EMAILS_CONFIG_ALERTAS_VEHICULOS: string[] = [
    'marcouribe@lols.cl',   // Marco Uribe
    'test@lols.cl',         // Mauricio Alvarez
    'daphnelazcano@lols.cl', // Daphne Lazcano
];

/**
 * Valida el campo "Días antes" de las alertas (react-hook-form `validate`).
 * Permite vacío (campo opcional) y exige rango 1–365. Devuelve true o el mensaje
 * de error que mostrará el componente estándar <FieldError>.
 */
export function validarDiasAlerta(v: unknown): true | string {
    if (v === '' || v === null || v === undefined) return true;
    const n = Number(v);
    if (Number.isNaN(n)) return 'Ingresa un número válido';
    if (n < 1) return 'Mínimo 1 día';
    if (n > 365) return 'Máximo 365 días';
    return true;
}

/** True si el usuario puede ver/editar la configuración de alertas de vehículos. */
export function puedeConfigurarAlertasVehiculos(
    user?: { email?: string; email_corporativo?: string } | null,
): boolean {
    if (!user) return false;
    const correos = [user.email, user.email_corporativo]
        .filter(Boolean)
        .map((e) => (e as string).trim().toLowerCase());
    return correos.some((e) => EMAILS_CONFIG_ALERTAS_VEHICULOS.includes(e));
}
