import React, { useRef, useState } from 'react';
import { ArrowLeft, RotateCcw, Sparkles, CheckCircle2, MousePointerClick } from 'lucide-react';
import { Button } from '../../ui/Button';
import VehiculosPage from '../../../pages/Vehiculos';
import { VehiculosSandbox } from './VehiculosSandbox';
import { SandboxBoundary } from '../journey/SandboxBoundary';
import { useTutorialSpotlight } from '../journey/useTutorialSpotlight';
import { TutorialCallout } from '../journey/TutorialCallout';
import type { JourneyDef } from '../journey/journeys';

type Flujo = NonNullable<JourneyDef['vehiculoFlujo']>;

interface FlujoConfig {
    /** Botón(es) a resaltar, por prioridad (por texto, aria-label o title). */
    labels: string[];
    instruccion: string;
    /** Tipo de acción (onAccion) que marca el tutorial como completado. */
    accion: string;
    finTitulo: string;
    recap: string[];
}

const CONFIG: Record<Flujo, FlujoConfig> = {
    registrar: {
        labels: ['Guardar', 'Nuevo vehículo'],
        instruccion: 'Elige una empresa de flota (a la izquierda), pulsa el botón "+" (Nuevo vehículo) de esa empresa, completa el formulario (patente con 4 letras y 2 números —ej. ABCD12—, marca, modelo, año y color) y pulsa "Guardar".',
        accion: 'crear',
        finTitulo: '¡Vehículo registrado!',
        recap: [
            'Elegiste una empresa de flota y pulsaste "Nuevo vehículo".',
            'Completaste los datos del vehículo (patente, marca, modelo, año, color).',
            'Pulsaste "Guardar" y el vehículo quedó registrado en esa empresa.',
        ],
    },
    editar: {
        labels: ['Guardar', 'Editar vehículo'],
        instruccion: 'Elige una empresa de flota, luego pulsa el lápiz "Editar vehículo" de un vehículo (o haz clic en su fila). Cambia algún dato y pulsa "Guardar".',
        accion: 'editar',
        finTitulo: '¡Vehículo actualizado!',
        recap: [
            'Abriste un vehículo en modo edición desde su empresa.',
            'Cambiaste algún dato.',
            'Pulsaste "Guardar" y los cambios quedaron registrados.',
        ],
    },
    documento: {
        labels: ['Subir documento', 'Agregar'],
        instruccion: 'Elige una empresa y un vehículo (su detalle aparece a la derecha). En "Documentos" pulsa "Agregar", deja el tipo en "Permiso de circulación", elige un archivo de tu equipo (PDF o imagen) y pulsa el botón de subir ("Subir documento").',
        accion: 'doc-subir',
        finTitulo: '¡Documento agregado!',
        recap: [
            'Abriste el detalle de un vehículo y su sección de Documentos.',
            'Pulsaste "Agregar", elegiste el tipo y un archivo.',
            'Subiste el documento y quedó en la ficha del vehículo.',
        ],
    },
    revision: {
        labels: ['Guardar registro', 'Agregar'],
        instruccion: 'Elige una empresa y un vehículo (su detalle aparece a la derecha). En "Documentos" pulsa "Agregar", en el selector elige "Revisión técnica", completa la planta/lugar, la fecha, el vencimiento y un email de alerta, y pulsa "Guardar registro".',
        accion: 'revision',
        finTitulo: '¡Revisión técnica registrada!',
        recap: [
            'Abriste el detalle de un vehículo y pulsaste "Agregar".',
            'Elegiste el tipo "Revisión técnica" y completaste lugar, fecha, vencimiento y email de alerta.',
            'Guardaste el registro; el sistema avisará por correo antes del vencimiento.',
        ],
    },
    mantencion: {
        labels: ['Guardar registro', 'Agregar'],
        instruccion: 'Elige una empresa y un vehículo (su detalle aparece a la derecha). En "Documentos" pulsa "Agregar", en el selector elige "Mantención", completa el taller/lugar, la fecha, la próxima mantención (vencimiento) y un email de alerta, y pulsa "Guardar registro".',
        accion: 'mantencion',
        finTitulo: '¡Mantención registrada!',
        recap: [
            'Abriste el detalle de un vehículo y pulsaste "Agregar".',
            'Elegiste el tipo "Mantención" y completaste taller, fecha, próxima mantención y email de alerta.',
            'Guardaste el registro; el sistema avisará por correo antes de la próxima.',
        ],
    },
};

/**
 * Tutorial de Vehículos: monta la página REAL (`VehiculosPage`) dentro del
 * `VehiculosSandbox` (api mockeada + AuthContext override) y guía con pulso/globo
 * hasta completar la acción del flujo (`journey.vehiculoFlujo` → CONFIG). Al ejecutar
 * la acción (POST/PUT interceptado) se marca el tutorial como completado.
 */
export const VehiculosJourneyRunner: React.FC<{
    journey: JourneyDef;
    onExit: () => void;
    completadoAt?: string;
    onCompletar?: (id: string) => void;
}> = ({ journey, onExit, completadoAt, onCompletar }) => {
    const cfg = CONFIG[journey.vehiculoFlujo ?? 'registrar'] ?? CONFIG.registrar;
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
                <span><span className="font-bold">Demostración interactiva.</span> Es la pantalla real de Vehículos con datos de ejemplo — no afecta nada.</span>
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
                    <VehiculosSandbox onAccion={onAccion}>
                        <VehiculosPage />
                    </VehiculosSandbox>
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
