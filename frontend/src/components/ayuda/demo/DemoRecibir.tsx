import React, { useState } from 'react';
import { CheckCircle2, RotateCcw } from 'lucide-react';
import { Button } from '../../ui/Button';
import { RecibirForm } from '../../inventario/transferencia-detail/RecibirForm';
import type { TransferenciaItem } from '../../../types/entities';
import { itemsTransferenciaDemo } from './mockData';

/**
 * Demo interactiva del flujo "Registrar lo que llegó" (recepción). Monta el
 * RecibirForm REAL con datos de ejemplo y estado local; al registrar/cerrar muestra
 * una escena de éxito en vez de llamar a la API.
 */
type ReceiveItem = { item_id: number; cantidad_recibida: number; correcto: boolean; observacion: string };

const recibidaPrevia = (item: TransferenciaItem) => Number(item.cantidad_recibida) || 0;
const pendientePorItem = (item: TransferenciaItem) =>
    (Number(item.cantidad_enviada) || Number(item.cantidad_solicitada)) - recibidaPrevia(item);

const initReceive = (): ReceiveItem[] =>
    itemsTransferenciaDemo.map(i => ({ item_id: i.item_id, cantidad_recibida: pendientePorItem(i), correcto: true, observacion: '' }));

export const DemoRecibir: React.FC = () => {
    const [receiveItems, setReceiveItems] = useState<ReceiveItem[]>(initReceive);
    const [cierreFinal, setCierreFinal] = useState(false);
    const [confirmMermaOpen, setConfirmMermaOpen] = useState(false);
    const [done, setDone] = useState<null | 'parcial' | 'total'>(null);
    const tipoRef = React.useRef<'parcial' | 'total'>('total');

    const reset = () => {
        setReceiveItems(initReceive()); setCierreFinal(false); setConfirmMermaOpen(false); setDone(null);
    };

    if (done) {
        const parcial = done === 'parcial';
        return (
            <div className="rounded-2xl border border-success/30 bg-success/5 p-6 text-center space-y-3">
                <CheckCircle2 className="h-10 w-10 text-success mx-auto" />
                <div>
                    <h3 className="text-title-sm font-bold text-brand-dark">
                        {parcial ? 'Viaje registrado (demo)' : '¡Entrega cerrada! (demo)'}
                    </h3>
                    <p className="text-caption text-muted-foreground mt-1">
                        {parcial
                            ? <>La transferencia quedaría en <span className="font-bold">Entrega en curso</span>, esperando los próximos viajes. Aviso: <span className="italic">"Cargamento registrado…".</span></>
                            : <>La transferencia pasaría a <span className="font-bold">Recibida</span> ("Transferencia cerrada ✓"). Si hubo diferencia con lo enviado, se crearía una <span className="font-bold">discrepancia</span>.</>}
                    </p>
                </div>
                <Button variant="secondary" size="sm" onClick={reset} leftIcon={<RotateCcw className="h-3.5 w-3.5" />}>
                    Recibir de nuevo
                </Button>
            </div>
        );
    }

    return (
        <RecibirForm
            items={itemsTransferenciaDemo}
            receiveItems={receiveItems}
            setReceiveItems={setReceiveItems}
            cierreFinal={cierreFinal}
            setCierreFinal={setCierreFinal}
            confirmMermaOpen={confirmMermaOpen}
            setConfirmMermaOpen={setConfirmMermaOpen}
            pendientePorItem={pendientePorItem}
            onRecibir={async (_items, tipo = 'total') => { tipoRef.current = tipo; return 1; }}
            onUploadFoto={async () => true}
            loading={false}
            viajesPrevios={0}
            onClose={() => setDone(tipoRef.current)}
            onOpenItem={() => { /* no-op en demo */ }}
        />
    );
};

export default DemoRecibir;
