/**
 * Reingresar (recontratar) a un trabajador finiquitado — reingreso con períodos laborales (mig 152).
 *
 * Reemplaza a ReactivarModal: ya no conserva la fecha de ingreso vieja. Pide la fecha de REINGRESO
 * (obligatoria, posterior al último egreso, hasta hoy+30) y deja elegir empresa, obra, cargo, categoría y
 * término de contrato (vacío = indefinido), precargados con los del período anterior. El período
 * anterior queda en el historial; `fecha_ingreso` pasa a ser el inicio del período actual.
 *  · "No recontratar": tarjeta roja que SOLO advierte (decisión del dueño 2026-09-10); se puede quitar.
 *  · Art. 159 N°4: aviso ámbar que no bloquea (decisión del dueño 2026-11-17) si con la misma empresa
 *    ya hubo contratos en los 15 meses previos.
 * Éxito: «Emitir kit de ingreso» (documentos.laborales.emitir; el contrato imprime la fecha nueva) y
 * «Actualizar ficha» (trabajadores.editar; tallas, banco, cuenta). PUT /trabajadores/:id/reactivar.
 * Gate: trabajadores.reactivar.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, CheckCircle2, FileSignature, History, Scale, UserCheck, UserPen } from 'lucide-react';

import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select, type SelectOption } from '../ui/Select';
import { SearchableSelect } from '../ui/SearchableSelect';
import { Cargando, Skeleton } from '../ui/Skeleton';
import { CampoSilueta } from './CampoSilueta';
import api from '../../services/api';
import type { ApiResponse } from '../../types';
import type { Cargo, Empresa, Obra, Trabajador } from '../../types/entities';
import { useAuth } from '../../context/AuthContext';
import { fmtFecha } from '../../utils/format';
import { showApiError } from '../../utils/toastUtils';
import { evaluarArt159, periodosCerradosDe, type PeriodoLaboral } from '../../utils/periodosLaborales';
import { CATEGORIA_REPORTE_OPTIONS } from '../consultas/solicitudIngresoSchema';
import { EmitirKitModal } from '../documents/EmitirKitModal';
import type { WorkerBasico } from '../documents/documentosLaborales';
import type { UltimaDesvinculacion } from './desvinculacionSchema';
import {
    reingresoSchema, fechaMinReingreso, fechaMaxReingreso, validarReingreso, buildReingresoPayload,
    type ReingresoFormData, type ReingresoResultado,
} from './reingresoSchema';

interface Props {
    isOpen: boolean;
    worker: Trabajador | null;
    onClose: () => void;
    /** Al cerrar la pantalla de éxito (el padre refresca). `editarFicha` = abrir Editar con la ficha nueva. */
    onDone: (opts?: { editarFicha?: boolean }) => void;
}

const hoy = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const aYmd = (v?: string | null) => (v ? String(v).slice(0, 10) : null);

export const ReingresoModal: React.FC<Props> = ({ isOpen, worker, onClose, onDone }) => {
    const { hasPermission } = useAuth();
    const puedeEmitirDocs = hasPermission('documentos.laborales.emitir');
    const puedeEditar = hasPermission('trabajadores.editar');

    const [historial, setHistorial] = useState<UltimaDesvinculacion[]>([]);
    const [cerrados, setCerrados] = useState<PeriodoLaboral[]>([]);
    const [empresas, setEmpresas] = useState<SelectOption[]>([]);
    const [obras, setObras] = useState<SelectOption[]>([]);
    const [cargos, setCargos] = useState<SelectOption[]>([]);
    const [cargando, setCargando] = useState(false);
    const [errorNegocio, setErrorNegocio] = useState<string | null>(null);
    const [resultado, setResultado] = useState<ReingresoResultado | null>(null);
    const [kitAbierto, setKitAbierto] = useState(false);
    const [kitEmitido, setKitEmitido] = useState(false);

    const valoresIniciales = (w: Trabajador | null): ReingresoFormData => ({
        fecha_ingreso: hoy(),
        empresa_id: w?.empresa_id ?? 0,
        obra_id: w?.obra_id ?? 0,
        cargo_id: w?.cargo_id ?? 0,
        categoria_reporte: w?.categoria_reporte ?? 'obra',
        fecha_termino_contrato: '',
        quitar_marca: false,
    });
    const { control, register, handleSubmit, reset, watch, formState: { errors, isSubmitting } } = useForm<ReingresoFormData>({
        resolver: zodResolver(reingresoSchema),
        defaultValues: valoresIniciales(worker),
    });

    useEffect(() => {
        if (!isOpen || !worker) return;
        setResultado(null);
        setErrorNegocio(null);
        setKitAbierto(false);
        setKitEmitido(false);
        reset(valoresIniciales(worker));
        let cancelado = false;
        setCargando(true);
        Promise.all([
            // Sin permiso de historial / resumen: se reingresa igual, sin antecedentes ni aviso del Art. 159.
            api.get(`/trabajadores/${worker.id}/desvinculaciones`).then(r => (r.data.data as UltimaDesvinculacion[]) || []).catch(() => []),
            api.get(`/trabajadores/${worker.id}/resumen`).then(r => (r.data.data?.periodos_laborales as PeriodoLaboral[]) || []).catch(() => []),
            api.get<ApiResponse<Empresa[]>>('/empresas?activo=true').then(r => r.data.data).catch(() => [] as Empresa[]),
            api.get<ApiResponse<Obra[]>>('/obras?activo=true&incluir_prueba=true').then(r => r.data.data).catch(() => [] as Obra[]),
            api.get<ApiResponse<Cargo[]>>('/cargos?activo=true').then(r => r.data.data).catch(() => [] as Cargo[]),
        ]).then(([hist, per, emp, obr, car]) => {
            if (cancelado) return;
            setHistorial(hist);
            setCerrados(periodosCerradosDe({ periodos_laborales: per }));
            setEmpresas(emp.map(e => ({ value: e.id, label: e.razon_social })));
            setObras(obr.map(o => ({ value: o.id, label: o.nombre })));
            setCargos(car.map(c => ({ value: c.id, label: c.nombre })));
        }).finally(() => { if (!cancelado) setCargando(false); });
        return () => { cancelado = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al abrir / cambiar de trabajador
    }, [isOpen, worker?.id]);

    const ultima = historial[0] ?? null;
    const marcado = !!(ultima?.no_recontratar ?? worker?.no_recontratar);
    const ultimoEgreso = ultima?.fecha ?? aYmd(worker?.fecha_desvinculacion);
    const nombre = worker ? `${worker.apellido_paterno} ${worker.apellido_materno || ''} ${worker.nombres}`.replace(/\s+/g, ' ').trim() : '';

    // Empresa con la que tenía contrato al terminar el último período: la foto de la baja (mig 152) o, para
    // bajas anteriores, la de la ficha (un finiquitado no cambia de empresa). El Art. 159 cuenta por empleador.
    const empresaUltimoId = ultima?.empresa_id ?? worker?.empresa_id ?? null;
    const empresaUltimoNombre = ultima?.empresa_nombre ?? worker?.empresa_nombre ?? null;

    // Art. 159 N°4: períodos cerrados + el que acaba de terminar (baja abierta) con su empresa.
    const fechaSel = watch('fecha_ingreso');
    const empresaSel = watch('empresa_id');
    const empresaSelNombre = empresas.find(e => e.value === empresaSel)?.label ?? null;
    const art159 = useMemo(() => {
        if (!worker) return null;
        const recien: PeriodoLaboral = { desde: aYmd(ultima?.fecha_ingreso_periodo ?? worker.fecha_ingreso), hasta: ultimoEgreso, empresa_id: empresaUltimoId };
        return evaluarArt159([...cerrados, recien], empresaSel || null, fechaSel);
    }, [worker, ultima, ultimoEgreso, empresaUltimoId, cerrados, empresaSel, fechaSel]);
    const nombreEmpresa = empresas.find(e => e.value === empresaSel)?.label ?? worker?.empresa_nombre ?? 'esta empresa';

    const onSubmit = async (d: ReingresoFormData) => {
        if (!worker) return;
        const err = validarReingreso(d, ultimoEgreso);
        if (err) { setErrorNegocio(err); return; }
        setErrorNegocio(null);
        try {
            const res = await api.put(`/trabajadores/${worker.id}/reactivar`, buildReingresoPayload(d, marcado));
            setResultado(res.data.data as ReingresoResultado);
        } catch (e) {
            showApiError(e, 'No se pudo reingresar al trabajador');
        }
    };

    // `nacionalidad` sin definir → el modal del kit relee la ficha (ya con la fecha de reingreso).
    const workerKit: WorkerBasico | null = worker && resultado ? {
        id: worker.id, nombres: worker.nombres, apellido_paterno: worker.apellido_paterno, apellido_materno: worker.apellido_materno,
        rut: worker.rut, activo: true, fecha_ingreso: resultado.fecha_ingreso,
    } : null;

    const cerrar = () => (resultado ? onDone() : onClose());

    return (
        <>
            <Modal isOpen={isOpen} onClose={cerrar} title="Reingresar trabajador" icon={UserCheck} size="md"
                description={worker ? [nombre, worker.rut].filter(Boolean).join(' · ') : undefined}
                footer={resultado ? (
                    <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <Button type="button" variant="ghost" onClick={() => onDone()}>Cerrar</Button>
                        {puedeEditar && (
                            <Button type="button" variant="outline" leftIcon={<UserPen className="h-4 w-4" />} onClick={() => onDone({ editarFicha: true })}>Actualizar ficha</Button>
                        )}
                        {puedeEmitirDocs && !kitEmitido && (
                            <Button type="button" leftIcon={<FileSignature className="h-4 w-4" />} onClick={() => setKitAbierto(true)}>Emitir kit de ingreso</Button>
                        )}
                    </div>
                ) : (
                    <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
                        <Button type="submit" form="reingreso-form" isLoading={isSubmitting} disabled={cargando} leftIcon={<UserCheck className="h-4 w-4" />}>Reingresar</Button>
                    </div>
                )}>
                {resultado ? (
                    <div className="space-y-4">
                        <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
                            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                            <div className="min-w-0 text-sm">
                                <p className="font-semibold text-brand-dark">{nombre} reingresó el {fmtFecha(resultado.fecha_ingreso)}</p>
                                <p className="text-muted-foreground">
                                    Su período anterior{resultado.fecha_ingreso_anterior ? ` (desde el ${fmtFecha(resultado.fecha_ingreso_anterior)})` : ''} queda en el historial.
                                    {' '}Los días, el contrato y el próximo finiquito cuentan desde la fecha de reingreso.
                                </p>
                            </div>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            Siguientes pasos: emite el kit de ingreso (contrato con la fecha nueva) y revisa la ficha por si cambiaron sus tallas, banco o cuenta.
                        </p>
                        {kitEmitido && <p className="text-sm font-medium text-success">Kit de ingreso emitido: quedó en la ficha del trabajador.</p>}
                    </div>
                ) : (
                    <form id="reingreso-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                        <p className="text-sm text-brand-dark">
                            Vas a reingresar a <strong>{nombre}</strong>. Se abre un período laboral nuevo desde la fecha que indiques; el anterior queda en su historial.
                        </p>

                        {marcado && (
                            <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4">
                                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                                <div className="min-w-0 text-sm">
                                    <p className="font-semibold text-destructive">Marcado como «No recontratar»</p>
                                    <p className="text-brand-dark">Revisa el antecedente antes de continuar. Puedes reingresarlo de todas formas.</p>
                                </div>
                            </div>
                        )}

                        {cargando ? (
                            <Cargando que="los antecedentes" className="space-y-3">
                                <div aria-hidden="true" className="rounded-xl border border-border bg-card p-4 text-sm">
                                    <p className="mb-2 flex items-center gap-1.5 text-caption font-black uppercase tracking-widest text-brand-dark/50">
                                        <History className="h-3.5 w-3.5" /> Última desvinculación
                                    </p>
                                    <Skeleton className="h-3.5 w-48 max-w-full" />
                                </div>
                                <div aria-hidden="true" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <CampoSilueta label="Fecha de reingreso" />
                                    <CampoSilueta label="Empresa" />
                                    <CampoSilueta label="Obra" />
                                    <CampoSilueta label="Cargo" />
                                </div>
                            </Cargando>
                        ) : (
                            <>
                                {ultima ? (
                                    <div className="rounded-xl border border-border bg-card p-4 text-sm">
                                        <p className="mb-2 flex items-center gap-1.5 text-caption font-black uppercase tracking-widest text-brand-dark/50">
                                            <History className="h-3.5 w-3.5" /> Última desvinculación
                                        </p>
                                        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                                            <dt className="text-muted-foreground">Período</dt>
                                            <dd className="font-medium text-brand-dark">
                                                {ultima.fecha_ingreso_periodo ? `${fmtFecha(ultima.fecha_ingreso_periodo)} → ` : ''}{ultima.fecha ? fmtFecha(ultima.fecha) : '—'}
                                            </dd>
                                            <dt className="text-muted-foreground">Empresa</dt>
                                            <dd className="font-medium text-brand-dark">{empresaUltimoNombre || '—'}</dd>
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

                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <Input label="Fecha de reingreso" type="date" min={fechaMinReingreso(ultimoEgreso) ?? undefined} max={fechaMaxReingreso()}
                                        error={errors.fecha_ingreso?.message} {...register('fecha_ingreso')} />
                                    <Controller name="empresa_id" control={control} render={({ field: { onChange, value, ref } }) => (
                                        <SearchableSelect ref={ref} label="Empresa" options={empresas} placeholder="Buscar empresa..."
                                            value={value || ''} onChange={val => onChange(val ? Number(val) : 0)} />
                                    )} />
                                    <Controller name="obra_id" control={control} render={({ field: { onChange, value, ref } }) => (
                                        <SearchableSelect ref={ref} label="Obra" options={obras} placeholder="Buscar obra..."
                                            value={value || ''} onChange={val => onChange(val ? Number(val) : 0)} />
                                    )} />
                                    <Controller name="cargo_id" control={control} render={({ field: { onChange, value, ref } }) => (
                                        <SearchableSelect ref={ref} label="Cargo" options={cargos} placeholder="Buscar cargo..."
                                            value={value || ''} onChange={val => onChange(val ? Number(val) : 0)} />
                                    )} />
                                    <Select label="Categoría de reporte" options={[...CATEGORIA_REPORTE_OPTIONS]} {...register('categoria_reporte')} />
                                    <Input label="Término de contrato (opcional)" type="date" min={fechaSel || undefined}
                                        helperText="Vacío = indefinido" {...register('fecha_termino_contrato')} />
                                </div>

                                {/* Siempre explícito: con qué empresa terminó y con cuál reingresa (Art. 159 cuenta por empleador). */}
                                {empresaUltimoNombre && (
                                    <p className="rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-brand-dark">
                                        {/* Sin doble punto cuando la razón social ya termina en «.» (Ltda., S.A.). */}
                                        Su último contrato fue con <strong>{empresaUltimoNombre}</strong>{empresaUltimoNombre.endsWith('.') ? '' : '.'}
                                        {empresaSel > 0 && empresaUltimoId != null && empresaSel !== empresaUltimoId && empresaSelNombre && (
                                            <span className="block text-muted-foreground">
                                                Reingresa con <strong className="text-brand-dark">{empresaSelNombre}</strong>: es otro empleador, así que los contratos anteriores no se suman para el Art. 159 N°4.
                                            </span>
                                        )}
                                        {empresaSel > 0 && empresaSel === empresaUltimoId && (
                                            <span className="block text-muted-foreground">Reingresa con la misma empresa.</span>
                                        )}
                                    </p>
                                )}

                                {art159 && art159.nivel !== 'ninguno' && (
                                    <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4">
                                        <Scale className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
                                        <div className="min-w-0 space-y-1 text-sm text-brand-dark">
                                            <p className="font-semibold">
                                                Con {nombreEmpresa}: este sería al menos el contrato N° {art159.contratos} en 15 meses
                                                {art159.meses > 0 ? ` (${art159.meses} ${art159.meses === 1 ? 'mes trabajado' : 'meses trabajados'} antes de este reingreso)` : ''}.
                                            </p>
                                            {art159.nivel === 'info' && (
                                                <p className="text-muted-foreground">Art. 159 N°4: con más de dos contratos a plazo y 12 meses o más trabajados en 15 meses, la ley presume contrato indefinido.</p>
                                            )}
                                            {art159.nivel === 'alerta' && (
                                                <p>Art. 159 N°4: ya es el tercer contrato. Si suma 12 meses o más de servicios dentro de 15 meses, la ley presume contrato indefinido.</p>
                                            )}
                                            {art159.nivel === 'presuncion' && (
                                                <p className="font-medium">Art. 159 N°4: más de dos contratos y 12 meses o más trabajados en 15 meses — la ley presume contrato indefinido. Revísalo con RRHH antes de emitir un contrato a plazo.</p>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {marcado && (
                                    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-card px-3 py-2.5">
                                        <input type="checkbox" {...register('quitar_marca')}
                                            className="mt-0.5 h-4 w-4 rounded border-input accent-brand-primary focus:ring-brand-primary" />
                                        <span className="text-sm">
                                            <span className="font-medium text-brand-dark">Quitar la marca «No recontratar»</span>
                                            <span className="block text-muted-foreground">Si no la quitas, seguirá visible en futuras contrataciones.</span>
                                        </span>
                                    </label>
                                )}

                                {errorNegocio && <p role="alert" className="text-sm font-medium text-destructive">{errorNegocio}</p>}
                            </>
                        )}
                    </form>
                )}
            </Modal>

            <EmitirKitModal isOpen={kitAbierto} onClose={() => setKitAbierto(false)} worker={workerKit}
                onEmitido={() => { setKitEmitido(true); setKitAbierto(false); }} />
        </>
    );
};
