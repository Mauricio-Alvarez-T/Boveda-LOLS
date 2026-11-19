import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ClipboardX } from 'lucide-react';

import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { EVENTO_ASISTENCIA_GUARDADA } from '../../hooks/usePasarLista';
import { PERMISO_DIAS_PASADOS } from '../../utils/fechaChile';
import { cn } from '../../utils/cn';
import { Button } from '../ui/Button';
import type { SinListaData } from '../dashboard/widgets/resumenSinLista';
import { etiquetaDia, recordatorioLista, textoCerradas, tituloRecordatorio } from './recordatorioLista';

/** Días que se ven sin desplegar (en el celular no debe tapar la lista). */
const VISIBLES = 5;

interface Props {
    obraId: number;
    obraNombre: string;
    /** Día que se está viendo en Asistencia. */
    fecha: string;
    /** Abre Asistencia en ese día. */
    onIr: (fecha: string) => void;
}

/**
 * Cartel de Asistencia para el jefe de obra (Marcos 2026-11-19: «que diga te olvidaste ayer o X días de pasar lista
 * como recordatorio y cuando lo tome desaparece»). Sale si la obra elegida tiene días sin lista que él todavía puede
 * pasar (los del mes en curso); cada día es un botón que abre ese día, y sale del cartel en cuanto se guarda. Cuando
 * no queda ninguno, el cartel se va. RR.HH. no lo ve: tiene la campana «Importante».
 *
 * Mientras se está en uno de esos días no se muestra: ahí ya está el aviso «{obra} no pasó la lista este día».
 */
export const RecordatorioListaOlvidada: React.FC<Props> = ({ obraId, obraNombre, fecha, onIr }) => {
    const { hasPermission } = useAuth();
    const activo = hasPermission('asistencia.guardar') && !hasPermission(PERMISO_DIAS_PASADOS);
    const [datos, setDatos] = useState<SinListaData | null>(null);
    const [todos, setTodos] = useState(false);
    const turno = useRef(0);

    const preguntar = useCallback(() => {
        if (!activo) return;
        const t = ++turno.current;
        api.get<{ data: SinListaData }>(`/dashboard/asistencia/sin-lista?obra_id=${obraId}`)
            .then(res => { if (t === turno.current) setDatos(res.data.data ?? null); })
            .catch(() => { /* sin cartel: se queda con lo último que supo */ });
    }, [activo, obraId]);

    // Al entrar (Asistencia lo monta con key = obra: al cambiar de obra parte de cero).
    useEffect(() => { preguntar(); }, [preguntar]);

    // Al guardar la asistencia: el día guardado sale del cartel.
    useEffect(() => {
        if (!activo) return;
        window.addEventListener(EVENTO_ASISTENCIA_GUARDADA, preguntar);
        return () => window.removeEventListener(EVENTO_ASISTENCIA_GUARDADA, preguntar);
    }, [activo, preguntar]);

    if (!activo || !datos) return null;
    const r = recordatorioLista(datos.obras.find(o => o.obra_id === obraId), datos.hoy, hasPermission);
    if (!r || r.pendientes.includes(fecha.slice(0, 10))) return null;

    const n = r.pendientes.length;
    const visibles = todos ? r.pendientes : r.pendientes.slice(0, VISIBLES);
    const ocultos = n - VISIBLES;
    const cerradas = textoCerradas(r.cerradas);

    return (
        <section aria-label="Listas sin pasar"
            className="mb-2 flex shrink-0 items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm dark:border-amber-900/60 dark:bg-amber-950/30">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300" aria-hidden>
                <ClipboardX className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1 space-y-2">
                <div className="space-y-0.5">
                    <h3 className="text-sm font-bold text-foreground">{tituloRecordatorio(r.pendientes, datos.hoy)}</h3>
                    <p className="text-sm text-muted-foreground">
                        {obraNombre}. Puede {n === 1 ? 'pasarla' : 'pasarlas'} hasta el último día del mes: toque
                        {n === 1 ? ' el día' : ' un día'} para abrirlo. {n === 1 ? 'Al guardarla, este aviso se va.' : 'Cada día sale de aquí al guardarlo.'}
                    </p>
                </div>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Días sin lista">
                    {visibles.map(f => (
                        <Button key={f} variant="glass" size="sm" onClick={() => onIr(f)} aria-label={`Abrir ${etiquetaDia(f, datos.hoy).toLowerCase()} para pasar la lista`}>
                            {etiquetaDia(f, datos.hoy)}
                        </Button>
                    ))}
                    {ocultos > 0 && (
                        <Button variant="ghost" size="sm" onClick={() => setTodos(v => !v)} aria-expanded={todos}
                            rightIcon={<ChevronDown className={cn('h-3.5 w-3.5 transition-transform', todos && 'rotate-180')} aria-hidden />}>
                            {todos ? 'Ver menos' : `Ver ${ocultos === 1 ? 'el otro' : `los otros ${ocultos}`}`}
                        </Button>
                    )}
                </div>
                {cerradas && <p className="text-xs text-muted-foreground">{cerradas}</p>}
            </div>
        </section>
    );
};

export default RecordatorioListaOlvidada;
