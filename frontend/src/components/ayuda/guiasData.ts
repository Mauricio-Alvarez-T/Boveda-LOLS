import type { LucideIcon } from 'lucide-react';
import { Package, CheckSquare, Truck, SearchCheck, Archive, Settings } from 'lucide-react';

/**
 * Datos del Centro de ayuda (Etapa 1 — cascarón).
 *
 * El modelo es intencionalmente liviano y provisional: cada guía se describe con
 * datos estructurados (sin Markdown ni dependencias nuevas) para renderizarse con
 * los componentes nativos de la app. Cuando se defina el estilo final (PDF de
 * referencia) este modelo se ajusta sin rehacer el cascarón.
 *
 * Para sumar una guía nueva: agrega un objeto `Guia` con `estado: 'disponible'` y
 * sus `secciones`. Las capturas van en `frontend/public/guides/*.png` y se
 * referencian con la ruta `/guides/archivo.png` en `GuiaPaso.captura`.
 */

export type GuiaEstado = 'disponible' | 'proximamente';

export interface GuiaPaso {
    /** Acción concreta del paso (frase imperativa corta). */
    titulo: string;
    /** Aclaración opcional bajo el título del paso. */
    detalle?: string;
    /** Ruta de captura (`/guides/...png`) o, si aún no hay imagen, una descripción
     *  de qué debería mostrar (se renderiza como marcador). */
    captura?: string;
    /** Indica si `captura` es una ruta de imagen real (true) o solo una descripción
     *  pendiente de captura (false / undefined). */
    capturaLista?: boolean;
}

/** Un flujo dentro de una guía (p. ej. "Crear una solicitud"). */
export interface GuiaSeccion {
    id: string;
    titulo: string;
    intro?: string;
    /** "Quién lo usa / permiso necesario" — opcional. */
    quien?: string;
    pasos: GuiaPaso[];
    /** Qué pasa al terminar (estado resultante + confirmación del sistema). */
    resultado?: string;
    /** Errores frecuentes y cómo resolverlos. */
    errores?: string[];
}

export interface Guia {
    id: string;
    /** Módulo/categoría al que pertenece (se usa para filtrar). */
    modulo: string;
    icon: LucideIcon;
    titulo: string;
    descripcion: string;
    estado: GuiaEstado;
    /** Duración estimada de lectura, opcional (ej. "5 min"). */
    duracion?: string;
    /** Secciones paso a paso. Presentes cuando `estado === 'disponible'`. */
    secciones?: GuiaSeccion[];
}

export const GUIAS: Guia[] = [
    {
        id: 'inventario-solicitudes',
        modulo: 'Inventario',
        icon: Package,
        titulo: 'Solicitudes y transferencias',
        descripcion: 'Pedir, mover, aprobar y recibir materiales entre obras y bodegas, paso a paso.',
        estado: 'disponible',
        duracion: '6 min',
        secciones: [
            {
                id: 'pedir',
                titulo: 'Crear una solicitud (Pedir)',
                intro: 'Cuando necesitas material para una obra pero no decides de qué bodega sale. Tú pides y otra persona aprueba.',
                quien: 'Jefe de obra / solicitante.',
                pasos: [
                    {
                        titulo: 'Entra a Inventario → pestaña Transferencias.',
                        captura: 'Pestaña "Transferencias" dentro de Inventario',
                    },
                    {
                        titulo: 'Haz clic en el botón Pedir.',
                        detalle: 'Se abre la ventana "Nueva solicitud".',
                        captura: 'Botón "Pedir" y ventana "Nueva solicitud" abierta',
                    },
                    {
                        titulo: 'Elige la obra de destino en "¿Para qué obra?" y pulsa Siguiente.',
                    },
                    {
                        titulo: 'Busca el material en el catálogo y pulsa Agregar; ajusta la cantidad con –/+.',
                        detalle: 'Bajo cada ítem se muestra cuánto hay en stock.',
                        captura: 'Paso "Ítems" con la lista del catálogo y el stock disponible',
                    },
                    {
                        titulo: 'Pulsa Siguiente, revisa la lista y agrega Observaciones si quieres.',
                    },
                    {
                        titulo: 'Haz clic en Crear solicitud.',
                    },
                ],
                resultado: 'La solicitud queda en estado "Pendiente". Aparece el aviso: "Solicitud TRF-… creada — Queda pendiente de aprobación".',
                errores: [
                    '"Debe especificar un destino" → no elegiste obra en el paso 3.',
                    '"Agrega al menos un ítem." → no agregaste materiales.',
                ],
            },
            {
                id: 'aprobar',
                titulo: 'Aprobar una solicitud',
                intro: 'Revisar una solicitud pendiente y decidir de qué ubicación(es) sale cada material.',
                quien: 'Aprobador (no puede aprobar lo que él mismo pidió).',
                pasos: [
                    {
                        titulo: 'Abre una solicitud en estado "Pendiente".',
                        captura: 'Lista con una transferencia "Pendiente" seleccionada',
                    },
                    {
                        titulo: 'Haz clic en Revisar y aprobar.',
                    },
                    {
                        titulo: 'Para cada ítem, elige de dónde sale tocando una ubicación (bodega o obra).',
                        detalle: 'Si una sola no alcanza, usa "Agregar otra ubicación" para repartir.',
                        captura: 'Panel "Aprobar Transferencia" con las ubicaciones de origen',
                    },
                    {
                        titulo: 'Atajo: el botón Auto-completar reparte las cantidades automáticamente.',
                    },
                    {
                        titulo: 'Haz clic en Confirmar Aprobación.',
                    },
                ],
                resultado: 'La solicitud pasa a "Aprobada". Aviso: "Transferencia aprobada — Siguiente paso: despacharla o avisar al transportista".',
                errores: [
                    '"Revisa las cantidades: exceden el stock o lo solicitado." → corrige las cantidades.',
                    'El botón queda gris si hay errores de stock o no hay nada que enviar.',
                ],
            },
            {
                id: 'recibir',
                titulo: 'Registrar lo que llegó (recepción)',
                intro: 'Cuando el material llega a destino. Puedes recibir en varios viajes o cerrar de una.',
                quien: 'Receptor (no puede recibir lo que él mismo despachó).',
                pasos: [
                    {
                        titulo: 'Abre la transferencia "En Tránsito" y pulsa Registrar lo que llegó.',
                        captura: 'Botón "Registrar lo que llegó" en el detalle',
                    },
                    {
                        titulo: 'En "Llegó este viaje", indica la cantidad recibida de cada ítem.',
                        detalle: 'Atajos: "todo" rellena lo pendiente, "nada" vacía.',
                        captura: 'Panel "Recepción de cargamento" con la tabla de ítems',
                    },
                    {
                        titulo: '(Opcional) Adjunta una foto de la entrega.',
                    },
                    {
                        titulo: 'Si falta material y vendrá en otro viaje, pulsa Faltan más viajes.',
                        detalle: 'La transferencia queda en "Entrega en curso".',
                    },
                    {
                        titulo: 'Si llegó todo, pulsa Esta es toda la entrega para cerrarla.',
                        detalle: 'Si hay diferencias, confirma en "¿Cerrar transferencia?" → "Sí, cerrar igual".',
                    },
                ],
                resultado: 'Cierre total → estado "Recibida" ("Transferencia cerrada ✓"). Si hubo diferencia entre lo enviado y lo recibido, se crea una discrepancia para revisar.',
                errores: [
                    '"Recepción parcial no puede exceder cantidad enviada…" → ajusta la cantidad o cierra con "Esta es toda la entrega".',
                ],
            },
        ],
    },
    {
        id: 'asistencia',
        modulo: 'Asistencia',
        icon: CheckSquare,
        titulo: 'Registrar asistencia',
        descripcion: 'Marcar asistencia diaria de los trabajadores en obra.',
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
