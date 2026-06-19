import type { LucideIcon } from 'lucide-react';
import {
    FileText, CheckCircle2, PackageCheck, ShoppingBag, Send, Undo2, ArrowLeftRight,
    Warehouse, ShieldCheck, AlertTriangle, MoreHorizontal,
    CheckSquare, SearchCheck, Truck, Archive, Settings,
} from 'lucide-react';

/**
 * Catálogo del Centro de ayuda. Cada flujo del módulo Solicitudes (Transferencias)
 * es un tutorial separado. Los tutoriales con `demoId` reusan la UI REAL de la app
 * como demo interactiva (ver `demo/registry.ts`); los demás quedan "proximamente".
 *
 * Para activar un tutorial nuevo: crea su demo en `demo/`, regístralo en
 * `demo/registry.ts` y pon su `demoId` + `estado: 'disponible'` aquí.
 */

export type GuiaEstado = 'disponible' | 'proximamente';

export interface GuiaPaso {
    titulo: string;
    detalle?: string;
    /** Ruta de captura (`/guides/...png`) o descripción de la captura pendiente. */
    captura?: string;
    /** true si `captura` es una imagen real ya disponible. */
    capturaLista?: boolean;
}

export interface GuiaSeccion {
    id: string;
    titulo: string;
    intro?: string;
    quien?: string;
    pasos: GuiaPaso[];
    resultado?: string;
    errores?: string[];
}

export interface Guia {
    id: string;
    /** Módulo/categoría (se usa para filtrar). */
    modulo: string;
    icon: LucideIcon;
    titulo: string;
    descripcion: string;
    estado: GuiaEstado;
    duracion?: string;
    /** Si está presente, el tutorial usa una demo interactiva del registry. */
    demoId?: string;
    /** Contenido estático paso a paso (para tutoriales sin demo). */
    secciones?: GuiaSeccion[];
}

export const GUIAS: Guia[] = [
    // ── SOLICITUDES (Transferencias) — flujo núcleo, demos interactivas ──
    {
        id: 'pedir-solicitud',
        modulo: 'Solicitudes',
        icon: FileText,
        titulo: 'Pedir una solicitud',
        descripcion: 'Pedir material del catálogo para una obra. Tú pides; otra persona aprueba y decide de qué bodega sale.',
        estado: 'disponible',
        duracion: 'Interactivo · 3 min',
        demoId: 'pedir-solicitud',
    },
    {
        id: 'aprobar-solicitud',
        modulo: 'Solicitudes',
        icon: CheckCircle2,
        titulo: 'Aprobar una solicitud',
        descripcion: 'Revisar una solicitud pendiente y elegir de qué ubicación sale cada material.',
        estado: 'disponible',
        duracion: 'Interactivo · 3 min',
        demoId: 'aprobar-solicitud',
    },
    {
        id: 'recibir-materiales',
        modulo: 'Solicitudes',
        icon: PackageCheck,
        titulo: 'Registrar lo que llegó',
        descripcion: 'Recibir material en obra: registrar viajes parciales o cerrar la entrega completa.',
        estado: 'disponible',
        duracion: 'Interactivo · 3 min',
        demoId: 'recibir-materiales',
    },

    // ── SOLICITUDES — resto de flujos (próximamente) ──
    {
        id: 'pedir-materiales',
        modulo: 'Solicitudes',
        icon: ShoppingBag,
        titulo: 'Pedir materiales (a comprar)',
        descripcion: 'Pedir materiales que no están en el catálogo; quien aprueba decide cómo conseguirlos.',
        estado: 'proximamente',
    },
    {
        id: 'envio-directo',
        modulo: 'Solicitudes',
        icon: Send,
        titulo: 'Envío directo (bodega → obra)',
        descripcion: 'Enviar material de una bodega a una obra sin pasar por aprobación.',
        estado: 'proximamente',
    },
    {
        id: 'devolucion',
        modulo: 'Solicitudes',
        icon: Undo2,
        titulo: 'Devolución (obra → bodega)',
        descripcion: 'Devolver material de una obra a una bodega.',
        estado: 'proximamente',
    },
    {
        id: 'traslado-obras',
        modulo: 'Solicitudes',
        icon: ArrowLeftRight,
        titulo: 'Traslado entre obras',
        descripcion: 'Mover material de una obra a otra.',
        estado: 'proximamente',
    },
    {
        id: 'movimiento-bodegas',
        modulo: 'Solicitudes',
        icon: Warehouse,
        titulo: 'Movimiento entre bodegas',
        descripcion: 'Mover material de una bodega a otra.',
        estado: 'proximamente',
    },
    {
        id: 'orden-gerencia',
        modulo: 'Solicitudes',
        icon: ShieldCheck,
        titulo: 'Orden de gerencia',
        descripcion: 'Movimiento ejecutivo que omite la aprobación (requiere motivo).',
        estado: 'proximamente',
    },
    {
        id: 'discrepancias',
        modulo: 'Solicitudes',
        icon: AlertTriangle,
        titulo: 'Resolver discrepancias',
        descripcion: 'Revisar y resolver diferencias entre lo enviado y lo recibido.',
        estado: 'proximamente',
    },
    {
        id: 'acciones-comunes',
        modulo: 'Solicitudes',
        icon: MoreHorizontal,
        titulo: 'Acciones comunes',
        descripcion: 'Cancelar, crear faltante y compartir por WhatsApp.',
        estado: 'proximamente',
    },

    // ── Otros módulos (próximamente) ──
    {
        id: 'asistencia',
        modulo: 'Asistencia',
        icon: CheckSquare,
        titulo: 'Registrar asistencia',
        descripcion: 'Marcar la asistencia diaria de los trabajadores en obra.',
        estado: 'proximamente',
    },
    {
        id: 'consultas',
        modulo: 'Consultas',
        icon: SearchCheck,
        titulo: 'Consultar trabajadores',
        descripcion: 'Buscar trabajadores y revisar su información y documentos.',
        estado: 'proximamente',
    },
    {
        id: 'vehiculos',
        modulo: 'Vehículos',
        icon: Truck,
        titulo: 'Gestión de vehículos',
        descripcion: 'Documentos, revisión técnica, mantención y alertas de vencimiento.',
        estado: 'proximamente',
    },
    {
        id: 'obras',
        modulo: 'Obras',
        icon: Archive,
        titulo: 'Obras finalizadas',
        descripcion: 'Consultar el historial de obras ya terminadas.',
        estado: 'proximamente',
    },
    {
        id: 'configuracion',
        modulo: 'Configuración',
        icon: Settings,
        titulo: 'Configuración del sistema',
        descripcion: 'Usuarios, roles, empresas, obras y catálogos.',
        estado: 'proximamente',
    },
];
