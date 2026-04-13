import React, { useState, useEffect } from 'react';
import { Droplets, Plus } from 'lucide-react';
import { toast } from 'sonner';
import api from '../../services/api';
import type { RegistroBombaHormigon, Obra } from '../../types/entities';
import { cn } from '../../utils/cn';

interface Props {
    obras: { id: number; nombre: string }[];
    canCreate: boolean;
}

const BombasHormigonTab: React.FC<Props> = ({ obras, canCreate }) => {
    const [registros, setRegistros] = useState<RegistroBombaHormigon[]>([]);
    const [loading, setLoading] = useState(false);
    const [filterObraId, setFilterObraId] = useState<number | ''>('');

    const fetch = async () => {
        setLoading(true);
        try {
            const params = filterObraId ? `?obra_id=${filterObraId}` : '';
            const res = await api.get(`/bombas-hormigon${params}`);
            setRegistros(res.data.data || []);
        } catch { setRegistros([]); }
        finally { setLoading(false); }
    };

    useEffect(() => { fetch(); }, [filterObraId]);

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-brand-dark">Bombas de Hormigón</h3>
                <select
                    value={filterObraId}
                    onChange={e => setFilterObraId(e.target.value ? Number(e.target.value) : '')}
                    className="px-3 py-1.5 text-xs border border-[#E8E8ED] rounded-xl bg-white"
                >
                    <option value="">Todas las obras</option>
                    {obras.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
                </select>
            </div>

            {loading ? (
                <div className="py-8 text-center text-muted-foreground text-sm">Cargando...</div>
            ) : registros.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                    <Droplets className="h-10 w-10 mx-auto opacity-20 mb-3" />
                    <p className="text-sm font-medium">Sin registros de bombas</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {registros.map(r => (
                        <div key={r.id} className="flex items-center justify-between px-4 py-3 rounded-xl border border-[#E8E8ED] hover:border-brand-primary/20 transition-colors">
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5">
                                    <span className="text-xs font-bold text-brand-dark">{r.obra_nombre}</span>
                                    <span className={cn(
                                        "text-[9px] font-bold px-2 py-0.5 rounded-full border",
                                        r.es_externa ? "bg-amber-100 text-amber-700 border-amber-200" : "bg-blue-100 text-blue-700 border-blue-200"
                                    )}>
                                        {r.es_externa ? 'ARRIENDO EXT' : 'EMPRESA'}
                                    </span>
                                </div>
                                <p className="text-[11px] text-muted-foreground">
                                    {new Date(r.fecha).toLocaleDateString('es-CL')} &middot; {r.tipo_bomba}
                                    {r.proveedor && ` &middot; ${r.proveedor}`}
                                    {r.costo && ` &middot; $${Number(r.costo).toLocaleString('es-CL')}`}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default BombasHormigonTab;
