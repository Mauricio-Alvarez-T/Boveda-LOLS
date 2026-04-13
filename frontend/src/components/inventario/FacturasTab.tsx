import React, { useState, useEffect } from 'react';
import { Plus, FileText, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import api from '../../services/api';
import type { FacturaInventario } from '../../types/entities';
import { cn } from '../../utils/cn';

const fmtMoney = (n: number) => `$${Number(n).toLocaleString('es-CL')}`;

interface Props {
    canCreate: boolean;
    canDelete: boolean;
}

const FacturasTab: React.FC<Props> = ({ canCreate, canDelete }) => {
    const [facturas, setFacturas] = useState<FacturaInventario[]>([]);
    const [loading, setLoading] = useState(false);

    const fetch = async () => {
        setLoading(true);
        try {
            const res = await api.get('/facturas-inventario');
            setFacturas(res.data.data || []);
        } catch { setFacturas([]); }
        finally { setLoading(false); }
    };

    useEffect(() => { fetch(); }, []);

    const handleAnular = async (id: number) => {
        try {
            await api.put(`/facturas-inventario/${id}/anular`);
            toast.success('Factura anulada');
            fetch();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Error al anular');
        }
    };

    if (loading) return <div className="py-8 text-center text-muted-foreground text-sm">Cargando facturas...</div>;

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-brand-dark">Facturas de Inventario</h3>
            </div>

            {facturas.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                    <FileText className="h-10 w-10 mx-auto opacity-20 mb-3" />
                    <p className="text-sm font-medium">No hay facturas registradas</p>
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
        </div>
    );
};

export default FacturasTab;
