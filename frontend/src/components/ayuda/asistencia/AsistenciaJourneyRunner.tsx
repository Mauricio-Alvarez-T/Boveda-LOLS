import React, { useRef, useState } from 'react';
import { ArrowLeft, RotateCcw, Sparkles, CheckCircle2, MousePointerClick } from 'lucide-react';
import { Button } from '../../ui/Button';
import AttendanceDailyTab from '../../attendance/AttendanceDailyTab';
import SabadosExtraTab from '../../attendance/sabados/SabadosExtraTab';
import { WorkerCalendarModal } from '../../attendance/WorkerCalendarModal';
import type { Trabajador, EstadoAsistencia } from '../../../types/entities';
import { AsistenciaSandbox } from './AsistenciaSandbox';
import { SandboxBoundary } from '../journey/SandboxBoundary';
import { useTutorialSpotlight } from '../journey/useTutorialSpotlight';
import { TutorialCallout } from '../journey/TutorialCallout';
import { estadosDemo, trabajadoresDemo, obraDemo } from './asistenciaMockData';
import type { JourneyDef } from '../journey/journeys';

type Flujo = NonNullable<JourneyDef['asistenciaFlujo']>;
type Pantalla = 'diaria' | 'sabados' | 'periodo';

interface FlujoConfig {
    pantalla: Pantalla;
    /** Botón(es) a resaltar, por prioridad. Se ubican por texto, aria-label o title. */
    labels: string[];
    instruccion: string;
    /** Tipo de acción (onAccion) que marca el tutorial como completado. */
    accion: string;
    finTitulo: string;
    recap: string[];
}

const CONFIG: Record<Flujo, FlujoConfig> = {
    diaria: {
        pantalla: 'diaria',
        labels: ['Guardar'],
        instruccion: 'Cambia el estado de un trabajador (A / F / JI…) y pulsa "Guardar". Si hoy es fin de semana, usa las flechas ← → para ir a un día hábil.',
        accion: 'guardar',
        finTitulo: '¡Asistencia registrada! Así se hace el día a día.',
        recap: [
            'Elegiste la obra y el día.',
            'Marcaste el estado de cada trabajador.',
            'Pulsaste Guardar y la asistencia quedó registrada.',
        ],
    },
    traslado: {
        pantalla: 'diaria',
        labels: ['Completar Traslado'],
        instruccion: 'En la fila de un trabajador abre el selector de estado y elige "TO" (Traslado de Obra). Se abre una ventana: elige la obra de destino y pulsa "Completar Traslado".',
        accion: 'traslado',
        finTitulo: '¡Traslado realizado!',
        recap: [
            'Marcaste a un trabajador con el estado TO.',
            'Elegiste la obra de destino en la ventana de traslado.',
            'Quedó un registro TO en la obra actual y el trabajador pasó a la nueva obra.',
        ],
    },
    feriado: {
        pantalla: 'diaria',
        labels: ['Marcar Feriado', 'Quitar Feriado'],
        instruccion: 'Pulsa el botón de feriado (icono de calendario) en la barra superior y escribe un nombre cuando el navegador lo pida. Para quitarlo, vuelve a pulsar el mismo botón. (Si la pantalla es angosta y no ves el botón, ábrelo desde el menú ⋯ de la barra.)',
        accion: 'feriado-crear',
        finTitulo: '¡Día marcado como feriado!',
        recap: [
            'Pulsaste el botón de feriado en la barra superior.',
            'Escribiste el nombre del feriado.',
            'El día quedó bloqueado para registro de asistencia (puedes quitarlo con el mismo botón).',
        ],
    },
    repetir: {
        pantalla: 'diaria',
        labels: ['Repetir día anterior'],
        instruccion: 'Pulsa "Repetir día anterior" en la barra superior: copia el último día laboral registrado. Luego revisa los estados y pulsa "Guardar" para terminar. (Si hoy es fin de semana, usa ← → para ir a un día hábil; si no ves el botón, ábrelo desde el menú ⋯.)',
        accion: 'guardar',
        finTitulo: '¡Día copiado y guardado!',
        recap: [
            'Pulsaste "Repetir día anterior".',
            'Se copió la asistencia del último día laboral.',
            'Revisaste los estados y guardaste.',
        ],
    },
    'export-excel': {
        pantalla: 'diaria',
        labels: ['Reporte Mensual'],
        instruccion: 'Pulsa "Reporte Mensual" (icono de descarga) en la barra superior. Se descargará una planilla Excel con el reporte del mes. (Si no ves el botón, ábrelo desde el menú ⋯ de la barra.)',
        accion: 'export-excel',
        finTitulo: '¡Reporte descargado!',
        recap: [
            'Pulsaste "Reporte Mensual" en la barra superior.',
            'El navegador descargó la planilla Excel del mes.',
        ],
    },
    whatsapp: {
        pantalla: 'diaria',
        labels: ['Compartir por WhatsApp'],
        instruccion: 'Pulsa el botón de WhatsApp en la barra superior. Se arma el resumen del día y se copia; luego aparece un aviso para enviarlo por WhatsApp. (Si no ves el botón, ábrelo desde el menú ⋯ de la barra.)',
        accion: 'whatsapp',
        finTitulo: '¡Resumen listo para enviar!',
        recap: [
            'Pulsaste el botón de WhatsApp.',
            'Se generó el resumen del día y se copió al portapapeles.',
            'Apareció el aviso para enviarlo por WhatsApp.',
        ],
    },
    periodo: {
        pantalla: 'periodo',
        labels: ['Confirmar Período'],
        instruccion: 'En el calendario, selecciona un rango de días (clic en el primero y luego en el último), elige el estado (Vacaciones, Licencia…) y pulsa "Confirmar Período".',
        accion: 'periodo-crear',
        finTitulo: '¡Período asignado!',
        recap: [
            'Abriste el calendario del trabajador.',
            'Seleccionaste el rango de días y el estado de ausencia.',
            'Pulsaste "Confirmar Período" y todos esos días quedaron justificados.',
        ],
    },
    sabado: {
        pantalla: 'sabados',
        labels: ['Crear citación', 'Guardar asistencia'],
        instruccion: 'Pulsa "Nueva citación". Elige una fecha que caiga en SÁBADO (otros días no se aceptan), marca a los trabajadores en la lista y pulsa "Crear citación". Después, en el detalle, puedes marcar su asistencia y pulsar "Guardar asistencia".',
        accion: 'sabado-crear',
        finTitulo: '¡Citación de sábado creada!',
        recap: [
            'Pulsaste "Nueva citación".',
            'Elegiste un sábado y marcaste a los trabajadores.',
            'Creaste la citación. En el detalle puedes marcar la asistencia y guardarla.',
        ],
    },
};

/** Trabajador/estados de ejemplo para el calendario del flujo "período". */
const workerPeriodo = trabajadoresDemo[0] as unknown as Trabajador;
const estadosPeriodo = estadosDemo as unknown as EstadoAsistencia[];

/**
 * Tutorial de Asistencia: monta una pantalla REAL del módulo dentro del
 * `AsistenciaSandbox` (api mockeada + contextos override) y guía con pulso/globo
 * hasta completar la acción del flujo. La pantalla y el objetivo dependen de
 * `journey.asistenciaFlujo` (ver CONFIG). Al ejecutar la acción (POST/PUT
 * interceptado) se marca el tutorial como completado.
 */
export const AsistenciaJourneyRunner: React.FC<{
    journey: JourneyDef;
    onExit: () => void;
    completadoAt?: string;
    onCompletar?: (id: string) => void;
}> = ({ journey, onExit, completadoAt, onCompletar }) => {
    const cfg = CONFIG[journey.asistenciaFlujo ?? 'diaria'] ?? CONFIG.diaria;
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

    const pantalla = (() => {
        switch (cfg.pantalla) {
            case 'sabados':
                return <SabadosExtraTab />;
            case 'periodo':
                return (
                    <WorkerCalendarModal
                        isOpen
                        worker={workerPeriodo}
                        estados={estadosPeriodo}
                        obraId={obraDemo.id}
                        onClose={() => { /* el demo mantiene el calendario abierto */ }}
                        onSuccess={() => { /* la asignación dispara onAccion vía mock */ }}
                    />
                );
            case 'diaria':
            default:
                return <AttendanceDailyTab onGoSabados={() => { /* sin navegación en el demo */ }} />;
        }
    })();

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
                <SandboxBoundary key={nonce}>
                    <AsistenciaSandbox onAccion={onAccion}>
                        {pantalla}
                    </AsistenciaSandbox>
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
