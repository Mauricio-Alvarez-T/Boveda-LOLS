/**
 * Configuración centralizada de estados/badges (Design System, Fase 2).
 *
 * Consolida los mapas de estado que hoy viven dispersos (TransferenciasList,
 * MovimientosTab, DiscrepanciaDetail, StockBadge) + los ternarios inline
 * (obra, asistencia, revisión vehículo). Lo consume `<StatusBadge>`.
 *
 * ⚠️ TAILWIND v4 JIT: cada string de clase DEBE ser un literal estático
 * completo. NUNCA concatenar fragmentos (`'bg-' + color`) — el JIT no genera
 * la clase y el pill queda sin color. Por eso las clases se copian verbatim.
 *
 * NOTA F2.1: este módulo es ADITIVO. Las fuentes originales (ej. el
 * `estadoConfig` exportado por TransferenciasList) siguen intactas hasta que
 * cada página se migre (F2.2+) y se borren los duplicados.
 */

import type { ElementType } from 'react';
import {
    Clock, CheckCircle2, Truck, PackageOpen, PackageCheck, XCircle, Ban,
    ArrowUp, ArrowDown,
} from 'lucide-react';

export interface StatusConfigEntry {
    label: string;
    /** Literal Tailwind COMPLETO para el pill: bg + text + border (+ dark:). */
    classes: string;
    /** Icono lucide opcional. */
    icon?: ElementType;
    /** Acento de borde izquierdo opcional (ej. 'border-l-green-500') para filas. */
    borderLeft?: string;
}

export type StatusMap<K extends string> = Record<K, StatusConfigEntry>;

/* ── Paleta compartida (de TransferenciasList) ──────────────────────── */
const NEUTRAL = 'bg-muted text-muted-foreground border-border dark:bg-muted dark:text-muted-foreground dark:border-border';
const GREEN = 'bg-green-100 text-green-700 border-green-200 dark:bg-green-500/15 dark:text-green-300 dark:border-green-800/60';
const RED = 'bg-red-100 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-800/60';
const AMBER = 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-800/60';

/* ── Transferencias: estado ─────────────────────────────────────────── */
export type TransferenciaEstado =
    | 'pendiente' | 'aprobada' | 'en_transito' | 'recepcion_parcial'
    | 'recibida' | 'rechazada' | 'cancelada';

export const transferenciaEstadoConfig: StatusMap<TransferenciaEstado> = {
    pendiente:         { label: 'Pendiente',        classes: RED,     icon: Clock,        borderLeft: 'border-l-red-400' },
    aprobada:          { label: 'Aprobada',         classes: GREEN,   icon: CheckCircle2, borderLeft: 'border-l-green-500' },
    en_transito:       { label: 'En Tránsito',      classes: NEUTRAL, icon: Truck,        borderLeft: 'border-l-border' },
    recepcion_parcial: { label: 'Entrega en curso', classes: NEUTRAL, icon: PackageOpen,  borderLeft: 'border-l-border' },
    recibida:          { label: 'Recibida',         classes: GREEN,   icon: PackageCheck, borderLeft: 'border-l-green-500' },
    rechazada:         { label: 'Rechazada',        classes: RED,     icon: XCircle,      borderLeft: 'border-l-red-400' },
    cancelada:         { label: 'Cancelada',        classes: NEUTRAL, icon: Ban,          borderLeft: 'border-l-border' },
};

/* ── Transferencias: tipo de flujo (info secundaria, todo neutro) ───── */
const FLUJO_NEUTRAL = 'bg-muted text-muted-foreground border-border';
export type TipoFlujo =
    | 'solicitud' | 'solicitud_materiales' | 'push_directo' | 'intra_bodega'
    | 'intra_obra' | 'orden_gerencia' | 'devolucion';

export const tipoFlujoConfig: StatusMap<TipoFlujo> = {
    solicitud:            { label: 'Solicitud',         classes: FLUJO_NEUTRAL },
    solicitud_materiales: { label: 'Mat. construcción', classes: FLUJO_NEUTRAL },
    push_directo:         { label: 'Push directo',      classes: FLUJO_NEUTRAL },
    intra_bodega:         { label: 'Intra-bodega',      classes: FLUJO_NEUTRAL },
    intra_obra:           { label: 'Intra-obra',        classes: FLUJO_NEUTRAL },
    orden_gerencia:       { label: 'Orden gerencia',    classes: FLUJO_NEUTRAL },
    devolucion:           { label: 'Devolución',        classes: FLUJO_NEUTRAL },
};

/* ── Discrepancias: estado de item (de DiscrepanciaDetail) ──────────── */
export type DiscrepanciaEstado = 'pendiente' | 'resuelta' | 'descartada';

export const discrepanciaEstadoConfig: StatusMap<DiscrepanciaEstado> = {
    pendiente:  { label: 'Pendiente',  classes: AMBER, icon: Clock },
    resuelta:   { label: 'Resuelta',   classes: GREEN, icon: CheckCircle2 },
    descartada: { label: 'Descartada', classes: 'bg-gray-100 text-gray-500 border-gray-200 dark:bg-muted dark:text-muted-foreground dark:border-border', icon: Ban },
};

/* ── Movimientos (kardex): tipo (de MovimientosTab TIPO_META) ───────── */
export type MovimientoTipo =
    | 'ajuste_manual' | 'transferencia_salida' | 'transferencia_entrada'
    | 'discrepancia' | 'factura' | 'recepcion';

export const movimientoTipoConfig: StatusMap<MovimientoTipo> = {
    ajuste_manual:         { label: 'Ajuste manual',   classes: 'bg-amber-100 text-amber-800 border-amber-200' },
    transferencia_salida:  { label: 'Transf. salida',  classes: 'bg-red-50 text-red-700 border-red-200',   icon: ArrowUp },
    transferencia_entrada: { label: 'Transf. entrada', classes: 'bg-green-50 text-green-700 border-green-200', icon: ArrowDown },
    discrepancia:          { label: 'Diferencia',    classes: 'bg-purple-50 text-purple-700 border-purple-200' },
    factura:               { label: 'Factura',         classes: 'bg-blue-50 text-blue-700 border-blue-200' },
    recepcion:             { label: 'Recepción',       classes: 'bg-teal-50 text-teal-700 border-teal-200' },
};

/* ── Stock (de StockBadge) ──────────────────────────────────────────── */
export type StockEstado = 'ok' | 'justo' | 'insuficiente' | 'vacio';

export const stockEstadoConfig: StatusMap<StockEstado> = {
    ok:           { label: 'OK',           classes: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-500/15 dark:text-green-300 dark:border-green-800/60' },
    justo:        { label: 'Justo',        classes: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-800/60' },
    insuficiente: { label: 'Insuficiente', classes: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-800/60' },
    vacio:        { label: 'Sin stock',    classes: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-800/60' },
};

/* ── Asistencia: justificación ──────────────────────────────────────── */
export type AsistenciaJustif = 'justificada' | 'no_justificada';

export const asistenciaConfig: StatusMap<AsistenciaJustif> = {
    justificada:    { label: 'Justificada',    classes: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-500/15 dark:text-green-300 dark:border-green-800/60' },
    no_justificada: { label: 'No justificada', classes: RED },
};

/* ── Obra: estado operativo ─────────────────────────────────────────── */
export type ObraEstado = 'activa' | 'inactiva' | 'prueba' | 'finalizada';

export const obraEstadoConfig: StatusMap<ObraEstado> = {
    activa:     { label: 'Activa',     classes: 'bg-brand-accent/10 text-brand-accent border-brand-accent/20' },
    inactiva:   { label: 'Inactiva',   classes: 'bg-destructive/10 text-destructive border-destructive/20' },
    prueba:     { label: 'Prueba',     classes: 'bg-amber-500/15 text-amber-600 border-amber-500/30' },
    finalizada: { label: 'Finalizada', classes: 'bg-muted text-muted-foreground border-border' },
};

/* ── Vehículo: resultado de revisión técnica ────────────────────────── */
export type VehiculoRevision = 'aprobado' | 'rechazado' | 'pendiente';

export const vehiculoRevisionConfig: StatusMap<VehiculoRevision> = {
    aprobado:  { label: 'Aprobado',  classes: GREEN },
    rechazado: { label: 'Rechazado', classes: RED },
    pendiente: { label: 'Pendiente', classes: AMBER },
};

/* ── Sábado Extra: estado de citación ───────────────────────────────── */
export type SabadoEstado = 'citada' | 'realizada' | 'cancelada';

export const sabadoEstadoConfig: StatusMap<SabadoEstado> = {
    citada:    { label: 'Citada',    classes: AMBER,   icon: Clock },
    realizada: { label: 'Realizada', classes: GREEN,   icon: CheckCircle2 },
    cancelada: { label: 'Cancelada', classes: NEUTRAL, icon: Ban },
};

/* ── Registro por dominio (para <StatusBadge domain=... />) ─────────── */
export const statusDomains = {
    transferencia: transferenciaEstadoConfig,
    tipoFlujo: tipoFlujoConfig,
    discrepancia: discrepanciaEstadoConfig,
    movimiento: movimientoTipoConfig,
    stock: stockEstadoConfig,
    asistencia: asistenciaConfig,
    obra: obraEstadoConfig,
    vehiculoRevision: vehiculoRevisionConfig,
    sabadoEstado: sabadoEstadoConfig,
} as const;

export type StatusDomain = keyof typeof statusDomains;

/** Entrada neutra de respaldo cuando la clave no existe en el mapa. */
export const FALLBACK_STATUS: StatusConfigEntry = { label: '—', classes: NEUTRAL };
