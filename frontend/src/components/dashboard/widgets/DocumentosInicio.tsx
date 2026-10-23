import React from 'react';
import { ChevronRight, FileCheck2, FileWarning } from 'lucide-react';
import { NumeroRodante } from '../../ui/NumeroRodante';
import { cn } from '../../../utils/cn';
import { EncabezadoTarjeta, CifraTarjeta } from './EncabezadoTarjeta';
import { useTarjetaActiva } from './tarjetaActiva';
import { BotonVerMas } from './BotonVerMas';
import type { PasoFlujo } from './pasosFlujoDocumentos';
import type { ResumenDocumentosInicio } from './resumenDocumentosInicio';

/**
 * Tarjeta «Gestiones» del Inicio para quien registra entregas (RRHH) — documentos físicos por firmar
 * (dueño 2026-10-20): lo que RRHH mira primero en Gestiones → Documentos físicos. Arriba lo atrasado
 * (cifra + etapas donde se atasca, rojo si hay críticos); abajo, dónde están los papeles ahora, con los
 * mismos puntos de color que los carriles del tablero (ámbar = en oficina, azul = en terreno). «Ver más»
 * abre debajo el detalle de Gestiones; cada píldora de etapa lo abre directo en su paso (dueño 2026-10-23).
 */
interface Props {
    resumen: ResumenDocumentosInicio;
    activo: boolean;
    onVerMas: () => void;
    onEtapa: (paso: PasoFlujo['key']) => void;
}

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

const Lugar: React.FC<{ punto: string; titulo: string; valor: number | null; unidad: string }> = ({ punto, titulo, valor, unidad }) => (
    <div className="min-w-0 rounded-2xl bg-muted/60 px-3 py-2.5">
        <p className="flex items-center gap-1.5 text-caption font-semibold text-muted-foreground">
            <span className={cn('h-2 w-2 shrink-0 rounded-full', punto)} aria-hidden />
            <span className="min-w-0 break-words">{titulo}</span>
        </p>
        <p className="mt-1.5 text-2xl font-bold leading-none tabular-nums text-foreground">
            {valor === null ? '—' : <NumeroRodante value={valor} />}
        </p>
        <p className="mt-1 text-caption text-muted-foreground">{unidad}</p>
    </div>
);

const DocumentosInicio: React.FC<Props> = ({ resumen: r, activo, onVerMas, onEtapa }) => {
    const n = r.fueraDePlazo;
    const sobreVerde = useTarjetaActiva();
    return (
        <div className="flex h-full flex-col">
            <EncabezadoTarjeta
                icon={r.tono === 'verde' ? FileCheck2 : FileWarning}
                tono={r.tono}
                titulo="Gestiones"
                subtitulo="Documentos físicos: por firmar y dónde están"
                extra={r.criticos > 0 && (
                    <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums', sobreVerde ? 'bg-white text-red-700' : 'bg-red-600 text-white')}>
                        {r.criticos} {plural(r.criticos, 'crítico', 'críticos')}
                    </span>
                )}
            />
            <CifraTarjeta
                valor={n}
                etiqueta={`${plural(n ?? 0, 'documento', 'documentos')} fuera de plazo`}
                tono={r.tono}
            />

            {r.etapas.length > 0 ? (
                <ul className="flex flex-wrap gap-1.5" aria-label="Dónde se atrasan">
                    {r.etapas.map(e => (
                        <li key={e.clave}>
                            {/* eslint-disable-next-line no-restricted-syntax -- píldora de etapa: abre el detalle en su paso */}
                            <button type="button" onClick={() => onEtapa(e.paso)}
                                aria-label={`${e.texto}: ${e.total}. Ver en el detalle`}
                                className={cn('flex min-h-8 items-center gap-1.5 rounded-lg py-1 pl-2.5 pr-1.5 text-xs font-medium transition-colors',
                                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40',
                                    e.critico
                                        ? 'bg-red-50 text-red-800 hover:bg-red-100 dark:bg-red-500/15 dark:text-red-200 dark:hover:bg-red-500/25'
                                        : 'bg-amber-50 text-amber-800 hover:bg-amber-100 dark:bg-amber-500/15 dark:text-amber-200 dark:hover:bg-amber-500/25')}>
                                {e.texto}
                                <span className="font-bold tabular-nums">{e.total}</span>
                                <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                            </button>
                        </li>
                    ))}
                </ul>
            ) : n === 0 && (
                <p className="text-sm text-muted-foreground">Ningún documento pasó su plazo de firma.</p>
            )}

            <div className="mt-5">
                <p className="mb-2 text-micro font-bold uppercase tracking-wider text-muted-foreground">Dónde están ahora</p>
                <div className="grid grid-cols-3 gap-2">
                    <Lugar punto="bg-muted-foreground/50" titulo="Impresos" valor={r.impresosSinAsignar} unidad="sin lote" />
                    <Lugar punto="bg-amber-500" titulo="En oficina" valor={r.lotesEnOficina}
                        unidad={plural(r.lotesEnOficina ?? 0, 'lote por retirar', 'lotes por retirar')} />
                    <Lugar punto="bg-blue-500" titulo="En terreno" valor={r.lotesEnTerreno}
                        unidad={plural(r.lotesEnTerreno ?? 0, 'lote firmándose', 'lotes firmándose')} />
                </div>
            </div>

            <div className="mt-auto flex justify-end pt-4">
                <BotonVerMas activo={activo} onClick={onVerMas} modulo="Gestiones" />
            </div>
        </div>
    );
};

export default DocumentosInicio;
