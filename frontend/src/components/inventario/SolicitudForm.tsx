import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Send } from 'lucide-react';
import { toast } from 'sonner';
import api from '../../services/api';
import type { ApiResponse } from '../../types';
import type { ItemInventario, Obra } from '../../types/entities';

interface Props {
    obras: Obra[];
    onCrear: (data: any) => Promise<any>;
    onClose: () => void;
}

interface LineItem {
    item_id: number;
    descripcion: string;
    cantidad: number;
}

const SolicitudForm: React.FC<Props> = ({ obras, onCrear, onClose }) => {
    const [destinoObraId, setDestinoObraId] = useState<number | ''>('');
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
        setItems([...items, { item_id: 0, descripcion: '', cantidad: 1 }]);
    };

    const removeItem = (idx: number) => {
        setItems(items.filter((_, i) => i !== idx));
    };

    const updateItem = (idx: number, field: keyof LineItem, value: any) => {
        const updated = [...items];
        if (field === 'item_id') {
            const found = catalogoItems.find(c => c.id === Number(value));
            updated[idx] = { ...updated[idx], item_id: Number(value), descripcion: found?.descripcion || '' };
        } else {
            (updated[idx] as any)[field] = value;
        }
        setItems(updated);
    };

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
            <div>
                <label className="text-xs font-bold text-brand-dark mb-1 block">Destino</label>
                <select
                    value={destinoObraId}
                    onChange={e => setDestinoObraId(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-[#E8E8ED] rounded-xl bg-white focus:ring-2 focus:ring-brand-primary/20 outline-none"
                    required
                >
                    <option value="">Seleccionar obra...</option>
                    {obras.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
                </select>
            </div>

            {/* Items */}
            <div>
                <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-bold text-brand-dark">Ítems</label>
                    <button type="button" onClick={addItem} className="flex items-center gap-1 text-[11px] font-bold text-brand-primary hover:underline">
                        <Plus className="h-3.5 w-3.5" /> Agregar
                    </button>
                </div>
                <div className="space-y-2">
                    {items.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                            <select
                                value={item.item_id || ''}
                                onChange={e => updateItem(idx, 'item_id', e.target.value)}
                                className="flex-1 px-2 py-1.5 text-xs border border-[#E8E8ED] rounded-lg"
                                required
                            >
                                <option value="">Seleccionar ítem...</option>
                                {catalogoItems.map(c => (
                                    <option key={c.id} value={c.id}>{c.nro_item} - {c.descripcion}</option>
                                ))}
                            </select>
                            <input
                                type="number"
                                min={1}
                                value={item.cantidad}
                                onChange={e => updateItem(idx, 'cantidad', parseInt(e.target.value) || 1)}
                                className="w-16 px-2 py-1.5 text-xs border border-[#E8E8ED] rounded-lg text-center"
                                required
                            />
                            <button type="button" onClick={() => removeItem(idx)} className="p-1 text-destructive hover:bg-destructive/10 rounded">
                                <Trash2 className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    ))}
                    {items.length === 0 && (
                        <p className="text-xs text-muted-foreground italic text-center py-3">Sin ítems. Presiona "Agregar" para comenzar.</p>
                    )}
                </div>
            </div>

            <div>
                <label className="text-xs font-bold text-brand-dark mb-1 block">Observaciones</label>
                <textarea
                    value={observaciones}
                    onChange={e => setObservaciones(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-[#E8E8ED] rounded-xl resize-none h-16"
                    placeholder="Opcional..."
                />
            </div>

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

            <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-bold text-muted-foreground hover:text-brand-dark transition-colors">
                    Cancelar
                </button>
                <button
                    type="submit"
                    disabled={submitting}
                    className="flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-brand-primary rounded-xl hover:bg-brand-primary/90 disabled:opacity-50 transition-all"
                >
                    <Send className="h-3.5 w-3.5" />
                    {submitting ? 'Enviando...' : 'Crear Solicitud'}
                </button>
            </div>
        </form>
    );
};

export default SolicitudForm;
