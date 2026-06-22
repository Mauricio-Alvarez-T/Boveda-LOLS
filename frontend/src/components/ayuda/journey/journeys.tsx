import type { LucideIcon } from 'lucide-react';
import {
    FileText, ShoppingBag, Send, Undo2, ArrowLeftRight, Warehouse, ShieldCheck, AlertTriangle,
    CheckSquare, SearchCheck, Truck, Archive, Settings,
} from 'lucide-react';
import type { Origen, Destino } from '../../../utils/inferMovimiento';

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
    /** Ruta preseteada para guiar un flujo de "Mover" (origen/destino + toggle). */
    escenario?: { origen: Origen; destino: Destino; ordenGerencia?: boolean };
    /** true si el flujo nace sin aprobación (envío directo / orden de gerencia) → stepper Crear→Recibir. */
    sinAprobacion?: boolean;
    /** true si el recorrido termina resolviendo una discrepancia (paso extra "Resolver"). */
    conDiscrepancia?: boolean;
    /** Motor que recorre el journey. 'solicitudes' (default) = wizard+detalle; 'asistencia' = pantalla diaria real en sandbox. */
    runner?: 'solicitudes' | 'asistencia';
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

    // ── MOVER (flujos físicos; la ruta se presetea para guiar cada uno) ──
    {
        id: 'envio-directo', modulo: 'Solicitudes', icon: Send,
        titulo: 'Envío directo a una obra',
        descripcion: 'Enviar material de una bodega a una obra sin pasar por aprobación.',
        estado: 'disponible', duracion: 'Interactivo · 3 min', modo: 'mover', sinAprobacion: true,
        escenario: { origen: { tipo: 'bodega', id: 101 }, destino: { tipo: 'obra', id: 1 } },
        textos: {
            crear: 'Paso 1 — Crear el envío. La ruta ya viene puesta (bodega → obra). Agrega los ítems y crea el movimiento. Nace En Tránsito, sin aprobación.',
            aprobar: '',
            recibir: 'Paso 2 — Recibir. Cuando llega a la obra, registra lo que llegó para cerrar.',
            fin: FIN,
        },
        recap: ['Creaste un envío directo de bodega a obra (sin aprobación).', 'Nació En Tránsito, listo para recibir.', 'Se recibió y quedó Recibida.'],
    },
    {
        id: 'devolucion', modulo: 'Solicitudes', icon: Undo2,
        titulo: 'Devolver material a bodega',
        descripcion: 'Devolver material sobrante de una obra a una bodega.',
        estado: 'disponible', duracion: 'Interactivo · 4 min', modo: 'mover',
        escenario: { origen: { tipo: 'obra', id: 1 }, destino: { tipo: 'bodega', id: 101 } },
        textos: {
            crear: 'Paso 1 — Crear la devolución. La ruta ya viene puesta (obra → bodega). Agrega lo que devuelves y crea el movimiento.',
            aprobar: 'Paso 2 — Aprobar. Como encargado de bodega, revisa y aprueba la devolución.',
            recibir: 'Paso 3 — Recibir. Registra lo que llegó a bodega para cerrar.',
            fin: FIN,
        },
        recap: ['Creaste una devolución de obra a bodega.', 'Se aprobó.', 'Se recibió en bodega y quedó Recibida.'],
    },
    {
        id: 'traslado-obras', modulo: 'Solicitudes', icon: ArrowLeftRight,
        titulo: 'Trasladar entre obras',
        descripcion: 'Mover material de una obra a otra.',
        estado: 'disponible', duracion: 'Interactivo · 4 min', modo: 'mover',
        escenario: { origen: { tipo: 'obra', id: 1 }, destino: { tipo: 'obra', id: 2 } },
        textos: {
            crear: 'Paso 1 — Crear el traslado. La ruta ya viene puesta (obra → obra). Agrega los ítems y crea el movimiento.',
            aprobar: 'Paso 2 — Aprobar el traslado entre obras.',
            recibir: 'Paso 3 — Recibir en la obra de destino.',
            fin: FIN,
        },
        recap: ['Creaste un traslado entre obras.', 'Se aprobó.', 'Se recibió y quedó Recibida.'],
    },
    {
        id: 'movimiento-bodegas', modulo: 'Solicitudes', icon: Warehouse,
        titulo: 'Mover entre bodegas',
        descripcion: 'Mover material de una bodega a otra.',
        estado: 'disponible', duracion: 'Interactivo · 4 min', modo: 'mover',
        escenario: { origen: { tipo: 'bodega', id: 101 }, destino: { tipo: 'bodega', id: 102 } },
        textos: {
            crear: 'Paso 1 — Crear el movimiento entre bodegas. La ruta ya viene puesta. Agrega los ítems y crea el movimiento.',
            aprobar: 'Paso 2 — Aprobar el movimiento entre bodegas.',
            recibir: 'Paso 3 — Recibir en la bodega de destino.',
            fin: FIN,
        },
        recap: ['Creaste un movimiento entre bodegas.', 'Se aprobó.', 'Se recibió y quedó Recibida.'],
    },
    {
        id: 'orden-gerencia', modulo: 'Solicitudes', icon: ShieldCheck,
        titulo: 'Orden de gerencia',
        descripcion: 'Movimiento ejecutivo que omite la aprobación (requiere motivo).',
        estado: 'disponible', duracion: 'Interactivo · 3 min', modo: 'mover', sinAprobacion: true,
        escenario: { origen: { tipo: 'bodega', id: 101 }, destino: { tipo: 'obra', id: 1 }, ordenGerencia: true },
        textos: {
            crear: 'Paso 1 — Emitir la orden. La ruta viene puesta y el modo "Orden de gerencia" activado. Escribe el motivo (obligatorio) y crea el movimiento. Omite la aprobación.',
            aprobar: '',
            recibir: 'Paso 2 — Recibir. Registra lo que llegó para cerrar.',
            fin: FIN,
        },
        recap: ['Emitiste una orden de gerencia (con motivo, sin aprobación).', 'Nació En Tránsito.', 'Se recibió y quedó Recibida.'],
    },

    {
        id: 'discrepancias', modulo: 'Solicitudes', icon: AlertTriangle,
        titulo: 'Resolver una discrepancia',
        descripcion: 'Cuando llega menos de lo enviado: el sistema crea una discrepancia y la resuelves.',
        estado: 'disponible', duracion: 'Interactivo · 5 min', modo: 'pedir', conDiscrepancia: true,
        textos: {
            crear: 'Paso 1 — Crear la solicitud (catálogo) como siempre.',
            aprobar: 'Paso 2 — Aprobar la solicitud.',
            recibir: 'Paso 3 — Recibir MENOS de lo enviado (baja una cantidad) y pulsa "Esta es toda la entrega". Eso genera una discrepancia.',
            fin: FIN,
        },
        recap: [
            'Creaste y aprobaste una solicitud.',
            'Al recibir llegó menos de lo enviado → se generó una discrepancia.',
            'Resolviste la discrepancia con una nota.',
        ],
    },

    // ── Otros módulos ──
    {
        id: 'asistencia', modulo: 'Asistencia', icon: CheckSquare,
        titulo: 'Registrar asistencia diaria',
        descripcion: 'Marcar el estado de cada trabajador del día y guardar.',
        estado: 'disponible', duracion: 'Interactivo · 3 min', runner: 'asistencia',
    },
    { id: 'consultas', modulo: 'Consultas', icon: SearchCheck, titulo: 'Consultar trabajadores', descripcion: 'Buscar trabajadores y revisar su información y documentos.', estado: 'proximamente' },
    { id: 'vehiculos', modulo: 'Vehículos', icon: Truck, titulo: 'Gestión de vehículos', descripcion: 'Documentos, revisión técnica, mantención y alertas de vencimiento.', estado: 'proximamente' },
    { id: 'obras', modulo: 'Obras', icon: Archive, titulo: 'Obras finalizadas', descripcion: 'Consultar el historial de obras ya terminadas.', estado: 'proximamente' },
    { id: 'configuracion', modulo: 'Configuración', icon: Settings, titulo: 'Configuración del sistema', descripcion: 'Usuarios, roles, empresas, obras y catálogos.', estado: 'proximamente' },
];
