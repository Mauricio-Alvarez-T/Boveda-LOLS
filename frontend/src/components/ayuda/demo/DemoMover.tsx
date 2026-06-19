import React, { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, RotateCcw } from 'lucide-react';
import { Button } from '../../ui/Button';
import { WizardStepper } from '../../inventario/nuevo-movimiento/WizardStepper';
import { PasoRuta } from '../../inventario/nuevo-movimiento/PasoRuta';
import { CatalogoCarrito } from '../../inventario/nuevo-movimiento/CatalogoCarrito';
import { PasoRevisar } from '../../inventario/nuevo-movimiento/PasoRevisar';
import {
    inferMovimiento,
    type Origen, type Destino, type ItemInput, type PermisosMovimiento,
} from '../../../utils/inferMovimiento';
import { obrasDemo, bodegasDemo, categoriasDemo, itemsDemo, disponibleTotalDemo, stockMapDemo } from './mockData';

/**
 * Demo interactiva del flujo "Mover stock". Reusa los sub-pasos REALES del wizard
 * (WizardStepper/PasoRuta/CatalogoCarrito/PasoRevisar) + la inferencia real
 * (`inferMovimiento`) en `modo='mover'`, con datos de ejemplo y SIN backend.
 *
 * Un solo componente cubre los 5 flujos de "Mover": el `escenario` pre-selecciona
 * origen/destino para enseñar cada uno (el usuario puede cambiarlos y el tipo se
 * vuelve a inferir, igual que en la app). El tipo concreto (Envío directo,
 * Devolución, etc.) lo deduce `inferMovimiento` y se muestra en "Revisar".
 */
export interface MoverEscenario {
    origen: Exclude<Origen, { tipo: 'central' }>;
    destino: Destino;
    /** Pre-activa el toggle "Orden de gerencia" (tutorial de orden de gerencia). */
    ordenGerencia?: boolean;
}

/** Escenarios por tutorial (clave = demoId en guiasData). */
export const ESCENARIOS: Record<string, MoverEscenario> = {
    'envio-directo': { origen: { tipo: 'bodega', id: 101 }, destino: { tipo: 'obra', id: 1 } },
    'devolucion': { origen: { tipo: 'obra', id: 1 }, destino: { tipo: 'bodega', id: 101 } },
    'traslado-obras': { origen: { tipo: 'obra', id: 1 }, destino: { tipo: 'obra', id: 2 } },
    'movimiento-bodegas': { origen: { tipo: 'bodega', id: 101 }, destino: { tipo: 'bodega', id: 102 } },
    'orden-gerencia': { origen: { tipo: 'bodega', id: 101 }, destino: { tipo: 'obra', id: 1 }, ordenGerencia: true },
};

const PERMISOS_DEMO: PermisosMovimiento = {
    solicitar: true, solicitudMateriales: true, pushDirecto: true,
    intraBodega: true, devolucion: true, intraObra: true, ordenGerencia: true,
};

const PASOS = ['Ruta', 'Ítems', 'Revisar'];

export const DemoMover: React.FC<{ escenario: MoverEscenario }> = ({ escenario }) => {
    const [paso, setPaso] = useState(0);
    const [origen, setOrigen] = useState<Origen | null>(escenario.origen);
    const [destino, setDestino] = useState<Destino | null>(escenario.destino);
    const [ordenGerencia, setOrdenGerencia] = useState(!!escenario.ordenGerencia);
    const [cart, setCart] = useState<ItemInput[]>([]);
    const [motivo, setMotivo] = useState('');
    const [observaciones, setObservaciones] = useState('');
    const [requierePionetas, setRequierePionetas] = useState(false);
    const [cantidadPionetas, setCantidadPionetas] = useState(0);
    const [creada, setCreada] = useState(false);

    const wizardState = useMemo(() => ({
        origen, destino, ordenGerencia,
        items: cart, itemsCustom: [],
        motivo, observaciones, requierePionetas, cantidadPionetas,
    }), [origen, destino, ordenGerencia, cart, motivo, observaciones, requierePionetas, cantidadPionetas]);

    const infer = useMemo(() => inferMovimiento(wizardState, PERMISOS_DEMO), [wizardState]);

    // Stock disponible en el origen elegido (igual cálculo que el wizard real).
    const stockEnOrigen = useMemo(() => {
        const m: Record<number, number> = {};
        const o = origen;
        if (!o || o.tipo === 'central') return m;
        Object.entries(stockMapDemo).forEach(([itemId, ubis]) => {
            const f = ubis.find(u => u.type === o.tipo && u.id === o.id);
            if (f) m[Number(itemId)] = Number(f.cantidad) || 0;
        });
        return m;
    }, [origen]);

    const nombreUbi = (u: Origen | Destino | null): string => {
        if (!u) return '—';
        if (u.tipo === 'central') return 'Bodega central';
        if (u.tipo === 'bodega') return bodegasDemo.find(b => b.id === u.id)?.nombre || `Bodega #${u.id}`;
        return obrasDemo.find(o => o.id === u.id)?.nombre || `Obra #${u.id}`;
    };

    const conStockFiltro = !!origen && origen.tipo !== 'central';
    const hayItems = cart.length > 0;
    const hayExceso = conStockFiltro && cart.some(l => (stockEnOrigen[l.item_id] || 0) < l.cantidad);
    const puedeSiguiente = paso === 0 ? infer.rutaOk : paso === 1 ? (hayItems && !hayExceso) : false;
    const puedeCrear = paso === 2 && !!infer.resuelto && !hayExceso;

    const naceEnTransito = infer.tipoFlujo === 'push_directo' || infer.tipoFlujo === 'orden_gerencia';

    const reset = () => {
        setPaso(0); setOrigen(escenario.origen); setDestino(escenario.destino);
        setOrdenGerencia(!!escenario.ordenGerencia); setCart([]);
        setMotivo(''); setObservaciones(''); setRequierePionetas(false); setCantidadPionetas(0);
        setCreada(false);
    };

    if (creada) {
        return (
            <div className="rounded-2xl border border-success/30 bg-success/5 p-6 text-center space-y-3">
                <CheckCircle2 className="h-10 w-10 text-success mx-auto" />
                <div>
                    <h3 className="text-title-sm font-bold text-brand-dark">¡Movimiento creado! (demo)</h3>
                    <p className="text-caption text-muted-foreground mt-1">
                        Se registró como <span className="font-bold">{infer.tipoFlujoLabel}</span>. En la app real
                        {naceEnTransito
                            ? <> nacería <span className="font-bold">En Tránsito</span> (sin aprobación), listo para recibir en destino.</>
                            : <> quedaría <span className="font-bold">Pendiente</span>, esperando aprobación.</>}
                    </p>
                </div>
                <Button variant="secondary" size="sm" onClick={reset} leftIcon={<RotateCcw className="h-3.5 w-3.5" />}>
                    Hacer otro movimiento
                </Button>
            </div>
        );
    }

    return (
        <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-5">
            <p className="text-section font-bold text-brand-dark">Mover stock</p>
            <WizardStepper pasos={PASOS} actual={paso} />

            {paso === 0 && (
                <PasoRuta
                    modo="mover" state={wizardState} infer={infer} obras={obrasDemo} bodegas={bodegasDemo}
                    onOrigen={o => { setOrigen(o); setCart([]); }}
                    onDestino={setDestino}
                    onToggleOrden={setOrdenGerencia}
                    nombreUbi={nombreUbi}
                />
            )}
            {paso === 1 && (
                <CatalogoCarrito
                    catalogo={itemsDemo} stockEnOrigen={stockEnOrigen} conStockFiltro={conStockFiltro}
                    disponibleTotal={disponibleTotalDemo} categorias={categoriasDemo} loading={false}
                    cart={cart} setCart={setCart}
                    allowCustom={false} customItems={[]} setCustomItems={() => { /* sin custom en Mover */ }}
                />
            )}
            {paso === 2 && (
                <PasoRevisar
                    infer={infer} state={wizardState} catalogo={itemsDemo} customItems={[]} nombreUbi={nombreUbi}
                    setCart={setCart} setCustomItems={() => { /* sin custom en Mover */ }}
                    onMotivo={setMotivo} onObservaciones={setObservaciones}
                    onRequierePionetas={setRequierePionetas} onCantidadPionetas={setCantidadPionetas}
                />
            )}

            <div className="flex items-center justify-between gap-2 pt-3 border-t border-border">
                <Button
                    variant="ghost"
                    onClick={paso === 0 ? reset : () => setPaso(p => p - 1)}
                    leftIcon={paso === 0 ? undefined : <ArrowLeft className="h-4 w-4" />}
                >
                    {paso === 0 ? 'Reiniciar' : 'Atrás'}
                </Button>
                {paso < 2 ? (
                    <Button onClick={() => setPaso(p => p + 1)} disabled={!puedeSiguiente} rightIcon={<ArrowRight className="h-4 w-4" />}>
                        Siguiente
                    </Button>
                ) : (
                    <Button onClick={() => setCreada(true)} disabled={!puedeCrear} leftIcon={<Check className="h-4 w-4" />}>
                        Crear movimiento
                    </Button>
                )}
            </div>
        </div>
    );
};

export default DemoMover;
