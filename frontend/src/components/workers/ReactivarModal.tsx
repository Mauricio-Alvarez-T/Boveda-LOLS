/**
 * Reactivar (recontratar) a un trabajador desvinculado (plan Gestiones B4).
 *
 * Reemplaza el `window.confirm` de useConsultasActions. Muestra la última desvinculación
 * (fecha, causal, quién, detalle) y, si está marcado "No recontratar", una tarjeta roja:
 * decisión del dueño 2026-09-10 → SOLO ADVIERTE, el botón sigue habilitado. Quien reactiva
 * puede quitar la marca. PUT /trabajadores/:id/reactivar (conserva fecha_ingreso; cierra la
 * fila del historial). Gate: trabajadores.reactivar.
 */
import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, History, UserCheck } from 'lucide-react';

import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import api from '../../services/api';
import { fmtFecha } from '../../utils/format';
import { showApiError } from '../../utils/toastUtils';
import type { Trabajador } from '../../types/entities';
import type { UltimaDesvinculacion } from './desvinculacionSchema';

interface Props {
    isOpen: boolean;
    worker: Trabajador | null;
    onClose: () => void;
    onDone: () => void;
}

export const ReactivarModal: React.FC<Props> = ({ isOpen, worker, onClose, onDone }) => {
    const [historial, setHistorial] = useState<UltimaDesvinculacion[]>([]);
    const [cargando, setCargando] = useState(false);
    const [enviando, setEnviando] = useState(false);
    const [quitarMarca, setQuitarMarca] = useState(false);

    useEffect(() => {
        if (!isOpen || !worker) return;
        setQuitarMarca(false);
        let cancelado = false;
        setCargando(true);
        api.get(`/trabajadores/${worker.id}/desvinculaciones`)
            .then(res => { if (!cancelado) setHistorial((res.data.data as UltimaDesvinculacion[]) || []); })
            .catch(() => { if (!cancelado) setHistorial([]); }) // sin permiso de historial: se reactiva igual, sin antecedentes
            .finally(() => { if (!cancelado) setCargando(false); });
        return () => { cancelado = true; };
    }, [isOpen, worker]);

    const ultima = historial[0] ?? null;
    const marcado = !!(ultima?.no_recontratar ?? worker?.no_recontratar);
    const nombre = worker ? `${worker.apellido_paterno} ${worker.apellido_materno || ''} ${worker.nombres}`.replace(/\s+/g, ' ').trim() : '';

    const confirmar = async () => {
        if (!worker) return;
        setEnviando(true);
        try {
            await api.put(`/trabajadores/${worker.id}/reactivar`, { quitar_marca_no_recontratar: marcado && quitarMarca });
            toast.success(`${nombre} reactivado`);
            onDone();
        } catch (e) {
            showApiError(e, 'No se pudo reactivar al trabajador');
        } finally {
            setEnviando(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Reactivar trabajador" icon={UserCheck} size="md"
            description={worker ? [nombre, worker.rut].filter(Boolean).join(' · ') : undefined}
            footer={(
                <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
                    <Button type="button" onClick={confirmar} isLoading={enviando} leftIcon={<UserCheck className="h-4 w-4" />}>Reactivar</Button>
                </div>
            )}>
            <div className="space-y-4">
                <p className="text-sm text-brand-dark">
                    Vas a reactivar a <strong>{nombre}</strong>. Se conserva su fecha de ingreso original y su historial de desvinculaciones.
                </p>

                {marcado && (
                    <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4">
                        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                        <div className="min-w-0 text-sm">
                            <p className="font-semibold text-destructive">Marcado como "No recontratar"</p>
                            <p className="text-brand-dark">Revisa el antecedente antes de continuar. Puedes reactivar de todas formas.</p>
                        </div>
                    </div>
                )}

                {cargando ? (
                    <p className="text-sm text-muted-foreground">Cargando antecedentes…</p>
                ) : ultima ? (
                    <div className="rounded-xl border border-border bg-card p-4 text-sm">
                        <p className="mb-2 flex items-center gap-1.5 text-caption font-black uppercase tracking-widest text-brand-dark/50">
                            <History className="h-3.5 w-3.5" /> Última desvinculación
                        </p>
                        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                            <dt className="text-muted-foreground">Fecha</dt><dd className="font-medium text-brand-dark">{ultima.fecha ? fmtFecha(ultima.fecha) : '—'}</dd>
                            <dt className="text-muted-foreground">Causal</dt><dd className="font-medium text-brand-dark">{ultima.causal_nombre || ultima.causal_codigo || '—'}{ultima.articulo_texto ? <span className="text-muted-foreground"> · {ultima.articulo_texto}</span> : null}</dd>
                            {ultima.desvinculado_por_nombre && (<><dt className="text-muted-foreground">Por</dt><dd className="text-brand-dark">{ultima.desvinculado_por_nombre}</dd></>)}
                            {ultima.detalle && (<><dt className="text-muted-foreground">Detalle</dt><dd className="whitespace-pre-wrap text-brand-dark">{ultima.detalle}</dd></>)}
                        </dl>
                        {historial.length > 1 && (
                            <p className="mt-2 text-caption text-muted-foreground">{historial.length} desvinculaciones registradas en total.</p>
                        )}
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground">Sin antecedentes de desvinculación registrados.</p>
                )}

                {marcado && (
                    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-card px-3 py-2.5">
                        <input type="checkbox" checked={quitarMarca} onChange={e => setQuitarMarca(e.target.checked)}
                            className="mt-0.5 h-4 w-4 rounded border-input accent-brand-primary focus:ring-brand-primary" />
                        <span className="text-sm">
                            <span className="font-medium text-brand-dark">Quitar la marca "No recontratar"</span>
                            <span className="block text-muted-foreground">Si no la quitas, seguirá visible en futuras contrataciones.</span>
                        </span>
                    </label>
                )}

            </div>
        </Modal>
    );
};
