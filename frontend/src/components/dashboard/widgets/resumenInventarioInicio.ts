/**
 * Tarjeta «Inventario» del Inicio (dueño 2026-10-20: «info de los pendientes de aprobar y discrepancias
 * según el perfil»). Lógica PURA, sin DOM, para poder testearla. Los datos llegan de
 * GET /api/transferencias/inicio (`transferenciaService.resumenInicio`): cada grupo viene null cuando el
 * perfil no puede actuar sobre él, y entonces la tarjeta no lo muestra.
 */

export interface GrupoInventario {
    total: number;
    /** Antigüedad de la más vieja del grupo, en días (null si no hay ninguna). */
    dias: number | null;
}

export interface ResumenInventarioApi {
    por_aprobar: GrupoInventario | null;
    discrepancias: GrupoInventario | null;
    por_despachar: GrupoInventario | null;
    por_recibir: GrupoInventario | null;
    mis_solicitudes: GrupoInventario | null;
}

export type TonoInventario = 'rojo' | 'ambar' | 'verde' | 'neutro';

export interface FilaInventario {
    clave: keyof ResumenInventarioApi;
    texto: string;
    total: number;
    /** «La más antigua: hace 6 días» (vacío si no hay ninguna). */
    detalle: string;
    tono: TonoInventario;
    /** Filtro con que se abre la pestaña Solicitudes de Inventario. */
    estado: string;
}

export interface ModeloInventarioInicio {
    tono: TonoInventario;
    /** null = todavía cargando (se pinta «—», nunca un 0 falso). */
    cifra: number | null;
    etiqueta: string;
    filas: FilaInventario[];
}

const FILAS: { clave: keyof ResumenInventarioApi; texto: string; estado: string; tono: TonoInventario; accion: boolean }[] = [
    { clave: 'por_aprobar', texto: 'Por aprobar', estado: 'pendiente', tono: 'ambar', accion: true },
    { clave: 'discrepancias', texto: 'Diferencias por resolver', estado: 'discrepancias', tono: 'rojo', accion: true },
    { clave: 'por_despachar', texto: 'Por despachar', estado: 'aprobada', tono: 'ambar', accion: true },
    { clave: 'por_recibir', texto: 'En tránsito, por recibir', estado: 'todas', tono: 'ambar', accion: true },
    { clave: 'mis_solicitudes', texto: 'Tus solicitudes en curso', estado: 'todas', tono: 'neutro', accion: false },
];

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

export function detalleAntiguedad(dias: number | null): string {
    if (dias == null) return '';
    if (dias <= 0) return 'La más antigua es de hoy';
    return `La más antigua: hace ${dias} ${plural(dias, 'día', 'días')}`;
}

export function resumenInventarioInicio(r: ResumenInventarioApi | null): ModeloInventarioInicio {
    if (!r) return { tono: 'neutro', cifra: null, etiqueta: 'por resolver', filas: [] };

    const filas: FilaInventario[] = FILAS
        .filter(f => r[f.clave] != null)
        .map(f => {
            const g = r[f.clave] as GrupoInventario;
            return {
                clave: f.clave, texto: f.texto, total: g.total, estado: f.estado,
                detalle: g.total > 0 ? detalleAntiguedad(g.dias) : '',
                tono: g.total > 0 ? f.tono : 'neutro',
            };
        });

    const deAccion = FILAS.filter(f => f.accion && r[f.clave] != null);
    // Perfil sin nada que aprobar, despachar ni recibir (solo pide): la cifra son sus solicitudes en curso.
    if (deAccion.length === 0) {
        const mias = r.mis_solicitudes?.total ?? 0;
        return { tono: mias > 0 ? 'neutro' : 'verde', cifra: mias, etiqueta: plural(mias, 'solicitud tuya en curso', 'solicitudes tuyas en curso'), filas };
    }

    const cifra = deAccion.reduce((acc, f) => acc + (r[f.clave]?.total ?? 0), 0);
    const tono: TonoInventario = (r.discrepancias?.total ?? 0) > 0 ? 'rojo' : cifra > 0 ? 'ambar' : 'verde';
    return { tono, cifra, etiqueta: 'por resolver', filas };
}
