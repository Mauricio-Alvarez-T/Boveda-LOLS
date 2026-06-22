import type { Bodega, CategoriaInventario, ItemInventario, TransferenciaItem } from '../../../types/entities';
import type { StockLocation } from '../../../hooks/inventario/useTransferenciaDetail';

/**
 * Datos de EJEMPLO para las demos interactivas del Centro de ayuda. NO tocan el
 * backend: alimentan los componentes reales (wizard, AprobarForm, RecibirForm)
 * montados en modo sandbox. Tipados con los tipos reales de la app → cualquier
 * cambio de contrato rompe en `tsc`, no en runtime.
 */

export const obrasDemo: { id: number; nombre: string }[] = [
    { id: 1, nombre: 'Edificio Las Condes' },
    { id: 2, nombre: 'Torre Centro' },
    { id: 3, nombre: 'Condominio El Bosque' },
];

export const bodegasDemo: Bodega[] = [
    { id: 101, nombre: 'Bodega Central', direccion: null, responsable_id: null, responsable_nombre: 'Juan Pérez', activa: true, participa_inventario: true, participa_transferencias: true },
    { id: 102, nombre: 'Bodega Norte', direccion: null, responsable_id: null, responsable_nombre: 'María Soto', activa: true, participa_inventario: true, participa_transferencias: true },
];

export const categoriasDemo: CategoriaInventario[] = [
    { id: 1, nombre: 'Moldajes', orden: 1, activo: true },
    { id: 2, nombre: 'Herramientas', orden: 2, activo: true },
    { id: 3, nombre: 'Seguridad', orden: 3, activo: true },
];

export const itemsDemo: ItemInventario[] = [
    { id: 1, nro_item: 101, categoria_id: 1, categoria_nombre: 'Moldajes', descripcion: 'Panel fenólico 1.2 × 2.4 m', m2: 2.88, valor_compra: 45000, valor_arriendo: 1200, unidad: 'un', imagen_url: null, es_consumible: false, propietario: 'lols', activo: true },
    { id: 2, nro_item: 102, categoria_id: 1, categoria_nombre: 'Moldajes', descripcion: 'Puntal metálico regulable 3 m', m2: null, valor_compra: 28000, valor_arriendo: 800, unidad: 'un', imagen_url: null, es_consumible: false, propietario: 'lols', activo: true },
    { id: 3, nro_item: 201, categoria_id: 2, categoria_nombre: 'Herramientas', descripcion: 'Taladro percutor 750 W', m2: null, valor_compra: 89000, valor_arriendo: 2500, unidad: 'un', imagen_url: null, es_consumible: false, propietario: 'lols', activo: true },
    { id: 4, nro_item: 202, categoria_id: 2, categoria_nombre: 'Herramientas', descripcion: 'Esmeril angular 4½"', m2: null, valor_compra: 52000, valor_arriendo: 1500, unidad: 'un', imagen_url: null, es_consumible: false, propietario: 'lols', activo: true },
    { id: 5, nro_item: 301, categoria_id: 3, categoria_nombre: 'Seguridad', descripcion: 'Casco de seguridad', m2: null, valor_compra: 6000, valor_arriendo: 0, unidad: 'un', imagen_url: null, es_consumible: false, propietario: 'lols', activo: true },
];

/** Stock total por ítem (modo Pedir: suma de todas las ubicaciones). */
export const disponibleTotalDemo: Record<number, number> = {
    1: 40,
    2: 120,
    3: 8,
    4: 5,
    5: 60,
};

/** Ítems de una solicitud de ejemplo (para Aprobar y Recibir). */
export const itemsTransferenciaDemo: TransferenciaItem[] = [
    {
        id: 11, transferencia_id: 999, item_id: 1, item_descripcion: 'Panel fenólico 1.2 × 2.4 m',
        cantidad_solicitada: 20, cantidad_enviada: 20, cantidad_recibida: 0, observacion: null, unidad: 'un',
    },
    {
        id: 12, transferencia_id: 999, item_id: 2, item_descripcion: 'Puntal metálico regulable 3 m',
        cantidad_solicitada: 50, cantidad_enviada: 50, cantidad_recibida: 0, observacion: null, unidad: 'un',
    },
    {
        id: 13, transferencia_id: 999, item_id: 3, item_descripcion: 'Taladro percutor 750 W',
        cantidad_solicitada: 2, cantidad_enviada: 2, cantidad_recibida: 0, observacion: null, unidad: 'un',
    },
];

/** Disponibilidad por ítem y ubicación, para el form de aprobación (splits). */
export const stockDataDemo: Record<number, StockLocation[]> = {
    1: [
        { type: 'bodega', id: 101, nombre: 'Bodega Central', cantidad: 12, responsable_nombre: 'Juan Pérez' },
        { type: 'bodega', id: 102, nombre: 'Bodega Norte', cantidad: 28, responsable_nombre: 'María Soto' },
    ],
    2: [
        { type: 'bodega', id: 101, nombre: 'Bodega Central', cantidad: 120, responsable_nombre: 'Juan Pérez' },
    ],
    3: [
        { type: 'bodega', id: 101, nombre: 'Bodega Central', cantidad: 5, responsable_nombre: 'Juan Pérez' },
        { type: 'obra', id: 2, nombre: 'Torre Centro', cantidad: 3 },
    ],
};

/**
 * Stock por ítem y ubicación para el wizard en modo "Mover": al elegir un origen
 * (bodega u obra) no-central, `stockEnOrigen` se calcula filtrando este mapa por
 * `type` + `id` del origen, igual que el wizard real.
 */
export const stockMapDemo: Record<number, StockLocation[]> = {
    1: [
        { type: 'bodega', id: 101, nombre: 'Bodega Central', cantidad: 30, responsable_nombre: 'Juan Pérez' },
        { type: 'bodega', id: 102, nombre: 'Bodega Norte', cantidad: 10, responsable_nombre: 'María Soto' },
        { type: 'obra', id: 1, nombre: 'Edificio Las Condes', cantidad: 8 },
        { type: 'obra', id: 2, nombre: 'Torre Centro', cantidad: 4 },
    ],
    2: [
        { type: 'bodega', id: 101, nombre: 'Bodega Central', cantidad: 120, responsable_nombre: 'Juan Pérez' },
        { type: 'obra', id: 1, nombre: 'Edificio Las Condes', cantidad: 15 },
    ],
    3: [
        { type: 'bodega', id: 101, nombre: 'Bodega Central', cantidad: 6, responsable_nombre: 'Juan Pérez' },
        { type: 'obra', id: 1, nombre: 'Edificio Las Condes', cantidad: 3 },
        { type: 'obra', id: 2, nombre: 'Torre Centro', cantidad: 2 },
    ],
    4: [
        { type: 'bodega', id: 101, nombre: 'Bodega Central', cantidad: 5, responsable_nombre: 'Juan Pérez' },
        { type: 'obra', id: 1, nombre: 'Edificio Las Condes', cantidad: 2 },
    ],
    5: [
        { type: 'bodega', id: 101, nombre: 'Bodega Central', cantidad: 40, responsable_nombre: 'Juan Pérez' },
        { type: 'bodega', id: 102, nombre: 'Bodega Norte', cantidad: 20, responsable_nombre: 'María Soto' },
    ],
};
