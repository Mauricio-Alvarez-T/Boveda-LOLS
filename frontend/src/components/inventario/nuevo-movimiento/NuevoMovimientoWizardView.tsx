import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { Button } from '../../ui/Button';
import { direccionCambio, type Direccion } from '../../../utils/movimiento';
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

    // Dirección del último cambio de paso (1 = avanzó, -1 = volvió). Se ajusta durante
    // el render al cambiar `paso` (diseno.md §9.9), no en un efecto: así el paso nuevo
    // ya monta con la dirección correcta, sin un frame de retraso.
    const [pasoPrevio, setPasoPrevio] = useState(paso);
    const [dir, setDir] = useState<Direccion>(0);
    if (paso !== pasoPrevio) {
        setDir(direccionCambio(pasoPrevio, paso));
        setPasoPrevio(paso);
    }

    return (
        <div className="space-y-5">
            <WizardStepper pasos={pasos} actual={paso} />

            {/* Idea: Stepper de React Bits (reactbits.dev, MIT + Commons Clause). Reescrito; sin código copiado.
                Panel direccional (diseno.md §9.7): el paso entra ±12 px desde el lado hacia el que
                se avanza, en 150 ms. UN solo motion.div por paso (nunca por fila de ítems, §8.13);
                sin AnimatePresence/exit/mode="wait" (el paso viejo se va en seco, nada espera) y
                sin animar el alto (los pasos miden distinto y el Modal saltaría). El primer montaje
                es estático (dir 0). Con reduce-motion, MotionConfig quita la `x` y queda el fundido. */}
            <motion.div
                key={paso}
                initial={dir === 0 ? false : { opacity: 0, x: dir * 12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
            >
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
            </motion.div>

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
