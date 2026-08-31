import React, { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'sonner';
import { CalendarCheck } from 'lucide-react';
import { Input } from '../ui/Input';
import { CurrencyInput } from '../ui/CurrencyInput';
import api from '../../services/api';
import type { Vehiculo, Conductor, EmpresaVehiculo } from '../../types/entities';
import type { ApiResponse } from '../../types';
import { useFormDirtyProtection } from '../../hooks/useFormDirtyProtection';
import { mesRevisionPorPatente } from '../../utils/revisionTecnica';
import { advertenciaPatente } from '../../utils/patente';

const schema = z.object({
    // Patente: sólo obligatoria. El formato NO bloquea — hay varios formatos
    // chilenos vigentes a la vez (motos, maquinaria, remolques municipales y las
    // patentes anteriores a 2007) y exigir uno solo impedía cargar vehículos
    // reales. Si no calza con ninguno conocido se muestra una advertencia bajo el
    // campo (advertenciaPatente), pero se puede guardar. Ver utils/patente.ts.
    patente: z.string()
        .trim()
        .min(1, 'La patente es obligatoria'),
    marca:   z.string().trim().min(3, 'La marca debe tener al menos 3 caracteres'),
    modelo:  z.string().trim().min(2, 'El modelo debe tener al menos 2 caracteres'),
    anio:    z.coerce.number()
        .int('El año debe ser un número entero')
        .min(1990, 'El año debe ser 1990 o posterior')
        .max(new Date().getFullYear() + 1, 'El año no puede ser futuro'),
    tipo:    z.enum(['camioneta','camion','auto','furgon','bus','moto','maquinaria','remolque','otro']),
    empresa_id: z.string().optional(),      // id de empresa de flota (select) o '' (sin asignar)
    conductor_nombre: z.string().optional(),// nombre escrito/elegido; el backend lo resuelve o crea en el catálogo
    kilometraje_actual: z.coerce.number()
        .min(0, 'Los kilómetros no pueden ser negativos')
        .optional(),
    color:   z.string().trim().min(3, 'El color debe tener al menos 3 caracteres'),
    valor:   z.coerce.number().min(0, 'El valor no puede ser negativo').optional(),
    precio_compra: z.coerce.number().min(0, 'El precio de compra no puede ser negativo').optional(),
    es_leasing: z.boolean().optional(),
    leasing_fecha_inicio: z.string().optional(),
    leasing_fecha_termino: z.string().optional(),
    leasing_terminado: z.boolean().optional(),
    leasing_traspaso_a: z.string().optional(),
    avisar_leasing_30d: z.boolean().optional(),
    avisar_alerta_seguro: z.boolean().optional(),
    observaciones: z.string().optional(),
}).superRefine((data, ctx) => {
    if (data.leasing_fecha_inicio && data.leasing_fecha_termino && data.leasing_fecha_termino < data.leasing_fecha_inicio) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['leasing_fecha_termino'], message: 'El término no puede ser anterior al inicio' });
    }
});
type FormData = z.infer<typeof schema>;

interface Props {
    initialData?: Vehiculo | null;
    /** Empresa preseleccionada al crear desde dentro de una empresa (Nivel 2). */
    defaultEmpresaId?: number | null;
    onSuccess: () => void;
    onCancel: () => void;
}

export const VehiculoForm: React.FC<Props> = ({ initialData, defaultEmpresaId, onSuccess, onCancel }) => {
    const { register, handleSubmit, watch, control, setValue, formState: { errors, isDirty } } = useForm<FormData>({
        resolver: zodResolver(schema) as any,
        defaultValues: initialData ? {
            patente: initialData.patente,
            marca:   initialData.marca,
            modelo:  initialData.modelo,
            anio:    initialData.anio,
            tipo:    initialData.tipo,
            empresa_id: initialData.empresa_id != null ? String(initialData.empresa_id) : '',
            conductor_nombre: initialData.conductor_nombre || '',
            kilometraje_actual: initialData.kilometraje_actual,
            color:   initialData.color || '',
            valor:   initialData.valor != null ? Number(initialData.valor) : 0,
            precio_compra: initialData.precio_compra != null ? Number(initialData.precio_compra) : 0,
            es_leasing: initialData.es_leasing ?? false,
            leasing_fecha_inicio: (initialData.leasing_fecha_inicio || '').slice(0, 10),
            leasing_fecha_termino: (initialData.leasing_fecha_termino || '').slice(0, 10),
            leasing_terminado: !!initialData.leasing_terminado,
            leasing_traspaso_a: initialData.leasing_traspaso_a || '',
            avisar_leasing_30d: initialData.avisar_leasing_30d ?? true,
            avisar_alerta_seguro: initialData.avisar_alerta_seguro ?? true,
            observaciones: initialData.observaciones || '',
        } : {
            tipo: 'camioneta',
            empresa_id: defaultEmpresaId != null ? String(defaultEmpresaId) : '',
            conductor_nombre: '',
            kilometraje_actual: 0,
            valor: 0,
            precio_compra: 0,
            es_leasing: false,
            avisar_leasing_30d: true,
            avisar_alerta_seguro: true,
        },
    });

    useFormDirtyProtection(isDirty);

    // Catálogo de conductores (se administra en Configuración → Conductores)
    const [conductores, setConductores] = useState<Conductor[]>([]);
    useEffect(() => {
        api.get<ApiResponse<Conductor[]>>('/conductores?activo=true')
            .then(res => setConductores(res.data.data))
            .catch(() => { /* si falla la carga, el select queda vacío; no bloquea el alta */ });
    }, []);

    // Catálogo de empresas de flota (paramétrico; se administra desde la página Vehículos)
    const [empresas, setEmpresas] = useState<EmpresaVehiculo[]>([]);
    useEffect(() => {
        api.get<ApiResponse<EmpresaVehiculo[]>>('/empresas-vehiculos?activo=true')
            .then(res => setEmpresas(res.data.data))
            .catch(() => { /* si falla, el select queda solo con "Sin asignar"; no bloquea el alta */ });
    }, []);

    // Mes de revisión técnica según el último dígito de la patente (calendario MTT).
    // El DS 156/1990 art. 7 aplica ese calendario a autos y TAMBIÉN a motos, pero NO
    // a maquinaria (revisión cada 4 años, DTO 289/1995) ni a remolques (cada 6 meses,
    // art. 7 inciso 1º). Para esos dos se oculta el recuadro: dar un mes equivocado
    // es peor que no dar ninguno.
    const patente = watch('patente');
    const tipoActual = watch('tipo');
    const mesRevision = ['maquinaria', 'remolque'].includes(tipoActual) ? null : mesRevisionPorPatente(patente);
    const avisoPatente = advertenciaPatente(patente || '');

    // La sección de CUOTAS se retiró del formulario (jefatura 2026-08-27, 2ª vuelta);
    // los datos históricos quedan en vehiculo_leasing_cuotas, sin UI.
    const esLeasing = watch('es_leasing');
    const leasingTerminado = watch('leasing_terminado');

    // El modal de edición recibe la fila del LISTADO, que puede venir sin los
    // campos de leasing (solo getById trae el detalle completo): se rehidrata.
    useEffect(() => {
        if (!initialData?.id) return;
        let vivo = true;
        api.get<{ data: Vehiculo }>(`/vehiculos/${initialData.id}`)
            .then(res => {
                if (!vivo) return;
                const v = res.data.data;
                setValue('leasing_fecha_inicio', (v.leasing_fecha_inicio || '').slice(0, 10));
                setValue('leasing_fecha_termino', (v.leasing_fecha_termino || '').slice(0, 10));
                setValue('leasing_terminado', !!v.leasing_terminado);
                setValue('leasing_traspaso_a', v.leasing_traspaso_a || '');
                setValue('avisar_leasing_30d', v.avisar_leasing_30d == null ? true : !!v.avisar_leasing_30d);
                setValue('avisar_alerta_seguro', v.avisar_alerta_seguro == null ? true : !!v.avisar_alerta_seguro);
                setValue('es_leasing', !!v.es_leasing);
            })
            .catch(() => { /* sin detalle: se queda con lo que trajo la fila */ });
        return () => { vivo = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar con el id
    }, [initialData?.id]);

    const onSubmit = async (data: FormData) => {
        const payload = {
            ...data,
            empresa_id: data.empresa_id ? Number(data.empresa_id) : null,
            conductor_nombre: data.conductor_nombre?.trim() || null, // backend resuelve/crea en el catálogo
            // OJO: cuotas ya NO se envía — la sección se retiró del form y no
            // mandarla deja intacto lo guardado (el backend solo las toca si vienen).
            leasing_fecha_inicio: data.es_leasing ? (data.leasing_fecha_inicio || null) : null,
            leasing_fecha_termino: data.es_leasing ? (data.leasing_fecha_termino || null) : null,
            leasing_terminado: data.es_leasing ? !!data.leasing_terminado : false,
            leasing_traspaso_a: data.es_leasing && data.leasing_terminado ? (data.leasing_traspaso_a?.trim() || null) : null,
            // Sin leasing el flag vuelve a 1: si mañana se marca "¿Es leasing?"
            // otra vez, arranca avisando (default de la mig 106), no silenciado.
            avisar_leasing_30d: data.es_leasing ? (data.avisar_leasing_30d ?? true) : true,
            avisar_alerta_seguro: data.avisar_alerta_seguro ?? true,
        };
        try {
            if (initialData) {
                await api.put(`/vehiculos/${initialData.id}`, payload);
                toast.success('Vehículo actualizado');
            } else {
                await api.post('/vehiculos', payload);
                toast.success('Vehículo registrado');
            }
            onSuccess();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Error al guardar vehículo');
        }
    };

    return (
        <form id="vehiculo-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <Input label="Patente" placeholder="Ej: ABCD·12 · moto ABC·12" {...register('patente')}
                        error={errors.patente?.message} />
                    {/* Advertencia, no error: el campo se puede guardar igual (ver utils/patente.ts). */}
                    {!errors.patente && avisoPatente && (
                        <p className="text-xs text-amber-600 mt-1.5 leading-snug">{avisoPatente}</p>
                    )}
                </div>
                <div>
                    <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Tipo</label>
                    <select {...register('tipo')}
                        className="w-full px-3 h-11 rounded-xl border border-border bg-card text-base text-brand-dark focus:outline-none focus:ring-2 focus:ring-brand-primary/30">
                        <option value="camioneta">Camioneta</option>
                        <option value="camion">Camión</option>
                        <option value="auto">Auto</option>
                        <option value="furgon">Furgón</option>
                        <option value="bus">Bus</option>
                        <option value="moto">Moto</option>
                        <option value="maquinaria">Maquinaria</option>
                        <option value="remolque">Remolque / carro de arrastre</option>
                        <option value="otro">Otro</option>
                    </select>
                </div>
            </div>

            {/* Calendario de revisión técnica según el último dígito de la patente */}
            {mesRevision && (
                <div className="flex items-start gap-2.5 rounded-xl border border-brand-primary/30 bg-brand-primary/5 px-3.5 py-2.5">
                    <CalendarCheck className="h-4 w-4 text-brand-primary mt-0.5 shrink-0" />
                    <p className="text-sm text-brand-dark leading-snug">
                        Según el último dígito de la patente, la <b>revisión técnica</b> de este vehículo
                        corresponde al mes de <b className="text-brand-primary">{mesRevision}</b>.
                        <span className="block text-xs text-muted-foreground mt-0.5">
                            Calendario MTT referencial para vehículos particulares.
                        </span>
                    </p>
                </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Empresa</label>
                    <select {...register('empresa_id')}
                        className="w-full px-3 h-11 rounded-xl border border-border bg-card text-base text-brand-dark focus:outline-none focus:ring-2 focus:ring-brand-primary/30">
                        <option value="">Sin asignar</option>
                        {empresas.map(e => (
                            <option key={e.id} value={e.id}>{e.nombre}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Conductor asignado</label>
                    <input {...register('conductor_nombre')} list="conductores-list"
                        placeholder="Escribe o elige un nombre"
                        autoComplete="off"
                        className="w-full px-3 h-11 rounded-xl border border-border bg-card text-base text-brand-dark focus:outline-none focus:ring-2 focus:ring-brand-primary/30" />
                    <datalist id="conductores-list">
                        {conductores.map(c => (
                            <option key={c.id} value={c.nombre} />
                        ))}
                    </datalist>
                    <p className="text-micro text-muted-foreground/70 mt-1">Si el nombre es nuevo, se guarda solo en el catálogo de conductores.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input label="Marca" placeholder="Toyota" {...register('marca')} error={errors.marca?.message} />
                <Input label="Modelo" placeholder="Hilux" {...register('modelo')} error={errors.modelo?.message} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input label="Año" type="number" placeholder="2022" {...register('anio')} error={errors.anio?.message} />
                <Input label="Color" placeholder="Blanco" {...register('color')} error={errors.color?.message} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input label="Kilómetros actuales" type="number" {...register('kilometraje_actual')} error={errors.kilometraje_actual?.message} />
                <Controller
                    name="precio_compra"
                    control={control}
                    render={({ field }) => (
                        <CurrencyInput
                            label="Precio de compra"
                            placeholder="$0"
                            value={Number(field.value) || 0}
                            onChange={field.onChange}
                            onBlur={field.onBlur}
                            error={errors.precio_compra?.message}
                        />
                    )}
                />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Controller
                    name="valor"
                    control={control}
                    render={({ field }) => (
                        <CurrencyInput
                            label="Valor del vehículo"
                            placeholder="$0"
                            value={Number(field.value) || 0}
                            onChange={field.onChange}
                            onBlur={field.onBlur}
                            error={errors.valor?.message}
                        />
                    )}
                />
            </div>

            {/* Leasing: flag sí/no con explicación de qué significa en el contexto de la app. */}
            <label className="flex items-start gap-3 cursor-pointer rounded-xl border border-border bg-card px-3.5 py-3 hover:border-brand-primary/40 transition-colors">
                <input
                    type="checkbox"
                    {...register('es_leasing')}
                    className="mt-0.5 h-5 w-5 shrink-0 rounded border-border text-brand-primary focus:ring-brand-primary cursor-pointer"
                />
                <span className="flex flex-col">
                    <span className="text-sm font-semibold text-brand-dark">¿Es leasing?</span>
                    <span className="text-xs text-muted-foreground mt-0.5 leading-snug">
                        En Chile, un leasing de vehículos es un contrato de arriendo financiero con una institución
                        (banco o automotora): pagas cuotas mensuales por el uso del auto y la entidad sigue siendo
                        la dueña legal hasta el final del contrato. Al terminar, decides si pagas una cuota final
                        (opción de compra) para quedártelo, lo devuelves o lo renuevas.
                    </span>
                </span>
            </label>

            {/* Contrato del leasing: fechas + cuotas. Solo visible con "¿Es leasing?". */}
            {esLeasing && (
                <div className="rounded-xl border border-border bg-card px-3.5 py-3 space-y-2.5">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Inicio del leasing</label>
                            <input type="date" {...register('leasing_fecha_inicio')}
                                className="w-full px-3 h-11 rounded-xl border border-border bg-card text-base text-brand-dark focus:outline-none focus:ring-2 focus:ring-brand-primary/30" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Término del leasing</label>
                            <input type="date" {...register('leasing_fecha_termino')}
                                className="w-full px-3 h-11 rounded-xl border border-border bg-card text-base text-brand-dark focus:outline-none focus:ring-2 focus:ring-brand-primary/30" />
                            {errors.leasing_fecha_termino && (
                                <p className="text-xs text-destructive mt-1">{errors.leasing_fecha_termino.message}</p>
                            )}
                        </div>
                    </div>
                    {/* Aviso 30 días antes del término (mig 106). Mismo rol que
                        "Avisar 30 días antes" de documentos/revisiones y que
                        "Alerta de renovación de seguro": controla el aviso IN-APP.
                        Va aquí, pegado a las fechas, porque es sobre ellas que actúa. */}
                    <label className="flex items-start gap-3 cursor-pointer rounded-xl border border-border bg-muted/30 px-3.5 py-3 hover:border-brand-primary/40 transition-colors">
                        <input
                            type="checkbox"
                            {...register('avisar_leasing_30d')}
                            className="mt-0.5 h-5 w-5 shrink-0 rounded border-border text-brand-primary focus:ring-brand-primary cursor-pointer"
                        />
                        <span className="flex flex-col">
                            <span className="text-sm font-semibold text-brand-dark">Avisar 30 días antes</span>
                            <span className="text-xs text-muted-foreground mt-0.5 leading-snug">
                                Con esto marcado, el término del leasing aparece en el aviso de vencimientos
                                del módulo Vehículos (número del menú y bandeja del Inicio) para renovarlo a tiempo.
                            </span>
                        </span>
                    </label>

                    {/* Término del leasing: el contrato YA finalizó. Al marcarlo, este
                        vehículo deja de avisar el vencimiento (ya fue gestionado) y se
                        registra a quién quedó traspasado. */}
                    <label className="flex items-start gap-3 cursor-pointer rounded-xl border border-border bg-muted/30 px-3.5 py-3 hover:border-brand-primary/40 transition-colors">
                        <input
                            type="checkbox"
                            {...register('leasing_terminado')}
                            className="mt-0.5 h-5 w-5 shrink-0 rounded border-border text-brand-primary focus:ring-brand-primary cursor-pointer"
                        />
                        <span className="flex flex-col">
                            <span className="text-sm font-semibold text-brand-dark">Término de leasing</span>
                            <span className="text-xs text-muted-foreground mt-0.5 leading-snug">
                                Márcalo cuando el contrato ya finalizó: el vehículo deja de aparecer en el
                                aviso de vencimientos y queda registrado el traspaso.
                            </span>
                        </span>
                    </label>
                    {leasingTerminado && (
                        <div>
                            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Traspaso a:</label>
                            <input type="text" {...register('leasing_traspaso_a')}
                                placeholder="Ej: LOLS (opción de compra), devuelto al banco, vendido a…"
                                className="w-full px-3 h-11 rounded-xl border border-border bg-card text-base text-brand-dark focus:outline-none focus:ring-2 focus:ring-brand-primary/30" />
                        </div>
                    )}
                </div>
            )}

            <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Observaciones</label>
                <textarea {...register('observaciones')} rows={2}
                    className="w-full px-3 py-3 rounded-xl border border-border bg-card text-base text-brand-dark resize-none focus:outline-none focus:ring-2 focus:ring-brand-primary/30" />
            </div>

            {/* Avisar alerta de seguro (pedido jefatura 2026-08-27). Marcado = los
                seguros de este vehículo cuentan en el aviso de vencimientos (menú,
                panel e Inicio). Desmarcado = este vehículo no genera esa alerta. */}
            <label className="flex items-start gap-3 cursor-pointer rounded-xl border border-border bg-card px-3.5 py-3 hover:border-brand-primary/40 transition-colors">
                <input
                    type="checkbox"
                    {...register('avisar_alerta_seguro')}
                    className="mt-0.5 h-5 w-5 shrink-0 rounded border-border text-brand-primary focus:ring-brand-primary cursor-pointer"
                />
                <span className="flex flex-col">
                    <span className="text-sm font-semibold text-brand-dark">Alerta de renovación de seguro</span>
                    <span className="text-xs text-muted-foreground mt-0.5 leading-snug">
                        Con esto marcado, los vencimientos de seguro de este vehículo aparecen en el aviso del
                        módulo Vehículos (número del menú y bandeja del Inicio) para renovarlo a tiempo.
                    </span>
                </span>
            </label>
            {/* Botones Cancelar/Guardar viven en el header del Modal (headerAction). */}
        </form>
    );
};
