import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Layers, Receipt, Plus, ListPlus, Pencil, ImageIcon, ChevronDown, ChevronRight, AlertTriangle, GitBranchPlus } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { Chip } from '../ui/Chip';
import { fmtMoney, fmtNumber, fmtFechaCorta } from '../../utils/format';
import { cn } from '../../utils/cn';
import { CATEGORIAS, CATEGORIAS_GG, CATEGORIAS_MANO_OBRA, CATEGORIAS_SUELDO, TIPOS_DOC, hoyISO, netoGasto, porCompletar, nombreGasto, nombreCategoria, nombreMes } from './costosConfig';
import { BarraAvance, PctGastado } from './piezas';
import type { CostoCategoria, CostoDetalleObra, CostoGasto, CostoPartida } from '../../types/entities';

/** Qué detalle se abre desde el Resumen. */
export type VistaDetalle =
    | { tipo: 'capitulo'; capitulo: string; partidaId?: number }
    | { tipo: 'gastos_generales' }
    | { tipo: 'mano_obra' }
    | { tipo: 'sin_asignar' }
    | { tipo: 'modificaciones' }
    /** Una categoría en un mes (AAAA-MM) o en toda la obra (mes null), desde «Gastos mes a mes». */
    | { tipo: 'categoria'; categoria: CostoCategoria | 'sin_categoria'; mes: string | null };


export interface AccionesDetalle {
    /** Gasto nuevo con la partida o la categoría ya elegida. */
    cargarFactura: (inicial: { partidaId?: number | null; categoria?: CostoCategoria | null }) => void;
    editarGasto: (g: CostoGasto) => void;
    verFoto: (g: CostoGasto) => void;
    editarPartida: (p: CostoPartida) => void;
    agregarPartida: (capitulo?: string) => void;
}

interface Props {
    detalle: CostoDetalleObra;
    vista: VistaDetalle;
    /** Obra cerrada: solo mirar (y ver fotos). */
    bloqueada: boolean;
    acciones: AccionesDetalle;
    onClose: () => void;
}

const conSigno = (n: number) => (n > 0 ? `+${fmtMoney(n)}` : n < 0 ? `−${fmtMoney(-n)}` : '$0');

/**
 * El «¿de dónde sale este número?» del Resumen: un capítulo con sus partidas y, dentro de cada una,
 * las facturas que la componen (proveedor, fecha, monto, foto); o los gastos generales, los gastos
 * sin partida, o las modificaciones del presupuesto. Desde acá se carga una factura (ya asignada),
 * se edita un gasto o una partida y se agrega una partida al capítulo. En el teléfono es un panel
 * desde abajo con tarjetas apiladas y botones de 44 px.
 */
export const DetalleCostos: React.FC<Props> = ({ detalle, vista, bloqueada, acciones, onClose }) => {
    const gastosPorPartida = useMemo(() => {
        const m = new Map<number, CostoGasto[]>();
        for (const g of detalle.gastos) if (g.partida_id) m.set(g.partida_id, [...(m.get(g.partida_id) || []), g]);
        return m;
    }, [detalle.gastos]);

    if (vista.tipo === 'capitulo') {
        return <DetalleCapitulo detalle={detalle} capitulo={vista.capitulo} partidaId={vista.partidaId} gastosPorPartida={gastosPorPartida}
            bloqueada={bloqueada} acciones={acciones} onClose={onClose} />;
    }
    if (vista.tipo === 'modificaciones') {
        return <DetalleModificaciones detalle={detalle} gastosPorPartida={gastosPorPartida} bloqueada={bloqueada} acciones={acciones} onClose={onClose} />;
    }

    // Listas planas: gastos generales, mano de obra y sin asignar (sin partida), o una categoría en un mes.
    const sinPartida = detalle.gastos.filter(g => !g.partida_id);
    let titulo: string, descripcion: string, gastos: CostoGasto[], categoriaNueva: CostoCategoria | null = null;
    let presupuestado: number | null = null;
    if (vista.tipo === 'gastos_generales') {
        titulo = 'Gastos generales';
        descripcion = 'Administración de obra, instalación de faenas (arriendos, servicios, escombros, combustible) y permisos, cargados sin partida.';
        gastos = sinPartida.filter(g => g.categoria && CATEGORIAS_GG.has(g.categoria));
        presupuestado = detalle.resumen.gastos_generales;
        categoriaNueva = 'gastos_generales';
    } else if (vista.tipo === 'mano_obra') {
        titulo = 'Mano de obra';
        descripcion = 'Sueldos, anticipos y subcontratistas sin partida. No tiene un presupuesto aparte: la mano de obra va dentro del precio unitario de cada partida.';
        gastos = sinPartida.filter(g => g.categoria && CATEGORIAS_MANO_OBRA.has(g.categoria));
        categoriaNueva = 'sueldos';
    } else if (vista.tipo === 'sin_asignar') {
        titulo = 'Gastos sin partida';
        descripcion = 'Cuentan en el total gastado, pero en ningún capítulo. Asígnalos a una partida para que el Resumen sea exacto.';
        gastos = sinPartida.filter(g => !g.categoria || (!CATEGORIAS_GG.has(g.categoria) && !CATEGORIAS_MANO_OBRA.has(g.categoria)));
    } else {
        const cat = vista.categoria;
        titulo = nombreCategoria(cat === 'sin_categoria' ? null : cat);
        descripcion = vista.mes ? `Gastos de ${nombreMes(vista.mes)}.` : 'Gastos de toda la obra.';
        gastos = detalle.gastos.filter(g => (cat === 'sin_categoria' ? !g.categoria : g.categoria === cat) && (!vista.mes || g.fecha.slice(0, 7) === vista.mes));
        categoriaNueva = cat === 'sin_categoria' ? null : cat;
    }
    const gastado = gastos.reduce((s, g) => s + netoGasto(g).neto, 0);
    const conPresupuesto = presupuestado !== null;
    return (
        <Modal isOpen onClose={onClose} size="lg" icon={Receipt} title={titulo} description={descripcion}>
            <div className="flex flex-col gap-4">
                <Cifras items={conPresupuesto
                    ? [['Presupuestado', fmtMoney(presupuestado) || '$0'], ['Gastado', fmtMoney(gastado) || '$0'],
                        [gastado > presupuestado! ? 'Pasado' : 'Queda', fmtMoney(Math.abs(presupuestado! - gastado)) || '$0']]
                    : [['Gastado (neto)', fmtMoney(gastado) || '$0'], ['Documentos', String(gastos.length)]]}
                    barra={conPresupuesto ? { presupuestado: presupuestado!, gastado } : undefined} peligro={conPresupuesto && gastado > presupuestado!} />
                {!bloqueada && (
                    <Button onClick={() => acciones.cargarFactura({ categoria: categoriaNueva })} leftIcon={<Plus className="h-4 w-4" />} className="sm:self-start">
                        {categoriaNueva && CATEGORIAS_SUELDO.has(categoriaNueva) ? 'Cargar planilla' : 'Cargar factura'}{categoriaNueva ? ` · ${CATEGORIAS[categoriaNueva]}` : ''}
                    </Button>
                )}
                {gastos.length
                    ? <ListaGastos gastos={gastos} bloqueada={bloqueada} acciones={acciones} />
                    : <p className="rounded-xl bg-muted/50 px-3 py-4 text-center text-sm text-muted-foreground">No hay gastos acá todavía.</p>}
            </div>
        </Modal>
    );
};

// ─── Capítulo: partidas y sus facturas ───────────────────────────────────────

const DetalleCapitulo: React.FC<{
    detalle: CostoDetalleObra; capitulo: string; partidaId?: number; gastosPorPartida: Map<number, CostoGasto[]>;
    bloqueada: boolean; acciones: AccionesDetalle; onClose: () => void;
}> = ({ detalle, capitulo, partidaId, gastosPorPartida, bloqueada, acciones, onClose }) => {
    const partidas = detalle.partidas.filter(p => p.capitulo === capitulo);
    const presupuestado = partidas.reduce((s, p) => s + p.total, 0);
    const gastado = partidas.reduce((s, p) => s + p.gastado, 0);
    const nFacturas = partidas.reduce((s, p) => s + (gastosPorPartida.get(p.id)?.length || 0), 0);
    const [abiertas, setAbiertas] = useState<Set<number>>(() => new Set(partidaId ? [partidaId] : partidas.length === 1 ? [partidas[0].id] : []));
    const toggle = (id: number) => setAbiertas(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

    // La partida que se pidió (desde «Partidas que se pasaron») queda a la vista.
    const refInicial = useRef<HTMLLIElement>(null);
    useEffect(() => { refInicial.current?.scrollIntoView({ block: 'nearest' }); }, []);

    return (
        <Modal isOpen onClose={onClose} size="lg" icon={Layers} title={capitulo}
            description={`${partidas.length} partida${partidas.length === 1 ? '' : 's'} · ${nFacturas} factura${nFacturas === 1 ? '' : 's'} asignada${nFacturas === 1 ? '' : 's'}`}>
            <div className="flex flex-col gap-4">
                <Cifras items={[['Presupuestado', fmtMoney(presupuestado) || '$0'], ['Gastado', fmtMoney(gastado) || '$0'],
                    [gastado > presupuestado ? 'Pasado' : 'Queda', fmtMoney(Math.abs(presupuestado - gastado)) || '$0']]}
                    barra={{ presupuestado, gastado }} peligro={gastado > presupuestado} />

                {!bloqueada && (
                    <div className="grid grid-cols-2 gap-2 sm:flex">
                        <Button onClick={() => acciones.cargarFactura({})} leftIcon={<Plus className="h-4 w-4" />} className="whitespace-nowrap px-3">Cargar factura</Button>
                        <Button variant="glass" onClick={() => acciones.agregarPartida(capitulo)} leftIcon={<ListPlus className="h-4 w-4" />} className="whitespace-nowrap px-3">Nueva partida</Button>
                    </div>
                )}

                {!partidas.length && <p className="rounded-xl bg-muted/50 px-3 py-4 text-center text-sm text-muted-foreground">Este capítulo ya no tiene partidas.</p>}
                <ul className="flex flex-col gap-2">
                    {partidas.map(p => {
                        const gastos = gastosPorPartida.get(p.id) || [];
                        const abierta = abiertas.has(p.id);
                        const pasada = p.gastado > p.total;
                        return (
                            <li key={p.id} ref={p.id === partidaId ? refInicial : undefined}
                                className={cn('overflow-hidden rounded-2xl border bg-card', pasada ? 'border-destructive/40' : 'border-border')}>
                                {/* eslint-disable-next-line no-restricted-syntax -- cabecera desplegable de la partida (nombre, montos, avance); Button no soporta este layout */}
                                <button type="button" onClick={() => toggle(p.id)} aria-expanded={abierta}
                                    className="flex w-full items-start gap-2.5 px-3.5 py-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-primary/40">
                                    {abierta ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
                                    <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                                        <span className="flex items-start justify-between gap-3">
                                            <span className="min-w-0 text-sm font-semibold text-brand-dark">
                                                {p.codigo && <span className="mr-1.5 font-normal text-muted-foreground tabular-nums">{p.codigo}</span>}
                                                {p.descripcion}
                                            </span>
                                            <PctGastado presupuestado={p.total} gastado={p.gastado} className="shrink-0" />
                                        </span>
                                        <BarraAvance presupuestado={p.total} gastado={p.gastado} className="h-1.5" />
                                        <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-caption text-muted-foreground tabular-nums">
                                            <span>{fmtMoney(p.gastado) || '$0'} de {fmtMoney(p.total) || '$0'}{pasada && <span className="font-semibold text-destructive"> · {conSigno(p.gastado - p.total)}</span>}</span>
                                            <span>{fmtNumber(p.cantidad) || '0'} {p.unidad || ''} × {fmtMoney(p.precio_unitario) || '$0'} · {gastos.length} factura{gastos.length === 1 ? '' : 's'}</span>
                                        </span>
                                        {p.origen === 'modificacion' && (
                                            <span className="flex flex-wrap items-center gap-1.5"><Chip tone="info" label="Modificación" />{p.motivo && <span className="text-caption text-muted-foreground">{p.motivo}</span>}</span>
                                        )}
                                    </span>
                                </button>
                                {abierta && (
                                    <div className="flex flex-col gap-2 border-t border-border bg-muted/20 px-3 py-3">
                                        {gastos.length
                                            ? <ListaGastos gastos={gastos} bloqueada={bloqueada} acciones={acciones} compacta />
                                            : <p className="px-1 py-1 text-xs text-muted-foreground">Sin facturas asignadas a esta partida todavía.</p>}
                                        {!bloqueada && (
                                            <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
                                                <Button variant="glass" size="sm" onClick={() => acciones.editarPartida(p)} leftIcon={<Pencil className="h-4 w-4" />} className="h-11 whitespace-nowrap sm:h-9">Editar partida</Button>
                                                <Button size="sm" onClick={() => acciones.cargarFactura({ partidaId: p.id })} leftIcon={<Plus className="h-4 w-4" />} className="h-11 whitespace-nowrap sm:h-9">Factura aquí</Button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            </div>
        </Modal>
    );
};

// ─── Modificaciones del presupuesto ──────────────────────────────────────────

const DetalleModificaciones: React.FC<{
    detalle: CostoDetalleObra; gastosPorPartida: Map<number, CostoGasto[]>; bloqueada: boolean; acciones: AccionesDetalle; onClose: () => void;
}> = ({ detalle, gastosPorPartida, bloqueada, acciones, onClose }) => {
    const mods = detalle.partidas.filter(p => p.origen === 'modificacion');
    const total = mods.reduce((s, p) => s + p.total, 0);
    const original = detalle.resumen.costo_directo_original;
    return (
        <Modal isOpen onClose={onClose} size="lg" icon={GitBranchPlus} title="Modificaciones del presupuesto"
            description="Obras extra y cambios agregados después del presupuesto original, con su motivo.">
            <div className="flex flex-col gap-4">
                <Cifras items={[['Original', fmtMoney(original) || '$0'], ['Modificaciones', fmtMoney(total) || '$0'],
                    ['Creció', original ? `${fmtNumber((total / original) * 100, { decimals: 1 })} %` : '—']]} />
                {!bloqueada && (
                    <Button onClick={() => acciones.agregarPartida()} leftIcon={<ListPlus className="h-4 w-4" />} className="sm:self-start">Agregar modificación</Button>
                )}
                {mods.length ? (
                    <ul className="flex flex-col gap-2">
                        {mods.map(p => {
                            const n = gastosPorPartida.get(p.id)?.length || 0;
                            return (
                                <li key={p.id}>
                                    {/* eslint-disable-next-line no-restricted-syntax -- tarjeta de modificación (motivo, capítulo, montos); Button no soporta este layout */}
                                    <button type="button" disabled={bloqueada} onClick={() => acciones.editarPartida(p)}
                                        className="flex w-full flex-col gap-1 rounded-2xl border border-border bg-card px-3.5 py-3 text-left transition-colors enabled:hover:border-muted-foreground/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 disabled:cursor-default">
                                        <span className="flex items-start justify-between gap-3">
                                            <span className="min-w-0 text-sm font-semibold text-brand-dark">{p.descripcion}</span>
                                            <span className="shrink-0 text-sm font-bold text-brand-dark tabular-nums">{fmtMoney(p.total) || '$0'}</span>
                                        </span>
                                        <span className="text-xs text-brand-dark">{p.motivo || <span className="text-muted-foreground">Sin motivo anotado</span>}</span>
                                        <span className="text-caption text-muted-foreground">
                                            {p.capitulo}{p.created_at ? ` · agregada el ${fmtFechaCorta(p.created_at)}` : ''} · {fmtMoney(p.gastado) || '$0'} gastado en {n} factura{n === 1 ? '' : 's'}
                                        </span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                ) : <p className="rounded-xl bg-muted/50 px-3 py-4 text-center text-sm text-muted-foreground">Sin modificaciones: el presupuesto sigue como el original.</p>}
            </div>
        </Modal>
    );
};

// ─── Piezas ──────────────────────────────────────────────────────────────────

/** Fila de cifras del encabezado del detalle (2 o 3 columnas, también en el teléfono). */
const Cifras: React.FC<{ items: [string, string][]; barra?: { presupuestado: number; gastado: number }; peligro?: boolean }> = ({ items, barra, peligro }) => (
    <div className="flex flex-col gap-2 rounded-2xl bg-muted/50 px-3.5 py-3">
        <dl className={cn('grid gap-2', items.length === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
            {items.map(([l, v], i) => (
                <div key={l} className="min-w-0">
                    <dt className="text-caption font-semibold uppercase tracking-wider text-muted-foreground">{l}</dt>
                    <dd className={cn('text-sm font-bold tabular-nums break-all sm:text-base', peligro && i === items.length - 1 ? 'text-destructive' : 'text-brand-dark')}>{v}</dd>
                </div>
            ))}
        </dl>
        {barra && (
            <div className="flex items-center gap-2">
                <BarraAvance presupuestado={barra.presupuestado} gastado={barra.gastado} className="flex-1" />
                <PctGastado presupuestado={barra.presupuestado} gastado={barra.gastado} />
            </div>
        )}
    </div>
);

/** Facturas como tarjetas: tocar abre el gasto para completarlo o corregirlo; la foto, aparte. */
const ListaGastos: React.FC<{ gastos: CostoGasto[]; bloqueada: boolean; acciones: AccionesDetalle; compacta?: boolean }> = ({ gastos, bloqueada, acciones, compacta }) => {
    const hoy = hoyISO();
    return (
        <ul className="flex flex-col gap-2">
            {gastos.map(g => {
                const { neto, estimado } = netoGasto(g);
                const falta = porCompletar(g);
                const vencida = g.estado_pago === 'por_pagar' && !!g.fecha_vencimiento && g.fecha_vencimiento.slice(0, 10) < hoy;
                const abrir = () => (bloqueada ? (g.tiene_foto ? acciones.verFoto(g) : undefined) : acciones.editarGasto(g));
                return (
                    <li key={g.id} className={cn('flex items-stretch gap-1 rounded-xl border border-border bg-card', compacta ? '' : 'shadow-none')}>
                        {/* eslint-disable-next-line no-restricted-syntax -- tarjeta de factura (proveedor, fecha, montos y estado); Button no soporta este layout */}
                        <button type="button" onClick={abrir} disabled={bloqueada && !g.tiene_foto}
                            className="flex min-w-0 flex-1 flex-col gap-1 px-3 py-2.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 disabled:cursor-default rounded-xl">
                            <span className="flex items-start justify-between gap-3">
                                <span className={cn('min-w-0 truncate text-sm font-semibold', g.proveedor || g.tipo_documento === 'planilla' ? 'text-brand-dark' : 'text-muted-foreground')}>{nombreGasto(g)}</span>
                                <span className="shrink-0 text-sm font-bold text-brand-dark tabular-nums">{fmtMoney(g.monto_total)}</span>
                            </span>
                            <span className="flex flex-wrap items-center justify-between gap-x-3 text-caption text-muted-foreground tabular-nums">
                                <span>{fmtFechaCorta(g.fecha)} · {TIPOS_DOC[g.tipo_documento]}{g.folio ? ` N° ${g.folio}` : ''}</span>
                                <span>{estimado ? 'neto ≈ ' : 'neto '}{fmtMoney(neto)}</span>
                            </span>
                            <span className="flex flex-wrap items-center gap-1.5">
                                {!g.partida_id && g.categoria && <span className="text-caption text-brand-dark">{CATEGORIAS[g.categoria]}</span>}
                                {falta && <Chip tone="warning" icon={<AlertTriangle className="h-3 w-3" />} label="Por completar" />}
                                {estimado && <Chip tone="warning" label="Neto estimado" />}
                                {g.estado_pago === 'pagada' ? <Chip tone="success" label="Pagada" />
                                    : vencida ? <Chip tone="danger" label={`Vencida ${fmtFechaCorta(g.fecha_vencimiento)}`} />
                                        : <Chip tone="warning" label={g.fecha_vencimiento ? `Por pagar · vence ${fmtFechaCorta(g.fecha_vencimiento)}` : 'Por pagar'} />}
                                {g.observacion && <span className="w-full truncate text-caption text-muted-foreground">{g.observacion}</span>}
                            </span>
                        </button>
                        {g.tiene_foto && (
                            <span className="flex items-center pr-1">
                                <IconButton icon={<ImageIcon className="h-4 w-4" />} aria-label={`Ver la foto de ${nombreGasto(g)}`} onClick={() => acciones.verFoto(g)} />
                            </span>
                        )}
                    </li>
                );
            })}
        </ul>
    );
};

export default DetalleCostos;
