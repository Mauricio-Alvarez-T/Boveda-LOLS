import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Minus, FileText, Trash2, Receipt, PackagePlus, Eye, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import api from '../../services/api';
import type { FacturaInventario, ItemInventario, CategoriaInventario } from '../../types/entities';
import type { ApiResponse } from '../../types';
import { cn } from '../../utils/cn';
import { Modal } from '../ui/Modal';
import { SearchableSelect } from '../ui/SearchableSelect';
import { FieldError } from '../ui/FieldError';
import { QtyStepper } from '../ui/QtyStepper';
import { fmtFecha } from '../../utils/fechas';
import { formatBodegaConResponsable } from '../../utils/formatBodega';

const fmtMoney = (n: number) => `$${Number(n).toLocaleString('es-CL')}`;

interface Props {
    canCreate: boolean;
    canDelete: boolean;
}

/* ── Line item inside the create form ── */
interface LineItem {
    item_id: number;
    descripcion: string;
    unidad: string;
    // Permiten '' (vacío) mientras el usuario edita; se coercen a número al calcular/guardar.
    cantidad: number | '';
    precio_unitario: number | '';
    destino_type: 'obra' | 'bodega';
    destino_id: number;
}

const FacturasTab: React.FC<Props> = ({ canCreate, canDelete }) => {
    const [facturas, setFacturas] = useState<FacturaInventario[]>([]);
    const [loading, setLoading] = useState(false);

    /* ── Modal state ── */
    const [showModal, setShowModal] = useState(false);

    /* ── Vista previa (detalle) ── */
    const [detalleId, setDetalleId] = useState<number | null>(null);
    const [detalle, setDetalle] = useState<any | null>(null);

    /* ── Form state ── */
    const [numFactura, setNumFactura] = useState('');
    const [proveedor, setProveedor] = useState('');
    const [fechaFactura, setFechaFactura] = useState(() => new Date().toISOString().slice(0, 10));
    const [observaciones, setObservaciones] = useState('');
    const [items, setItems] = useState<LineItem[]>([]);
    const [submitting, setSubmitting] = useState(false);
    // Errores de validación inline (los mostramos bajo cada campo con <FieldError>).
    const [formErrors, setFormErrors] = useState<{ numFactura?: string; proveedor?: string; items?: string }>({});

    /* ── Catalog data for selects ── */
    const [catalogoItems, setCatalogoItems] = useState<ItemInventario[]>([]);
    const [obras, setObras] = useState<{ id: number; nombre: string }[]>([]);
    const [bodegas, setBodegas] = useState<{ id: number; nombre: string }[]>([]);

    /* ── Crear ítem nuevo inline ── */
    const [categorias, setCategorias] = useState<CategoriaInventario[]>([]);
    const [showNewItemModal, setShowNewItemModal] = useState(false);
    const [newItemTargetIdx, setNewItemTargetIdx] = useState<number | null>(null);
    const [creatingItem, setCreatingItem] = useState(false);
    const [newItem, setNewItem] = useState({ categoria_id: '' as number | '', descripcion: '', unidad: 'U', valor_compra: '' });

    /* ── Fetch facturas ── */
    const fetchFacturas = async () => {
        setLoading(true);
        try {
            const res = await api.get('/facturas-inventario');
            setFacturas(res.data.data || []);
        } catch { setFacturas([]); }
        finally { setLoading(false); }
    };

    useEffect(() => { fetchFacturas(); }, []);

    /* ── Fetch catalog when modal opens ── */
    useEffect(() => {
        if (!showModal) return;
        api.get<ApiResponse<ItemInventario[]>>('/items-inventario?activo=true&limit=500')
            .then(res => setCatalogoItems(res.data.data))
            .catch(() => {});
        api.get('/obras?participa_inventario=1').then(res => setObras(res.data.data || [])).catch(() => {});
        api.get('/bodegas').then(res => setBodegas(res.data.data || [])).catch(() => {});
        api.get<ApiResponse<CategoriaInventario[]>>('/categorias-inventario?activo=true&limit=100')
            .then(res => setCategorias(res.data.data || []))
            .catch(() => {});
    }, [showModal]);

    /* ── Abrir modal de creación de ítem para una línea concreta ── */
    const openNewItem = (idx: number) => {
        setNewItemTargetIdx(idx);
        setNewItem({ categoria_id: '', descripcion: '', unidad: 'U', valor_compra: '' });
        setShowNewItemModal(true);
    };

    /* ── Crear ítem en catálogo y auto-seleccionarlo en la línea ── */
    const handleCreateItem = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newItem.categoria_id) { toast.error('Selecciona una categoría'); return; }
        if (!newItem.descripcion.trim()) { toast.error('Ingresa la descripción'); return; }
        if (!newItem.unidad.trim()) { toast.error('Ingresa la unidad'); return; }

        setCreatingItem(true);
        try {
            const payload: Record<string, unknown> = {
                categoria_id: Number(newItem.categoria_id),
                descripcion: newItem.descripcion.trim(),
                unidad: newItem.unidad.trim(),
            };
            if (newItem.valor_compra.trim() !== '') payload.valor_compra = Number(newItem.valor_compra) || 0;

            const res = await api.post('/items-inventario', payload);
            // El CRUD genérico devuelve el ítem DIRECTO (res.data), no envuelto en { data }.
            // Soportamos ambas formas y validamos que llegó con id (si no, no contaminamos el catálogo).
            const created: any = (res.data as any)?.data ?? res.data;
            if (!created || created.id == null) {
                throw new Error('La respuesta del servidor no incluyó el ítem creado');
            }
            // Refrescar catálogo e insertar el nuevo ítem para que el selector lo encuentre
            setCatalogoItems(prev => [...prev, created]);
            // Auto-seleccionar en la línea que disparó la creación
            if (newItemTargetIdx != null) {
                updateItem(newItemTargetIdx, {
                    item_id: created.id,
                    descripcion: created.descripcion,
                    unidad: created.unidad,
                    precio_unitario: created.valor_compra || '',
                });
            }
            toast.success(`Ítem "${created.descripcion}" creado y vinculado`);
            setShowNewItemModal(false);
            setNewItemTargetIdx(null);
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Error al crear el ítem');
        } finally {
            setCreatingItem(false);
        }
    };

    /* ── Reset form when modal closes ── */
    const resetForm = () => {
        setNumFactura('');
        setProveedor('');
        setFechaFactura(new Date().toISOString().slice(0, 10));
        setObservaciones('');
        setItems([]);
    };

    const handleClose = () => {
        setShowModal(false);
        resetForm();
        setFormErrors({});
    };

    /* ── Item helpers ── */
    const addItem = () => {
        setItems([...items, {
            item_id: 0, descripcion: '', unidad: 'U',
            cantidad: 1, precio_unitario: '',
            destino_type: 'bodega', destino_id: 0,
        }]);
    };

    const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx));

    const updateItem = (idx: number, patch: Partial<LineItem>) => {
        const updated = [...items];
        updated[idx] = { ...updated[idx], ...patch };
        setItems(updated);
    };

    const selectCatalogItem = (idx: number, value: string | number | null) => {
        const found = catalogoItems.find(c => c.id === Number(value));
        updateItem(idx, {
            item_id: Number(value) || 0,
            descripcion: found?.descripcion || '',
            unidad: found?.unidad || 'U',
            precio_unitario: found?.valor_compra || '',
        });
    };

    /* ── Computed total ── */
    const montoNeto = useMemo(
        () => items.reduce((sum, i) => sum + (Number(i.cantidad) || 0) * (Number(i.precio_unitario) || 0), 0),
        [items],
    );

    const availableOptions = useMemo(() =>
        catalogoItems.filter(Boolean).map(c => ({
            value: c.id,
            label: `${c.nro_item ? c.nro_item + ' — ' : ''}${c.descripcion} (${c.unidad})`,
        })),
    [catalogoItems]);

    const destinoOptions = useMemo(() => [
        ...obras.map(o => ({ value: `obra-${o.id}`, label: `Obra: ${o.nombre}` })),
        ...bodegas.map(b => ({ value: `bodega-${b.id}`, label: `Bodega: ${formatBodegaConResponsable(b)}` })),
    ], [obras, bodegas]);

    /* ── Submit ── */
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        // Validación inline: cada error aparece bajo su campo (no toast).
        const errs: typeof formErrors = {};
        if (!numFactura.trim()) errs.numFactura = 'Ingresa el número de factura';
        if (!proveedor.trim()) errs.proveedor = 'Ingresa el proveedor';
        if (!items.length || items.some(i => !i.item_id || Number(i.cantidad) < 1 || !i.destino_id)) {
            errs.items = 'Agrega al menos un ítem con cantidad (mínimo 1) y destino válido';
        }
        setFormErrors(errs);
        if (Object.keys(errs).length > 0) return;

        setSubmitting(true);
        try {
            await api.post('/facturas-inventario', {
                numero_factura: numFactura.trim(),
                proveedor: proveedor.trim(),
                fecha_factura: fechaFactura,
                monto_neto: montoNeto,
                observaciones: observaciones || undefined,
                items: items.map(i => ({
                    item_id: i.item_id,
                    obra_id: i.destino_type === 'obra' ? i.destino_id : null,
                    bodega_id: i.destino_type === 'bodega' ? i.destino_id : null,
                    cantidad: Number(i.cantidad) || 0,
                    precio_unitario: Number(i.precio_unitario) || 0,
                })),
            });
            toast.success('Factura registrada correctamente');
            handleClose();
            fetchFacturas();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Error al crear factura');
        } finally {
            setSubmitting(false);
        }
    };

    /* ── Vista previa: cargar detalle con ítems ── */
    const openDetalle = async (id: number) => {
        setDetalleId(id);
        setDetalle(null);
        try {
            const res = await api.get(`/facturas-inventario/${id}`);
            setDetalle(res.data.data);
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'No se pudo cargar la factura');
            setDetalleId(null);
        }
    };

    /* ── Anular ── */
    const handleAnular = async (id: number) => {
        if (!window.confirm('Esta accion anulara la factura y revertira el stock. Continuar?')) return;
        try {
            await api.put(`/facturas-inventario/${id}/anular`);
            toast.success('Factura anulada');
            fetchFacturas();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Error al anular');
        }
    };

    /* ── Render ── */
    if (loading) return <div className="py-8 text-center text-muted-foreground text-sm">Cargando facturas...</div>;

    return (
        <div className="space-y-4">
            {/* Header + Create button */}
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-brand-primary">Facturas de Inventario</h3>
                {canCreate && (
                    <button
                        onClick={() => setShowModal(true)}
                        className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-white bg-brand-primary rounded-xl hover:bg-brand-primary/90 transition-all shadow-lg shadow-brand-primary/20"
                    >
                        <Plus className="h-3.5 w-3.5" />
                        Nueva Factura
                    </button>
                )}
            </div>

            {/* List */}
            {facturas.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                    <FileText className="h-10 w-10 mx-auto opacity-20 mb-3" />
                    <p className="text-sm font-medium">No hay facturas registradas</p>
                    {canCreate && (
                        <p className="text-xs mt-1">Haz click en <span className="font-bold text-brand-dark">+ Nueva Factura</span> para registrar la primera</p>
                    )}
                </div>
            ) : (
                <div className="space-y-2">
                    {facturas.map(f => (
                        <div
                            key={f.id}
                            onClick={() => openDetalle(f.id)}
                            title="Ver detalle de la factura"
                            className="flex items-center justify-between px-4 py-3 rounded-xl border border-border hover:border-brand-primary/40 hover:bg-muted/40 transition-colors cursor-pointer"
                        >
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5">
                                    <span className="text-xs font-bold text-brand-dark">#{f.numero_factura}</span>
                                    <span className="text-caption text-muted-foreground">{f.proveedor}</span>
                                </div>
                                <p className="text-label text-muted-foreground">
                                    {fmtFecha(f.fecha_factura)} &middot; {fmtMoney(f.monto_neto)} neto
                                </p>
                            </div>
                            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                {!f.activo && (
                                    <span className="text-micro font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-800/60">ANULADA</span>
                                )}
                                <button onClick={() => openDetalle(f.id)} title="Ver detalle"
                                    className="p-1.5 text-muted-foreground hover:text-brand-primary hover:bg-brand-primary/10 rounded-lg transition-colors">
                                    <Eye className="h-3.5 w-3.5" />
                                </button>
                                {canDelete && f.activo && (
                                    <button onClick={() => handleAnular(f.id)} title="Anular factura (revierte stock)" className="p-1.5 text-destructive/60 hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors">
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* ═══ VISTA PREVIA (DETALLE) ═══ */}
            <Modal
                isOpen={detalleId !== null}
                onClose={() => { setDetalleId(null); setDetalle(null); }}
                title={detalle ? `Factura #${detalle.numero_factura}` : 'Factura'}
                size="lg"
            >
                {!detalle ? (
                    <div className="py-12 flex flex-col items-center justify-center text-muted-foreground">
                        <Loader2 className="h-6 w-6 animate-spin mb-2" />
                        <p className="text-sm">Cargando factura…</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {/* Cabecera */}
                        <div className="bg-muted rounded-xl border border-border p-4">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-black text-brand-dark">#{detalle.numero_factura}</span>
                                {!detalle.activo && (
                                    <span className="text-micro font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-800/60">ANULADA</span>
                                )}
                            </div>
                            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs">
                                <p className="text-muted-foreground">Proveedor: <span className="font-semibold text-brand-dark">{detalle.proveedor}</span></p>
                                <p className="text-muted-foreground">Fecha: <span className="font-semibold text-brand-dark">{fmtFecha(detalle.fecha_factura)}</span></p>
                                {detalle.registrado_por_nombre && (
                                    <p className="text-muted-foreground">Registró: <span className="font-semibold text-brand-dark">{detalle.registrado_por_nombre}</span></p>
                                )}
                            </div>
                        </div>

                        {/* Ítems */}
                        <div>
                            <p className="text-xs font-bold text-brand-dark mb-2">Ítems</p>
                            <div className="space-y-2">
                                {(detalle.items || []).map((it: any, idx: number) => (
                                    <div key={idx} className="flex items-start justify-between gap-3 px-3 py-2 rounded-xl border border-border">
                                        <div className="min-w-0">
                                            <p className="text-xs font-semibold text-brand-dark truncate">{it.item_descripcion}</p>
                                            <p className="text-caption text-muted-foreground">
                                                {Number(it.cantidad).toLocaleString('es-CL')} {it.unidad} &middot; {fmtMoney(it.precio_unitario)} c/u
                                                {it.obra_nombre ? ` · Obra: ${it.obra_nombre}` : it.bodega_nombre ? ` · Bodega: ${it.bodega_nombre}` : ''}
                                            </p>
                                        </div>
                                        <span className="text-xs font-bold text-brand-dark shrink-0">
                                            {fmtMoney(Number(it.cantidad) * Number(it.precio_unitario))}
                                        </span>
                                    </div>
                                ))}
                                {(!detalle.items || detalle.items.length === 0) && (
                                    <p className="text-xs text-muted-foreground italic">Sin ítems.</p>
                                )}
                            </div>
                        </div>

                        {/* Total */}
                        <div className="flex items-center justify-between bg-muted rounded-xl px-4 py-3 border border-border">
                            <span className="text-xs font-bold text-brand-dark flex items-center gap-1.5">
                                <Receipt className="h-3.5 w-3.5 text-brand-primary" /> Total Neto
                            </span>
                            <span className="text-sm font-black text-brand-dark">{fmtMoney(detalle.monto_neto)}</span>
                        </div>

                        {/* Observaciones */}
                        {detalle.observaciones && (
                            <div>
                                <p className="text-xs font-bold text-brand-dark mb-1">Observaciones</p>
                                <p className="text-xs text-muted-foreground whitespace-pre-wrap">{detalle.observaciones}</p>
                            </div>
                        )}
                    </div>
                )}
            </Modal>

            {/* ═══ CREATE MODAL ═══ */}
            <Modal isOpen={showModal} onClose={handleClose} title="Registrar Factura de Inventario" size="lg">
                <form onSubmit={handleSubmit} className="space-y-5" noValidate>
                    {/* Row 1: Numero + Proveedor */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-bold text-brand-dark mb-1 block">N° Factura</label>
                            <input
                                type="text"
                                value={numFactura}
                                onChange={e => { setNumFactura(e.target.value); if (formErrors.numFactura) setFormErrors(p => ({ ...p, numFactura: undefined })); }}
                                placeholder="Ej: 001234"
                                className={cn(
                                    "w-full px-3 py-2 text-sm border rounded-xl focus:ring-2 focus:ring-brand-primary/20 outline-none",
                                    formErrors.numFactura ? "border-destructive" : "border-border"
                                )}
                            />
                            <FieldError message={formErrors.numFactura} className="mt-1" />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-brand-dark mb-1 block">Proveedor</label>
                            <input
                                type="text"
                                value={proveedor}
                                onChange={e => { setProveedor(e.target.value); if (formErrors.proveedor) setFormErrors(p => ({ ...p, proveedor: undefined })); }}
                                placeholder="Nombre del proveedor"
                                className={cn(
                                    "w-full px-3 py-2 text-sm border rounded-xl focus:ring-2 focus:ring-brand-primary/20 outline-none",
                                    formErrors.proveedor ? "border-destructive" : "border-border"
                                )}
                            />
                            <FieldError message={formErrors.proveedor} className="mt-1" />
                        </div>
                    </div>

                    {/* Row 2: Fecha */}
                    <div className="w-48">
                        <label className="text-xs font-bold text-brand-dark mb-1 block">Fecha Factura</label>
                        <input
                            type="date"
                            value={fechaFactura}
                            onChange={e => setFechaFactura(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:ring-2 focus:ring-brand-primary/20 outline-none"
                        />
                    </div>

                    {/* Items */}
                    <div>
                        <label className="text-xs font-bold text-brand-dark mb-2 block">Items de la factura</label>
                        <div className="space-y-2">
                            {items.map((item, idx) => (
                                <div key={idx} className="bg-muted rounded-xl border border-border p-3 space-y-3">
                                    {/* Item selector + crear nuevo */}
                                    <div className="flex items-center gap-2">
                                        <div className="flex-1 min-w-0">
                                            <SearchableSelect
                                                options={availableOptions.filter(o => !items.some((i, j) => j !== idx && i.item_id === o.value))}
                                                value={item.item_id || null}
                                                onChange={(val) => selectCatalogItem(idx, val)}
                                                placeholder="Buscar item..."
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => openNewItem(idx)}
                                            title="Crear un ítem nuevo en el catálogo"
                                            className="flex items-center gap-1 px-2.5 py-2 text-label font-bold text-green-700 dark:text-green-300 bg-brand-primary/10 hover:bg-brand-primary/20 rounded-lg transition-colors shrink-0 whitespace-nowrap"
                                        >
                                            <PackagePlus className="h-3.5 w-3.5" />
                                            <span className="hidden sm:inline">Nuevo</span>
                                        </button>
                                    </div>

                                    {/* Destino (obra o bodega) */}
                                    <SearchableSelect
                                        options={destinoOptions}
                                        value={item.destino_id ? `${item.destino_type}-${item.destino_id}` : null}
                                        onChange={(val) => {
                                            if (!val) { updateItem(idx, { destino_type: 'bodega', destino_id: 0 }); return; }
                                            const [type, id] = String(val).split('-');
                                            updateItem(idx, {
                                                destino_type: type as 'obra' | 'bodega',
                                                destino_id: Number(id),
                                            });
                                        }}
                                        placeholder="Destino (obra o bodega)..."
                                    />

                                    {/* Cantidad + Precio + Delete */}
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-3">
                                            {/* Cantidad */}
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-caption text-muted-foreground font-medium">Cant:</span>
                                                <QtyStepper
                                                    value={Number(item.cantidad) || 0}
                                                    onChange={v => updateItem(idx, { cantidad: v })}
                                                    min={0}
                                                    size="sm"
                                                    unidad={item.unidad}
                                                />
                                            </div>

                                            {/* Precio unitario */}
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-caption text-muted-foreground font-medium">P.Unit:</span>
                                                <div className="relative">
                                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                                                    <input
                                                        type="number" min={0} step="any"
                                                        value={item.precio_unitario}
                                                        onChange={e => updateItem(idx, { precio_unitario: e.target.value === '' ? '' : (parseFloat(e.target.value) || 0) })}
                                                        className="w-24 pl-5 pr-2 py-1 text-xs border border-border rounded-lg text-right font-bold"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        <button type="button" onClick={() => removeItem(idx)}
                                            className="p-1.5 text-destructive/60 hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors">
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                    </div>

                                    {/* Subtotal */}
                                    {Number(item.cantidad) > 0 && Number(item.precio_unitario) > 0 && (
                                        <p className="text-caption text-right text-muted-foreground">
                                            Subtotal: <span className="font-bold text-brand-dark">{fmtMoney(Number(item.cantidad) * Number(item.precio_unitario))}</span>
                                        </p>
                                    )}
                                </div>
                            ))}

                            <button type="button" onClick={() => { addItem(); if (formErrors.items) setFormErrors(p => ({ ...p, items: undefined })); }}
                                className={cn(
                                    "w-full border-2 border-dashed rounded-xl py-4 text-center text-xs font-bold text-muted-foreground hover:border-brand-primary/40 hover:text-brand-primary transition-colors",
                                    formErrors.items ? "border-destructive/60" : "border-border"
                                )}>
                                <Plus className="h-4 w-4 inline-block mr-1 -mt-0.5" />
                                Agregar item
                            </button>
                        </div>
                        <FieldError message={formErrors.items} className="mt-2" />
                    </div>

                    {/* Monto total */}
                    {items.length > 0 && (
                        <div className="flex items-center justify-between bg-muted rounded-xl px-4 py-3 border border-border">
                            <span className="text-xs font-bold text-brand-dark flex items-center gap-1.5">
                                <Receipt className="h-3.5 w-3.5 text-brand-primary" />
                                Total Neto
                            </span>
                            <span className="text-sm font-black text-brand-dark">{fmtMoney(montoNeto)}</span>
                        </div>
                    )}

                    {/* Observaciones */}
                    <div>
                        <label className="text-xs font-bold text-brand-dark mb-1 block">Observaciones</label>
                        <textarea
                            value={observaciones}
                            onChange={e => setObservaciones(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-border rounded-xl resize-none h-16 focus:ring-2 focus:ring-brand-primary/20 outline-none"
                            placeholder="Opcional..."
                        />
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end gap-3 pt-2">
                        <button type="button" onClick={handleClose}
                            className="px-4 py-2 text-xs font-bold text-muted-foreground hover:text-brand-dark transition-colors">
                            Cancelar
                        </button>
                        <button type="submit" disabled={submitting}
                            className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-brand-primary rounded-xl hover:bg-brand-primary/90 disabled:opacity-50 transition-all shadow-lg shadow-brand-primary/20">
                            <Receipt className="h-3.5 w-3.5" />
                            {submitting ? 'Registrando...' : 'Registrar Factura'}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* ═══ MODAL CREAR ÍTEM NUEVO (anidado) ═══ */}
            <Modal isOpen={showNewItemModal} onClose={() => setShowNewItemModal(false)} title="Crear ítem nuevo" size="md">
                <form onSubmit={handleCreateItem} className="space-y-4" noValidate>
                    <p className="text-label text-muted-foreground">
                        El ítem se agrega al catálogo y se vincula automáticamente a esta línea de la factura.
                    </p>

                    {/* Categoría */}
                    <div>
                        <label className="text-xs font-bold text-brand-dark mb-1 block">Categoría <span className="text-red-500">*</span></label>
                        <select
                            value={newItem.categoria_id}
                            onChange={e => setNewItem(n => ({ ...n, categoria_id: e.target.value ? Number(e.target.value) : '' }))}
                            className="w-full px-3 py-2 text-sm border border-border rounded-xl bg-card focus:ring-2 focus:ring-brand-primary/20 outline-none"
                            required
                        >
                            <option value="">Seleccionar categoría...</option>
                            {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                        </select>
                    </div>

                    {/* Descripción */}
                    <div>
                        <label className="text-xs font-bold text-brand-dark mb-1 block">Descripción <span className="text-red-500">*</span></label>
                        <input
                            type="text"
                            value={newItem.descripcion}
                            onChange={e => setNewItem(n => ({ ...n, descripcion: e.target.value }))}
                            placeholder="Ej: Saco de cemento especial"
                            className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:ring-2 focus:ring-brand-primary/20 outline-none"
                            required
                        />
                    </div>

                    {/* Unidad + Valor compra */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-bold text-brand-dark mb-1 block">Unidad <span className="text-red-500">*</span></label>
                            <input
                                type="text"
                                value={newItem.unidad}
                                onChange={e => setNewItem(n => ({ ...n, unidad: e.target.value }))}
                                placeholder="U, kg, m, m²..."
                                className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:ring-2 focus:ring-brand-primary/20 outline-none"
                                required
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-brand-dark mb-1 block">
                                Valor compra <span className="text-muted-foreground font-normal">(opcional)</span>
                            </label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                                <input
                                    type="number" min={0} step="any"
                                    value={newItem.valor_compra}
                                    onChange={e => setNewItem(n => ({ ...n, valor_compra: e.target.value }))}
                                    placeholder="0"
                                    className="w-full pl-7 pr-3 py-2 text-sm border border-border rounded-xl focus:ring-2 focus:ring-brand-primary/20 outline-none"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end gap-3 pt-1">
                        <button type="button" onClick={() => setShowNewItemModal(false)}
                            className="px-4 py-2 text-xs font-bold text-muted-foreground hover:text-brand-dark transition-colors">
                            Cancelar
                        </button>
                        <button type="submit" disabled={creatingItem}
                            className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-brand-primary rounded-xl hover:bg-brand-primary/90 disabled:opacity-50 transition-all shadow-sm">
                            <PackagePlus className="h-3.5 w-3.5" />
                            {creatingItem ? 'Creando...' : 'Crear y vincular'}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default FacturasTab;
