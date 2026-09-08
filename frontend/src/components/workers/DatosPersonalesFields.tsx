import React from 'react';
import type { FieldErrors, UseFormRegister } from 'react-hook-form';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { ESTADO_CIVIL_OPTIONS } from '../consultas/solicitudIngresoSchema';

interface Props {
    /**
     * `register`/`errors` del form padre. `any` a propósito: lo comparten tres schemas
     * distintos (solicitud, aprobación, WorkerForm) y `UseFormRegister<T>` es
     * contravariante en T — con `FieldValues` no compila ninguno de los tres.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ver docblock
    register: UseFormRegister<any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ver docblock
    errors: FieldErrors<any>;
    /** false cuando el form padre ya tiene su propio campo Teléfono (WorkerForm). */
    incluirTelefono?: boolean;
}

const msg = (e: unknown): string | undefined => (e as { message?: string } | undefined)?.message;

/**
 * Los 8 campos "Datos personales" de la ficha de ingreso (todos opcionales),
 * con los MISMOS controles en la solicitud de terreno, la revisión de oficina y
 * la ficha del trabajador. Estado civil = select fijo; AFP/salud = texto (no hay
 * catálogo). Espera que el schema del padre incluya `datosPersonalesSchema`.
 */
export const DatosPersonalesFields: React.FC<Props> = ({ register, errors, incluirTelefono = true }) => (
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
        <Input
            label="Comuna"
            placeholder="Ej: Maipú"
            error={msg(errors.comuna)}
            {...register('comuna')}
        />
        <Input
            label="Nacionalidad"
            placeholder="Ej: Chilena"
            error={msg(errors.nacionalidad)}
            {...register('nacionalidad')}
        />
        <Input
            label="AFP"
            placeholder="Ej: Modelo, Habitat"
            error={msg(errors.afp)}
            {...register('afp')}
        />
        <Input
            label="Salud"
            placeholder="FONASA / ISAPRE"
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
