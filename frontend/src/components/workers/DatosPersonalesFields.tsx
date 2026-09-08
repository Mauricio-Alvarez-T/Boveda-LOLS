import React from 'react';
import { Controller, useWatch } from 'react-hook-form';
import type { Control, FieldErrors, UseFormRegister } from 'react-hook-form';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { SearchableSelect } from '../ui/SearchableSelect';
import { ESTADO_CIVIL_OPTIONS } from '../consultas/solicitudIngresoSchema';
import {
    COMUNAS_RM, AFP_OPTIONS, SALUD_OPTIONS, toSelectOptions,
    TALLAS_CALZADO, TALLAS_PANTALON, TALLAS_POLERA,
    BANCOS_CHILE, BANCO_CUENTA_RUT, TIPOS_CUENTA, CUENTA_RUT_OPTIONS,
} from '../../config/catalogosPersonales';

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

/** Subtítulo neutro de bloque (DS: sin tinte; el verde es solo para acción). */
const Subtitulo: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground pt-1">{children}</p>
);

/**
 * Campos opcionales de la ficha de ingreso — 1:1 con la ficha de papel (pedido de
 * oficina 2026-09-08): datos personales, tallas de ropa y pago de remuneraciones.
 * MISMOS controles en la solicitud de terreno, la revisión de oficina y la ficha
 * del trabajador. Estado civil / AFP / salud / tallas / banco = select fijo; comuna =
 * selector con buscador (52 comunas RM). Un valor legado en texto libre se conserva
 * como opción extra para no perderlo al re-guardar.
 *
 * Pago: primera pregunta "¿Cuenta RUT?". Sí → nada más (BancoEstado / vista / N° =
 * RUT sin DV, lo fija el backend). No → banco + tipo (vista | corriente, excluyentes)
 * + número. Espera que el schema del padre incluya `datosPersonalesSchema`.
 */
export const DatosPersonalesFields: React.FC<Props> = ({ register, errors, control, incluirTelefono = true }) => {
    // Valores actuales: legado como opción extra + ramas del bloque de pago.
    const [comunaActual, afpActual, saludActual, bancoActual, cuentaRut] = useWatch({
        control, name: ['comuna', 'afp', 'salud', 'banco', 'cuenta_rut'],
    }) as (string | undefined)[];

    return (
        <>
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

            {/* ── Tallas (ficha de papel: calzado / pantalones / poleras) ── */}
            <Subtitulo>Tallas</Subtitulo>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Select
                    label="Calzado"
                    options={toSelectOptions(TALLAS_CALZADO)}
                    error={msg(errors.talla_calzado)}
                    {...register('talla_calzado')}
                />
                <Select
                    label="Pantalón"
                    options={toSelectOptions(TALLAS_PANTALON)}
                    error={msg(errors.talla_pantalon)}
                    {...register('talla_pantalon')}
                />
                <Select
                    label="Polera"
                    options={toSelectOptions(TALLAS_POLERA)}
                    error={msg(errors.talla_polera)}
                    {...register('talla_polera')}
                />
            </div>

            {/* ── Pago de remuneraciones: primero ¿cuenta RUT?; con "No" se despliega el banco ── */}
            <Subtitulo>Pago de remuneraciones</Subtitulo>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Select
                    label="¿Paga a cuenta RUT?"
                    options={[...CUENTA_RUT_OPTIONS]}
                    error={msg(errors.cuenta_rut)}
                    {...register('cuenta_rut')}
                />
                {cuentaRut === 'si' && (
                    <p className="text-xs text-muted-foreground self-end pb-3 md:pb-3.5">
                        Cuenta RUT {BANCO_CUENTA_RUT} · N° de cuenta = RUT del trabajador sin dígito verificador (se completa solo).
                    </p>
                )}
                {cuentaRut === 'no' && (
                    <>
                        <Select
                            label="Banco"
                            options={toSelectOptions(BANCOS_CHILE, bancoActual)}
                            error={msg(errors.banco)}
                            {...register('banco')}
                        />
                        <fieldset className="w-full space-y-1.5">
                            <legend className="text-sm font-medium text-muted-foreground ml-0.5">Tipo de cuenta</legend>
                            <div className="flex h-11 items-center gap-6 px-1">
                                {TIPOS_CUENTA.map(t => (
                                    <label key={t.value} className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                                        <input
                                            type="radio"
                                            value={t.value}
                                            className="h-4 w-4 border-border text-brand-primary focus:ring-brand-primary cursor-pointer"
                                            {...register('tipo_cuenta')}
                                        />
                                        {t.label}
                                    </label>
                                ))}
                            </div>
                            {msg(errors.tipo_cuenta) && (
                                <p className="text-xs text-destructive ml-0.5">{msg(errors.tipo_cuenta)}</p>
                            )}
                        </fieldset>
                        <Input
                            label="Número de cuenta"
                            inputMode="numeric"
                            autoComplete="off"
                            placeholder="Ej: 12345678"
                            error={msg(errors.numero_cuenta)}
                            {...register('numero_cuenta')}
                        />
                    </>
                )}
            </div>
        </>
    );
};
