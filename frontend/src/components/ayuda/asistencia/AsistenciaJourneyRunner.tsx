import React, { useRef, useState } from 'react';
import { ArrowLeft, RotateCcw, Sparkles, CheckCircle2, MousePointerClick } from 'lucide-react';
import { Button } from '../../ui/Button';
import AttendanceDailyTab from '../../attendance/AttendanceDailyTab';
import { AsistenciaSandbox } from './AsistenciaSandbox';
import { useTutorialSpotlight } from '../journey/useTutorialSpotlight';
import { TutorialCallout } from '../journey/TutorialCallout';
import type { JourneyDef } from '../journey/journeys';

const GUARDAR_LABELS = ['Guardar'];
const SIN_LABELS: string[] = [];

/**
 * Tutorial de Asistencia: monta la pantalla diaria REAL (`AttendanceDailyTab`)
 * dentro del `AsistenciaSandbox` (api mockeada + contextos override). El globo/pulso
 * guían a marcar y pulsar "Guardar"; al guardar (POST interceptado) se completa.
 */
export const AsistenciaJourneyRunner: React.FC<{
    journey: JourneyDef;
    onExit: () => void;
    completadoAt?: string;
    onCompletar?: (id: string) => void;
}> = ({ journey, onExit, completadoAt, onCompletar }) => {
    const [completado, setCompletado] = useState(false);
    const [nonce, setNonce] = useState(0);
    const screenRef = useRef<HTMLDivElement>(null);
    const marcado = useRef(false);

    const reiniciar = () => { setCompletado(false); marcado.current = false; setNonce(n => n + 1); };

    const onGuardado = () => {
        if (!marcado.current) { marcado.current = true; onCompletar?.(journey.id); }
        setCompletado(true);
    };

    const spot = useTutorialSpotlight(screenRef, completado ? SIN_LABELS : GUARDAR_LABELS);
    const instruccion = completado
        ? null
        : 'Cambia el estado de un trabajador (A / F / JI…) y pulsa "Guardar". Si hoy es fin de semana, usa las flechas ← → para ir a un día hábil.';

    const recap = journey.recap ?? [
        'Elegiste la obra y el día.',
        'Marcaste el estado de cada trabajador.',
        'Pulsaste Guardar y la asistencia quedó registrada.',
    ];

    return (
        <div className="w-full max-w-6xl mx-auto space-y-4">
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

            {/* Aviso sandbox */}
            <div className="flex items-center gap-2 rounded-xl border border-info/30 bg-info/5 px-3 py-2 text-caption text-brand-dark">
                <Sparkles className="h-4 w-4 shrink-0 text-info" />
                <span><span className="font-bold">Demostración interactiva.</span> Es la pantalla real de Asistencia con datos de ejemplo — no afecta nada.</span>
            </div>

            {/* Instrucción */}
            {instruccion && (
                spot.rect
                    ? <TutorialCallout rect={spot.rect}>{instruccion}</TutorialCallout>
                    : (
                        <div className="flex items-start gap-2 rounded-xl border border-brand-primary/30 bg-brand-primary/5 px-3 py-2.5 text-sm text-brand-dark">
                            <MousePointerClick className="h-4 w-4 mt-0.5 shrink-0 text-brand-primary" />
                            <span>{instruccion}</span>
                        </div>
                    )
            )}

            {/* Pantalla real dentro del sandbox */}
            <div ref={screenRef} className="rounded-2xl border border-border bg-card p-3 sm:p-4 min-h-[60vh] flex flex-col">
                <AsistenciaSandbox key={nonce} onGuardado={onGuardado}>
                    <AttendanceDailyTab onGoSabados={() => { /* sin tab sábados en este demo */ }} />
                </AsistenciaSandbox>
            </div>

            {/* Recap */}
            {completado && (
                <div className="rounded-2xl border border-success/30 bg-success/5 px-4 py-4 space-y-3">
                    <p className="flex items-center gap-2 text-sm font-bold text-brand-dark">
                        <CheckCircle2 className="h-5 w-5 shrink-0 text-success" /> ¡Asistencia registrada! Así se hace el día a día.
                    </p>
                    <ol className="ml-5 space-y-1 list-decimal text-caption text-muted-foreground">
                        {recap.map((r, i) => <li key={i}>{r}</li>)}
                    </ol>
                    <p className="text-caption text-muted-foreground">
                        Recuerda: no se registra en fin de semana ni feriados, y las faltas reiteradas disparan una alerta (Art. 160).
                    </p>
                    <Button variant="secondary" size="sm" onClick={reiniciar} leftIcon={<RotateCcw className="h-3.5 w-3.5" />}>Empezar de nuevo</Button>
                </div>
            )}
        </div>
    );
};
