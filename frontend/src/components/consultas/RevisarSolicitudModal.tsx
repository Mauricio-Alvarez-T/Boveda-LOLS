import React, { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Loader2, CheckCircle2, XCircle, UserPlus, Clock, User, AlertTriangle } from 'lucide-react';

import api from '../../services/api';
import type { ApiResponse } from '../../types';
import type { SolicitudIngreso, Obra, Cargo, Empresa } from '../../types/entities';
import { formatRut } from '../../utils/rut';
import { fmtFecha, normalizarFecha } from '../../utils/format';
import { fmtFechaHora } from '../../utils/fechas';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import type { SelectOption } from '../ui/Select';
import { SearchableSelect } from '../ui/SearchableSelect';
import { Button } from '../ui/Button';
import { StatusBadge } from '../ui/StatusBadge';
import { useFormDirtyProtection } from '../../hooks/useFormDirtyProtection';
import { showApiError } from '../../utils/toastUtils';
import { RechazarForm } from '../inventario/transferencia-detail/RechazarForm';
import { DatosPersonalesFields } from '../workers/DatosPersonalesFields';
import {
    aprobarSolicitudSchema, buildAprobarPayload, datosPersonalesDefaults, listarDatosPersonales,
    CATEGORIA_REPORTE_OPTIONS, type AprobarSolicitudFormValues,
} from './solicitudIngresoSchema';

export type SolicitudAccion = 'aprobada' | 'rechazada';

interface Props {
    /** null = cerrado. */
    solicitud: SolicitudIngreso | null;
    onClose: () => void;
    /** `trabajadores.solicitud.aprobar`: sin él la ficha es solo lectura. */
    puedeAprobar: boolean;
    /** Tras aprobar o rechazar: el padre cierra, refresca lista + badge (y la grilla si se creó el trabajador). */
    onResuelta: (accion: SolicitudAccion) => void;
}

const nombreCompleto = (s: SolicitudIngreso) =>
    [s.nombres, s.apellido_paterno, s.apellido_materno].filter(Boolean).join(' ');

/** Quién pidió, cuándo, en qué estado va y quién la resolvió — común a ambos modos. */
const Encabezado: React.FC<{ s: SolicitudIngreso }> = ({ s }) => (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
        <StatusBadge domain="solicitudIngresoEstado" status={s.estado} showIcon />
        <span className="inline-flex items-center gap-1">
            <User className="h-3.5 w-3.5" /> Solicitó {s.solicitante_nombre || '—'}
        </span>
        <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" /> {fmtFechaHora(s.fecha_solicitud) || '—'}
        </span>
        {s.estado !== 'pendiente' && (
            <span>
                · Resuelta por {s.resuelto_por_nombre || '—'}{s.fecha_resolucion ? ` el ${fmtFechaHora(s.fecha_resolucion)}` : ''}
            </span>
        )}
    </div>
);

/** Ficha en solo lectura: la ve el solicitante (cualquier estado) y la oficina cuando ya está resuelta. */
const FichaSoloLectura: React.FC<{ s: SolicitudIngreso }> = ({ s }) => {
    const campos: { label: string; value: string }[] = [
        { label: 'RUT', value: s.rut },
        { label: 'Nombre', value: nombreCompleto(s) },
        { label: 'Cargo', value: s.cargo_nombre || '—' },
        { label: 'Obra', value: s.obra_nombre || '—' },
        { label: 'Fecha de ingreso', value: fmtFecha(normalizarFecha(s.fecha_ingreso)) || '—' },
        ...(s.empresa_nombre ? [{ label: 'Empresa', value: s.empresa_nombre }] : []),
        ...listarDatosPersonales(s).map(d => ({ label: d.label, value: d.value })),
    ];

    return (
        <div className="space-y-4">
            <Encabezado s={s} />

            {/* Rechazo: motivo obligatorio y VISIBLE para quien solicitó (decisión del dueño). */}
            {s.estado === 'rechazada' && (
                <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/10 p-4">
                    <p className="text-caption font-black uppercase tracking-widest text-red-700 dark:text-red-300 flex items-center gap-1.5">
                        <XCircle className="h-3.5 w-3.5" /> Motivo del rechazo
                    </p>
                    <p className="mt-1 text-sm text-foreground whitespace-pre-line">{s.motivo_rechazo || '—'}</p>
                </div>
            )}
            {s.estado === 'aprobada' && (
                <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800 dark:border-green-800/60 dark:bg-green-500/10 dark:text-green-300">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    <span>Trabajador creado en Bóveda{s.empresa_nombre ? ` · ${s.empresa_nombre}` : ''}.</span>
                </div>
            )}

            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {campos.map(c => (
                    <div key={c.label} className="rounded-xl bg-background border border-border px-3 py-2 min-w-0">
                        <dt className="text-micro text-muted-foreground uppercase font-bold tracking-wide">{c.label}</dt>
                        <dd className="text-sm font-semibold text-brand-dark mt-0.5 break-words">{c.value}</dd>
                    </div>
                ))}
            </dl>

            {s.observaciones && (
                <div className="rounded-xl bg-background border border-border px-3 py-2">
                    <p className="text-micro text-muted-foreground uppercase font-bold tracking-wide">Observaciones</p>
                    <p className="text-sm text-brand-dark mt-0.5 whitespace-pre-line">{s.observaciones}</p>
                </div>
            )}
        </div>
    );
};

/**
 * Revisión de oficina: la ficha completa precargada y EDITABLE + Empresa
 * (obligatoria) + categoría de reporte. "Aprobar" envía la ficha editada y el
 * backend crea el trabajador en la misma transacción. "Rechazar" reutiliza
 * RechazarForm (motivo obligatorio). El bloque de rechazo vive FUERA del <form>
 * de aprobación: sus botones no declaran type y dispararían el submit.
 */
const FormRevision: React.FC<{ s: SolicitudIngreso; onResuelta: (a: SolicitudAccion) => void; onClose: () => void }> =
    ({ s, onResuelta, onClose }) => {
        const [initializing, setInitializing] = useState(true);
        // Catálogos gateados por empresas.ver / obras.ver / cargos.ver: sin ellos, aviso explícito.
        const [errorCatalogos, setErrorCatalogos] = useState<string | null>(null);
        const [empresas, setEmpresas] = useState<SelectOption[]>([]);
        const [obras, setObras] = useState<SelectOption[]>([]);
        const [cargos, setCargos] = useState<SelectOption[]>([]);
        const [aprobando, setAprobando] = useState(false);
        const [modoRechazo, setModoRechazo] = useState(false);
        const [motivo, setMotivo] = useState('');
        const [rechazando, setRechazando] = useState(false);

        const {
            register,
            handleSubmit,
            control,
            formState: { errors, isDirty },
        } = useForm<AprobarSolicitudFormValues>({
            resolver: zodResolver(aprobarSolicitudSchema) as any,
            defaultValues: {
                rut: s.rut,
                nombres: s.nombres,
                apellido_paterno: s.apellido_paterno,
                apellido_materno: s.apellido_materno || '',
                cargo_id: s.cargo_id || 0,
                obra_id: s.obra_id || 0,
                empresa_id: s.empresa_id || 0,
                categoria_reporte: 'obra',
                fecha_ingreso: normalizarFecha(s.fecha_ingreso),
                observaciones: s.observaciones || '',
                ...datosPersonalesDefaults(s),
            },
        });

        useFormDirtyProtection(isDirty);

        useEffect(() => {
            const fetchData = async () => {
                try {
                    const [empRes, obraRes, cargoRes] = await Promise.all([
                        api.get<ApiResponse<Empresa[]>>('/empresas?activo=true'),
                        api.get<ApiResponse<Obra[]>>('/obras?activo=true&incluir_prueba=true'),
                        api.get<ApiResponse<Cargo[]>>('/cargos?activo=true'),
                    ]);
                    setEmpresas(empRes.data.data.map(e => ({ value: e.id, label: `${e.razon_social} (${e.rut})` })));
                    setObras(obraRes.data.data.map(o => ({ value: o.id, label: o.nombre })));
                    setCargos(cargoRes.data.data.map(c => ({ value: c.id, label: c.nombre })));
                } catch (err) {
                    const status = (err as { response?: { status?: number } })?.response?.status;
                    setErrorCatalogos(status === 403
                        ? 'Tu rol no tiene permiso para ver empresas, obras o cargos (empresas.ver, obras.ver, cargos.ver). Pide a administración que lo habilite para poder aprobar.'
                        : 'No se pudieron cargar empresas, obras y cargos. Reintenta en unos segundos.');
                } finally {
                    setInitializing(false);
                }
            };
            fetchData();
        }, []);

        const onAprobar = async (data: AprobarSolicitudFormValues) => {
            setAprobando(true);
            try {
                await api.put(`/solicitudes-ingreso/${s.id}/aprobar`, buildAprobarPayload(data));
                toast.success(`Trabajador creado: ${data.nombres.trim()} ${data.apellido_paterno.trim()}`);
                onResuelta('aprobada');
            } catch (err) {
                // 409 = ya no está pendiente o el RUT se creó entre medio; 400 = ficha incompleta.
                showApiError(err, 'No se pudo aprobar la solicitud');
            } finally {
                setAprobando(false);
            }
        };

        const onRechazar = async () => {
            const texto = motivo.trim();
            if (!texto) return;
            setRechazando(true);
            try {
                await api.put(`/solicitudes-ingreso/${s.id}/rechazar`, { motivo: texto });
                toast.success('Solicitud rechazada');
                onResuelta('rechazada');
            } catch (err) {
                showApiError(err, 'No se pudo rechazar la solicitud');
            } finally {
                setRechazando(false);
            }
        };

        if (initializing) {
            return (
                <div className="py-20 flex flex-col items-center justify-center text-muted-foreground">
                    <Loader2 className="h-8 w-8 animate-spin text-brand-primary mb-2" />
                    <p>Cargando ficha...</p>
                </div>
            );
        }

        if (errorCatalogos) {
            return (
                <div className="space-y-6">
                    <Encabezado s={s} />
                    <div role="alert" className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                        <p>{errorCatalogos}</p>
                    </div>
                    <div className="flex justify-end">
                        <Button type="button" variant="outline" onClick={onClose}>Cerrar</Button>
                    </div>
                </div>
            );
        }

        return (
            <div className="space-y-6">
                <Encabezado s={s} />

                <form id="revisar-solicitud-form" onSubmit={handleSubmit(onAprobar)} className="space-y-6">
                    {/* ── Identificación (viene de terreno; corregible) ── */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Controller
                            name="rut"
                            control={control}
                            render={({ field: { onChange, value, ref } }) => (
                                <Input
                                    ref={ref}
                                    label="RUT"
                                    placeholder="12.345.678-9"
                                    error={errors.rut?.message}
                                    value={value || ''}
                                    autoCapitalize="characters"
                                    autoCorrect="off"
                                    spellCheck={false}
                                    onChange={(e) => onChange(formatRut(e.target.value))}
                                />
                            )}
                        />
                        <Input label="Nombres" error={errors.nombres?.message} {...register('nombres')} />
                        <Input label="Apellido paterno" error={errors.apellido_paterno?.message} {...register('apellido_paterno')} />
                        <Input label="Apellido materno" placeholder="(opcional)" error={errors.apellido_materno?.message} {...register('apellido_materno')} />
                    </div>

                    {/* ── Contratación: lo que define la oficina ── */}
                    <div className="space-y-1">
                        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Contratación</p>
                        <p className="text-xs text-muted-foreground">
                            La empresa y la categoría de reporte las define administración; el resto viene de la ficha de terreno y se puede corregir antes de aprobar.
                        </p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Controller
                            name="empresa_id"
                            control={control}
                            render={({ field: { onChange, value, ref } }) => (
                                <SearchableSelect
                                    ref={ref}
                                    label="Empresa"
                                    options={empresas}
                                    error={errors.empresa_id?.message}
                                    placeholder="Buscar empresa..."
                                    value={value}
                                    onChange={(val) => onChange(val ? Number(val) : 0)}
                                />
                            )}
                        />
                        <Controller
                            name="obra_id"
                            control={control}
                            render={({ field: { onChange, value, ref } }) => (
                                <SearchableSelect
                                    ref={ref}
                                    label="Obra"
                                    options={obras}
                                    error={errors.obra_id?.message}
                                    placeholder="Buscar obra..."
                                    value={value}
                                    onChange={(val) => onChange(val ? Number(val) : 0)}
                                />
                            )}
                        />
                        <Controller
                            name="cargo_id"
                            control={control}
                            render={({ field: { onChange, value, ref } }) => (
                                <SearchableSelect
                                    ref={ref}
                                    label="Cargo"
                                    options={cargos}
                                    error={errors.cargo_id?.message}
                                    placeholder="Buscar cargo..."
                                    value={value}
                                    onChange={(val) => onChange(val ? Number(val) : 0)}
                                />
                            )}
                        />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Select
                            label="Categoría de reporte"
                            options={[...CATEGORIA_REPORTE_OPTIONS]}
                            error={errors.categoria_reporte?.message}
                            {...register('categoria_reporte')}
                        />
                        <Input
                            label="Fecha de ingreso"
                            type="date"
                            error={errors.fecha_ingreso?.message}
                            {...register('fecha_ingreso')}
                        />
                    </div>

                    {/* ── Datos personales (opcionales; quedan en la ficha del trabajador) ── */}
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Datos personales</p>
                    <DatosPersonalesFields register={register} errors={errors} />
                    <div className="w-full space-y-1.5">
                        <label htmlFor="revisar-observaciones" className="text-sm font-medium text-muted-foreground ml-0.5">Observaciones</label>
                        <textarea
                            id="revisar-observaciones"
                            rows={3}
                            className="flex w-full rounded-xl border border-border bg-card px-4 py-2 text-base text-brand-dark placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/30 focus-visible:border-brand-primary transition-all resize-none"
                            {...register('observaciones')}
                        />
                    </div>

                    {!modoRechazo && (
                        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2 pt-2 border-t border-border">
                            <Button
                                type="button"
                                variant="destructive"
                                onClick={() => setModoRechazo(true)}
                                disabled={aprobando}
                                leftIcon={<XCircle className="h-4 w-4" />}
                            >
                                Rechazar
                            </Button>
                            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
                                <Button type="button" variant="ghost" onClick={onClose} disabled={aprobando}>
                                    Cancelar
                                </Button>
                                <Button type="submit" isLoading={aprobando} leftIcon={<UserPlus className="h-4 w-4" />}>
                                    Aprobar y crear trabajador
                                </Button>
                            </div>
                        </div>
                    )}
                </form>

                {/* Rechazo (fuera del form de aprobación, ver docblock). Rojo = acción terminal/destructiva. */}
                {modoRechazo && (
                    <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 space-y-3">
                        <p className="flex items-center gap-2 text-sm font-semibold text-red-700 dark:text-red-300">
                            <XCircle className="h-4 w-4" /> Rechazar solicitud
                        </p>
                        <RechazarForm
                            value={motivo}
                            onChange={setMotivo}
                            onConfirm={onRechazar}
                            onCancel={() => { setModoRechazo(false); setMotivo(''); }}
                            loading={rechazando}
                            confirmLabel="Confirmar rechazo"
                            description="El motivo es obligatorio y lo verá quien hizo la solicitud."
                            placeholder="Ej: RUT ya contratado por otra empresa del grupo, faltan antecedentes..."
                        />
                    </div>
                )}
            </div>
        );
    };

/**
 * Modal de una solicitud de ingreso. Con permiso de aprobar y estado pendiente
 * → formulario de revisión (aprobar / rechazar). En cualquier otro caso → ficha
 * en solo lectura con el estado y, si fue rechazada, el motivo.
 */
export const RevisarSolicitudModal: React.FC<Props> = ({ solicitud, onClose, puedeAprobar, onResuelta }) => {
    const editable = !!solicitud && puedeAprobar && solicitud.estado === 'pendiente';
    return (
        <Modal
            isOpen={!!solicitud}
            onClose={onClose}
            title={editable ? 'Revisar solicitud de ingreso' : 'Solicitud de ingreso'}
            size="lg"
        >
            {solicitud && (editable
                // key: un form nuevo por solicitud (defaults distintos).
                ? <FormRevision key={solicitud.id} s={solicitud} onResuelta={onResuelta} onClose={onClose} />
                : <FichaSoloLectura s={solicitud} />
            )}
        </Modal>
    );
};
