import React from 'react';
import { ArrowRight, FileText, PackageCheck } from 'lucide-react';

import { cn } from '../../../utils/cn';
import { Button } from '../../ui/Button';
import { EncabezadoTarjeta, CifraTarjeta } from './EncabezadoTarjeta';
import { BotonVerMas } from './BotonVerMas';
import { BarraTenencia } from '../../documentos-fisicos/BarraTenencia';
import { diaCorto, type LoteConDocumentos, type MisLotesRespuesta } from '../../documentos-fisicos/documentosFisicos';
import type { ResumenTusDocumentos } from './resumenTusDocumentos';

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

const PUNTO = { rojo: 'bg-red-600', ambar: 'bg-amber-500', neutro: 'bg-muted-foreground/40', verde: 'bg-green-600' } as const;
const CIFRA = { rojo: 'text-red-700 dark:text-red-400', ambar: 'text-amber-700 dark:text-amber-300', neutro: 'text-foreground', verde: 'text-green-700 dark:text-green-400' } as const;

/**
 * Tarjeta «Tus documentos» del Inicio del PORTADOR (dueño 2026-10-21): va primero en su Inicio y dice qué
 * lo espera en oficina, qué tiene en sus manos (con la tenencia de 4 días hábiles) y qué devolvió esta
 * semana. Reemplaza al cartel de atrasos (la ventana del inicio de sesión avisa los vencidos).
 */
export const TusDocumentosInicio: React.FC<{ resumen: ResumenTusDocumentos | null; activo: boolean; onVerMas: () => void }> = ({ resumen: r, activo, onVerMas }) => (
    <div className="flex h-full flex-col">
        <EncabezadoTarjeta icon={FileText} tono={r?.tono ?? 'neutro'} titulo="Tus documentos" subtitulo="Para llevar a firmar y devolver a RRHH" />
        <CifraTarjeta valor={r ? r.porEntregar : null} etiqueta={`${plural(r?.porEntregar ?? 0, 'documento', 'documentos')} por entregar`} tono={r?.tono ?? 'neutro'} />
        {r && (
            <ul className="divide-y divide-border border-t border-border">
                {r.filas.map(f => (
                    <li key={f.clave} className="flex items-center gap-3 py-2.5">
                        <span className={cn('h-2 w-2 shrink-0 rounded-full', PUNTO[f.tono])} aria-hidden />
                        <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold text-foreground break-words">{f.titulo}</span>
                            <span className="block text-xs text-muted-foreground break-words">{f.sub}</span>
                        </span>
                        <span className={cn('text-xl font-bold tabular-nums', CIFRA[f.tono])}>{f.n}</span>
                    </li>
                ))}
            </ul>
        )}
        <div className="mt-auto flex justify-end pt-4">
            <BotonVerMas activo={activo} onClick={onVerMas} modulo="Tus documentos" />
        </div>
    </div>
);

const TarjetaLote: React.FC<{ l: LoteConDocumentos; enMano: boolean }> = ({ l, enMano }) => (
    <article className={cn('rounded-2xl border bg-card p-4',
        l.tenencia?.atrasado ? 'border-red-300 dark:border-red-800/70' : enMano ? 'border-border' : 'border-amber-300 dark:border-amber-700/70')}>
        <h4 className="text-base font-semibold text-foreground">Lote #{l.id} · {l.total} {plural(l.total, 'documento', 'documentos')}</h4>
        <p className="text-xs text-muted-foreground">
            {enMano
                ? (l.retirado_en ? `Lo retiraste el ${diaCorto(l.retirado_en)}` : 'En terreno')
                : `Listo desde el ${diaCorto(l.creado_en)}${l.creado_por_nombre ? ` · lo preparó ${l.creado_por_nombre}` : ''}`}
        </p>
        {enMano && l.tenencia && <BarraTenencia t={l.tenencia} />}
        <ul className="mt-3 space-y-1">
            {l.documentos.map(d => (
                <li key={d.id} className="rounded-lg bg-muted/60 px-2.5 py-1.5 text-xs">
                    <span className="font-semibold text-foreground break-words">{d.tipo_nombre || d.nombre_archivo}</span>
                    <span className="text-muted-foreground break-words"> · {d.trabajador_nombre || '(sin trabajador)'}{d.obra_nombre ? ` · ${d.obra_nombre}` : ''}</span>
                </li>
            ))}
        </ul>
    </article>
);

/** Detalle de «Tus documentos»: en tus manos (con tenencia) y lo que te espera en oficina. */
export const DetalleTusDocumentos: React.FC<{ mis: MisLotesRespuesta; onIr: () => void }> = ({ mis, onIr }) => (
    <div className="space-y-6">
        <section>
            <h3 className="mb-3 text-section font-bold text-foreground">En tus manos · llévalos a firmar y devuélvelos</h3>
            {mis.en_mano.length === 0
                ? <p className="text-sm text-muted-foreground">No tienes documentos en terreno.</p>
                : <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">{mis.en_mano.map(l => <TarjetaLote key={l.id} l={l} enMano />)}</div>}
        </section>
        <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-section font-bold text-foreground">Te esperan en la oficina</h3>
                {mis.en_oficina.length > 0 && (
                    <Button size="sm" leftIcon={<PackageCheck className="h-4 w-4" />} onClick={onIr}>Confirmar retiro</Button>
                )}
            </div>
            {mis.en_oficina.length === 0
                ? <p className="text-sm text-muted-foreground">Nada por retirar.</p>
                : <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">{mis.en_oficina.map(l => <TarjetaLote key={l.id} l={l} enMano={false} />)}</div>}
        </section>
        <p className="text-sm text-muted-foreground">
            {mis.devueltos_semana > 0
                ? `Esta semana devolviste ${mis.devueltos_semana} ${plural(mis.devueltos_semana, 'documento', 'documentos')}.`
                : 'Esta semana aún no devuelves documentos.'}
            {' '}
            <Button variant="ghost" size="sm" rightIcon={<ArrowRight className="h-4 w-4" />} onClick={onIr}>Ir a Documentos físicos</Button>
        </p>
    </div>
);
