/**
 * Completar los datos personales que el contrato imprime y la ficha del trabajador no tiene
 * (plan Gestiones B2b). Aparece dentro del modal de emisión: el dueño pidió que se pidan ahí mismo
 * en vez de mandar al usuario a editar al trabajador y volver.
 *
 * Controles propios en vez de `DatosPersonalesFields`: ese componente exige `register`/`errors`/
 * `control` de react-hook-form y estos modales usan `useState` plano. Los catálogos (comunas y
 * estados civiles) sí se reutilizan, así que las opciones son las mismas de la ficha.
 */
import React from 'react';
import { AlertTriangle, Lock } from 'lucide-react';

import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { SearchableSelect } from '../ui/SearchableSelect';
import { ESTADO_CIVIL_OPTIONS } from '../consultas/solicitudIngresoSchema';
import { COMUNAS_RM, toSelectOptions } from '../../config/catalogosPersonales';
import { LABEL_CAMPO_CONTRATO, MAXLEN_CAMPO_CONTRATO, hoyYmd, type CampoContrato } from './documentosLaborales';

interface Props {
    /** Campos que faltan, en el orden en que salen impresos. */
    faltan: CampoContrato[];
    valores: Partial<Record<CampoContrato, string>>;
    onChange: (campo: CampoContrato, valor: string) => void;
    /** Sin `trabajadores.editar` no se pueden guardar: se muestra en solo lectura. */
    puedeEditar: boolean;
    /** Mensaje de error por campo (validación previa al envío). */
    errores?: Partial<Record<CampoContrato, string>>;
}

const CAJA_AMBAR = 'rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800/60 dark:bg-amber-500/10 dark:text-amber-300';

export const CompletarDatosContrato: React.FC<Props> = ({ faltan, valores, onChange, puedeEditar, errores = {} }) => {
    if (!faltan.length) return null;
    const err = (c: CampoContrato) => errores[c];
    const val = (c: CampoContrato) => valores[c] ?? '';
    const nombres = faltan.map(c => LABEL_CAMPO_CONTRATO[c].toLowerCase()).join(', ');

    if (!puedeEditar) {
        return (
            <div role="alert" className={CAJA_AMBAR}>
                <p className="flex items-start gap-2 font-bold">
                    <Lock className="h-4 w-4 mt-0.5 shrink-0" />
                    El contrato necesita datos que la ficha no tiene: {nombres}.
                </p>
                <p className="mt-1 text-xs">
                    Tu rol no puede editar trabajadores. Pide a administración que los complete en la ficha, o
                    desmarca el contrato y emite el resto del kit.
                </p>
            </div>
        );
    }

    return (
        <div role="group" className={CAJA_AMBAR}>
            <p className="flex items-start gap-2 font-bold">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                El contrato necesita estos datos y la ficha no los tiene
            </p>
            <p className="mt-0.5 text-xs">
                Complétalos aquí: quedan guardados en la ficha del trabajador y el contrato sale sin espacios en blanco.
            </p>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {faltan.includes('nacionalidad') && (
                    <Input label="Nacionalidad" placeholder="Ej: Chilena" value={val('nacionalidad')} maxLength={MAXLEN_CAMPO_CONTRATO.nacionalidad}
                        error={err('nacionalidad')} onChange={e => onChange('nacionalidad', e.target.value)} />
                )}
                {faltan.includes('estado_civil') && (
                    <Select label="Estado civil" value={val('estado_civil')} error={err('estado_civil')}
                        onChange={e => onChange('estado_civil', e.target.value)}
                        options={[{ value: '', label: 'Seleccionar…' }, ...ESTADO_CIVIL_OPTIONS.map(o => ({ value: o.value, label: o.label }))]} />
                )}
                {faltan.includes('fecha_nacimiento') && (
                    <Input label="Fecha de nacimiento" type="date" max={hoyYmd()} value={val('fecha_nacimiento')}
                        error={err('fecha_nacimiento')} onChange={e => onChange('fecha_nacimiento', e.target.value)} />
                )}
                {faltan.includes('comuna') && (
                    <SearchableSelect label="Comuna" placeholder="Buscar comuna..." value={val('comuna')}
                        error={err('comuna')} options={toSelectOptions(COMUNAS_RM, val('comuna'))}
                        onChange={v => onChange('comuna', v == null ? '' : String(v))} />
                )}
                {faltan.includes('direccion') && (
                    <div className="sm:col-span-2">
                        <Input label="Dirección" placeholder="Calle, número, depto." value={val('direccion')} maxLength={MAXLEN_CAMPO_CONTRATO.direccion}
                            error={err('direccion')} onChange={e => onChange('direccion', e.target.value)} />
                    </div>
                )}
            </div>
        </div>
    );
};
