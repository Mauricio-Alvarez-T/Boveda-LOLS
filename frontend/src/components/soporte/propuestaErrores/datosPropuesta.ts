import fotoCelular from './foto-celular.jpg';
import fotoComputador from './foto-computador.jpg';

/**
 * Datos INVENTADOS de la propuesta «Errores» de Soporte (solo staging): personas y errores de ejemplo para
 * conversarlo con Mauricio. Los nombres no son de la empresa a propósito.
 */
export interface ReporteEjemplo {
    id: number;
    nombre: string;
    rol: string;
    obra: string | null;
    cuando: string;
    primera?: string;
    mensaje: string;
    pantalla: string;
    veces: number;
    dispositivo: 'celular' | 'computador';
    navegador: string;
    foto: string | null;
    escribio: string | null;
    sinSenal?: boolean;
    revisado?: { por: string; cuando: string; nota: string };
}

export const FOTO_CELULAR = fotoCelular;

export const REPORTES: ReporteEjemplo[] = [
    {
        id: 1, nombre: 'Tomás Vera', rol: 'Supervisor de Obra', obra: 'Toesca 2770', cuando: 'hoy 14:32', primera: 'hoy 14:28',
        mensaje: 'No se pudo guardar la recepción', pantalla: 'Inventario → Solicitudes → Recibir TRF-202610-0041', veces: 3,
        dispositivo: 'celular', navegador: 'Chrome 118 · Android 10', foto: fotoCelular,
        escribio: 'Estaba recibiendo los fierros de la 41 y al apretar Confirmar me sale esto, ya lo intenté 3 veces',
    },
    {
        id: 2, nombre: 'Francisca Muñoz', rol: 'RR.HH', obra: null, cuando: 'hoy 11:05',
        mensaje: 'No tienes permiso para hacer esto', pantalla: 'Trabajadores → Ficha de Juan Pérez → Editar contrato', veces: 1,
        dispositivo: 'computador', navegador: 'Chrome 129 · Windows', foto: fotoComputador, escribio: null,
    },
    {
        id: 3, nombre: 'Camila Rojas', rol: 'Prevencionista', obra: 'EW 195', cuando: 'hoy 08:47', primera: 'hoy 08:12',
        mensaje: 'Sin conexión: revisa tu internet', pantalla: 'Asistencia → Tomar asistencia', veces: 7,
        dispositivo: 'celular', navegador: 'Chrome 117 · Android 9', foto: null, escribio: null, sinSenal: true,
    },
    {
        id: 4, nombre: 'Javier Soto', rol: 'Coordinador de Obra', obra: 'EW 195', cuando: 'ayer 16:20',
        mensaje: 'El archivo pesa más de 10 MB', pantalla: 'Vehículos → BXTR-21 → Subir revisión técnica', veces: 2,
        dispositivo: 'computador', navegador: 'Edge 129 · Windows', foto: fotoComputador,
        escribio: 'No me deja subir el PDF de la revisión técnica',
        revisado: { por: 'Marco', cuando: 'ayer 17:02', nota: 'Le expliqué que lo escanee en calidad media. Ya lo subió.' },
    },
];

export const PENDIENTES = REPORTES.filter(r => !r.revisado).length;
