import React, { useEffect, useRef, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Loader2, AlertTriangle, CheckCircle2, Send, ChevronDown, ChevronRight } from 'lucide-react';

import { formatRut, validateRut } from '../../utils/rut';
import api from '../../services/api';
import type { ApiResponse } from '../../types';
import type { Obra, Cargo, SolicitudIngreso } from '../../types/entities';
import { Input } from '../ui/Input';
import { SearchableSelect } from '../ui/SearchableSelect';
import type { SelectOption } from '../ui/Select';
import { Button } from '../ui/Button';
import { useFormDirtyProtection } from '../../hooks/useFormDirtyProtection';
import { showApiError } from '../../utils/toastUtils';
import { DatosPersonalesFields } from '../workers/DatosPersonalesFields';
import WhatsAppIcon from '../ui/WhatsAppIcon';
import { copyAndShare } from '../../utils/whatsappShare';
import { buildSolicitudIngresoMessage, fechaContratacion, nombreCompletoSolicitud } from './solicitudIngresoWhatsApp';
import {
    solicitudIngresoSchema, buildSolicitudPayload, datosPersonalesDefaults,
    avisoRutExiste, AVISO_SOLICITUD_PENDIENTE,
    type SolicitudIngresoFormValues,
} from './solicitudIngresoSchema';

/** Respuesta de GET /solicitudes-ingreso/check-rut/:rut (gate `trabajadores.solicitud.crear`). */
export interface CheckRutResponse {
    existe_trabajador: boolean;
    trabajador: { id: number; nombre: string; activo: boolean } | null;
    solicitud_pendiente: { id: number } | null;
}

type RutStatus = 'idle' | 'checking' | 'existe' | 'pendiente' | 'disponible';

interface Props {
    /** Se llama apenas el POST responde OK (el padre refresca badge y lista). El modal sigue abierto. */
    onEnviada: (solicitud: SolicitudIngreso) => void;
    /** Botón "Cerrar" de la pantalla de confirmación. */
    onClose: () => void;
    onCancel: () => void;
}

/**
 * Ficha de ingreso digital — la llena TERRENO (supervisor/prevencionista) y
 * llega a la oficina como solicitud pendiente. Reemplaza la ficha de papel.
 *
 * Anti-duplicados: el RUT es el PRIMER campo y se verifica en vivo (debounce
 * 400 ms) contra trabajadores existentes (activos o finiquitados) y solicitudes
 * pendientes. Si choca, aviso ámbar y el envío queda bloqueado.
 * Sin campo Empresa: la asigna administración al aprobar.
 */
export const SolicitudIngresoForm: React.FC<Props> = ({ onEnviada, onClose, onCancel }) => {
    const [loading, setLoading] = useState(false);
    // Solicitud ya creada → el modal pasa a la pantalla de confirmación (resumen + WhatsApp).
    const [enviada, setEnviada] = useState<SolicitudIngreso | null>(null);
    const [initializing, setInitializing] = useState(true);
    // Los catálogos dependen de obras.ver / cargos.ver (rutas CRUD): un rol que solo
    // tenga solicitud.crear recibe 403 → aviso explícito en vez de selects vacíos.
    const [errorCatalogos, setErrorCatalogos] = useState<string | null>(null);
    const [obras, setObras] = useState<SelectOption[]>([]);
    const [cargos, setCargos] = useState<SelectOption[]>([]);
    const [mostrarOpcionales, setMostrarOpcionales] = useState(false);

    // ── Verificación en vivo del RUT (patrón de WorkerForm) ──
    const [rutStatus, setRutStatus] = useState<RutStatus>('idle');
    const [rutNombre, setRutNombre] = useState('');
    const rutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const rutSeq = useRef(0); // descarta respuestas viejas (race) al tipear rápido

    const checkRut = (formatted: string) => {
        if (rutTimer.current) clearTimeout(rutTimer.current);
        const seq = ++rutSeq.current; // invalida cualquier respuesta en vuelo
        if (!validateRut(formatted)) { setRutStatus('idle'); setRutNombre(''); return; }

        setRutStatus('checking');
        rutTimer.current = setTimeout(async () => {
            try {
                const res = await api.get<ApiResponse<CheckRutResponse>>(
                    `/solicitudes-ingreso/check-rut/${encodeURIComponent(formatted)}`
                );
                if (seq !== rutSeq.current) return; // llegó tarde, ignorar
                const d = res.data.data;
                if (d.existe_trabajador) {
                    setRutStatus('existe');
                    setRutNombre(d.trabajador?.nombre || 'sin nombre');
                } else if (d.solicitud_pendiente) {
                    setRutStatus('pendiente');
                    setRutNombre('');
                } else {
                    setRutStatus('disponible');
                    setRutNombre('');
                }
            } catch {
                // Error de red → no bloquear acá: el backend re-valida al enviar (409).
                if (seq === rutSeq.current) setRutStatus('idle');
            }
        }, 400);
    };

    useEffect(() => () => { if (rutTimer.current) clearTimeout(rutTimer.current); }, []);

    const {
        register,
        handleSubmit,
        control,
        formState: { errors, isDirty },
    } = useForm<SolicitudIngresoFormValues>({
        resolver: zodResolver(solicitudIngresoSchema) as any,
        // Defaults explícitos: garantizan el mensaje en español del schema (no "Invalid input").
        defaultValues: {
            rut: '',
            nombres: '',
            apellido_paterno: '',
            apellido_materno: '',
            cargo_id: 0,
            obra_id: 0,
            fecha_ingreso: '',
            observaciones: '',
            ...datosPersonalesDefaults(null),
        },
    });

    // Una vez enviada, ya no hay nada que perder: no bloquear el cierre.
    useFormDirtyProtection(isDirty && !enviada);

    const handleWhatsApp = async () => {
        if (!enviada) return;
        // Dentro del click (gesto de usuario) para que window.open no sea bloqueado.
        const { copied, opened } = await copyAndShare(buildSolicitudIngresoMessage(enviada), 'Solicitud de ingreso');
        if (opened) toast.success('WhatsApp abierto', { description: copied ? 'El mensaje también quedó en tu portapapeles.' : undefined });
        else if (copied) toast.info('Mensaje copiado al portapapeles');
        else toast.error('No se pudo abrir WhatsApp ni copiar el mensaje');
    };

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [obraRes, cargoRes] = await Promise.all([
                    api.get<ApiResponse<Obra[]>>('/obras?activo=true&incluir_prueba=true'),
                    api.get<ApiResponse<Cargo[]>>('/cargos?activo=true'),
                ]);
                setObras(obraRes.data.data.map(o => ({ value: o.id, label: o.nombre })));
                setCargos(cargoRes.data.data.map(c => ({ value: c.id, label: c.nombre })));
            } catch (err) {
                const status = (err as { response?: { status?: number } })?.response?.status;
                setErrorCatalogos(status === 403
                    ? 'Tu rol no tiene permiso para ver obras y cargos (obras.ver y cargos.ver). Pide a administración que lo habilite para poder enviar la ficha.'
                    : 'No se pudieron cargar obras y cargos. Reintenta en unos segundos.');
            } finally {
                setInitializing(false);
            }
        };
        fetchData();
    }, []);

    const bloqueado = rutStatus === 'existe' || rutStatus === 'pendiente';

    const onSubmit = async (data: SolicitudIngresoFormValues) => {
        // Bloqueo defensivo (el botón ya está deshabilitado): el backend responde 409 igual.
        if (bloqueado) return;
        setLoading(true);
        try {
            const res = await api.post<ApiResponse<SolicitudIngreso>>('/solicitudes-ingreso', buildSolicitudPayload(data));
            setEnviada(res.data.data);
            onEnviada(res.data.data);
        } catch (err) {
            // 409 = RUT ya existe / solicitud pendiente (el backend re-valida); 400 = ficha inválida.
            showApiError(err, 'No se pudo enviar la solicitud');
        } finally {
            setLoading(false);
        }
    };

    if (enviada) {
        const resumen: [string, string][] = [
            ['Trabajador', nombreCompletoSolicitud(enviada)],
            ['RUT', enviada.rut],
            ['Obra', enviada.obra_nombre || '—'],
            ['Cargo', enviada.cargo_nombre || '—'],
            ['Fecha de ingreso', fechaContratacion(enviada.fecha_ingreso) || '—'],
        ];
        return (
            <div className="space-y-6" role="status">
                <div className="flex flex-col items-center text-center pt-2">
                    <div className="h-12 w-12 rounded-full bg-success/10 text-success flex items-center justify-center">
                        <CheckCircle2 className="h-7 w-7" />
                    </div>
                    <h3 className="mt-3 text-lg font-semibold text-foreground">Solicitud enviada a administración</h3>
                    <p className="text-sm text-muted-foreground">Queda pendiente de revisión. Puedes avisar por WhatsApp.</p>
                </div>

                <dl className="rounded-xl border border-border bg-card divide-y divide-border">
                    {resumen.map(([k, v]) => (
                        <div key={k} className="flex items-baseline justify-between gap-4 px-4 py-2.5 text-sm">
                            <dt className="text-muted-foreground shrink-0">{k}</dt>
                            <dd className="font-medium text-foreground text-right">{v}</dd>
                        </div>
                    ))}
                </dl>

                <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2 border-t border-border">
                    <Button type="button" variant="ghost" onClick={onClose}>
                        Cerrar
                    </Button>
                    <Button type="button" onClick={handleWhatsApp} leftIcon={<WhatsAppIcon className="h-4 w-4" />}>
                        Enviar por WhatsApp
                    </Button>
                </div>
            </div>
        );
    }

    if (initializing) {
        return (
            <div className="py-20 flex flex-col items-center justify-center text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin text-brand-primary mb-2" />
                <p>Preparando ficha...</p>
            </div>
        );
    }

    if (errorCatalogos) {
        return (
            <div className="space-y-4">
                <div role="alert" className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <p>{errorCatalogos}</p>
                </div>
                <div className="flex justify-end">
                    <Button type="button" variant="outline" onClick={onCancel}>Cerrar</Button>
                </div>
            </div>
        );
    }

    return (
        <form id="solicitud-ingreso-form" onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <p className="text-xs text-muted-foreground">
                La ficha llega a administración, que la revisa y crea al trabajador. La empresa la asigna la oficina.
            </p>

            {/* ── Identificación: el RUT PRIMERO, verificado en vivo ── */}
            <Controller
                name="rut"
                control={control}
                render={({ field: { onChange, value, ref } }) => (
                    <div>
                        <Input
                            ref={ref}
                            label="RUT"
                            placeholder="12.345.678-9"
                            error={errors.rut?.message}
                            value={value || ''}
                            autoFocus
                            autoCapitalize="characters"
                            autoCorrect="off"
                            spellCheck={false}
                            inputMode="text"
                            onChange={(e) => {
                                const formatted = formatRut(e.target.value);
                                onChange(formatted);
                                checkRut(formatted);
                            }}
                        />
                        {!errors.rut && rutStatus === 'checking' && (
                            <p className="flex items-center gap-1 text-xs text-muted-foreground mt-1 ml-0.5">
                                <Loader2 className="h-3 w-3 animate-spin shrink-0" /> Verificando RUT...
                            </p>
                        )}
                        {!errors.rut && rutStatus === 'disponible' && (
                            <p className="flex items-center gap-1 text-xs text-green-700 dark:text-green-300 mt-1 ml-0.5">
                                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> RUT disponible
                            </p>
                        )}
                        {/* Aviso ÁMBAR (precaución, no error): duplicado o solicitud ya en curso. */}
                        {bloqueado && (
                            <div
                                role="alert"
                                className="mt-2 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800/60 dark:bg-amber-500/10 dark:text-amber-300"
                            >
                                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                                <span>{rutStatus === 'existe' ? avisoRutExiste(rutNombre) : AVISO_SOLICITUD_PENDIENTE}</span>
                            </div>
                        )}
                    </div>
                )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                    label="Nombres"
                    placeholder="Juan Andrés"
                    error={errors.nombres?.message}
                    {...register('nombres')}
                />
                <Input
                    label="Apellido paterno"
                    placeholder="Pérez"
                    error={errors.apellido_paterno?.message}
                    {...register('apellido_paterno')}
                />
                <Input
                    label="Apellido materno"
                    placeholder="Cotapos (opcional)"
                    error={errors.apellido_materno?.message}
                    {...register('apellido_materno')}
                />
            </div>

            {/* ── Puesto ── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                <Input
                    label="Fecha de ingreso"
                    type="date"
                    error={errors.fecha_ingreso?.message}
                    {...register('fecha_ingreso')}
                />
            </div>

            {/* ── Datos personales (opcional) — barra colapsable con contenedor (DS: fondo verde + texto blanco) ── */}
            {/* eslint-disable-next-line no-restricted-syntax -- disclosure (header colapsable full-width) */}
            <button
                type="button"
                onClick={() => setMostrarOpcionales(v => !v)}
                aria-expanded={mostrarOpcionales}
                aria-controls="solicitud-datos-personales"
                className="flex w-full items-center justify-between rounded-xl bg-brand-primary px-4 py-2.5 text-left text-white transition-colors hover:bg-[#027A3B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 focus-visible:ring-offset-2"
            >
                <span className="text-sm font-semibold">
                    Datos personales <span className="font-normal opacity-80">(opcional)</span>
                </span>
                {mostrarOpcionales ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>

            {mostrarOpcionales && (
                <div id="solicitud-datos-personales" className="space-y-4">
                    <DatosPersonalesFields register={register} errors={errors} control={control} />
                    <div className="w-full space-y-1.5">
                        <label htmlFor="solicitud-observaciones" className="text-sm font-medium text-muted-foreground ml-0.5">Observaciones</label>
                        <textarea
                            id="solicitud-observaciones"
                            rows={3}
                            placeholder="Cualquier antecedente útil para administración"
                            className="flex w-full rounded-xl border border-border bg-card px-4 py-2 text-base text-brand-dark placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/30 focus-visible:border-brand-primary transition-all resize-none"
                            {...register('observaciones')}
                        />
                    </div>
                </div>
            )}

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2 border-t border-border">
                <Button type="button" variant="ghost" onClick={onCancel} disabled={loading}>
                    Cancelar
                </Button>
                <Button
                    type="submit"
                    isLoading={loading}
                    disabled={bloqueado || rutStatus === 'checking'}
                    leftIcon={<Send className="h-4 w-4" />}
                >
                    Enviar solicitud
                </Button>
            </div>
        </form>
    );
};
