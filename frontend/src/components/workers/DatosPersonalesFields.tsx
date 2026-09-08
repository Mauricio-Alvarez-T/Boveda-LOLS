import React from 'react';
import { Controller, useWatch } from 'react-hook-form';
import type { Control, FieldErrors, UseFormRegister } from 'react-hook-form';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { SearchableSelect } from '../ui/SearchableSelect';
import { ESTADO_CIVIL_OPTIONS } from '../consultas/solicitudIngresoSchema';
import { COMUNAS_RM, AFP_OPTIONS, SALUD_OPTIONS, toSelectOptions } from '../../config/catalogosPersonales';

interface Props {
    /**
     * `register`/`errors`/`control` del form padre. `any` a propósito: lo comparten tres
     * schemas distintos (solicitud, aprobación, WorkerForm) y `UseFormRegister<T>` es
     * contravariante en T — con `FieldValues` no compila ninguno de los tres.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ver docblock
    register: UseFormRegister<any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ver docblock
    errors: FieldErrors<any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ver docblock
    control: Control<any>;
    /** false cuando el form padre ya tiene su propio campo Teléfono (WorkerForm). */
    incluirTelefono?: boolean;
}

const msg = (e: unknown): string | undefined => (e as { message?: string } | undefined)?.message;

/**
 * Los 8 campos "Datos personales" de la ficha de ingreso (todos opcionales),
 * con los MISMOS controles en la solicitud de terreno, la revisión de oficina y
 * la ficha del trabajador. Estado civil / AFP / salud = select fijo; comuna =
 * selector con buscador (52 comunas RM). Un valor legado en texto libre (fichas
 * anteriores a los catálogos, 2026-09-08) se conserva como opción extra para no
 * perderlo al re-guardar. Espera que el schema del padre incluya `datosPersonalesSchema`.
 */
export const DatosPersonalesFields: React.FC<Props> = ({ register, errors, control, incluirTelefono = true }) => {
    // Valores actuales solo para inyectar el legado como opción (no re-renderiza los inputs).
    const [comunaActual, afpActual, saludActual] = useWatch({ control, name: ['comuna', 'afp', 'salud'] }) as (string | undefined)[];

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
                label="Fecha de nacimiento"
                type="date"
                error={msg(errors.fecha_nacimiento)}
                {...register('fecha_nacimiento')}
            />
            <Select
                label="Estado civil"
                options={[...ESTADO_CIVIL_OPTIONS]}
                error={msg(errors.estado_civil)}
                {...register('estado_civil')}
            />
            <div className="md:col-span-2">
                <Input
                    label="Dirección"
                    placeholder="Calle, número, depto."
                    autoComplete="off"
                    error={msg(errors.direccion)}
                    {...register('direccion')}
                />
            </div>
            <Controller
                name="comuna"
                control={control}
                render={({ field: { onChange, value, ref } }) => (
                    <SearchableSelect
                        ref={ref}
                        label="Comuna"
                        options={toSelectOptions(COMUNAS_RM, comunaActual)}
                        placeholder="Buscar comuna..."
                        error={msg(errors.comuna)}
                        value={value || null}
                        onChange={(val) => onChange(val ? String(val) : '')}
                    />
                )}
            />
            <Input
                label="Nacionalidad"
                placeholder="Ej: Chilena"
                error={msg(errors.nacionalidad)}
                {...register('nacionalidad')}
            />
            <Select
                label="AFP"
                options={toSelectOptions(AFP_OPTIONS, afpActual)}
                error={msg(errors.afp)}
                {...register('afp')}
            />
            <Select
                label="Salud"
                options={toSelectOptions(SALUD_OPTIONS, saludActual)}
                error={msg(errors.salud)}
                {...register('salud')}
            />
            {incluirTelefono && (
                <Input
                    label="Teléfono"
                    type="tel"
                    inputMode="tel"
                    placeholder="+56 9 1234 5678"
                    error={msg(errors.telefono)}
                    {...register('telefono')}
                />
            )}
            <Input
                label="Cargas familiares"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                placeholder="0"
                error={msg(errors.cargas_familiares)}
                {...register('cargas_familiares')}
            />
        </div>
    );
};
