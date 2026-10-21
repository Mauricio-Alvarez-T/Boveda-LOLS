import React from 'react';
import { ArrowRight, Plus, UserPlus } from 'lucide-react';

import { cn } from '../../../utils/cn';
import { Button } from '../../ui/Button';
import { EncabezadoTarjeta, CifraTarjeta } from './EncabezadoTarjeta';
import { BotonVerMas } from './BotonVerMas';
import type { FilaSolicitud, GrupoSolicitud, ResumenTusSolicitudes } from './resumenTusSolicitudes';

const CHIP = {
    rojo: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300',
    ambar: 'bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200',
    neutro: 'bg-muted text-foreground',
    verde: 'bg-green-50 text-green-800 dark:bg-green-500/15 dark:text-green-200',
} as const;
const NOTA = { rojo: 'text-red-700 dark:text-red-300', ambar: 'text-amber-800 dark:text-amber-300', neutro: 'text-muted-foreground', verde: 'text-green-700 dark:text-green-400' } as const;

/**
 * Tarjeta «Tus solicitudes de ingreso» del Inicio del perfil terreno (dueño 2026-10-21): cuántas esperan
 * revisión y las que piden atención primero (rechazadas, luego las más antiguas), con «+ Nuevo ingreso».
 */
export const TusSolicitudesInicio: React.FC<{ resumen: ResumenTusSolicitudes | null; activo: boolean; onVerMas: () => void; onNuevo: () => void }> = ({ resumen: r, activo, onVerMas, onNuevo }) => (
    <div className="flex h-full flex-col">
        <EncabezadoTarjeta icon={UserPlus} tono={r?.tono ?? 'neutro'} titulo="Tus solicitudes de ingreso" subtitulo="Fichas que enviaste a RRHH" />
        <CifraTarjeta valor={r ? r.pendientes : null} etiqueta="esperando revisión" tono={r?.tono ?? 'neutro'} />
        {r && r.filas.length === 0 && <p className="text-sm text-muted-foreground">No tienes solicitudes en curso.</p>}
        {r && r.filas.length > 0 && (
            <ul className="divide-y divide-border border-t border-border">
                {r.filas.map(f => (
                    <li key={f.id} className="flex items-center gap-2.5 py-2">
                        <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold text-foreground break-words">{f.nombre}</span>
                            <span className={cn('block text-xs break-words', f.grupo === 'pendiente' ? 'text-muted-foreground' : NOTA[f.tono])}>
                                {f.grupo === 'pendiente' ? f.detalle || f.nota : f.nota}
                            </span>
                        </span>
                        <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', CHIP[f.tono])}>{f.chip}</span>
                    </li>
                ))}
            </ul>
        )}
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4">
            <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={(e) => { e.stopPropagation(); onNuevo(); }}>Nuevo ingreso</Button>
            <BotonVerMas activo={activo} onClick={onVerMas} modulo="Tus solicitudes" />
        </div>
    </div>
);

const GRUPOS: { g: GrupoSolicitud; titulo: string; acento: string; vacio: string }[] = [
    { g: 'rechazada', titulo: 'Rechazadas: revisa el motivo', acento: 'border-t-red-600', vacio: 'Ninguna rechazada.' },
    { g: 'pendiente', titulo: 'Esperando revisión', acento: 'border-t-amber-500', vacio: 'Nada esperando revisión.' },
    { g: 'aprobada', titulo: 'Aprobadas (últimos 30 días)', acento: 'border-t-green-700', vacio: 'Ninguna aprobada en los últimos 30 días.' },
];

/** Detalle: todas tus solicitudes por estado, en tres columnas. */
export const DetalleTusSolicitudes: React.FC<{ resumen: ResumenTusSolicitudes; onIr: () => void }> = ({ resumen: r, onIr }) => (
    <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {GRUPOS.map(({ g, titulo, acento, vacio }) => {
                const filas: FilaSolicitud[] = r.grupos[g];
                return (
                    <section key={g} className={cn('overflow-hidden rounded-2xl border border-border border-t-4 bg-card', acento)}>
                        <header className="flex items-baseline justify-between gap-3 px-4 py-3">
                            <h4 className="text-sm font-bold text-foreground">{titulo}</h4>
                            <span className="text-xl font-bold tabular-nums text-foreground">{filas.length}</span>
                        </header>
                        {filas.length === 0
                            ? <p className="border-t border-border px-4 py-4 text-sm text-muted-foreground">{vacio}</p>
                            : (
                                <ul>
                                    {filas.map(f => (
                                        <li key={f.id} className="border-t border-border px-4 py-2.5">
                                            <span className="block text-sm font-semibold text-foreground break-words">{f.nombre}</span>
                                            {f.detalle && <span className="block text-xs text-muted-foreground break-words">{f.detalle}</span>}
                                            <span className={cn('mt-1 block text-xs break-words', NOTA[f.tono])}>{f.nota}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                    </section>
                );
            })}
        </div>
        <div className="flex justify-end">
            <Button variant="ghost" size="sm" rightIcon={<ArrowRight className="h-4 w-4" />} onClick={onIr}>Ir a Solicitudes</Button>
        </div>
    </div>
);
