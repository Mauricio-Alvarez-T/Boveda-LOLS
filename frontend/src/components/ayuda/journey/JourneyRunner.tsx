import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, RotateCcw, Sparkles, Check, CheckCircle2 } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { Button } from '../../ui/Button';
import { NuevoMovimientoWizardView } from '../../inventario/nuevo-movimiento/NuevoMovimientoWizardView';
import { useWizardEngine, type WizardData } from '../../inventario/nuevo-movimiento/wizardEngine';
import TransferenciaDetail from '../../inventario/TransferenciaDetail';
import DiscrepanciaDetail from '../../inventario/DiscrepanciaDetail';
import type { PermisosMovimiento } from '../../../utils/inferMovimiento';
import type { TransferenciaConDiscrepancias } from '../../../types/entities';
import { itemsDemo, bodegasDemo, obrasDemo, categoriasDemo, stockMapDemo } from '../demo/mockData';
import {
    buildTrfDemo, aprobarTrfDemo, recibirTrfDemo, rechazarTrfDemo, cancelarTrfDemo,
    buildDiscrepanciaDemo, resolverDiscrepanciaDemo, tieneDiferencia,
    type DemoTransferencia,
} from './journeyHelpers';
import { useTutorialSpotlight } from './useTutorialSpotlight';
import { TutorialCallout } from './TutorialCallout';
import type { JourneyDef } from './journeys';

const WIZARD_DATA: WizardData = {
    catalogo: itemsDemo, bodegas: bodegasDemo, obras: obrasDemo, categorias: categoriasDemo, stockMap: stockMapDemo,
};
const PERMISOS_TODO: PermisosMovimiento = {
    solicitar: true, solicitudMateriales: true, pushDirecto: true,
    intraBodega: true, devolucion: true, intraObra: true, ordenGerencia: true,
};

// Botones objetivo por fase, en orden de prioridad (los de formulario/modal abierto
// primero → el realce "salta" al botón de confirmar cuando se abre el form).
const CREAR_LABELS = ['Crear solicitud', 'Crear movimiento', 'Siguiente'];
const DETALLE_LABELS = [
    'Confirmar Aprobación', 'Esta es toda la entrega', 'Cerrar entrega (total)',
    'Faltan más viajes', 'Registrar viaje (parcial)', 'Registrar otro viaje',
    'Revisar y aprobar', 'Registrar lo que llegó',
];
const DISCREPANCIA_LABELS = ['Marcar como resuelta', 'Marcar como descartada', 'Resolver', 'Descartar'];
const SIN_LABELS: string[] = [];

const ESTADO_LABEL: Record<string, string> = {
    pendiente: 'Pendiente', aprobada: 'Aprobada', en_transito: 'En Tránsito',
    recepcion_parcial: 'Entrega en curso', recibida: 'Recibida', rechazada: 'Rechazada', cancelada: 'Cancelada',
};

const RECAP_DEFAULT = [
    'Creaste la solicitud (quedó Pendiente).',
    'Se aprobó eligiendo de qué bodega sale cada ítem.',
    'Se registró la recepción y quedó Recibida.',
];

const Stepper: React.FC<{ pasos: string[]; activo: number }> = ({ pasos, activo }) => (
    <div className="flex items-center justify-center gap-1 sm:gap-2">
        {pasos.map((label, idx) => {
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

export const JourneyRunner: React.FC<{
    journey: JourneyDef;
    onExit: () => void;
    /** Fecha ISO en que el usuario completó este tutorial (si ya lo hizo). */
    completadoAt?: string;
    /** Se llama una vez al completar el recorrido. */
    onCompletar?: (id: string) => void;
}> = ({ journey, onExit, completadoAt, onCompletar }) => {
    const engine = useWizardEngine(journey.modo ?? 'pedir', WIZARD_DATA, PERMISOS_TODO, journey.escenario);
    const [trf, setTrf] = useState<DemoTransferencia | null>(null);
    const [discrepancia, setDiscrepancia] = useState<TransferenciaConDiscrepancias | null>(null);
    const [discResuelta, setDiscResuelta] = useState(false);
    const screenRef = useRef<HTMLDivElement>(null);
    const marcado = useRef(false);

    const reiniciar = () => {
        engine.reset(); setTrf(null); setDiscrepancia(null); setDiscResuelta(false); marcado.current = false;
    };

    const conDiscrepancia = !!journey.conDiscrepancia;
    const sinAprobacion = !!journey.sinAprobacion;
    const estado = trf?.estado;
    const terminalMalo = estado === 'rechazada' || estado === 'cancelada';
    const enResolver = conDiscrepancia && !!discrepancia && !discResuelta;
    const completado = conDiscrepancia ? discResuelta : estado === 'recibida';

    // Marca el tutorial como completado (una sola vez).
    useEffect(() => {
        if (completado && !marcado.current) {
            marcado.current = true;
            onCompletar?.(journey.id);
        }
    }, [completado, journey.id, onCompletar]);

    const pasos = conDiscrepancia
        ? ['Crear', 'Aprobar', 'Recibir', 'Resolver']
        : sinAprobacion ? ['Crear', 'Recibir'] : ['Crear', 'Aprobar', 'Recibir'];
    const activo = !trf ? 0
        : completado ? pasos.length
            : (conDiscrepancia && estado === 'recibida') ? 3
                : estado === 'pendiente' ? 1
                    : terminalMalo ? 1
                        : (sinAprobacion ? 1 : 2);
    const pasoNum = Math.min(activo + 1, pasos.length);

    const labels = useMemo(() => {
        if (enResolver) return DISCREPANCIA_LABELS;
        if (!trf) return CREAR_LABELS;
        if (estado === 'pendiente' || estado === 'aprobada' || estado === 'en_transito' || estado === 'recepcion_parcial') return DETALLE_LABELS;
        return SIN_LABELS;
    }, [enResolver, trf, estado]);

    const spot = useTutorialSpotlight(screenRef, labels);

    // Instrucción state-aware del globo.
    const esMateriales = journey.id === 'catalogo-materiales';
    const modo = journey.modo ?? 'pedir';
    const crearWord = modo === 'mover' ? 'Crear movimiento' : 'Crear solicitud';
    let instruccion: string | null = null;
    if (!trf) {
        if (engine.paso === 0) {
            instruccion = modo === 'mover'
                ? (engine.origen && engine.destino ? 'Revisa la ruta (ya viene puesta) y pulsa "Siguiente".' : 'Elige el origen y el destino; luego se habilita "Siguiente".')
                : (engine.destino ? 'Listo el destino. Pulsa "Siguiente".' : 'Elige la obra de destino; luego se habilita "Siguiente".');
        } else if (engine.paso === 1) {
            instruccion = engine.hayItems
                ? 'Pulsa "Siguiente" para revisar.'
                : (esMateriales
                    ? 'Agrega ítems del catálogo y, en la pestaña "Otros materiales", lo que no esté en el catálogo.'
                    : 'Agrega al menos un ítem con "Agregar" y ajusta la cantidad.');
        } else {
            instruccion = (engine.ordenGerencia && !engine.motivo.trim())
                ? `Escribe el motivo (obligatorio) y pulsa "${crearWord}".`
                : `Revisa el resumen y pulsa "${crearWord}".`;
        }
    } else if (enResolver) {
        const m: Record<string, string> = {
            'Marcar como resuelta': 'Escribe la nota de resolución y pulsa "Marcar como resuelta".',
            'Marcar como descartada': 'Escribe la nota y pulsa "Marcar como descartada".',
            'Resolver': 'Pulsa "Resolver" en el ítem con diferencia.',
            'Descartar': 'O "Descartar" si la diferencia no requiere acción.',
        };
        instruccion = (spot.label && m[spot.label]) || 'Resuelve la diferencia: pulsa "Resolver" en el ítem, escribe una nota y confirma.';
    } else if (!completado && !terminalMalo) {
        const map: Record<string, string> = {
            'Confirmar Aprobación': spot.enabled ? 'Pulsa "Confirmar Aprobación".' : 'Elige de qué bodega(s) sale cada ítem; luego se habilita "Confirmar Aprobación".',
            'Revisar y aprobar': 'Pulsa "Revisar y aprobar" para elegir de qué bodega sale cada ítem.',
            'Esta es toda la entrega': 'Marca lo que llegó y pulsa "Esta es toda la entrega" para cerrar.',
            'Cerrar entrega (total)': 'Escribe lo que llegó y pulsa "Cerrar entrega (total)".',
            'Faltan más viajes': 'Si llegó todo, usa "Esta es toda la entrega"; si falta para otro viaje, "Faltan más viajes".',
            'Registrar viaje (parcial)': 'Registra lo de este viaje; cuando llegue todo, cierra la entrega.',
            'Registrar otro viaje': 'Registra el siguiente viaje, o cierra cuando llegue todo.',
            'Registrar lo que llegó': 'Pulsa "Registrar lo que llegó" para anotar lo recibido.',
        };
        instruccion = (spot.label && map[spot.label]) ? map[spot.label]
            : estado === 'pendiente' ? journey.textos?.aprobar ?? null
                : journey.textos?.recibir ?? null;
    }

    const recap = journey.recap ?? RECAP_DEFAULT;
    // Dead-end suave: journey de discrepancia pero el usuario recibió todo (sin diferencia).
    const recibidaSinDiferencia = conDiscrepancia && estado === 'recibida' && !discrepancia && !discResuelta;

    return (
        <div className="w-full max-w-5xl mx-auto space-y-4">
            {/* Cabecera */}
            <div className="flex items-center justify-between gap-3">
                <Button variant="ghost" size="sm" onClick={onExit} leftIcon={<ArrowLeft className="h-4 w-4" />}>Volver</Button>
                <Button variant="ghost" size="sm" onClick={reiniciar} leftIcon={<RotateCcw className="h-3.5 w-3.5" />}>Reiniciar</Button>
            </div>

            <div>
                <h1 className="text-title font-bold text-brand-dark leading-tight">{journey.titulo}</h1>
                <p className="text-body text-muted-foreground mt-0.5">{journey.descripcion}</p>
                {completadoAt && (
                    <p className="mt-1.5 inline-flex items-center gap-1.5 text-caption font-bold text-success">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Ya completaste este tutorial el {new Date(completadoAt).toLocaleDateString('es-CL')}
                    </p>
                )}
            </div>

            <div className="flex flex-col items-center gap-1.5">
                <Stepper pasos={pasos} activo={activo} />
                <p className="text-caption text-muted-foreground">
                    {completado ? 'Completado' : `Paso ${pasoNum} de ${pasos.length}`}
                    {trf && <> · Estado: <span className="font-bold text-brand-dark">{ESTADO_LABEL[estado!] ?? estado}</span></>}
                </p>
            </div>

            {/* Aviso sandbox */}
            <div className="flex items-center gap-2 rounded-xl border border-info/30 bg-info/5 px-3 py-2 text-caption text-brand-dark">
                <Sparkles className="h-4 w-4 shrink-0 text-info" />
                <span><span className="font-bold">Demostración interactiva.</span> Es la pantalla real de la app con datos de ejemplo — no afecta nada.</span>
            </div>

            {/* Instrucción: globo anclado al botón; si no hay botón visible, banner */}
            {instruccion && (
                spot.rect
                    ? <TutorialCallout rect={spot.rect}>{instruccion}</TutorialCallout>
                    : (
                        <div className="flex items-start gap-2 rounded-xl border border-brand-primary/30 bg-brand-primary/5 px-3 py-2.5 text-sm text-brand-dark">
                            <span>{instruccion}</span>
                        </div>
                    )
            )}

            {/* Pantalla real (objetivo del spotlight) */}
            <div ref={screenRef}>
                {!trf ? (
                    <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
                        <NuevoMovimientoWizardView
                            modo={modo}
                            engine={engine}
                            data={WIZARD_DATA}
                            loadingData={false}
                            onClose={() => { /* sin modal en el tutorial */ }}
                            onSubmit={async () => { setTrf(buildTrfDemo(engine)); return { id: 9001, codigo: 'TRF-DEMO-0001' }; }}
                        />
                    </div>
                ) : enResolver && discrepancia ? (
                    <DiscrepanciaDetail
                        discrepancia={discrepancia}
                        canEdit
                        onBack={onExit}
                        onResolver={async (id, est, resolucion) => {
                            const upd = resolverDiscrepanciaDemo(discrepancia, id, est, resolucion);
                            setDiscrepancia(upd);
                            if (upd.discrepancias.every(d => d.estado !== 'pendiente')) setDiscResuelta(true);
                            return true;
                        }}
                        onRefresh={async () => { /* no-op en demo */ }}
                    />
                ) : (
                    <TransferenciaDetail
                        transferencia={trf}
                        obras={obrasDemo}
                        actionLoading={false}
                        hasPermission={() => true}
                        userId={0}
                        onBack={onExit}
                        onFetchStock={async (ids) => Object.fromEntries(ids.map(id => [id, stockMapDemo[id] ?? []]))}
                        onAprobar={async (data) => { setTrf(prev => prev ? aprobarTrfDemo(prev, data) : prev); return true; }}
                        onRecibir={async (items, tipo = 'total') => {
                            if (!trf) return null;
                            const next = recibirTrfDemo(trf, items, tipo);
                            setTrf(next);
                            if (conDiscrepancia && tipo === 'total' && tieneDiferencia(next)) {
                                setDiscrepancia(buildDiscrepanciaDemo(next));
                            }
                            return 1;
                        }}
                        onRechazar={async (motivo) => { setTrf(prev => prev ? rechazarTrfDemo(prev, motivo) : prev); return true; }}
                        onRechazarRecepcion={async (motivo) => { setTrf(prev => prev ? rechazarTrfDemo(prev, motivo) : prev); return true; }}
                        onCancelar={async () => { setTrf(prev => prev ? cancelarTrfDemo(prev) : prev); return true; }}
                        onFetchRecepciones={async () => []}
                        onUploadFotoRecepcion={async () => true}
                    />
                )}
            </div>

            {/* Dead-end suave (discrepancia pero recibió todo) */}
            {recibidaSinDiferencia && (
                <div className="rounded-2xl border border-warning/30 bg-warning/5 px-4 py-3 flex items-center justify-between gap-3">
                    <p className="text-sm text-brand-dark">Recibiste todo, así que no quedó diferencia. Para ver una discrepancia, <span className="font-bold">recibe menos de lo enviado</span>.</p>
                    <Button variant="secondary" size="sm" onClick={reiniciar} leftIcon={<RotateCcw className="h-3.5 w-3.5" />}>Reintentar</Button>
                </div>
            )}

            {/* Recap al completar */}
            {completado && (
                <div className="rounded-2xl border border-success/30 bg-success/5 px-4 py-4 space-y-3">
                    <p className="flex items-center gap-2 text-sm font-bold text-brand-dark">
                        <CheckCircle2 className="h-5 w-5 shrink-0 text-success" /> ¡Flujo completo! Así se hace de principio a fin.
                    </p>
                    <ol className="ml-5 space-y-1 list-decimal text-caption text-muted-foreground">
                        {recap.map((r, i) => <li key={i}>{r}</li>)}
                    </ol>
                    <p className="text-caption text-muted-foreground">
                        En la app real, cada paso lo hace una <span className="font-bold">persona distinta</span> (no puedes aprobar lo que tú mismo pediste).
                    </p>
                    <Button variant="secondary" size="sm" onClick={reiniciar} leftIcon={<RotateCcw className="h-3.5 w-3.5" />}>Empezar de nuevo</Button>
                </div>
            )}

            {/* Terminal por rechazo/cancelación */}
            {terminalMalo && (
                <div className="rounded-2xl border border-border bg-muted/40 px-4 py-3 flex items-center justify-between gap-3">
                    <p className="text-sm text-brand-dark">La solicitud quedó <span className="font-bold">{ESTADO_LABEL[estado!]}</span> (demostración).</p>
                    <Button variant="secondary" size="sm" onClick={reiniciar} leftIcon={<RotateCcw className="h-3.5 w-3.5" />}>Empezar de nuevo</Button>
                </div>
            )}
        </div>
    );
};
