import React, { useEffect, useMemo, useState } from 'react';
import { BellOff, BellRing, ChevronDown, ChevronRight, Monitor, Smartphone } from 'lucide-react';
import {
    avisosEnviados, estadoDelAviso, resumenRecordatorios, type AvisoEnviado, type PersonaRecordatorios,
} from '../../services/avisosCelular';
import { textoIngreso } from './fichaUsuario';

/**
 * Soporte → Errores (solo Super Administrador): el centro de avisos (Marcos 2026-10-27, mig 145).
 *   · Las personas del horario de recordatorios (avisosPendientes.service.js): si ya activaron los avisos en el
 *     celular (y en el computador, quien trabaja ahí) y qué se les mandó hoy. Para saber a quién pedirle que los active.
 *   · Por persona, cada aviso de los últimos 7 días y qué pasó en cada equipo: le llegó (apareció en su equipo), lo
 *     abrió, lo cerró sin abrirlo, no se mostró porque ya tenía Bóveda al frente en el computador, o no salió. Es la
 *     prueba de que la persona fue avisada. No se puede saber si lo leyó sin abrirlo.
 */

const DIAS = 7;

const TONO: Record<ReturnType<typeof estadoDelAviso>['tono'], string> = {
    ok: 'text-green-700 dark:text-green-400',
    espera: 'text-muted-foreground',
    aviso: 'text-amber-700 dark:text-amber-300',
    error: 'text-destructive',
};

const Equipo: React.FC<{ tipo: 'celular' | 'computador'; activos: number }> = ({ tipo, activos }) => (
    <span className={activos > 0 ? 'text-foreground' : 'text-amber-700 dark:text-amber-300'}>
        {tipo === 'celular' ? 'Celular' : 'Computador'}: {activos > 0 ? 'activo' : 'todavía no los activa'}
    </span>
);

export const RecordatoriosAvisos: React.FC = () => {
    const [lista, setLista] = useState<PersonaRecordatorios[] | null>(null);
    const [avisos, setAvisos] = useState<AvisoEnviado[]>([]);
    const [abierta, setAbierta] = useState<number | null>(null);

    useEffect(() => {
        let vivo = true;
        resumenRecordatorios().then(l => { if (vivo) setLista(l); }).catch(() => { if (vivo) setLista([]); });
        avisosEnviados(DIAS).then(a => { if (vivo) setAvisos(a); }).catch(() => { /* sin centro de avisos todavía */ });
        return () => { vivo = false; };
    }, []);

    // Las personas del horario y, al final, quien recibió otros avisos (pruebas, fallas de Soporte).
    const personas = useMemo(() => {
        const base = lista ?? [];
        const ids = new Set(base.map(p => p.id));
        const otros = new Map<number, PersonaRecordatorios>();
        for (const a of avisos) {
            if (!ids.has(a.usuario_id) && !otros.has(a.usuario_id)) {
                otros.set(a.usuario_id, { id: a.usuario_id, nombre: a.nombre, celulares: -1, horas: [], hoy: null });
            }
        }
        return [...base, ...otros.values()];
    }, [lista, avisos]);

    const porPersona = useMemo(() => {
        const m = new Map<number, AvisoEnviado[]>();
        for (const a of avisos) m.set(a.usuario_id, [...(m.get(a.usuario_id) ?? []), a]);
        return m;
    }, [avisos]);

    if (!lista || !personas.length) return null;
    const enHorario = lista.length;
    const activos = lista.filter(p => p.celulares > 0).length;

    return (
        <section aria-label="Centro de avisos" className="rounded-card border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
                <p className="text-sm font-semibold text-brand-dark">Centro de avisos</p>
                <p className="text-xs text-muted-foreground">
                    {activos} de {enHorario} con los avisos activos en el celular · recordatorios de lunes a viernes, sin feriados,
                    solo si tienen algo pendiente · «Le llegó» = apareció en su equipo; «lo abrió» = lo tocó
                </p>
            </div>
            <ul className="divide-y divide-border">
                {personas.map(p => {
                    const suyos = porPersona.get(p.id) ?? [];
                    const enLista = p.celulares >= 0;
                    const abiertaEsta = abierta === p.id;
                    return (
                        <li key={p.id} className="px-4 py-2.5">
                            <div className="flex items-start gap-3">
                                {!enLista ? <BellRing aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                                    : p.celulares > 0
                                        ? <BellRing aria-label="Avisos activos en el celular" className="mt-0.5 h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
                                        : <BellOff aria-label="Sin avisos en el celular" className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />}
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm text-foreground">
                                        <span className="font-medium">{p.nombre}</span>
                                        {p.horas.length > 0 && <span className="text-muted-foreground"> · {p.horas.map(h => `${h}:00`).join(' y ')}</span>}
                                        {!enLista && <span className="text-muted-foreground"> · fuera del horario de recordatorios</span>}
                                    </p>
                                    {enLista && (
                                        <p className="text-xs text-muted-foreground">
                                            <Equipo tipo="celular" activos={p.celulares} />
                                            {(p.usa_computador || (p.computadores ?? 0) > 0) && <> · <Equipo tipo="computador" activos={p.computadores ?? 0} /></>}
                                        </p>
                                    )}
                                    {p.hoy && <p className="truncate text-xs text-muted-foreground" title={p.hoy}>Hoy: {p.hoy}</p>}
                                    {suyos.length > 0 && (
                                        <button type="button" onClick={() => setAbierta(abiertaEsta ? null : p.id)} aria-expanded={abiertaEsta}
                                            className="mt-1 inline-flex items-center gap-1 py-1 text-xs font-medium text-brand-primary hover:underline">
                                            {abiertaEsta ? <ChevronDown aria-hidden className="h-3.5 w-3.5" /> : <ChevronRight aria-hidden className="h-3.5 w-3.5" />}
                                            {abiertaEsta ? 'Ocultar avisos' : `Ver avisos de los últimos ${DIAS} días (${suyos.length})`}
                                        </button>
                                    )}
                                </div>
                            </div>
                            {abiertaEsta && (
                                <ul className="mt-2 space-y-2 border-l border-border pl-3 sm:ml-7">
                                    {suyos.map(a => {
                                        const e = estadoDelAviso(a);
                                        const Icono = a.equipo === 'computador' ? Monitor : Smartphone;
                                        return (
                                            <li key={a.id} className="text-xs">
                                                <p className="flex items-center gap-1 text-muted-foreground">
                                                    <Icono aria-hidden className="h-3.5 w-3.5 shrink-0" />
                                                    {a.equipo === 'computador' ? 'Computador' : 'Celular'} · enviado {textoIngreso(a.enviado_en)} · {a.tipo}
                                                </p>
                                                <p className="text-foreground"><span className="font-medium">{a.titulo}</span>{a.cuerpo ? ` — ${a.cuerpo}` : ''}</p>
                                                <p className={TONO[e.tono]}>{e.texto}</p>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </li>
                    );
                })}
            </ul>
        </section>
    );
};

export default RecordatoriosAvisos;
