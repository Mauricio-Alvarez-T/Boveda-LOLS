import React, { useCallback, useEffect, useRef, useState } from 'react';
import { HardHat } from 'lucide-react';

import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { EVENTO_ASISTENCIA_GUARDADA } from '../../hooks/usePasarLista';
import { PERMISO_DIAS_PASADOS } from '../../utils/fechaChile';
import { trabajadores, type EnPreparacionData } from '../dashboard/widgets/resumenSinLista';

interface Props {
    obraId: number;
    obraNombre: string;
}

/**
 * Aviso de Asistencia para el jefe de obra (Marcos 2026-11-20, vista previa aprobada: «que pase un aviso si sigue en
 * preparación… para el jefe que se haya olvidado o no sabe»). Sale si la obra elegida sigue «En preparación» (mig 156)
 * pero ya tiene trabajadores: probablemente empezaron y nadie pasó la primera lista. Al guardarla, la obra queda
 * pasando lista desde ese día y el aviso se va. RR.HH. no lo ve: lo tiene en la campana «Importante».
 */
export const AvisoObraEnPreparacion: React.FC<Props> = ({ obraId, obraNombre }) => {
    const { hasPermission } = useAuth();
    const activo = hasPermission('asistencia.guardar') && !hasPermission(PERMISO_DIAS_PASADOS);
    const [datos, setDatos] = useState<EnPreparacionData | null>(null);
    const turno = useRef(0);

    const preguntar = useCallback(() => {
        if (!activo) return;
        const t = ++turno.current;
        api.get<{ data: EnPreparacionData }>(`/dashboard/asistencia/en-preparacion?obra_id=${obraId}`)
            .then(res => { if (t === turno.current) setDatos(res.data.data ?? null); })
            .catch(() => { /* sin aviso: se queda con lo último que supo */ });
    }, [activo, obraId]);

    // Al entrar (Asistencia lo monta con key = obra) y al guardar la asistencia (la primera lista lo apaga).
    useEffect(() => { preguntar(); }, [preguntar]);
    useEffect(() => {
        if (!activo) return;
        window.addEventListener(EVENTO_ASISTENCIA_GUARDADA, preguntar);
        return () => window.removeEventListener(EVENTO_ASISTENCIA_GUARDADA, preguntar);
    }, [activo, preguntar]);

    const o = activo ? datos?.obras.find(x => x.obra_id === obraId) : undefined;
    if (!o) return null;

    return (
        <section aria-label="Obra en preparación"
            className="mb-2 flex shrink-0 items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm dark:border-amber-900/60 dark:bg-amber-950/30">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300" aria-hidden>
                <HardHat className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1 space-y-2">
                <div className="space-y-0.5">
                    <h3 className="text-sm font-bold text-foreground">Esta obra todavía no pasa lista</h3>
                    <p className="text-sm text-muted-foreground">
                        {obraNombre} tiene {trabajadores(o.dotacion)}, pero en Bóveda sigue «en preparación». Si ya
                        empezaron a trabajar, guarde la lista de hoy: desde ese día la obra queda pasando lista.
                    </p>
                </div>
                <p className="text-xs text-muted-foreground">
                    Si todavía no empiezan, no tiene que hacer nada: avísele a RR.HH. cuando partan.
                </p>
            </div>
        </section>
    );
};

export default AvisoObraEnPreparacion;
