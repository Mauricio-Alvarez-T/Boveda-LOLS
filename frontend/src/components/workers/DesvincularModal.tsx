/**
 * Desvincular trabajador con causal obligatoria (plan Gestiones B4, mig 112).
 *
 * Reemplaza el modal inline de Gestiones que solo pedía la fecha (y leía el input por id).
 * Flujo: fecha (default hoy, máx. hoy+30) → causal del catálogo cerrado → detalle (obligatorio
 * para art. 160 / NO_PRESENTACION / RENDIMIENTO / OTRO) → marca "No recontratar" (precargada
 * según la causal; SOLO advierte al recontratar) → PUT /trabajadores/:id/desvincular.
 * Éxito: pantalla de confirmación con causal y aviso si ya había asistencia posterior, y el botón
 * "Emitir finiquito" (plan Gestiones B5; gate documentos.laborales.emitir) que abre EmitirFiniquitoModal
 * con la baja recién registrada en mano — también se puede emitir después desde la ficha.
 * Gate: trabajadores.eliminar (el backend lo exige; el botón de la fila ya venía gateado).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, CheckCircle2, FileCheck2, FileSignature, UserX } from 'lucide-react';

import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { fmtFecha } from '../../utils/format';
import { showApiError } from '../../utils/toastUtils';
import type { Trabajador } from '../../types/entities';
import {
    desvincularSchema, hoyYmd, fechaMaxDesvinculacion, opcionesCausales, requiereDetalle, getCausal,
    validarDesvinculacion, buildDesvincularPayload, bajaDesdeResultado,
    type CausalDesvinculacion, type DesvincularFormData, type DesvincularResultado,
} from './desvinculacionSchema';
import { EmitirFiniquitoModal } from '../documents/EmitirFiniquitoModal';
import { avisoEnlaceFiniquito, type DocumentoEmitido, type WorkerBasico } from '../documents/documentosLaborales';

export type { DesvincularResultado } from './desvinculacionSchema';

interface Props {
    isOpen: boolean;
    worker: Trabajador | null;
    onClose: () => void;
    /** Se llama al cerrar la pantalla de éxito (el padre refresca la grilla). */
    onDone: (r: DesvincularResultado) => void;
}

export const DesvincularModal: React.FC<Props> = ({ isOpen, worker, onClose, onDone }) => {
    const { hasPermission } = useAuth();
    const puedeEmitirDocs = hasPermission('documentos.laborales.emitir');
    const [catalogo, setCatalogo] = useState<CausalDesvinculacion[]>([]);
    const [cargando, setCargando] = useState(false);
    const [errorNegocio, setErrorNegocio] = useState<string | null>(null);
    const [resultado, setResultado] = useState<DesvincularResultado | null>(null);
    const [finiquitoAbierto, setFiniquitoAbierto] = useState(false);
    const [finiquitoEmitido, setFiniquitoEmitido] = useState<DocumentoEmitido | null>(null);

    const { control, register, handleSubmit, reset, watch, setValue, formState: { errors, isSubmitting } } = useForm<DesvincularFormData>({
        resolver: zodResolver(desvincularSchema),
        defaultValues: { fecha_desvinculacion: hoyYmd(), causal_codigo: '', detalle: '', no_recontratar: false },
    });
    const causalSel = watch('causal_codigo');
    const detalleObligatorio = requiereDetalle(catalogo, causalSel);

    useEffect(() => {
        if (!isOpen) return;
        setResultado(null);
        setErrorNegocio(null);
        setFiniquitoAbierto(false);
        setFiniquitoEmitido(null);
        reset({ fecha_desvinculacion: hoyYmd(), causal_codigo: '', detalle: '', no_recontratar: false });
        let cancelado = false;
        setCargando(true);
        api.get('/trabajadores/catalogos/causales-desvinculacion')
            .then(res => { if (!cancelado) setCatalogo((res.data.data as CausalDesvinculacion[]) || []); })
            .catch(err => { if (!cancelado) showApiError(err, 'No se pudo cargar el catálogo de causales'); })
            .finally(() => { if (!cancelado) setCargando(false); });
        return () => { cancelado = true; };
    }, [isOpen, reset]);

    // Al elegir causal, precargar la marca según el catálogo (el usuario puede cambiarla).
    const onCausalChange = (codigo: string) => {
        setValue('causal_codigo', codigo, { shouldValidate: true });
        const c = getCausal(catalogo, codigo);
        setValue('no_recontratar', !!c?.sugiere_no_recontratar);
        setErrorNegocio(null);
    };

    const onSubmit = async (d: DesvincularFormData) => {
        if (!worker) return;
        const err = validarDesvinculacion(d, catalogo, worker.fecha_ingreso);
        if (err) { setErrorNegocio(err); return; }
        try {
            const res = await api.put(`/trabajadores/${worker.id}/desvincular`, buildDesvincularPayload(d));
            setResultado(res.data.data as DesvincularResultado);
        } catch (e) {
            showApiError(e, 'No se pudo desvincular al trabajador');
        }
    };

    const nombre = worker ? `${worker.apellido_paterno} ${worker.apellido_materno || ''} ${worker.nombres}`.replace(/\s+/g, ' ').trim() : '';
    // Identidad estable: si se construyera inline en el JSX, cada render (p. ej. al recibir onEmitido) le
    // pasaría un objeto nuevo al modal de finiquito.
    const bajaParaFiniquito = useMemo(
        () => (resultado ? bajaDesdeResultado(resultado, worker?.fecha_ingreso) : null),
        [resultado, worker?.fecha_ingreso]
    );
    // Lo mínimo que necesita el modal de finiquito; `activo: false` porque la baja ya se confirmó.
    const workerBasico: WorkerBasico | null = worker ? {
        id: worker.id, nombres: worker.nombres, apellido_paterno: worker.apellido_paterno, apellido_materno: worker.apellido_materno,
        rut: worker.rut, cargo_nombre: worker.cargo_nombre ?? null, obra_nombre: worker.obra_nombre ?? null, empresa_nombre: worker.empresa_nombre ?? null,
        activo: false,
    } : null;

    return (
        <Modal isOpen={isOpen} onClose={resultado ? () => onDone(resultado) : onClose} title="Desvincular trabajador" icon={UserX} size="md"
            description={worker ? [nombre, worker.rut].filter(Boolean).join(' · ') : undefined}
            footer={resultado ? (
                <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button type="button" variant={finiquitoEmitido || !puedeEmitirDocs ? 'primary' : 'ghost'} onClick={() => onDone(resultado)}>Cerrar</Button>
                    {puedeEmitirDocs && !finiquitoEmitido && (
                        <Button type="button" leftIcon={<FileSignature className="h-4 w-4" />} onClick={() => setFiniquitoAbierto(true)}>Emitir finiquito</Button>
                    )}
                </div>
            ) : (
                <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
                    <Button type="submit" form="desvincular-form" variant="destructive" isLoading={isSubmitting} disabled={cargando}>Confirmar desvinculación</Button>
                </div>
            )}>
            {resultado ? (
                <div className="space-y-4">
                    <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4">
                        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                        <div className="min-w-0">
                            <p className="text-sm font-semibold text-brand-dark">{nombre} quedó desvinculado el {fmtFecha(resultado.fecha_desvinculacion)}.</p>
                            <p className="mt-1 text-sm text-muted-foreground">
                                Causal: <span className="font-medium text-brand-dark">{resultado.causal.nombre}</span>
                                {resultado.causal.articulo_texto ? ` (${resultado.causal.articulo_texto})` : ''}
                            </p>
                            {resultado.no_recontratar && (
                                <p className="mt-1 text-sm font-medium text-destructive">Marcado como "No recontratar": al intentar reactivarlo o crear una solicitud con su RUT se mostrará este antecedente.</p>
                            )}
                        </div>
                    </div>
                    {resultado.asistencias_posteriores > 0 && (
                        <div className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-brand-dark">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                            <span>Hay {resultado.asistencias_posteriores} registro(s) de asistencia posteriores a la fecha de desvinculación. Revísalos en Asistencia.</span>
                        </div>
                    )}
                    {finiquitoEmitido ? (
                        <div className="rounded-xl border border-border bg-background px-3 py-2 text-sm">
                            <p className="flex items-center gap-1.5 font-semibold text-brand-dark"><FileCheck2 className="h-4 w-4 text-success" /> Finiquito emitido</p>
                            <p className="text-xs text-muted-foreground">{finiquitoEmitido.nombre_archivo} · queda en "Documentos laborales (Bóveda)" de la ficha del trabajador.</p>
                            {avisoEnlaceFiniquito(finiquitoEmitido) && (
                                <p className="mt-1 flex items-start gap-1 text-xs font-medium text-warning"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {avisoEnlaceFiniquito(finiquitoEmitido)}</p>
                            )}
                        </div>
                    ) : (
                        <p className="text-caption text-muted-foreground">
                            {puedeEmitirDocs
                                ? 'El finiquito se puede emitir ahora, con la causal y las fechas de esta baja, o después desde la ficha del trabajador.'
                                : 'El finiquito lo emite RRHH desde la ficha del trabajador (requiere "Emitir Documentos Laborales").'}
                        </p>
                    )}
                    <EmitirFiniquitoModal
                        isOpen={finiquitoAbierto}
                        onClose={() => setFiniquitoAbierto(false)}
                        worker={workerBasico}
                        desvinculacion={bajaParaFiniquito}
                        onEmitido={setFiniquitoEmitido}
                    />
                </div>
            ) : (
                <form id="desvincular-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    <div className="flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/10 p-4">
                        <UserX className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                        <p className="text-sm text-brand-dark">
                            Vas a desvincular a <strong>{nombre}</strong>. No podrá registrar asistencia después de la fecha indicada y la causal quedará en su historial.
                        </p>
                    </div>

                    <Input
                        type="date"
                        label="Fecha efectiva de desvinculación"
                        max={fechaMaxDesvinculacion()}
                        min={worker?.fecha_ingreso ? worker.fecha_ingreso.slice(0, 10) : undefined}
                        error={errors.fecha_desvinculacion?.message}
                        {...register('fecha_desvinculacion')}
                    />

                    <Controller
                        name="causal_codigo"
                        control={control}
                        render={({ field }) => (
                            <Select
                                label="Causal (obligatoria)"
                                value={field.value}
                                onChange={e => onCausalChange(e.target.value)}
                                onBlur={field.onBlur}
                                disabled={cargando}
                                error={errors.causal_codigo?.message}
                                options={[{ value: '', label: cargando ? 'Cargando causales…' : 'Selecciona la causal' }, ...opcionesCausales(catalogo)]}
                            />
                        )}
                    />

                    <div className="space-y-1.5">
                        <label className="ml-0.5 text-sm font-medium text-muted-foreground">
                            Detalle / antecedente {detalleObligatorio ? <span className="text-destructive">(obligatorio para esta causal)</span> : <span>(opcional)</span>}
                        </label>
                        <textarea
                            {...register('detalle')}
                            rows={3}
                            maxLength={2000}
                            placeholder="Qué pasó, fechas, testigos… Solo lo ve quien puede desvincular o reactivar; no se imprime."
                            className="w-full resize-none rounded-xl border border-border bg-card px-3 py-2 text-sm text-brand-dark placeholder:text-muted-foreground focus-visible:border-brand-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/30"
                        />
                        {errors.detalle?.message && <p className="text-xs text-destructive">{errors.detalle.message}</p>}
                    </div>

                    <Controller
                        name="no_recontratar"
                        control={control}
                        render={({ field }) => (
                            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-card px-3 py-2.5">
                                <input type="checkbox" checked={field.value} onChange={e => field.onChange(e.target.checked)}
                                    className="mt-0.5 h-4 w-4 rounded border-input text-destructive focus:ring-destructive" />
                                <span className="text-sm">
                                    <span className="font-medium text-brand-dark">Marcar como "No recontratar"</span>
                                    <span className="block text-muted-foreground">Al intentar reactivarlo o crear una solicitud de ingreso con su RUT se mostrará la causal y la fecha. No bloquea.</span>
                                </span>
                            </label>
                        )}
                    />

                    {errorNegocio && (
                        <p className="flex items-center gap-1.5 text-sm font-medium text-destructive"><AlertTriangle className="h-4 w-4" /> {errorNegocio}</p>
                    )}

                </form>
            )}
        </Modal>
    );
};
