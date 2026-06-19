import React, { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, RotateCcw } from 'lucide-react';
import { Button } from '../../ui/Button';
import { WizardStepper } from '../../inventario/nuevo-movimiento/WizardStepper';
import { PasoRuta } from '../../inventario/nuevo-movimiento/PasoRuta';
import { CatalogoCarrito } from '../../inventario/nuevo-movimiento/CatalogoCarrito';
import { PasoRevisar } from '../../inventario/nuevo-movimiento/PasoRevisar';
import {
    inferMovimiento,
    type Origen, type Destino, type ItemInput, type CustomItemInput, type PermisosMovimiento,
} from '../../../utils/inferMovimiento';
import { obrasDemo, bodegasDemo, categoriasDemo, itemsDemo, disponibleTotalDemo } from './mockData';

/**
 * Demo interactiva del flujo "Pedir una solicitud". Reusa los sub-pasos REALES del
 * wizard (WizardStepper, PasoRuta, CatalogoCarrito, PasoRevisar) y la inferencia
 * real (`inferMovimiento`), pero con datos de ejemplo y SIN backend: replica la
 * orquestación de NuevoMovimientoWizard en modo "pedir" (el wizard real hace fetch
 * al abrir, por eso aquí se orquesta localmente). Al "Crear solicitud" muestra una
 * escena de éxito en vez de llamar a la API.
 */
const PERMISOS_DEMO: PermisosMovimiento = {
    solicitar: true, solicitudMateriales: true, pushDirecto: true,
    intraBodega: true, devolucion: true, intraObra: true, ordenGerencia: true,
};

const PASOS = ['Obra', 'Ítems', 'Revisar'];

export const DemoPedir: React.FC = () => {
    const [paso, setPaso] = useState(0);
    const [origen] = useState<Origen>({ tipo: 'central' }); // modo Pedir: origen fijo central
    const [destino, setDestino] = useState<Destino | null>(null);
    const [cart, setCart] = useState<ItemInput[]>([]);
    const [customItems, setCustomItems] = useState<CustomItemInput[]>([]);
    const [motivo, setMotivo] = useState('');
    const [observaciones, setObservaciones] = useState('');
    const [requierePionetas, setRequierePionetas] = useState(false);
    const [cantidadPionetas, setCantidadPionetas] = useState(0);
    const [creada, setCreada] = useState(false);

    const customLimpios = useMemo(() => customItems.filter(c => c.descripcion.trim()), [customItems]);

    const wizardState = useMemo(() => ({
        origen, destino, ordenGerencia: false,
        items: cart, itemsCustom: customLimpios,
        motivo, observaciones, requierePionetas, cantidadPionetas,
    }), [origen, destino, cart, customLimpios, motivo, observaciones, requierePionetas, cantidadPionetas]);

    const infer = useMemo(() => inferMovimiento(wizardState, PERMISOS_DEMO), [wizardState]);

    const nombreUbi = (u: Origen | Destino | null): string => {
        if (!u) return '—';
        if (u.tipo === 'central') return 'Bodega central';
        if (u.tipo === 'bodega') return bodegasDemo.find(b => b.id === u.id)?.nombre || `Bodega #${u.id}`;
        return obrasDemo.find(o => o.id === u.id)?.nombre || `Obra #${u.id}`;
    };

    const hayItems = cart.length > 0 || customLimpios.length > 0;
    const puedeSiguiente = paso === 0 ? infer.rutaOk : paso === 1 ? hayItems : false;
    const puedeCrear = paso === 2 && !!infer.resuelto;

    const reset = () => {
        setPaso(0); setDestino(null); setCart([]); setCustomItems([]);
        setMotivo(''); setObservaciones(''); setRequierePionetas(false); setCantidadPionetas(0);
        setCreada(false);
    };

    if (creada) {
        return (
            <div className="rounded-2xl border border-success/30 bg-success/5 p-6 text-center space-y-3">
                <CheckCircle2 className="h-10 w-10 text-success mx-auto" />
                <div>
                    <h3 className="text-title-sm font-bold text-brand-dark">¡Solicitud creada! (demo)</h3>
                    <p className="text-caption text-muted-foreground mt-1">
                        En la app real quedaría en estado <span className="font-bold">Pendiente</span>, esperando que alguien la apruebe.
                        Verías el aviso: <span className="italic">"Solicitud TRF-… creada — Queda pendiente de aprobación".</span>
                    </p>
                </div>
                <Button variant="secondary" size="sm" onClick={reset} leftIcon={<RotateCcw className="h-3.5 w-3.5" />}>
                    Hacer otra solicitud
                </Button>
            </div>
        );
    }

    return (
        <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-5">
            <p className="text-section font-bold text-brand-dark">Nueva solicitud</p>
            <WizardStepper pasos={PASOS} actual={paso} />

            {paso === 0 && (
                <PasoRuta
                    modo="pedir" state={wizardState} infer={infer} obras={obrasDemo} bodegas={bodegasDemo}
                    onOrigen={() => { /* origen fijo central en modo pedir */ }}
                    onDestino={d => setDestino(d && d.tipo === 'obra' ? d : null)}
                    onToggleOrden={() => { /* sin orden de gerencia en este demo */ }}
                    nombreUbi={nombreUbi}
                />
            )}
            {paso === 1 && (
                <CatalogoCarrito
                    catalogo={itemsDemo} stockEnOrigen={{}} conStockFiltro={false}
                    disponibleTotal={disponibleTotalDemo} categorias={categoriasDemo} loading={false}
                    cart={cart} setCart={setCart}
                    allowCustom customItems={customItems} setCustomItems={setCustomItems}
                />
            )}
            {paso === 2 && (
                <PasoRevisar
                    infer={infer} state={wizardState} catalogo={itemsDemo} customItems={customItems} nombreUbi={nombreUbi}
                    setCart={setCart} setCustomItems={setCustomItems}
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
                        Crear solicitud
                    </Button>
                )}
            </div>
        </div>
    );
};

export default DemoPedir;
