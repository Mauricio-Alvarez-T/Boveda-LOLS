import type { LucideIcon } from 'lucide-react';
import {
    FileText, ShoppingBag, Send, Undo2, ArrowLeftRight, Warehouse, ShieldCheck, AlertTriangle,
    CheckSquare, SearchCheck, Truck, Archive, Settings,
} from 'lucide-react';

/**
 * Catálogo de tutoriales del Centro de ayuda, organizados por FLUJO DE TRABAJO
 * (end-to-end), no por función. Los `disponibles` traen `modo` + `textos` y se
 * recorren con `JourneyRunner` sobre las pantallas reales de la app.
 */
export interface JourneyDef {
    id: string;
    modulo: string;
    titulo: string;
    descripcion: string;
    icon: LucideIcon;
    estado: 'disponible' | 'proximamente';
    duracion?: string;
    /** Modo del wizard en el paso "crear" (solo journeys disponibles). */
    modo?: 'pedir' | 'mover';
    /** Textos de ayuda por fase del recorrido. */
    textos?: { crear: string; aprobar: string; recibir: string; fin: string };
    /** Resumen de pasos al completar (si se omite, uno por defecto). */
    recap?: string[];
}

const FIN = '¡Recorriste el flujo completo! Así se ve de principio a fin en la app real.';

export const JOURNEYS: JourneyDef[] = [
    {
        id: 'catalogo',
        modulo: 'Solicitudes',
        icon: FileText,
        titulo: 'Solicitar un producto del catálogo',
        descripcion: 'De principio a fin: pedir un material del catálogo, aprobarlo y recibirlo en la obra.',
        estado: 'disponible',
        duracion: 'Interactivo · 4 min',
        modo: 'pedir',
        textos: {
            crear: 'Paso 1 — Crear la solicitud. Elige la obra de destino, agrega ítems del catálogo y crea la solicitud. Tú pides; otra persona decidirá de qué bodega sale.',
            aprobar: 'Paso 2 — Aprobar. La solicitud quedó pendiente. Ahora, como aprobador, revisa y elige de qué bodega(s) sale cada ítem.',
            recibir: 'Paso 3 — Recibir. Ya está aprobada. Cuando el material llega a la obra, registra lo que llegó (un viaje o la entrega completa).',
            fin: FIN,
        },
    },
    {
        id: 'catalogo-materiales',
        modulo: 'Solicitudes',
        icon: ShoppingBag,
        titulo: 'Solicitar dentro y fuera del catálogo',
        descripcion: 'Una solicitud que mezcla ítems del catálogo con materiales que hay que comprar o traer de otra obra.',
        estado: 'disponible',
        duracion: 'Interactivo · 5 min',
        modo: 'pedir',
        textos: {
            crear: 'Paso 1 — Crear. Agrega ítems del catálogo y, en la pestaña "Otros materiales", lo que no está en el catálogo. Luego crea la solicitud.',
            aprobar: 'Paso 2 — Aprobar. Elige el origen de los ítems de catálogo y, para cada material extra, decide si se compra o se trae de otra obra.',
            recibir: 'Paso 3 — Recibir. Registra lo que llegó para cerrar la entrega.',
            fin: FIN,
        },
        recap: [
            'Creaste la solicitud con ítems del catálogo y materiales extra.',
            'Se aprobó: origen de los de catálogo + comprar/traer los materiales.',
            'Se registró la recepción y quedó Recibida.',
        ],
    },

    // ── Próximamente (se irán activando) ──
    { id: 'envio-directo', modulo: 'Solicitudes', icon: Send, titulo: 'Envío directo a una obra', descripcion: 'Enviar material de una bodega a una obra sin pasar por aprobación.', estado: 'proximamente' },
    { id: 'devolucion', modulo: 'Solicitudes', icon: Undo2, titulo: 'Devolver material a bodega', descripcion: 'Devolver material sobrante de una obra a una bodega.', estado: 'proximamente' },
    { id: 'traslado-obras', modulo: 'Solicitudes', icon: ArrowLeftRight, titulo: 'Trasladar entre obras', descripcion: 'Mover material de una obra a otra.', estado: 'proximamente' },
    { id: 'movimiento-bodegas', modulo: 'Solicitudes', icon: Warehouse, titulo: 'Mover entre bodegas', descripcion: 'Mover material de una bodega a otra.', estado: 'proximamente' },
    { id: 'orden-gerencia', modulo: 'Solicitudes', icon: ShieldCheck, titulo: 'Orden de gerencia', descripcion: 'Movimiento ejecutivo que omite la aprobación (requiere motivo).', estado: 'proximamente' },
    { id: 'discrepancias', modulo: 'Solicitudes', icon: AlertTriangle, titulo: 'Resolver una discrepancia', descripcion: 'Cuando llega menos (o más) de lo enviado: revisar y resolver la diferencia.', estado: 'proximamente' },

    // ── Otros módulos ──
    { id: 'asistencia', modulo: 'Asistencia', icon: CheckSquare, titulo: 'Registrar asistencia', descripcion: 'Marcar la asistencia diaria de los trabajadores en obra.', estado: 'proximamente' },
    { id: 'consultas', modulo: 'Consultas', icon: SearchCheck, titulo: 'Consultar trabajadores', descripcion: 'Buscar trabajadores y revisar su información y documentos.', estado: 'proximamente' },
    { id: 'vehiculos', modulo: 'Vehículos', icon: Truck, titulo: 'Gestión de vehículos', descripcion: 'Documentos, revisión técnica, mantención y alertas de vencimiento.', estado: 'proximamente' },
    { id: 'obras', modulo: 'Obras', icon: Archive, titulo: 'Obras finalizadas', descripcion: 'Consultar el historial de obras ya terminadas.', estado: 'proximamente' },
    { id: 'configuracion', modulo: 'Configuración', icon: Settings, titulo: 'Configuración del sistema', descripcion: 'Usuarios, roles, empresas, obras y catálogos.', estado: 'proximamente' },
];
