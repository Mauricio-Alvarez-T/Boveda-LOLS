import React, { useState } from 'react';
import { ArrowLeft, RotateCcw, Sparkles, Check, CheckCircle2, MousePointerClick } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { Button } from '../../ui/Button';
import { NuevoMovimientoWizardView } from '../../inventario/nuevo-movimiento/NuevoMovimientoWizardView';
import { useWizardEngine, type WizardData } from '../../inventario/nuevo-movimiento/wizardEngine';
import TransferenciaDetail from '../../inventario/TransferenciaDetail';
import type { PermisosMovimiento } from '../../../utils/inferMovimiento';
import { itemsDemo, bodegasDemo, obrasDemo, categoriasDemo, stockMapDemo } from '../demo/mockData';
import {
    buildTrfDemo, aprobarTrfDemo, recibirTrfDemo, rechazarTrfDemo, cancelarTrfDemo,
    type DemoTransferencia,
} from './journeyHelpers';
import type { JourneyDef } from './journeys';

const WIZARD_DATA: WizardData = {
    catalogo: itemsDemo, bodegas: bodegasDemo, obras: obrasDemo, categorias: categoriasDemo, stockMap: stockMapDemo,
};
const PERMISOS_TODO: PermisosMovimiento = {
    solicitar: true, solicitudMateriales: true, pushDirecto: true,
    intraBodega: true, devolucion: true, intraObra: true, ordenGerencia: true,
};

const PASOS = ['Crear', 'Aprobar', 'Recibir'];

const Stepper: React.FC<{ activo: number }> = ({ activo }) => (
    <div className="flex items-center justify-center gap-1 sm:gap-2">
        {PASOS.map((label, idx) => {
            const completado = idx < activo;
            const esActivo = idx === activo;
            return (
                <React.Fragment key={label}>
                    {idx > 0 && <div className={cn('h-0.5 w-8 sm:w-12 rounded-full', idx <= activo ? 'bg-brand-primary' : 'bg-muted')} />}
                    <div className="flex items-center gap-1.5">
                        <div className={cn(
                            'h-6 w-6 rounded-full flex items-center justify-center text-caption font-black border-2 transition-all',
                            completado ? 'bg-brand-primary border-brand-primary text-white'
                                : esActivo ? 'border-brand-primary text-brand-primary ring-4 ring-brand-primary/15'
                                    : 'border-border text-muted-foreground/50',
                        )}>
                            {completado ? <Check className="h-3.5 w-3.5" /> : idx + 1}
                        </div>
                        <span className={cn('text-label font-bold whitespace-nowrap hidden sm:block', esActivo ? 'text-brand-dark' : 'text-muted-foreground/60')}>{label}</span>
                    </div>
                </React.Fragment>
            );
        })}
    </div>
);

export const JourneyRunner: React.FC<{ journey: JourneyDef; onExit: () => void }> = ({ journey, onExit }) => {
    const engine = useWizardEngine(journey.modo ?? 'pedir', WIZARD_DATA, PERMISOS_TODO);
    const [trf, setTrf] = useState<DemoTransferencia | null>(null);

    const reiniciar = () => { engine.reset(); setTrf(null); };

    const estado = trf?.estado;
    const terminalMalo = estado === 'rechazada' || estado === 'cancelada';
    const activo = !trf ? 0
        : estado === 'pendiente' ? 1
            : estado === 'recibida' ? 3
                : terminalMalo ? 1
                    : 2; // aprobada / en_transito / recepcion_parcial

    const t = journey.textos;
    const ayuda = !trf ? t?.crear
        : estado === 'pendiente' ? t?.aprobar
            : (estado === 'aprobada' || estado === 'recepcion_parcial' || estado === 'en_transito') ? t?.recibir
                : estado === 'recibida' ? t?.fin
                    : estado === 'rechazada' ? 'La solicitud quedó rechazada (demostración). Pulsa Reiniciar para empezar de nuevo.'
                        : 'La solicitud quedó cancelada (demostración). Pulsa Reiniciar para empezar de nuevo.';

    return (
        <div className="w-full max-w-5xl mx-auto space-y-4">
            {/* Cabecera */}
            <div className="flex items-center justify-between gap-3">
                <Button variant="ghost" size="sm" onClick={onExit} leftIcon={<ArrowLeft className="h-4 w-4" />}>
                    Volver
                </Button>
                <Button variant="ghost" size="sm" onClick={reiniciar} leftIcon={<RotateCcw className="h-3.5 w-3.5" />}>
                    Reiniciar
                </Button>
            </div>

            <div>
                <h1 className="text-title font-bold text-brand-dark leading-tight">{journey.titulo}</h1>
                <p className="text-body text-muted-foreground mt-0.5">{journey.descripcion}</p>
            </div>

            <Stepper activo={activo} />

            {/* Aviso sandbox */}
            <div className="flex items-center gap-2 rounded-xl border border-info/30 bg-info/5 px-3 py-2 text-caption text-brand-dark">
                <Sparkles className="h-4 w-4 shrink-0 text-info" />
                <span><span className="font-bold">Demostración interactiva.</span> Es la pantalla real de la app con datos de ejemplo — no afecta nada.</span>
            </div>

            {/* Panel de ayuda del paso */}
            {ayuda && (
                <div className="flex items-start gap-2 rounded-xl border border-brand-primary/30 bg-brand-primary/5 px-3 py-2.5 text-sm text-brand-dark">
                    <MousePointerClick className="h-4 w-4 mt-0.5 shrink-0 text-brand-primary" />
                    <span>{ayuda}</span>
                </div>
            )}

            {/* Pantalla real */}
            {!trf ? (
                <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
                    <NuevoMovimientoWizardView
                        modo={journey.modo ?? 'pedir'}
                        engine={engine}
                        data={WIZARD_DATA}
                        loadingData={false}
                        onClose={() => { /* sin modal en el tutorial */ }}
                        onSubmit={async () => { setTrf(buildTrfDemo(engine)); return { id: 9001, codigo: 'TRF-DEMO-0001' }; }}
                    />
                </div>
            ) : (
                <>
                    <TransferenciaDetail
                        transferencia={trf}
                        obras={obrasDemo}
                        actionLoading={false}
                        hasPermission={() => true}
                        userId={0}
                        onBack={onExit}
                        onFetchStock={async (ids) => Object.fromEntries(ids.map(id => [id, stockMapDemo[id] ?? []]))}
                        onAprobar={async (data) => { setTrf(prev => prev ? aprobarTrfDemo(prev, data) : prev); return true; }}
                        onRecibir={async (items, tipo = 'total') => { setTrf(prev => prev ? recibirTrfDemo(prev, items, tipo) : prev); return 1; }}
                        onRechazar={async (motivo) => { setTrf(prev => prev ? rechazarTrfDemo(prev, motivo) : prev); return true; }}
                        onRechazarRecepcion={async (motivo) => { setTrf(prev => prev ? rechazarTrfDemo(prev, motivo) : prev); return true; }}
                        onCancelar={async () => { setTrf(prev => prev ? cancelarTrfDemo(prev) : prev); return true; }}
                        onFetchRecepciones={async () => []}
                        onUploadFotoRecepcion={async () => true}
                    />

                    {estado === 'recibida' && (
                        <div className="flex items-center justify-between gap-3 rounded-2xl border border-success/30 bg-success/5 px-4 py-3">
                            <p className="flex items-center gap-2 text-sm text-brand-dark">
                                <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
                                <span className="font-bold">¡Flujo completo!</span> La solicitud quedó <span className="font-bold">Recibida</span>.
                            </p>
                            <Button variant="secondary" size="sm" onClick={reiniciar} leftIcon={<RotateCcw className="h-3.5 w-3.5" />}>
                                Empezar de nuevo
                            </Button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};
