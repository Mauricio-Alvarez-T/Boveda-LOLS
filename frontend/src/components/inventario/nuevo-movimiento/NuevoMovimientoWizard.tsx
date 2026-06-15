import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import api from '../../../services/api';
import type { ApiResponse } from '../../../types';
import type { ItemInventario, Bodega, Obra } from '../../../types/entities';
import type { StockUbicacion } from '../StockBadge';
import { useTransferencias } from '../../../hooks/inventario/useTransferencias';
import { Modal } from '../../ui/Modal';
import { Button } from '../../ui/Button';
import { WizardStepper } from './WizardStepper';
import { PasoRuta } from './PasoRuta';
import { CatalogoCarrito } from './CatalogoCarrito';
import { PasoRevisar } from './PasoRevisar';
import {
    inferMovimiento,
    type Origen, type Destino, type ItemInput, type CustomItemInput,
    type PermisosMovimiento, type MovimientoResuelto,
} from '../../../utils/inferMovimiento';

const PASOS = ['Ruta', 'Ítems', 'Revisar'];

/**
 * Wizard adaptativo "Nuevo movimiento" (Fase 4). UNA sola entrada en vez de 8
 * modales: el usuario elige origen/destino y `inferMovimiento` deduce el tipo de
 * flujo + el endpoint. El backend no cambia. `onSubmit` recibe el resultado tipado
 * y lo despacha a la función correcta del hook (lo resuelve el padre).
 */
export const NuevoMovimientoWizard: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    hasPermission: (p: string) => boolean;
    onSubmit: (resuelto: MovimientoResuelto) => Promise<{ id: number; codigo: string } | null>;
}> = ({ isOpen, onClose, hasPermission, onSubmit }) => {
    const { fetchStockPorItems } = useTransferencias();

    const [catalogo, setCatalogo] = useState<ItemInventario[]>([]);
    const [bodegas, setBodegas] = useState<Bodega[]>([]);
    const [obras, setObras] = useState<{ id: number; nombre: string }[]>([]);
    const [stockMap, setStockMap] = useState<Record<number, StockUbicacion[]>>({});
    const [loadingData, setLoadingData] = useState(true);

    const [paso, setPaso] = useState(0);
    const [origen, setOrigen] = useState<Origen | null>(null);
    const [destino, setDestino] = useState<Destino | null>(null);
    const [enviarAhora, setEnviarAhora] = useState(false);
    const [ordenGerencia, setOrdenGerencia] = useState(false);
    const [cart, setCart] = useState<ItemInput[]>([]);
    const [customItems, setCustomItems] = useState<CustomItemInput[]>([]);
    const [motivo, setMotivo] = useState('');
    const [observaciones, setObservaciones] = useState('');
    const [requierePionetas, setRequierePionetas] = useState(false);
    const [cantidadPionetas, setCantidadPionetas] = useState(0);
    const [submitting, setSubmitting] = useState(false);

    // Reset + carga de datos al abrir.
    useEffect(() => {
        if (!isOpen) return;
        setPaso(0); setOrigen(null); setDestino(null); setEnviarAhora(false); setOrdenGerencia(false);
        setCart([]); setCustomItems([]); setMotivo(''); setObservaciones(''); setRequierePionetas(false); setCantidadPionetas(0); setSubmitting(false);
        setLoadingData(true);
        Promise.all([
            api.get<ApiResponse<ItemInventario[]>>('/items-inventario?activo=true&limit=500'),
            api.get<ApiResponse<Bodega[]>>('/bodegas?activa=true&participa_transferencias=1&limit=50'),
            api.get<ApiResponse<Obra[]>>('/obras?activo=true&participa_transferencias=1&limit=500'),
        ]).then(async ([itemsRes, bodRes, obrasRes]) => {
            const items = itemsRes.data.data;
            setCatalogo(items);
            setBodegas(bodRes.data.data || []);
            setObras((obrasRes.data.data || []).map(o => ({ id: o.id, nombre: o.nombre })));
            if (items.length) setStockMap(await fetchStockPorItems(items.map(i => i.id)));
            setLoadingData(false);
        }).catch(() => setLoadingData(false));
    }, [isOpen, fetchStockPorItems]);

    const permisos: PermisosMovimiento = useMemo(() => ({
        solicitar: hasPermission('inventario.transferencias.solicitar'),
        solicitudMateriales: hasPermission('inventario.transferencias.solicitud_materiales'),
        pushDirecto: hasPermission('inventario.transferencias.push_directo'),
        intraBodega: hasPermission('inventario.transferencias.intra_bodega'),
        ordenGerencia: hasPermission('inventario.transferencias.orden_gerencia'),
    }), [hasPermission]);

    const customLimpios = useMemo(() => customItems.filter(c => c.descripcion.trim()), [customItems]);

    const wizardState = useMemo(() => ({
        origen, destino, enviarAhora, ordenGerencia,
        items: cart, itemsCustom: customLimpios,
        motivo, observaciones, requierePionetas, cantidadPionetas,
    }), [origen, destino, enviarAhora, ordenGerencia, cart, customLimpios, motivo, observaciones, requierePionetas, cantidadPionetas]);

    const infer = useMemo(() => inferMovimiento(wizardState, permisos), [wizardState, permisos]);

    const conStockFiltro = !!origen && origen.tipo !== 'central';
    const stockEnOrigen = useMemo(() => {
        const m: Record<number, number> = {};
        const o = origen;
        if (!o || o.tipo === 'central') return m;
        Object.entries(stockMap).forEach(([itemId, ubis]) => {
            const f = ubis.find(u => u.type === o.tipo && u.id === o.id);
            if (f) m[Number(itemId)] = Number(f.cantidad) || 0;
        });
        return m;
    }, [stockMap, origen]);

    const hayExceso = conStockFiltro && cart.some(l => (stockEnOrigen[l.item_id] || 0) < l.cantidad);
    const allowCustom = destino?.tipo === 'obra';

    const nombreUbi = (u: Origen | Destino | null): string => {
        if (!u) return '—';
        if (u.tipo === 'central') return 'Bodega central';
        if (u.tipo === 'bodega') return bodegas.find(b => b.id === u.id)?.nombre || `Bodega #${u.id}`;
        return obras.find(o => o.id === u.id)?.nombre || `Obra #${u.id}`;
    };

    const handleOrigen = (o: Origen | null) => { setOrigen(o); setCart([]); };
    const handleDestino = (d: Destino | null) => { setDestino(d); if (d?.tipo !== 'obra') setCustomItems([]); };

    const hayItems = cart.length > 0 || customLimpios.length > 0;
    const puedeSiguiente = paso === 0 ? infer.rutaOk : paso === 1 ? (hayItems && !hayExceso) : false;
    const puedeCrear = paso === 2 && !!infer.resuelto && !hayExceso && !submitting;

    const handleCrear = async () => {
        if (!infer.resuelto) return;
        setSubmitting(true);
        const r = await onSubmit(infer.resuelto);
        setSubmitting(false);
        if (r) onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Nuevo movimiento" size="lg">
            <div className="space-y-5">
                <WizardStepper pasos={PASOS} actual={paso} />

                {paso === 0 && (
                    <PasoRuta
                        state={wizardState} infer={infer} obras={obras} bodegas={bodegas}
                        onOrigen={handleOrigen} onDestino={handleDestino}
                        onToggleEnviarAhora={setEnviarAhora} onToggleOrden={setOrdenGerencia}
                        nombreUbi={nombreUbi}
                    />
                )}
                {paso === 1 && (
                    <CatalogoCarrito
                        catalogo={catalogo} stockEnOrigen={stockEnOrigen} conStockFiltro={conStockFiltro}
                        loading={loadingData} cart={cart} setCart={setCart}
                        allowCustom={!!allowCustom} customItems={customItems} setCustomItems={setCustomItems}
                    />
                )}
                {paso === 2 && (
                    <PasoRevisar
                        infer={infer} state={wizardState} catalogo={catalogo} nombreUbi={nombreUbi}
                        onMotivo={setMotivo} onObservaciones={setObservaciones}
                        onRequierePionetas={setRequierePionetas} onCantidadPionetas={setCantidadPionetas}
                    />
                )}

                <div className="flex items-center justify-between gap-2 pt-3 border-t border-border">
                    <Button variant="ghost" onClick={paso === 0 ? onClose : () => setPaso(p => p - 1)} leftIcon={paso === 0 ? undefined : <ArrowLeft className="h-4 w-4" />}>
                        {paso === 0 ? 'Cancelar' : 'Atrás'}
                    </Button>
                    {paso < 2 ? (
                        <Button onClick={() => setPaso(p => p + 1)} disabled={!puedeSiguiente} rightIcon={<ArrowRight className="h-4 w-4" />}>Siguiente</Button>
                    ) : (
                        <Button onClick={handleCrear} disabled={!puedeCrear} isLoading={submitting} leftIcon={<Check className="h-4 w-4" />}>Crear movimiento</Button>
                    )}
                </div>
            </div>
        </Modal>
    );
};
