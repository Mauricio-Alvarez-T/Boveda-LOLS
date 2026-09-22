/**
 * Parámetros de sueldo por cargo (plan Gestiones B3, mig 111).
 *
 * Se abre desde Configuración → Cargos (icono Banknote). Lee GET /cargo-sueldos/:id y su
 * historial; guarda con PUT /cargo-sueldos/:id (transaccional en el backend; el historial
 * se escribe solo si cambió un monto). Gating: ver = `cargos.sueldo.ver` (quien no lo tiene
 * no ve la acción); editar = `cargos.sueldo.editar` (sin él, campos en solo lectura).
 * Design system: Modal + headerAction Guardar, CurrencyInput, tokens neutros; el verde solo
 * en la acción primaria.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { History, Save } from 'lucide-react';

import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { CurrencyInput } from '../ui/CurrencyInput';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { fmtMoney, fmtFecha } from '../../utils/format';
import { showApiError } from '../../utils/toastUtils';
import type { Cargo, CargoSueldo, CargoSueldoHistorial } from '../../types/entities';
import { cargoSueldoSchema, sueldoDefaults, buildSueldoPayload, totalMensual, type CargoSueldoFormData } from './cargoSueldoSchema';

interface Props {
    isOpen: boolean;
    cargo: Cargo | null;
    onClose: () => void;
    /** Tras guardar: el padre refresca la columna "Sueldo base" de la tabla. */
    onSaved?: () => void;
}

export const CargoSueldoModal: React.FC<Props> = ({ isOpen, cargo, onClose, onSaved }) => {
    const { hasPermission } = useAuth();
    const puedeEditar = hasPermission('cargos.sueldo.editar');
    const [loading, setLoading] = useState(false);
    const [historial, setHistorial] = useState<CargoSueldoHistorial[]>([]);
    const [verHistorial, setVerHistorial] = useState(false);

    const { control, register, handleSubmit, reset, watch, formState: { errors, isSubmitting } } = useForm<CargoSueldoFormData>({
        resolver: zodResolver(cargoSueldoSchema),
        defaultValues: sueldoDefaults(null),
    });
    const valores = watch();

    const cargar = useCallback(async () => {
        if (!cargo) return;
        setLoading(true);
        try {
            const [s, h] = await Promise.all([
                api.get(`/cargo-sueldos/${cargo.id}`),
                api.get(`/cargo-sueldos/${cargo.id}/historial`),
            ]);
            reset(sueldoDefaults(s.data.data as CargoSueldo | null));
            setHistorial((h.data.data as CargoSueldoHistorial[]) || []);
        } catch (err) {
            showApiError(err, 'No se pudo cargar el sueldo del cargo');
        } finally {
            setLoading(false);
        }
    }, [cargo, reset]);

    useEffect(() => {
        if (isOpen && cargo) { setVerHistorial(false); cargar(); }
    }, [isOpen, cargo, cargar]);

    const onSubmit = async (d: CargoSueldoFormData) => {
        if (!cargo) return;
        try {
            await api.put(`/cargo-sueldos/${cargo.id}`, buildSueldoPayload(d));
            toast.success(`Sueldo de ${cargo.nombre} guardado`);
            onSaved?.();
            onClose();
        } catch (err) {
            showApiError(err, 'No se pudo guardar el sueldo');
        }
    };

    const bloqueado = !puedeEditar || loading;

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={cargo ? `Sueldo · ${cargo.nombre}` : 'Sueldo por cargo'}
            size="md"
            headerAction={puedeEditar ? (
                <Button type="submit" form="cargo-sueldo-form" size="sm" isLoading={isSubmitting} disabled={loading} leftIcon={<Save className="h-4 w-4" />}>
                    Guardar
                </Button>
            ) : undefined}
        >
            <form id="cargo-sueldo-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <p className="text-sm text-muted-foreground">
                    Montos mensuales en pesos. Se imprimen en el contrato de trabajo al emitirlo y cada cambio de monto queda en el historial.
                </p>

                <Controller
                    name="sueldo_base"
                    control={control}
                    render={({ field }) => (
                        <CurrencyInput label="Sueldo base" value={field.value} onChange={field.onChange} onBlur={field.onBlur}
                            error={errors.sueldo_base?.message} disabled={bloqueado} />
                    )}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Controller
                        name="bono_colacion"
                        control={control}
                        render={({ field }) => (
                            <CurrencyInput label="Colación" value={field.value} onChange={field.onChange} onBlur={field.onBlur}
                                error={errors.bono_colacion?.message} disabled={bloqueado} />
                        )}
                    />
                    <Controller
                        name="bono_movilizacion"
                        control={control}
                        render={({ field }) => (
                            <CurrencyInput label="Movilización" value={field.value} onChange={field.onChange} onBlur={field.onBlur}
                                error={errors.bono_movilizacion?.message} disabled={bloqueado} />
                        )}
                    />
                </div>
                <Input label="Observaciones" {...register('observaciones')} error={errors.observaciones?.message}
                    disabled={bloqueado} placeholder="Opcional (máx. 500 caracteres)" />

                <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
                    <span className="text-sm text-muted-foreground">Total mensual</span>
                    <span className="text-base font-bold text-brand-dark">{fmtMoney(totalMensual(valores))}</span>
                </div>

                {!puedeEditar && (
                    <p className="text-caption text-muted-foreground">
                        Solo lectura: tu rol no tiene el permiso "Editar Parámetros de Sueldo".
                    </p>
                )}

                <div>
                    <Button type="button" variant="ghost" size="sm" leftIcon={<History className="h-4 w-4" />} onClick={() => setVerHistorial(v => !v)}>
                        {verHistorial ? 'Ocultar historial' : `Historial de cambios (${historial.length})`}
                    </Button>
                    {verHistorial && (
                        historial.length === 0 ? (
                            <p className="px-1 py-2 text-sm text-muted-foreground">Sin cambios registrados todavía.</p>
                        ) : (
                            <ul className="mt-2 divide-y divide-border rounded-xl border border-border">
                                {historial.map(h => (
                                    <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                                        <span className="text-muted-foreground">{fmtFecha(h.cambiado_en)} · {h.cambiado_por_nombre || '—'}</span>
                                        <span className="font-medium text-brand-dark">
                                            {fmtMoney(h.sueldo_base)} <span className="text-muted-foreground">+ {fmtMoney(h.bono_colacion)} + {fmtMoney(h.bono_movilizacion)}</span>
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )
                    )}
                </div>
            </form>
        </Modal>
    );
};
