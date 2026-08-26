import React, { useMemo, useState } from 'react';
import { Eraser, Search, Loader2, AlertTriangle } from 'lucide-react';
import { Modal } from '../../ui/Modal';
import { Button } from '../../ui/Button';
import { cn } from '../../../utils/cn';

/** Un trabajador con asistencia GUARDADA en el día (los sin guardar no se listan: no hay nada que borrar). */
export interface BorrableItem {
    trabajadorId: number;
    nombre: string;
    rut: string;
    /** Código del estado guardado (A, F, V…) para ver QUÉ se va a borrar. */
    estadoCodigo: string;
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    /** Fecha visible del registro diario, 'YYYY-MM-DD'. */
    fecha: string;
    items: BorrableItem[];
    busy: boolean;
    onConfirm: (trabajadorIds: number[]) => void;
    /** Nombre de la obra seleccionada; null = Reporte Global (borra el día completo, todas las obras). */
    obraNombre: string | null;
}

const fmtFecha = (s: string) => s.split('-').reverse().join('-');

/**
 * Goma de borrar del Registro Diario: borra la asistencia guardada de uno o
 * varios trabajadores en la fecha visible. Nace del caso real 2026-08-26:
 * marcaron a los 194 trabajadores en el día equivocado y no había deshacer.
 *
 * La selección parte VACÍA a propósito (es un borrado definitivo — que cada
 * inclusión sea explícita); "Seleccionar todos" cubre el caso masivo en un clic.
 */
export const BorrarAsistenciaModal: React.FC<Props> = ({ isOpen, onClose, fecha, items, busy, onConfirm, obraNombre }) => {
    const [seleccion, setSeleccion] = useState<Set<number>>(new Set());
    const [query, setQuery] = useState('');

    // Reset al abrir: una selección vieja no debe sobrevivir entre usos.
    const wasOpen = React.useRef(false);
    React.useEffect(() => {
        if (isOpen && !wasOpen.current) { setSeleccion(new Set()); setQuery(''); }
        wasOpen.current = isOpen;
    }, [isOpen]);

    const visibles = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return items;
        return items.filter(i => i.nombre.toLowerCase().includes(q) || i.rut.toLowerCase().includes(q));
    }, [items, query]);

    const toggle = (id: number) => setSeleccion(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });

    const todosVisiblesSeleccionados = visibles.length > 0 && visibles.every(i => seleccion.has(i.trabajadorId));
    const toggleTodos = () => setSeleccion(prev => {
        const next = new Set(prev);
        if (todosVisiblesSeleccionados) visibles.forEach(i => next.delete(i.trabajadorId));
        else visibles.forEach(i => next.add(i.trabajadorId));
        return next;
    });

    const confirmar = () => {
        const ids = [...seleccion];
        if (ids.length === 0) return;
        const alcance = obraNombre ? `en ${obraNombre}` : 'en TODAS las obras (Reporte Global)';
        if (!window.confirm(`¿Borrar definitivamente la asistencia de ${ids.length} trabajador(es) del ${fmtFecha(fecha)} ${alcance}?\n\nEsta acción no se puede deshacer.`)) return;
        onConfirm(ids);
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} size="md"
            title={
                <span className="inline-flex items-center gap-2">
                    <Eraser className="h-4 w-4 text-destructive" /> Borrar asistencia
                    <span className="text-xs font-normal text-muted-foreground">{fmtFecha(fecha)}</span>
                </span>
            }>
            {items.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                    No hay asistencia guardada este día — no hay nada que borrar.
                </p>
            ) : (
                <div className="space-y-3">
                    <div className="flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2">
                        <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                        <p className="text-xs text-brand-dark">
                            Borra el registro guardado de los trabajadores que marques — para corregir un día
                            anotado por error. {obraNombre
                                ? <>Solo afecta la obra <b>{obraNombre}</b>.</>
                                : <>Estás en el <b>Reporte Global</b>: borra el día completo del trabajador en todas las obras.</>}
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                            <input type="text" value={query} onChange={e => setQuery(e.target.value)}
                                placeholder="Buscar nombre o RUT..."
                                className="w-full pl-8 pr-3 py-2 text-sm border border-border rounded-xl bg-card focus:ring-2 focus:ring-brand-primary/20 outline-none" />
                        </div>
                        <Button variant="secondary" size="sm" onClick={toggleTodos} className="shrink-0">
                            {todosVisiblesSeleccionados ? 'Quitar todos' : `Seleccionar todos (${visibles.length})`}
                        </Button>
                    </div>

                    <div className="max-h-[45vh] overflow-y-auto rounded-xl border border-border divide-y divide-border/60">
                        {visibles.map(i => (
                            <label key={i.trabajadorId}
                                className={cn('flex items-center gap-3 px-3 py-2 cursor-pointer select-none transition-colors',
                                    seleccion.has(i.trabajadorId) ? 'bg-destructive/5' : 'hover:bg-muted/50')}>
                                <input type="checkbox" checked={seleccion.has(i.trabajadorId)} onChange={() => toggle(i.trabajadorId)}
                                    className="h-4 w-4 rounded border-border text-destructive focus:ring-destructive" />
                                <span className="flex-1 min-w-0">
                                    <span className="block text-sm font-semibold text-brand-dark truncate">{i.nombre}</span>
                                    <span className="block text-caption text-muted-foreground">{i.rut}</span>
                                </span>
                                <span className="shrink-0 text-micro font-black px-2 py-0.5 rounded-full bg-muted text-brand-dark" title="Estado guardado que se borrará">
                                    {i.estadoCodigo}
                                </span>
                            </label>
                        ))}
                        {visibles.length === 0 && (
                            <p className="py-6 text-center text-xs text-muted-foreground">Sin resultados para "{query}"</p>
                        )}
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1">
                        <span className="text-caption text-muted-foreground tabular-nums">
                            {seleccion.size} de {items.length} seleccionado(s)
                        </span>
                        <div className="flex items-center gap-2">
                            <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Cancelar</Button>
                            <Button variant="destructive" size="sm" onClick={confirmar} disabled={busy || seleccion.size === 0}
                                leftIcon={busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eraser className="h-4 w-4" />}>
                                Borrar asistencia ({seleccion.size})
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </Modal>
    );
};
