/**
 * Aviso de una solicitud de REINGRESO (mig 153) en la revisión de la oficina: el RUT es de un trabajador
 * finiquitado y aprobar reingresa su ficha (período laboral nuevo). Muestra el último período, la marca
 * «No recontratar» (solo advierte) y el aviso del Art. 159 N°4 con la empresa y la fecha elegidas (no
 * bloquea; decisión del dueño 2026-11-17). Lee GET /trabajadores/:id y /:id/resumen (trabajadores.ver);
 * sin permiso se queda con el aviso base.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Scale, UserCheck } from 'lucide-react';

import api from '../../services/api';
import { cn } from '../../utils/cn';
import { fmtFecha } from '../../utils/format';
import { evaluarArt159, periodosCerradosDe, type PeriodoLaboral } from '../../utils/periodosLaborales';
import type { UltimaDesvinculacion } from './desvinculacionSchema';

interface Props {
    trabajadorId: number;
    /** Empresa y fecha de ingreso que la oficina está por aprobar (para el Art. 159). */
    empresaId: number | null;
    fechaIngreso: string;
}

interface Datos {
    empresa_id: number | null;
    empresa_nombre: string | null;
    fecha_ingreso: string | null;
    ultima: UltimaDesvinculacion | null;
    cerrados: PeriodoLaboral[];
}

const aYmd = (v?: string | null) => (v ? String(v).slice(0, 10) : null);

export const AvisoReingreso: React.FC<Props> = ({ trabajadorId, empresaId, fechaIngreso }) => {
    const [datos, setDatos] = useState<Datos | null>(null);

    useEffect(() => {
        let cancelado = false;
        Promise.all([
            api.get(`/trabajadores/${trabajadorId}`).then(r => (r.data?.data ?? r.data) as { empresa_id?: number | null; empresa_nombre?: string | null; fecha_ingreso?: string | null }).catch(() => null),
            api.get(`/trabajadores/${trabajadorId}/resumen`).then(r => r.data?.data as { ultima_desvinculacion?: UltimaDesvinculacion | null; periodos_laborales?: PeriodoLaboral[] }).catch(() => null),
        ]).then(([t, res]) => {
            if (cancelado || !t) return;
            setDatos({
                empresa_id: t.empresa_id ?? null,
                empresa_nombre: t.empresa_nombre ?? null,
                fecha_ingreso: aYmd(t.fecha_ingreso),
                ultima: res?.ultima_desvinculacion ?? null,
                cerrados: periodosCerradosDe({ periodos_laborales: res?.periodos_laborales ?? [] }),
            });
        });
        return () => { cancelado = true; };
    }, [trabajadorId]);

    // Empresa del último contrato: la foto de la baja (mig 152) o la de la ficha (un finiquitado no cambia de empresa).
    const empresaUltimoId = datos?.ultima?.empresa_id ?? datos?.empresa_id ?? null;
    const empresaUltimoNombre = datos?.ultima?.empresa_nombre ?? datos?.empresa_nombre ?? null;

    const art159 = useMemo(() => {
        if (!datos) return null;
        const recien: PeriodoLaboral = { desde: aYmd(datos.ultima?.fecha_ingreso_periodo) ?? datos.fecha_ingreso, hasta: aYmd(datos.ultima?.fecha), empresa_id: empresaUltimoId };
        return evaluarArt159([...datos.cerrados, recien], empresaId, fechaIngreso);
    }, [datos, empresaUltimoId, empresaId, fechaIngreso]);

    const marcado = !!datos?.ultima?.no_recontratar;
    const ultima = datos?.ultima;
    const otraEmpresa = empresaId != null && empresaId > 0 && empresaUltimoId != null && empresaId !== empresaUltimoId;

    return (
        <div className="space-y-2">
            <div className={cn('flex items-start gap-3 rounded-xl border p-4 text-sm',
                marcado ? 'border-destructive/30 bg-destructive/10' : 'border-info/30 bg-info/10')}>
                {marcado ? <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" /> : <UserCheck className="mt-0.5 h-5 w-5 shrink-0 text-info" />}
                <div className="min-w-0 space-y-1 text-brand-dark">
                    <p className="font-semibold">Solicitud de reingreso</p>
                    <p>
                        Este RUT ya trabajó con nosotros{ultima?.fecha ? ` (último egreso: ${fmtFecha(ultima.fecha)}${ultima.causal_nombre ? ` · ${ultima.causal_nombre}` : ''})` : ''}.
                        {' '}Al aprobar se reingresa su ficha con un período nuevo desde la fecha de ingreso; lo que quede vacío conserva el dato que ya tenía.
                    </p>
                    {empresaUltimoNombre && (
                        <p>
                            Su último contrato fue con <strong>{empresaUltimoNombre}</strong>.
                            {otraEmpresa && ' La empresa elegida abajo es otro empleador: los contratos anteriores no se suman para el Art. 159 N°4.'}
                        </p>
                    )}
                    {marcado && <p className="font-semibold text-destructive">Marcado como «No recontratar». Puedes aprobarlo de todas formas.</p>}
                </div>
            </div>
            {art159 && art159.nivel !== 'ninguno' && (
                <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-brand-dark">
                    <Scale className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
                    <p>
                        Art. 159 N°4: con {empresaUltimoId === empresaId && empresaUltimoNombre ? empresaUltimoNombre : 'esta empresa'} este sería al menos el
                        contrato N° {art159.contratos} en 15 meses ({art159.meses} {art159.meses === 1 ? 'mes trabajado' : 'meses trabajados'} antes).
                        {art159.nivel === 'presuncion'
                            ? ' Con más de dos contratos y 12 meses o más, la ley presume contrato indefinido: revísalo con RRHH.'
                            : ' Con más de dos contratos a plazo y 12 meses o más trabajados en 15 meses, la ley presume contrato indefinido.'}
                    </p>
                </div>
            )}
        </div>
    );
};
