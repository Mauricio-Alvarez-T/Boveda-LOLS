import React from 'react';
import { UserCheck, UserX } from 'lucide-react';
import { Chip } from '../../ui/Chip';
import { Button } from '../../ui/Button';
import { EncabezadoTarjeta, CifraTarjeta } from './EncabezadoTarjeta';
import { diasFaltas, tonoFaltas, type FaltasMesData } from './resumenFaltasMes';

interface Props {
    data: FaltasMesData;
    /** «octubre». */
    mes: string;
    /** Abre Asistencia filtrada por el RUT del trabajador. */
    onTrabajador: (rut: string) => void;
    onNavigate: () => void;
}

/** Filas visibles antes de cortar con «y N más» (misma medida que Vehículos). */
const MAX_FILAS = 5;

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

/**
 * Faltas del mes — cuarta tarjeta del Inicio (pedido del dueño 2026-10-20). Antes del Inicio H había un
 * widget de «alertas de inasistencia» siempre visible; con el H solo quedó la cifra de reiterados en la
 * tarjeta verde y, si daba 0, no se veía a nadie. Esta tarjeta lista a TODOS los que faltaron en el mes
 * (falta injustificada, F), con más faltas arriba, en qué obra y qué días. En rojo los reiterados del
 * Art. 160 N°3 (2 seguidas, 2 lunes o 3 en el mes); en ámbar las faltas sueltas.
 */
const FaltasMes: React.FC<Props> = ({ data, mes, onTrabajador, onNavigate }) => {
    const tono = tonoFaltas(data);
    const visibles = data.lista.slice(0, MAX_FILAS);
    const resto = data.trabajadores - visibles.length;

    return (
        <div className="flex h-full flex-col">
            <EncabezadoTarjeta
                icon={data.trabajadores > 0 ? UserX : UserCheck}
                tono={tono}
                titulo="Faltas del mes"
                subtitulo={`Faltas injustificadas de ${mes}`}
                extra={data.reiteradas > 0 && (
                    <span className="rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-bold tabular-nums text-white">
                        {data.reiteradas} {plural(data.reiteradas, 'reiterado', 'reiterados')}
                    </span>
                )}
            />
            <CifraTarjeta
                valor={data.trabajadores}
                etiqueta={`${plural(data.trabajadores, 'trabajador', 'trabajadores')} con faltas${data.faltas > 0 ? ` · ${data.faltas} ${plural(data.faltas, 'falta', 'faltas')}` : ''}`}
                tono={tono}
            />

            {data.trabajadores === 0 ? (
                <p className="text-sm text-muted-foreground">Nadie tiene faltas injustificadas este mes.</p>
            ) : (
                <>
                    <div>
                        {visibles.map(t => {
                            const reiterado = t.alertas.length > 0;
                            const dias = diasFaltas(t.fechas);
                            return (
                                // eslint-disable-next-line no-restricted-syntax -- fila de lista (toda la fila navega)
                                <button
                                    key={t.trabajador_id}
                                    type="button"
                                    onClick={() => onTrabajador(t.rut)}
                                    title={reiterado ? t.alertas.map(a => a.mensaje).join(' · ') : undefined}
                                    className="flex w-full items-center gap-3 border-t border-border py-2.5 text-left transition-colors hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 -mx-2 px-2 rounded-lg"
                                >
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-foreground truncate">
                                            {t.apellido_paterno} {t.nombres}
                                        </p>
                                        <p className="text-xs text-muted-foreground truncate">
                                            {[t.obra_nombre, dias].filter(Boolean).join(' · ') || t.rut}
                                        </p>
                                    </div>
                                    <Chip
                                        tone={reiterado ? 'danger' : 'warning'}
                                        label={`${t.total_faltas} ${plural(t.total_faltas, 'falta', 'faltas')}`}
                                        className="shrink-0"
                                    />
                                </button>
                            );
                        })}
                    </div>
                    <p className="mt-2 text-caption text-muted-foreground">
                        En rojo: 2 seguidas, 2 lunes o 3 en el mes (Art. 160 N°3).
                    </p>
                </>
            )}

            <div className="mt-auto flex items-center justify-between gap-3 pt-3">
                <span className="text-xs text-muted-foreground">{resto > 0 ? `y ${resto} más` : ''}</span>
                <Button variant="link" size="sm" onClick={onNavigate} className="text-green-700 dark:text-green-300">
                    Ir a Asistencia
                </Button>
            </div>
        </div>
    );
};

export default FaltasMes;
