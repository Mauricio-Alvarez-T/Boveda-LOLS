import type { LucideIcon } from 'lucide-react';
import {
    FileText, ShoppingBag, Send, Undo2, ArrowLeftRight, Warehouse, ShieldCheck, AlertTriangle,
    CheckSquare, SearchCheck, Truck, Archive, Settings,
    CalendarOff, CopyPlus, FileSpreadsheet, Share2, CalendarClock, CalendarPlus,
    Pencil, ClipboardCheck, Wrench, UserPlus, UserPen,
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
    /** Motor que recorre el journey. 'solicitudes' (default) = wizard+detalle; 'asistencia'/'vehiculos'/'consultas' = pantalla real en sandbox. */
    runner?: 'solicitudes' | 'asistencia' | 'vehiculos' | 'consultas';
    /** Flujo concreto del runner de Asistencia: define qué pantalla montar, qué botón resaltar, la instrucción y el recap (ver AsistenciaJourneyRunner). */
    asistenciaFlujo?: 'diaria' | 'traslado' | 'feriado' | 'repetir' | 'export-excel' | 'whatsapp' | 'periodo' | 'sabado';
    /** Flujo concreto del runner de Vehículos (ver VehiculosJourneyRunner). */
    vehiculoFlujo?: 'registrar' | 'editar' | 'documento' | 'revision' | 'mantencion';
    /** Flujo concreto del runner de Consultas (ver ConsultasJourneyRunner). */
    consultaFlujo?: 'ver-trabajador' | 'ver-doc' | 'registrar' | 'editar';
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
        estado: 'disponible', duracion: 'Interactivo · 3 min', runner: 'asistencia', asistenciaFlujo: 'diaria',
    },
    {
        id: 'asistencia-traslado', modulo: 'Asistencia', icon: ArrowLeftRight,
        titulo: 'Trasladar un trabajador de obra',
        descripcion: 'Marcar a alguien con estado TO y enviarlo a otra obra desde la asistencia del día.',
        estado: 'disponible', duracion: 'Interactivo · 3 min', runner: 'asistencia', asistenciaFlujo: 'traslado',
    },
    {
        id: 'asistencia-periodo', modulo: 'Asistencia', icon: CalendarClock,
        titulo: 'Justificar una ausencia por período',
        descripcion: 'Asignar Vacaciones, Licencia u otra ausencia a un rango de días desde el calendario del trabajador.',
        estado: 'disponible', duracion: 'Interactivo · 4 min', runner: 'asistencia', asistenciaFlujo: 'periodo',
    },
    {
        id: 'asistencia-feriado', modulo: 'Asistencia', icon: CalendarOff,
        titulo: 'Marcar un día como feriado',
        descripcion: 'Declarar un feriado para la obra (y cómo quitarlo) desde la pantalla diaria.',
        estado: 'disponible', duracion: 'Interactivo · 2 min', runner: 'asistencia', asistenciaFlujo: 'feriado',
    },
    {
        id: 'asistencia-repetir', modulo: 'Asistencia', icon: CopyPlus,
        titulo: 'Repetir el día anterior',
        descripcion: 'Copiar la asistencia del último día laboral para no marcar todo de nuevo; luego revisas y guardas.',
        estado: 'disponible', duracion: 'Interactivo · 2 min', runner: 'asistencia', asistenciaFlujo: 'repetir',
    },
    {
        id: 'asistencia-sabado', modulo: 'Asistencia', icon: CalendarPlus,
        titulo: 'Citar y registrar un sábado extra',
        descripcion: 'Crear una citación de sábado, citar trabajadores y luego marcar su asistencia.',
        estado: 'disponible', duracion: 'Interactivo · 4 min', runner: 'asistencia', asistenciaFlujo: 'sabado',
    },
    {
        id: 'asistencia-excel', modulo: 'Asistencia', icon: FileSpreadsheet,
        titulo: 'Exportar el reporte a Excel',
        descripcion: 'Descargar el reporte mensual de asistencia en una planilla Excel.',
        estado: 'disponible', duracion: 'Interactivo · 1 min', runner: 'asistencia', asistenciaFlujo: 'export-excel',
    },
    {
        id: 'asistencia-whatsapp', modulo: 'Asistencia', icon: Share2,
        titulo: 'Compartir la asistencia por WhatsApp',
        descripcion: 'Generar el resumen del día y compartirlo por WhatsApp con un toque.',
        estado: 'disponible', duracion: 'Interactivo · 2 min', runner: 'asistencia', asistenciaFlujo: 'whatsapp',
    },
    {
        id: 'consulta-trabajador', modulo: 'Consultas', icon: SearchCheck,
        titulo: 'Consultar un trabajador',
        descripcion: 'Buscar un trabajador y abrir su ficha (datos, contacto y documentación).',
        estado: 'disponible', duracion: 'Interactivo · 2 min', runner: 'consultas', consultaFlujo: 'ver-trabajador',
    },
    {
        id: 'consulta-documento', modulo: 'Consultas', icon: FileText,
        titulo: 'Ver los documentos de un trabajador',
        descripcion: 'Abrir la ficha de un trabajador y ver uno de sus documentos.',
        estado: 'disponible', duracion: 'Interactivo · 2 min', runner: 'consultas', consultaFlujo: 'ver-doc',
    },
    {
        id: 'consulta-registrar', modulo: 'Consultas', icon: UserPlus,
        titulo: 'Registrar un trabajador',
        descripcion: 'Dar de alta un trabajador nuevo con sus datos, empresa, obra y cargo.',
        estado: 'disponible', duracion: 'Interactivo · 3 min', runner: 'consultas', consultaFlujo: 'registrar',
    },
    {
        id: 'consulta-editar', modulo: 'Consultas', icon: UserPen,
        titulo: 'Editar un trabajador',
        descripcion: 'Actualizar los datos de un trabajador existente.',
        estado: 'disponible', duracion: 'Interactivo · 2 min', runner: 'consultas', consultaFlujo: 'editar',
    },
    {
        id: 'vehiculo-registrar', modulo: 'Vehículos', icon: Truck,
        titulo: 'Registrar un vehículo',
        descripcion: 'Dar de alta un vehículo en una empresa de flota: patente, marca, modelo y datos.',
        estado: 'disponible', duracion: 'Interactivo · 3 min', runner: 'vehiculos', vehiculoFlujo: 'registrar',
    },
    {
        id: 'vehiculo-editar', modulo: 'Vehículos', icon: Pencil,
        titulo: 'Editar un vehículo',
        descripcion: 'Actualizar los datos de un vehículo existente (conductor, kilómetros, etc.).',
        estado: 'disponible', duracion: 'Interactivo · 2 min', runner: 'vehiculos', vehiculoFlujo: 'editar',
    },
    {
        id: 'vehiculo-documento', modulo: 'Vehículos', icon: FileText,
        titulo: 'Subir un documento del vehículo',
        descripcion: 'Adjuntar el permiso de circulación, seguro u otro documento a un vehículo.',
        estado: 'disponible', duracion: 'Interactivo · 2 min', runner: 'vehiculos', vehiculoFlujo: 'documento',
    },
    {
        id: 'vehiculo-revision', modulo: 'Vehículos', icon: ClipboardCheck,
        titulo: 'Registrar una revisión técnica',
        descripcion: 'Anotar la revisión técnica (o de gases) de un vehículo y su vencimiento, con aviso por correo.',
        estado: 'disponible', duracion: 'Interactivo · 3 min', runner: 'vehiculos', vehiculoFlujo: 'revision',
    },
    {
        id: 'vehiculo-mantencion', modulo: 'Vehículos', icon: Wrench,
        titulo: 'Registrar una mantención',
        descripcion: 'Dejar registro de una mantención del vehículo y agendar la próxima con aviso por correo.',
        estado: 'disponible', duracion: 'Interactivo · 3 min', runner: 'vehiculos', vehiculoFlujo: 'mantencion',
    },
    { id: 'obras', modulo: 'Obras', icon: Archive, titulo: 'Obras finalizadas', descripcion: 'Consultar el historial de obras ya terminadas.', estado: 'proximamente' },
    { id: 'configuracion', modulo: 'Configuración', icon: Settings, titulo: 'Configuración del sistema', descripcion: 'Usuarios, roles, empresas, obras y catálogos.', estado: 'proximamente' },
];
