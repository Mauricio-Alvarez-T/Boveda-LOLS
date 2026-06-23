import React, { useRef, useState } from 'react';
import { ArrowLeft, RotateCcw, Sparkles, CheckCircle2, MousePointerClick } from 'lucide-react';
import { Button } from '../../ui/Button';
import ConsultasPage from '../../../pages/Consultas';
import { ConsultasSandbox } from './ConsultasSandbox';
import { SandboxBoundary } from '../journey/SandboxBoundary';
import { useTutorialSpotlight } from '../journey/useTutorialSpotlight';
import { TutorialCallout } from '../journey/TutorialCallout';
import type { JourneyDef } from '../journey/journeys';

type Flujo = NonNullable<JourneyDef['consultaFlujo']>;

interface FlujoConfig {
    /** Botón(es) a resaltar, por prioridad (por texto, aria-label o title). Vacío = solo guía por globo. */
    labels: string[];
    instruccion: string;
    /** Tipo de acción (onAccion) que marca el tutorial como completado. */
    accion: string;
    finTitulo: string;
    recap: string[];
}

const CONFIG: Record<Flujo, FlujoConfig> = {
    'ver-trabajador': {
        labels: [],
        instruccion: 'Escribe un nombre o RUT en el buscador (arriba) y haz clic en un trabajador de la lista para abrir su ficha. (También puedes hacer clic directo sin buscar.)',
        accion: 'ver-trabajador',
        finTitulo: '¡Ficha del trabajador abierta!',
        recap: [
            'Usaste el buscador para encontrar a un trabajador.',
            'Hiciste clic en su nombre para abrir la ficha (datos, contacto y documentación).',
            'Desde la ficha puedes ver documentos, asistencia y editar.',
        ],
    },
    'ver-doc': {
        labels: ['Ver documento'],
        instruccion: 'Abre la ficha de un trabajador (clic en su nombre). En la sección de documentos, pulsa el ojo "Ver documento" de uno de ellos para abrirlo.',
        accion: 'ver-doc',
        finTitulo: '¡Documento abierto!',
        recap: [
            'Abriste la ficha de un trabajador.',
            'Pulsaste "Ver documento" en uno de sus documentos.',
            'El documento se abrió en una pestaña nueva.',
        ],
    },
    registrar: {
        labels: ['Guardar', 'Trabajador', 'Crear'],
        instruccion: 'Pulsa "CREAR" (arriba) y luego "Trabajador". Completa el formulario: RUT válido (ej. 11.111.111-1), nombres, apellido, y elige empresa, obra, cargo y categoría. Pulsa "Guardar".',
        accion: 'crear',
        finTitulo: '¡Trabajador registrado!',
        recap: [
            'Pulsaste "CREAR" y luego "Trabajador".',
            'Completaste RUT, nombres, apellido, empresa, obra, cargo y categoría.',
            'Pulsaste "Guardar" y el trabajador quedó registrado.',
        ],
    },
    editar: {
        labels: ['Guardar', 'Editar trabajador'],
        instruccion: 'Busca un trabajador y pulsa el lápiz "Editar trabajador" de su fila (o ábrelo desde su ficha). Cambia algún dato y pulsa "Guardar".',
        accion: 'editar',
        finTitulo: '¡Trabajador actualizado!',
        recap: [
            'Abriste un trabajador en modo edición.',
            'Cambiaste algún dato.',
            'Pulsaste "Guardar" y los cambios quedaron registrados.',
        ],
    },
};

/**
 * Tutorial de Consultas: monta la página REAL (`ConsultasPage`) dentro del
 * `ConsultasSandbox` (api mockeada + AuthContext override) y guía con pulso/globo
 * hasta completar la acción del flujo (`journey.consultaFlujo` → CONFIG). Los flujos
 * de lectura completan al cargar un GET (ficha / documento); los de CRUD al POST/PUT.
 */
export const ConsultasJourneyRunner: React.FC<{
    journey: JourneyDef;
    onExit: () => void;
    completadoAt?: string;
    onCompletar?: (id: string) => void;
}> = ({ journey, onExit, completadoAt, onCompletar }) => {
    const cfg = CONFIG[journey.consultaFlujo ?? 'ver-trabajador'] ?? CONFIG['ver-trabajador'];
    const [completado, setCompletado] = useState(false);
    const [nonce, setNonce] = useState(0);
    const screenRef = useRef<HTMLDivElement>(null);
    const marcado = useRef(false);

    const reiniciar = () => { setCompletado(false); marcado.current = false; setNonce(n => n + 1); };

    const onAccion = (tipo: string) => {
        if (tipo !== cfg.accion) return;
        if (!marcado.current) { marcado.current = true; onCompletar?.(journey.id); }
        setCompletado(true);
    };

    const spot = useTutorialSpotlight(screenRef, completado ? [] : cfg.labels);
    const instruccion = completado ? null : cfg.instruccion;

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
                <span><span className="font-bold">Demostración interactiva.</span> Es la pantalla real de Consultas con datos de ejemplo — no afecta nada.</span>
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
                <SandboxBoundary key={nonce}>
                    <ConsultasSandbox onAccion={onAccion}>
                        <ConsultasPage />
                    </ConsultasSandbox>
                </SandboxBoundary>
            </div>

            {/* Recap */}
            {completado && (
                <div className="rounded-2xl border border-success/30 bg-success/5 px-4 py-4 space-y-3">
                    <p className="flex items-center gap-2 text-sm font-bold text-brand-dark">
                        <CheckCircle2 className="h-5 w-5 shrink-0 text-success" /> {cfg.finTitulo}
                    </p>
                    <ol className="ml-5 space-y-1 list-decimal text-caption text-muted-foreground">
                        {(journey.recap ?? cfg.recap).map((r, i) => <li key={i}>{r}</li>)}
                    </ol>
                    <Button variant="secondary" size="sm" onClick={reiniciar} leftIcon={<RotateCcw className="h-3.5 w-3.5" />}>Empezar de nuevo</Button>
                </div>
            )}
        </div>
    );
};
