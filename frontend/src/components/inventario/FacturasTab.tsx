import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Minus, FileText, XCircle, Trash2, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import api from '../../services/api';
import type { FacturaInventario, ItemInventario } from '../../types/entities';
import type { ApiResponse } from '../../types';
import { cn } from '../../utils/cn';
import { Modal } from '../ui/Modal';
import { SearchableSelect } from '../ui/SearchableSelect';

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
    cantidad: number;
    precio_unitario: number;
    destino_type: 'obra' | 'bodega';
    destino_id: number;
}

const FacturasTab: React.FC<Props> = ({ canCreate, canDelete }) => {
    const [facturas, setFacturas] = useState<FacturaInventario[]>([]);
    const [loading, setLoading] = useState(false);

    /* ── Modal state ── */
    const [showModal, setShowModal] = useState(false);

    /* ── Form state ── */
    const [numFactura, setNumFactura] = useState('');
    const [proveedor, setProveedor] = useState('');
    const [fechaFactura, setFechaFactura] = useState(() => new Date().toISOString().slice(0, 10));
    const [observaciones, setObservaciones] = useState('');
    const [items, setItems] = useState<LineItem[]>([]);
    const [submitting, setSubmitting] = useState(false);

    /* ── Catalog data for selects ── */
    const [catalogoItems, setCatalogoItems] = useState<ItemInventario[]>([]);
    const [obras, setObras] = useState<{ id: number; nombre: string }[]>([]);
    const [bodegas, setBodegas] = useState<{ id: number; nombre: string }[]>([]);

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
        api.get('/obras').then(res => setObras(res.data.data || [])).catch(() => {});
        api.get('/bodegas').then(res => setBodegas(res.data.data || [])).catch(() => {});
    }, [showModal]);

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
    };

    /* ── Item helpers ── */
    const addItem = () => {
        setItems([...items, {
            item_id: 0, descripcion: '', unidad: 'U',
            cantidad: 1, precio_unitario: 0,
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
            precio_unitario: found?.valor_compra || 0,
        });
    };

    /* ── Computed total ── */
    const montoNeto = useMemo(
        () => items.reduce((sum, i) => sum + i.cantidad * i.precio_unitario, 0),
        [items],
    );

    const availableOptions = useMemo(() =>
        catalogoItems.map(c => ({
            value: c.id,
            label: `${c.nro_item} — ${c.descripcion} (${c.unidad})`,
        })),
    [catalogoItems]);

    const destinoOptions = useMemo(() => [
        ...obras.map(o => ({ value: `obra-${o.id}`, label: `Obra: ${o.nombre}` })),
        ...bodegas.map(b => ({ value: `bodega-${b.id}`, label: `Bodega: ${b.nombre}` })),
    ], [obras, bodegas]);

    /* ── Submit ── */
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!numFactura.trim()) { toast.error('Ingresa el numero de factura'); return; }
        if (!proveedor.trim()) { toast.error('Ingresa el proveedor'); return; }
        if (!items.length || items.some(i => !i.item_id || i.cantidad < 1 || !i.destino_id)) {
            toast.error('Agrega al menos un item con destino valido'); return;
        }

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
                    cantidad: i.cantidad,
                    precio_unitario: i.precio_unitario,
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
                <h3 className="text-sm font-bold text-brand-dark">Facturas de Inventario</h3>
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
                        <p className="text-xs mt-1">Haz click en <span className="font-bold text-brand-primary">+ Nueva Factura</span> para registrar la primera</p>
                    )}
                </div>
            ) : (
                <div className="space-y-2">
                    {facturas.map(f => (
                        <div key={f.id} className="flex items-center justify-between px-4 py-3 rounded-xl border border-[#E8E8ED] hover:border-brand-primary/20 transition-colors">
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5">
                                    <span className="text-xs font-bold text-brand-dark">#{f.numero_factura}</span>
                                    <span className="text-[10px] text-muted-foreground">{f.proveedor}</span>
                                </div>
                                <p className="text-[11px] text-muted-foreground">
                                    {new Date(f.fecha_factura).toLocaleDateString('es-CL')} &middot; {fmtMoney(f.monto_neto)} neto
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                {!f.activo && (
                                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600 border border-red-200">ANULADA</span>
                                )}
                                {canDelete && f.activo && (
                                    <button onClick={() => handleAnular(f.id)} className="p-1.5 text-destructive/60 hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors">
                                        <XCircle className="h-3.5 w-3.5" />
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* ═══ CREATE MODAL ═══ */}
            <Modal isOpen={showModal} onClose={handleClose} title="Registrar Factura de Inventario" size="lg">
                <form onSubmit={handleSubmit} className="space-y-5">
                    {/* Row 1: Numero + Proveedor */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-bold text-brand-dark mb-1 block">N° Factura</label>
                            <input
                                type="text"
                                value={numFactura}
                                onChange={e => setNumFactura(e.target.value)}
                                placeholder="Ej: 001234"
                                className="w-full px-3 py-2 text-sm border border-[#E8E8ED] rounded-xl focus:ring-2 focus:ring-brand-primary/20 outline-none"
                                required
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-brand-dark mb-1 block">Proveedor</label>
                            <input
                                type="text"
                                value={proveedor}
                                onChange={e => setProveedor(e.target.value)}
                                placeholder="Nombre del proveedor"
                                className="w-full px-3 py-2 text-sm border border-[#E8E8ED] rounded-xl focus:ring-2 focus:ring-brand-primary/20 outline-none"
                                required
                            />
                        </div>
                    </div>

                    {/* Row 2: Fecha */}
                    <div className="w-48">
                        <label className="text-xs font-bold text-brand-dark mb-1 block">Fecha Factura</label>
                        <input
                            type="date"
                            value={fechaFactura}
                            onChange={e => setFechaFactura(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-[#E8E8ED] rounded-xl focus:ring-2 focus:ring-brand-primary/20 outline-none"
                            required
                        />
                    </div>

                    {/* Items */}
                    <div>
                        <label className="text-xs font-bold text-brand-dark mb-2 block">Items de la factura</label>
                        <div className="space-y-2">
                            {items.map((item, idx) => (
                                <div key={idx} className="bg-[#F9F9FB] rounded-xl border border-[#E8E8ED] p-3 space-y-3">
                                    {/* Item selector */}
                                    <SearchableSelect
                                        options={availableOptions.filter(o => !items.some((i, j) => j !== idx && i.item_id === o.value))}
                                        value={item.item_id || null}
                                        onChange={(val) => selectCatalogItem(idx, val)}
                                        placeholder="Buscar item..."
                                    />

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
                                                <span className="text-[10px] text-muted-foreground font-medium">Cant:</span>
                                                <button type="button" onClick={() => updateItem(idx, { cantidad: Math.max(1, item.cantidad - 1) })}
                                                    className="w-7 h-7 rounded-lg bg-white border border-[#E8E8ED] flex items-center justify-center hover:bg-muted transition-colors">
                                                    <Minus className="h-3 w-3 text-muted-foreground" />
                                                </button>
                                                <input
                                                    type="number" min={1}
                                                    value={item.cantidad}
                                                    onChange={e => updateItem(idx, { cantidad: Math.max(1, parseInt(e.target.value) || 1) })}
                                                    className="w-14 px-2 py-1 text-xs border border-[#E8E8ED] rounded-lg text-center font-bold"
                                                />
                                                <button type="button" onClick={() => updateItem(idx, { cantidad: item.cantidad + 1 })}
                                                    className="w-7 h-7 rounded-lg bg-white border border-[#E8E8ED] flex items-center justify-center hover:bg-muted transition-colors">
                                                    <Plus className="h-3 w-3 text-muted-foreground" />
                                                </button>
                                                {item.unidad && <span className="text-[10px] text-muted-foreground">{item.unidad}</span>}
                                            </div>

                                            {/* Precio unitario */}
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-[10px] text-muted-foreground font-medium">P.Unit:</span>
                                                <div className="relative">
                                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                                                    <input
                                                        type="number" min={0}
                                                        value={item.precio_unitario}
                                                        onChange={e => updateItem(idx, { precio_unitario: parseInt(e.target.value) || 0 })}
                                                        className="w-24 pl-5 pr-2 py-1 text-xs border border-[#E8E8ED] rounded-lg text-right font-bold"
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
                                    {item.cantidad > 0 && item.precio_unitario > 0 && (
                                        <p className="text-[10px] text-right text-muted-foreground">
                                            Subtotal: <span className="font-bold text-brand-dark">{fmtMoney(item.cantidad * item.precio_unitario)}</span>
                                        </p>
                                    )}
                                </div>
                            ))}

                            <button type="button" onClick={addItem}
                                className="w-full border-2 border-dashed border-[#E8E8ED] rounded-xl py-4 text-center text-xs font-bold text-muted-foreground hover:border-brand-primary/40 hover:text-brand-primary transition-colors">
                                <Plus className="h-4 w-4 inline-block mr-1 -mt-0.5" />
                                Agregar item
                            </button>
                        </div>
                    </div>

                    {/* Monto total */}
                    {items.length > 0 && (
                        <div className="flex items-center justify-between bg-[#F5F7FA] rounded-xl px-4 py-3 border border-[#E8E8ED]">
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
                            className="w-full px-3 py-2 text-sm border border-[#E8E8ED] rounded-xl resize-none h-16 focus:ring-2 focus:ring-brand-primary/20 outline-none"
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
        </div>
    );
};

export default FacturasTab;
