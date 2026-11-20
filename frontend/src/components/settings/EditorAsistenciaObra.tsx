import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../utils/cn';
import { hoyChile } from '../../utils/fechaChile';
import api from '../../services/api';
import { fechaLarga } from '../dashboard/widgets/mensajesWhatsApp';
import { usePosicionFlotante } from '../../hooks/usePosicionFlotante';
import { useCierreExterno } from '../../hooks/useCierreExterno';
import { EVENTO_ASISTENCIA_GUARDADA } from '../../hooks/usePasarLista';
import { Button } from '../ui/Button';
import {
    cuerpoAsistencia, etiquetaChip, NOTA_PREPARACION, OPCIONES_ASISTENCIA, valorAsistencia,
    type EstadoAsistenciaObra, type ObraConAsistencia, type ValorAsistenciaObra,
} from './asistenciaObra';

/**
 * Las tres opciones de asistencia de una obra (Marcos 2026-11-20, maqueta aprobada): «En preparación», «Pasa lista
 * desde [fecha]» y «No pasa asistencia». Tarjetas con radio; la elegida con borde verde (elemento seleccionado). Tocar
 * la fecha elige «Pasa lista desde». La usan el chip «Asis» de Configuración → Obras, el formulario de la obra y el
 * «Cambiar» del calendario del Inicio.
 */
export const OpcionesAsistenciaObra: React.FC<{
    nombre: string;
    valor: ValorAsistenciaObra;
    onCambiar: (v: ValorAsistenciaObra) => void;
}> = ({ nombre, valor, onCambiar }) => (
    <div className="space-y-2" role="radiogroup" aria-label="Asistencia de la obra">
        {OPCIONES_ASISTENCIA.map(op => {
            const elegida = valor.estado === op.estado;
            const elegir = (estado: EstadoAsistenciaObra, fecha = valor.fecha) => onCambiar({ estado, fecha });
            return (
                <label key={op.estado}
                    className={cn('flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors',
                        elegida ? 'border-brand-primary bg-brand-primary/5' : 'border-border hover:border-brand-primary/40')}>
                    <input type="radio" name={nombre} value={op.estado} checked={elegida} onChange={() => elegir(op.estado)}
                        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-brand-primary" />
                    <span className="min-w-0 flex-1 space-y-1">
                        <span className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-foreground">{op.titulo}</span>
                            {op.estado === 'desde' && (
                                <input type="date" value={valor.fecha} aria-label="Desde qué día pasa lista"
                                    onFocus={() => { if (!elegida) elegir('desde'); }}
                                    onChange={e => { if (e.target.value) elegir('desde', e.target.value); }}
                                    className={cn('h-9 rounded-lg border border-input bg-card px-2 text-sm text-foreground dark:[color-scheme:dark]',
                                        'focus:outline-none focus:ring-2 focus:ring-brand-primary/40', !elegida && 'opacity-60')} />
                            )}
                        </span>
                        <span className="block text-xs text-muted-foreground">{op.ayuda}</span>
                    </span>
                </label>
            );
        })}
    </div>
);

interface EditorProps {
    obraId: number;
    obraNombre: string;
    /** Cómo está ahora (se copia al abrir). */
    inicial: ValorAsistenciaObra;
    /** Tras guardar (recargar la tabla, etc.). */
    onGuardado?: () => void;
    /** Clases del botón que abre (chip de la tabla o enlace «Cambiar»). */
    claseDisparador: string;
    title?: string;
    disabled?: boolean;
    children: React.ReactNode;
}

const ANCHO = 352;
const MARGEN = 12;

/**
 * Botón que abre la ventanita «Asistencia · obra» (flotante fijo, sigue al botón al hacer scroll y no lo recorta la
 * tabla). Guarda con PUT /obras/:id y avisa al resto (campana, recordatorio, Inicio) para que vuelvan a preguntar.
 */
export const EditorAsistenciaObra: React.FC<EditorProps> = ({
    obraId, obraNombre, inicial, onGuardado, claseDisparador, title, disabled, children,
}) => {
    const [abierto, setAbierto] = useState(false);
    const [borrador, setBorrador] = useState<ValorAsistenciaObra>(inicial);
    const [horizontal, setHorizontal] = useState({ left: MARGEN, width: ANCHO });
    const [guardando, setGuardando] = useState(false);
    const cerrar = () => setAbierto(false);
    const { disparadorRef, flotanteRef, pos, estilo, medir } = usePosicionFlotante<HTMLButtonElement>({
        abierto, alCerrar: cerrar, variante: 'hoja', altoMax: 560, separacion: 6,
    });
    const anclaRef = useCierreExterno<HTMLSpanElement>({ abierto, alCerrar: cerrar, extras: [flotanteRef], escape: true });

    const abrir = (e: React.MouseEvent<HTMLButtonElement>) => {
        if (abierto) { cerrar(); return; }
        // Pegada al borde derecho del botón (los chips están a la derecha de la fila), sin salirse de la ventana.
        const r = e.currentTarget.getBoundingClientRect();
        const width = Math.min(ANCHO, window.innerWidth - 2 * MARGEN);
        const left = Math.max(MARGEN, Math.min(r.right - width, window.innerWidth - width - MARGEN));
        setHorizontal({ left, width });
        setBorrador(inicial);
        medir();
        setAbierto(true);
    };

    const guardar = async () => {
        setGuardando(true);
        try {
            await api.put(`/obras/${obraId}`, cuerpoAsistencia(borrador));
            toast.success(borrador.estado === 'desde' ? 'Listo: la obra pasa lista desde esa fecha'
                : borrador.estado === 'preparacion' ? 'Listo: la obra quedó en preparación'
                : 'Listo: la obra no pasa asistencia');
            window.dispatchEvent(new Event(EVENTO_ASISTENCIA_GUARDADA));
            cerrar();
            onGuardado?.();
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
            toast.error(msg || 'No se pudo guardar la asistencia de la obra');
        } finally {
            setGuardando(false);
        }
    };

    return (
        <span ref={anclaRef} className="inline-flex">
            {/* eslint-disable-next-line no-restricted-syntax -- chip/enlace que abre su ventanita (como ParticipaToggle) */}
            <button ref={disparadorRef} type="button" onClick={abrir} disabled={disabled} title={title}
                aria-haspopup="dialog" aria-expanded={abierto} className={claseDisparador}>
                {children}
            </button>
            {abierto && estilo && createPortal(
                <div ref={flotanteRef} role="dialog" aria-label={`Asistencia de ${obraNombre}`}
                    style={{ ...estilo, left: horizontal.left, width: horizontal.width, maxHeight: pos?.maxHeight }}
                    className="z-[1200] space-y-3 overflow-y-auto overscroll-contain rounded-2xl border border-border bg-popover p-4 text-left text-foreground shadow-[var(--shadow-md)]">
                    <div>
                        <p className="text-sm font-bold text-foreground">Asistencia · {obraNombre}</p>
                        <p className="text-xs text-muted-foreground">Desde cuándo esta obra pasa lista.</p>
                    </div>
                    <OpcionesAsistenciaObra nombre={`asis-${obraId}`} valor={borrador} onCambiar={setBorrador} />
                    <p className="text-xs text-muted-foreground">{NOTA_PREPARACION}</p>
                    <div className="flex justify-end gap-2 pt-1">
                        <Button type="button" variant="ghost" size="sm" onClick={cerrar}>Cancelar</Button>
                        <Button type="button" size="sm" onClick={() => { void guardar(); }} isLoading={guardando}>Guardar</Button>
                    </div>
                </div>,
                document.body,
            )}
        </span>
    );
};

/**
 * Chip «Asis» de la fila de Configuración → Obras: dice en qué está la obra («Asis · desde 16 nov», «Asis ·
 * preparando», «Asis» atenuado si no participa) y abre las tres opciones. Mismo aspecto que `ParticipaToggle`.
 */
export const ChipAsistenciaObra: React.FC<{
    obra: { id: number; nombre: string } & ObraConAsistencia;
    onDone: () => void;
    disabled?: boolean;
}> = ({ obra, onDone, disabled }) => {
    const valor = valorAsistencia(obra, hoyChile());
    return (
        <EditorAsistenciaObra obraId={obra.id} obraNombre={obra.nombre} inicial={valor} onGuardado={onDone} disabled={disabled}
            title={valor.estado === 'desde' ? `Pasa lista desde el ${fechaLarga(valor.fecha)}`
                : valor.estado === 'preparacion' ? 'En preparación: todavía no pasa lista' : 'No pasa asistencia'}
            claseDisparador={cn(
                'inline-flex items-center gap-1 text-caption font-bold px-2 py-0.5 rounded-lg border uppercase tracking-wide transition-colors disabled:opacity-50',
                'bg-muted text-muted-foreground border-border hover:text-brand-primary hover:border-brand-primary/40',
                valor.estado === 'no' && 'opacity-50',
            )}>
            {valor.estado === 'desde' && <Check className="h-3 w-3 shrink-0" aria-hidden />}
            {valor.estado === 'preparacion' && <Clock className="h-3 w-3 shrink-0" aria-hidden />}
            {etiquetaChip(valor)}
        </EditorAsistenciaObra>
    );
};

export default EditorAsistenciaObra;
