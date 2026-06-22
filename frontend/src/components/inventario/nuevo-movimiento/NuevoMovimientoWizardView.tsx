import React from 'react';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { Button } from '../../ui/Button';
import { WizardStepper } from './WizardStepper';
import { PasoRuta } from './PasoRuta';
import { CatalogoCarrito } from './CatalogoCarrito';
import { PasoRevisar } from './PasoRevisar';
import type { MovimientoResuelto } from '../../../utils/inferMovimiento';
import type { WizardData, WizardEngine } from './wizardEngine';

/**
 * Vista PURA del wizard de "Nuevo movimiento": stepper + paso (Ruta/Ítems/Revisar)
 * + navegación. Sin `<Modal>` ni fetch: recibe `engine` (estado+derivados) y `data`
 * (catálogo/bodegas/obras/categorías). La usan el wizard real (dentro de un Modal) y
 * las demos del Centro de ayuda (inline) → fuente única de la UI del wizard.
 */
export const NuevoMovimientoWizardView: React.FC<{
    modo: 'pedir' | 'mover';
    engine: WizardEngine;
    data: WizardData;
    loadingData: boolean;
    onClose: () => void;
    onSubmit: (resuelto: MovimientoResuelto) => Promise<{ id: number; codigo: string } | null>;
}> = ({ modo, engine, data, loadingData, onClose, onSubmit }) => {
    const {
        paso, setPaso, wizardState, infer, conStockFiltro, stockEnOrigen, disponibleTotal,
        allowCustom, nombreUbi, handleOrigen, handleDestino, setOrdenGerencia,
        cart, setCart, customItems, setCustomItems,
        setMotivo, setObservaciones, setRequierePionetas, setCantidadPionetas,
        puedeSiguiente, puedeCrear, submitting, setSubmitting,
    } = engine;

    const handleCrear = async () => {
        if (!infer.resuelto) return;
        setSubmitting(true);
        const r = await onSubmit(infer.resuelto);
        setSubmitting(false);
        if (r) onClose();
    };

    const pasos = modo === 'pedir' ? ['Obra', 'Ítems', 'Revisar'] : ['Ruta', 'Ítems', 'Revisar'];

    return (
        <div className="space-y-5">
            <WizardStepper pasos={pasos} actual={paso} />

            {paso === 0 && (
                <PasoRuta
                    modo={modo} state={wizardState} infer={infer} obras={data.obras} bodegas={data.bodegas}
                    onOrigen={handleOrigen} onDestino={handleDestino}
                    onToggleOrden={setOrdenGerencia} nombreUbi={nombreUbi}
                />
            )}
            {paso === 1 && (
                <CatalogoCarrito
                    catalogo={data.catalogo} stockEnOrigen={stockEnOrigen} conStockFiltro={conStockFiltro}
                    disponibleTotal={disponibleTotal} categorias={data.categorias} loading={loadingData} cart={cart} setCart={setCart}
                    allowCustom={allowCustom} customItems={customItems} setCustomItems={setCustomItems}
                />
            )}
            {paso === 2 && (
                <PasoRevisar
                    infer={infer} state={wizardState} catalogo={data.catalogo} customItems={customItems} nombreUbi={nombreUbi}
                    setCart={setCart} setCustomItems={setCustomItems}
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
                    <Button onClick={handleCrear} disabled={!puedeCrear} isLoading={submitting} leftIcon={<Check className="h-4 w-4" />}>
                        {modo === 'pedir' ? 'Crear solicitud' : 'Crear movimiento'}
                    </Button>
                )}
            </div>
        </div>
    );
};
