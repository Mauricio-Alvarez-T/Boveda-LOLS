import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Minus, Trash2, Send } from 'lucide-react';
import { toast } from 'sonner';
import api from '../../services/api';
import type { ApiResponse } from '../../types';
import type { ItemInventario } from '../../types/entities';
import { SearchableSelect } from '../ui/SearchableSelect';

interface Props {
    obras: { id: number; nombre: string }[];
    onCrear: (data: any) => Promise<any>;
    onClose: () => void;
}

interface LineItem {
    item_id: number;
    descripcion: string;
    unidad: string;
    cantidad: number;
}

const SolicitudForm: React.FC<Props> = ({ obras, onCrear, onClose }) => {
    const [destinoObraId, setDestinoObraId] = useState<number | null>(null);
    const [observaciones, setObservaciones] = useState('');
    const [requierePionetas, setRequierePionetas] = useState(false);
    const [cantidadPionetas, setCantidadPionetas] = useState<number>(0);
    const [items, setItems] = useState<LineItem[]>([]);
    const [catalogoItems, setCatalogoItems] = useState<ItemInventario[]>([]);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        api.get<ApiResponse<ItemInventario[]>>('/items-inventario?activo=true&limit=500')
            .then(res => setCatalogoItems(res.data.data))
            .catch(() => {});
    }, []);

    const addItem = () => {
        setItems([...items, { item_id: 0, descripcion: '', unidad: 'U', cantidad: 1 }]);
    };

    const removeItem = (idx: number) => {
        setItems(items.filter((_, i) => i !== idx));
    };

    const updateItemId = (idx: number, value: string | number | null) => {
        const updated = [...items];
        const found = catalogoItems.find(c => c.id === Number(value));
        updated[idx] = {
            ...updated[idx],
            item_id: Number(value) || 0,
            descripcion: found?.descripcion || '',
            unidad: found?.unidad || 'U',
        };
        setItems(updated);
    };

    const updateCantidad = (idx: number, value: number) => {
        const updated = [...items];
        updated[idx] = { ...updated[idx], cantidad: Math.max(1, value) };
        setItems(updated);
    };

    const availableOptions = useMemo(() =>
        catalogoItems.map(c => ({
            value: c.id,
            label: `${c.nro_item} — ${c.descripcion} (${c.unidad})`,
        })),
    [catalogoItems]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!destinoObraId) { toast.error('Selecciona un destino'); return; }
        if (!items.length || items.some(i => !i.item_id || i.cantidad < 1)) {
            toast.error('Agrega al menos un ítem válido'); return;
        }

        setSubmitting(true);
        const result = await onCrear({
            destino_obra_id: destinoObraId,
            items: items.map(i => ({ item_id: i.item_id, cantidad: i.cantidad })),
            observaciones: observaciones || undefined,
            requiere_pionetas: requierePionetas,
            cantidad_pionetas: requierePionetas ? cantidadPionetas : undefined,
        });
        setSubmitting(false);

        if (result) onClose();
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-5">
            {/* Destino */}
            <SearchableSelect
                label="Destino"
                options={obras.map(o => ({ value: o.id, label: o.nombre }))}
                value={destinoObraId}
                onChange={(val) => setDestinoObraId(val as number | null)}
                placeholder="Seleccionar obra destino..."
            />

            {/* Items */}
            <div>
                <label className="text-xs font-bold text-brand-dark mb-2 block">Ítems</label>
                <div className="space-y-2">
                    {items.map((item, idx) => (
                        <div key={idx} className="bg-[#F9F9FB] rounded-xl border border-[#E8E8ED] p-3 space-y-2">
                            <SearchableSelect
                                options={availableOptions.filter(o => !items.some((i, j) => j !== idx && i.item_id === o.value))}
                                value={item.item_id || null}
                                onChange={(val) => updateItemId(idx, val)}
                                placeholder="Buscar ítem..."
                            />
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                    <button
                                        type="button"
                                        onClick={() => updateCantidad(idx, item.cantidad - 1)}
                                        className="w-7 h-7 rounded-lg bg-white border border-[#E8E8ED] flex items-center justify-center hover:bg-muted transition-colors"
                                    >
                                        <Minus className="h-3 w-3 text-muted-foreground" />
                                    </button>
                                    <input
                                        type="number"
                                        min={1}
                                        value={item.cantidad}
                                        onChange={e => updateCantidad(idx, parseInt(e.target.value) || 1)}
                                        className="w-14 px-2 py-1 text-xs border border-[#E8E8ED] rounded-lg text-center font-bold"
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => updateCantidad(idx, item.cantidad + 1)}
                                        className="w-7 h-7 rounded-lg bg-white border border-[#E8E8ED] flex items-center justify-center hover:bg-muted transition-colors"
                                    >
                                        <Plus className="h-3 w-3 text-muted-foreground" />
                                    </button>
                                    {item.unidad && (
                                        <span className="text-[10px] text-muted-foreground ml-1">{item.unidad}</span>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => removeItem(idx)}
                                    className="p-1.5 text-destructive/60 hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        </div>
                    ))}
                    <button
                        type="button"
                        onClick={addItem}
                        className="w-full border-2 border-dashed border-[#E8E8ED] rounded-xl py-4 text-center text-xs font-bold text-muted-foreground hover:border-brand-primary/40 hover:text-brand-primary transition-colors"
                    >
                        <Plus className="h-4 w-4 inline-block mr-1 -mt-0.5" />
                        Agregar ítem
                    </button>
                </div>
            </div>

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

            {/* Pionetas */}
            <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-xs font-medium text-brand-dark cursor-pointer">
                    <input
                        type="checkbox"
                        checked={requierePionetas}
                        onChange={e => setRequierePionetas(e.target.checked)}
                        className="rounded border-[#E8E8ED]"
                    />
                    Requiere pionetas
                </label>
                {requierePionetas && (
                    <input
                        type="number"
                        min={1}
                        value={cantidadPionetas}
                        onChange={e => setCantidadPionetas(parseInt(e.target.value) || 0)}
                        className="w-16 px-2 py-1 text-xs border border-[#E8E8ED] rounded-lg text-center"
                        placeholder="Cant."
                    />
                )}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-bold text-muted-foreground hover:text-brand-dark transition-colors">
                    Cancelar
                </button>
                <button
                    type="submit"
                    disabled={submitting}
                    className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-brand-primary rounded-xl hover:bg-brand-primary/90 disabled:opacity-50 transition-all shadow-lg shadow-brand-primary/20"
                >
                    <Send className="h-3.5 w-3.5" />
                    {submitting ? 'Enviando...' : 'Crear Solicitud'}
                </button>
            </div>
        </form>
    );
};

export default SolicitudForm;
