import React, { useEffect, useState } from 'react';
import { BellOff, BellRing } from 'lucide-react';
import { resumenRecordatorios, type PersonaRecordatorios } from '../../services/avisosCelular';

/**
 * Soporte → Errores (solo Super Administrador): las personas del horario de recordatorios de pendientes
 * (avisosPendientes.service.js), si ya activaron los avisos en su celular y qué se les mandó hoy. Para que don Luis
 * sepa a quién pedirle que los active.
 */
export const RecordatoriosAvisos: React.FC = () => {
    const [lista, setLista] = useState<PersonaRecordatorios[] | null>(null);

    useEffect(() => {
        let vivo = true;
        resumenRecordatorios().then(l => { if (vivo) setLista(l); }).catch(() => { if (vivo) setLista([]); });
        return () => { vivo = false; };
    }, []);

    if (!lista || !lista.length) return null;
    const activos = lista.filter(p => p.celulares > 0).length;

    return (
        <section aria-label="Recordatorios de pendientes" className="rounded-card border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
                <p className="text-sm font-semibold text-brand-dark">Recordatorios de pendientes</p>
                <p className="text-xs text-muted-foreground">
                    {activos} de {lista.length} con los avisos activos · lunes a viernes, sin feriados, solo si tienen algo pendiente
                </p>
            </div>
            <ul className="divide-y divide-border">
                {lista.map(p => (
                    <li key={p.id} className="flex items-start gap-3 px-4 py-2.5">
                        {p.celulares > 0
                            ? <BellRing aria-label="Avisos activos" className="mt-0.5 h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
                            : <BellOff aria-label="Sin avisos activos" className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />}
                        <div className="min-w-0 flex-1">
                            <p className="text-sm text-foreground">
                                <span className="font-medium">{p.nombre}</span>
                                <span className="text-muted-foreground"> · {p.horas.map(h => `${h}:00`).join(' y ')}</span>
                                {p.celulares === 0 && <span className="text-amber-700 dark:text-amber-300"> · todavía no los activa</span>}
                            </p>
                            {p.hoy && <p className="truncate text-xs text-muted-foreground" title={p.hoy}>Hoy: {p.hoy}</p>}
                        </div>
                    </li>
                ))}
            </ul>
        </section>
    );
};

export default RecordatoriosAvisos;
