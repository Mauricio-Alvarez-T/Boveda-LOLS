/**
 * Las pestañas del módulo Inventario y el permiso que abre cada una: LA lista de `pages/Inventario.tsx` (que le pone
 * el ícono a cada una), pura para que la ficha de «Soporte · usuarios» diga qué pestañas ve una persona con la misma
 * regla. El acceso al módulo entero va un nivel arriba (`inventario.ver`, menú lateral).
 */
export type PestanaInventario = 'resumen_ejecutivo' | 'resumen' | 'por_ubicacion' | 'transferencias' | 'maestro' | 'bombas' | 'movimientos' | 'facturas';

export interface DefPestanaInventario {
    key: PestanaInventario;
    label: string;
    shortLabel: string;
    requiresPerm: string;
}

export const PESTANAS_INVENTARIO: readonly DefPestanaInventario[] = [
    { key: 'resumen_ejecutivo', label: 'Resumen Ejecutivo', shortLabel: 'Ejecutivo', requiresPerm: 'inventario.tab.resumen_ejecutivo' },
    { key: 'resumen', label: 'Resumen', shortLabel: 'Resumen', requiresPerm: 'inventario.tab.resumen' },
    { key: 'por_ubicacion', label: 'Por Obra/Bodega', shortLabel: 'Obra/Bod.', requiresPerm: 'inventario.tab.por_ubicacion' },
    { key: 'transferencias', label: 'Solicitudes', shortLabel: 'Solicitudes', requiresPerm: 'inventario.tab.transferencias' },
    { key: 'maestro', label: 'Maestro', shortLabel: 'Maestro', requiresPerm: 'inventario.tab.maestro' },
    { key: 'bombas', label: 'Hormigón', shortLabel: 'Hormigón', requiresPerm: 'inventario.tab.bombas' },
    { key: 'facturas', label: 'Facturas', shortLabel: 'Facturas', requiresPerm: 'inventario.facturas.ver' },
    { key: 'movimientos', label: 'Movimientos', shortLabel: 'Movim.', requiresPerm: 'inventario.movimientos.ver' },
];

/** Las pestañas que ve esa persona, en orden (`tiene` = `hasPermission`, o los permisos efectivos de la ficha). */
export const pestanasInventarioVisibles = (tiene: (permiso: string) => boolean): DefPestanaInventario[] =>
    PESTANAS_INVENTARIO.filter(t => tiene(t.requiresPerm));
