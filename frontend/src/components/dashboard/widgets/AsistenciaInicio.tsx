import React from 'react';
import { CheckSquare } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { NumeroRodante } from '../../ui/NumeroRodante';
import { EncabezadoTarjeta } from './EncabezadoTarjeta';
import { CIFRA_SOBRE_VERDE, useTarjetaActiva, type TonoTarjeta } from './tarjetaActiva';
import { BotonVerMas } from './BotonVerMas';
import { ordenarReiterados, reglasDe, REGLA_FALTA, type FaltasMesData } from './resumenFaltasMes';
import { desgloseAusentes, listaObras, segmentosObras, type AusentesHoy, type ObrasHoy, type SeccionAsistencia } from './resumenAsistenciaHoy';

interface Props {
    faltas: FaltasMesData | null;
    ausentes: AusentesHoy | null;
    /** null = sin datos de obras (el perfil no ve asistencia por obra). */
    obras: ObrasHoy | null;
    /** «martes 20 de octubre». */
    fechaTexto: string;
    /** «octubre». */
    mesNombre: string;
    onTrabajador: (rut: string) => void;
    onObras: () => void;
    /** Abre el detalle (sin cerrarlo si ya estaba abierto) y lleva a la sección. */
    onSeccion: (s: SeccionAsistencia) => void;
    activo: boolean;
    onVerMas: () => void;
}

const MAX_FILAS = 3;
const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

/** Botón sin aspecto propio dentro de la tarjeta: toda el área navega, con foco visible. */
const ZONA = 'block w-full text-left rounded-lg -mx-2 px-2 transition-colors hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40';

/**
 * Tarjeta «Asistencia» del Inicio, variante «Pulso del día» con la tira del mes (dueño 2026-10-20, elegida
 * en el lienzo de bocetos). Arriba cuántas obras guardaron hoy; luego ausentes de hoy y faltas reiteradas
 * del mes (Art. 160 N°3); abajo los 3 reiterados más urgentes con su regla. La tira del mes por
 * trabajador vive solo en el detalle: en la tarjeta saturaba (dueño 2026-10-20, fiel al boceto B).
 */
const AsistenciaInicio: React.FC<Props> = ({
    faltas, ausentes, obras, fechaTexto, mesNombre,
    onTrabajador, onObras, onSeccion, activo, onVerMas,
}) => {
    const sobreVerde = useTarjetaActiva();
    const reiterados = faltas?.reiterados ?? 0;
    const pendientesObras = obras && !obras.finDeSemana ? obras.sinGuardar.length : 0;
    const tono: TonoTarjeta = reiterados > 0 ? 'rojo' : pendientesObras > 0 ? 'ambar' : 'verde';
    const filas = faltas ? ordenarReiterados(faltas.lista).slice(0, MAX_FILAS) : [];
    const resto = reiterados - filas.length;
    const segmentos = obras ? segmentosObras(obras.total, obras.guardadas) : null;
    const desglose = ausentes ? desgloseAusentes(ausentes.porEstado) : '';

    const relleno = sobreVerde ? 'bg-white' : 'bg-green-700 dark:bg-green-400';
    const vacio = sobreVerde ? 'bg-yellow-300' : 'bg-amber-500';
    const avisoTexto = sobreVerde ? 'text-white' : 'text-amber-700 dark:text-amber-300';
    const cifraAlerta = sobreVerde ? CIFRA_SOBRE_VERDE.rojo : 'text-red-700 dark:text-red-300';
    // Etiqueta de la regla, como en el boceto B: pequeña y en minúsculas. Rojo solo «2 días seguidos»;
    // sobre la tarjeta verde, fondo blanco (el color del texto conserva el significado).
    const pildora = (grave: boolean) => sobreVerde
        ? cn('bg-white', grave ? 'text-red-700' : 'text-green-800')
        : grave ? 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300' : 'bg-muted text-zinc-700 dark:text-zinc-300';

    return (
        <div className="flex h-full flex-col">
            <EncabezadoTarjeta icon={CheckSquare} tono={tono} titulo="Asistencia" subtitulo={`Hoy · ${fechaTexto}`} />

            {obras && obras.total > 0 && (
                // eslint-disable-next-line no-restricted-syntax -- zona de la tarjeta (todo el bloque navega)
                <button type="button" onClick={onObras} className={cn(ZONA, 'mb-4 py-1')}>
                    <span className="mb-2 flex items-baseline justify-between gap-2">
                        <span className="text-xs text-muted-foreground">Asistencia guardada</span>
                        <span className="text-sm font-semibold tabular-nums text-foreground">
                            {obras.guardadas} de {obras.total} {plural(obras.total, 'obra', 'obras')}
                        </span>
                    </span>
                    {segmentos ? (
                        <span className="flex gap-[3px]" aria-hidden>
                            {segmentos.map((lleno, i) => (
                                <span key={i} className={cn('h-2 flex-1 rounded-[3px] transition-colors duration-200', lleno ? relleno : vacio)} />
                            ))}
                        </span>
                    ) : (
                        <span className={cn('block h-2 overflow-hidden rounded-full', vacio)} aria-hidden>
                            <span className={cn('block h-full rounded-full', relleno)} style={{ width: `${(obras.guardadas / obras.total) * 100}%` }} />
                        </span>
                    )}
                    <span className={cn('mt-2 flex items-center gap-1.5 text-xs font-medium',
                        obras.finDeSemana || pendientesObras === 0 ? 'text-muted-foreground' : avisoTexto)}>
                        {pendientesObras > 0 && <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', vacio)} aria-hidden />}
                        <span className="truncate">
                            {obras.finDeSemana ? 'Fin de semana: no se marca'
                                : pendientesObras > 0 ? `Faltan ${listaObras(obras.sinGuardar)}`
                                    : 'Todas las obras guardaron hoy'}
                        </span>
                    </span>
                </button>
            )}

            <div className="mb-3 grid grid-cols-2 border-y border-border">
                {/* eslint-disable-next-line no-restricted-syntax -- zona de la tarjeta */}
                <button type="button" onClick={() => onSeccion('hoy')} className="rounded-lg py-3 pr-3 text-left transition-colors hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40">
                    <NumeroRodante value={ausentes?.total ?? 0} className="text-headline font-bold leading-none tracking-tight text-foreground" />
                    <span className="mt-1.5 block text-xs font-semibold text-foreground">Ausentes hoy</span>
                    <span className="mt-0.5 block truncate text-label text-muted-foreground">{desglose || 'Nadie ha faltado'}</span>
                </button>
                {/* eslint-disable-next-line no-restricted-syntax -- zona de la tarjeta */}
                <button type="button" onClick={() => onSeccion('reiterados')} className="rounded-lg border-l border-border py-3 pl-4 text-left transition-colors hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40">
                    <NumeroRodante value={reiterados} className={cn('text-headline font-bold leading-none tracking-tight', reiterados > 0 ? cifraAlerta : 'text-foreground')} />
                    <span className="mt-1.5 block text-xs font-semibold text-foreground">Faltas reiteradas</span>
                    <span className="mt-0.5 block text-label text-muted-foreground">en {mesNombre}</span>
                </button>
            </div>

            {faltas && filas.length === 0 && (
                <p className="text-sm text-muted-foreground">Nadie con faltas reiteradas en {mesNombre}.</p>
            )}
            {filas.map(t => {
                const regla = reglasDe(t)[0];
                return (
                    // eslint-disable-next-line no-restricted-syntax -- fila de lista (toda la fila navega)
                    <button key={t.trabajador_id} type="button" onClick={() => onTrabajador(t.rut)}
                        title={t.alertas.map(a => a.mensaje).join(' · ')}
                        className={cn(ZONA, 'flex min-h-10 items-center gap-2 py-2')}>
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                            {t.apellido_paterno} {t.nombres}
                        </span>
                        {regla && (
                            <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-label font-semibold', pildora(REGLA_FALTA[regla].grave))}>
                                {REGLA_FALTA[regla].texto}
                            </span>
                        )}
                    </button>
                );
            })}

            <div className="mt-auto flex items-center justify-between gap-3 pt-3">
                <span className="text-xs text-muted-foreground">{resto > 0 ? `y ${resto} más` : ''}</span>
                <BotonVerMas activo={activo} onClick={onVerMas} modulo="Asistencia" />
            </div>
        </div>
    );
};

export default AsistenciaInicio;
