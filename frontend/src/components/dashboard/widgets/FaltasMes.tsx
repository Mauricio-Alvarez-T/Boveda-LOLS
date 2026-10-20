import React from 'react';
import { CheckSquare } from 'lucide-react';
import { Chip } from '../../ui/Chip';
import { EncabezadoTarjeta, CifraTarjeta } from './EncabezadoTarjeta';
import { BotonVerMas } from './BotonVerMas';
import { diasFaltas, reglasDe, REGLA_FALTA, type FaltasMesData, type TrabajadorFaltas } from './resumenFaltasMes';

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

/** Una fila de trabajador con faltas reiteradas: nombre, obra · faltas: días, y las reglas que gatilla. */
export const FilaFalta: React.FC<{ t: TrabajadorFaltas; onClick: () => void; conRut?: boolean }> = ({ t, onClick, conRut }) => {
    const dias = diasFaltas(t.fechas, conRut ? 31 : 5);
    return (
        // eslint-disable-next-line no-restricted-syntax -- fila de lista (toda la fila navega)
        <button
            type="button"
            onClick={onClick}
            title={t.alertas.map(a => a.mensaje).join(' · ')}
            className="flex w-full items-start gap-3 border-t border-border py-2.5 text-left transition-colors hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 -mx-2 px-2 rounded-lg"
        >
            <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">
                    {t.apellido_paterno} {t.nombres}
                    {conRut && <span className="ml-2 font-normal text-muted-foreground">{t.rut}</span>}
                </p>
                <p className={conRut ? 'text-xs text-muted-foreground' : 'text-xs text-muted-foreground truncate'}>
                    {[t.obra_nombre, `${t.total_faltas} ${plural(t.total_faltas, 'falta', 'faltas')}${dias ? `: ${dias}` : ''}`].filter(Boolean).join(' · ')}
                </p>
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-1 max-w-[50%]">
                {reglasDe(t).map(r => (
                    <Chip key={r} tone={REGLA_FALTA[r].grave ? 'danger' : 'warning'} label={REGLA_FALTA[r].texto} />
                ))}
            </div>
        </button>
    );
};

interface Props {
    data: FaltasMesData;
    /** «octubre». */
    mes: string;
    /** Abre Asistencia filtrada por el RUT del trabajador. */
    onTrabajador: (rut: string) => void;
    activo: boolean;
    onVerMas: () => void;
}

/** Filas en la tarjeta: lo primero; la lista completa va en el detalle de abajo. */
const MAX_FILAS = 3;

/**
 * Tarjeta «Asistencia» del Inicio (dueño 2026-10-20): trabajadores con faltas injustificadas REITERADAS en
 * el mes calendario (Art. 160 N°3: 2 lunes, 3 o más días o 2 días seguidos), con más faltas arriba. Muestra
 * los 3 primeros; «Ver más» abre debajo el detalle del módulo con la lista completa y el resto de asistencia.
 */
const FaltasMes: React.FC<Props> = ({ data, mes, onTrabajador, activo, onVerMas }) => {
    const n = data.reiterados;
    const visibles = data.lista.slice(0, MAX_FILAS);
    const resto = n - visibles.length;

    return (
        <div className="flex h-full flex-col">
            <EncabezadoTarjeta
                icon={CheckSquare}
                tono={n > 0 ? 'rojo' : 'verde'}
                titulo="Asistencia"
                subtitulo={`Faltas reiteradas de ${mes}: 2 lunes, 3 días o 2 seguidos`}
            />
            <CifraTarjeta
                valor={n}
                etiqueta={`${plural(n, 'trabajador', 'trabajadores')} con faltas reiteradas`}
                tono={n > 0 ? 'rojo' : 'verde'}
            />

            {n === 0 ? (
                <p className="text-sm text-muted-foreground">Nadie tiene faltas reiteradas este mes.</p>
            ) : (
                <div>
                    {visibles.map(t => <FilaFalta key={t.trabajador_id} t={t} onClick={() => onTrabajador(t.rut)} />)}
                </div>
            )}

            <div className="mt-auto flex items-center justify-between gap-3 pt-3">
                <span className="text-xs text-muted-foreground">{resto > 0 ? `y ${resto} más` : ''}</span>
                <BotonVerMas activo={activo} onClick={onVerMas} modulo="Asistencia" />
            </div>
        </div>
    );
};

export default FaltasMes;
