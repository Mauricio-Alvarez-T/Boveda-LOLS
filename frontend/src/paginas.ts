/**
 * Import de cada sección (code-splitting de App.tsx). Aparte para poder PRECARGARLAS: el dueño (2026-10-22) no
 * quería «una animación de carga entremedio de un click» — la primera visita a una sección esperaba su código
 * con un círculo girando a pantalla completa. `precargarSecciones` las baja todas en reposo apenas hay sesión;
 * después cada clic encuentra el módulo ya cargado. Vite comparte el módulo: el `lazy` de App lo reusa.
 */
export const cargarPagina = {
    login: () => import('./pages/Login'),
    dashboard: () => import('./pages/Dashboard'),
    asistencia: () => import('./pages/Attendance'),
    consultas: () => import('./pages/Consultas'),
    inventario: () => import('./pages/Inventario'),
    vehiculos: () => import('./pages/Vehiculos'),
    obrasFinalizadas: () => import('./pages/ObrasFinalizadas'),
    ayuda: () => import('./pages/CentroAyuda'),
    configuracion: () => import('./pages/Settings'),
    ideas: () => import('./pages/Ideas'),
    costos: () => import('./pages/Costos'),
    sitioWeb: () => import('./pages/SitioWeb'),
    soporte: () => import('./pages/Soporte'),
};

/** Baja el código de todas las secciones (menos Login) sin bloquear: errores se ignoran, el `lazy` reintenta. */
export const precargarSecciones = () => {
    Object.entries(cargarPagina).forEach(([nombre, cargar]) => {
        if (nombre !== 'login') cargar().catch(() => { /* la ruta lo reintenta al entrar */ });
    });
};
