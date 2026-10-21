/**
 * Ventana al INICIAR SESIÓN con los documentos en terreno pasados del plazo (jefatura 2026-10-21): el máximo
 * es de 4 días hábiles (lunes = día 1, jueves = día 4; el viernes ya está atrasado). Aparece en cada inicio de
 * sesión mientras haya atrasados (decisión del dueño): RRHH ve todos, con quién está cada uno; el portador,
 * solo los suyos. AuthContext.login deja la marca `sgdl_recien_ingreso`; esta ventana la consume una vez,
 * así que recargar la página no la repite.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight } from 'lucide-react';

import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { diaCorto, type AtrasadosRespuesta } from './documentosFisicos';

const MARCA = 'sgdl_recien_ingreso';

const consumirMarca = (): boolean => {
    try {
        const hay = sessionStorage.getItem(MARCA) === '1';
        sessionStorage.removeItem(MARCA);
        return hay;
    } catch {
        return false;
    }
};

export const AlertaAtrasosAlEntrar: React.FC = () => {
    const { user, hasPermission } = useAuth();
    const navigate = useNavigate();
    const [datos, setDatos] = useState<AtrasadosRespuesta | null>(null);
    const puede = hasPermission('documentos.entrega.registrar') || hasPermission('documentos.entrega.portar');

    useEffect(() => {
        if (!user || !puede || !consumirMarca()) return;
        let vivo = true;
        api.get<{ data: AtrasadosRespuesta }>('/documentos-lotes/atrasados')
            .then(res => { if (vivo && res.data.data?.lotes?.length) setDatos(res.data.data); })
            .catch(() => { /* sin la ventana; el tablero sigue mostrando los atrasos */ });
        return () => { vivo = false; };
    }, [user, puede]);

    if (!datos) return null;
    const cerrar = () => setDatos(null);
    const propios = datos.alcance === 'propios';
    const nDocs = datos.lotes.reduce((n, l) => n + l.documentos.length, 0);

    return (
        <Modal isOpen onClose={cerrar} icon={AlertTriangle} size="md"
            title="Documentos fuera de plazo"
            description={propios
                ? `Tienes ${nDocs} documento${nDocs === 1 ? '' : 's'} que debías devolver firmado${nDocs === 1 ? '' : 's'} a RRHH`
                : `${nDocs} documento${nDocs === 1 ? '' : 's'} en terreno pasaron el máximo de ${datos.max_dias_habiles} días hábiles`}
            footer={(
                <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button variant="ghost" onClick={cerrar}>Entendido</Button>
                    <Button rightIcon={<ArrowRight className="h-4 w-4" />} onClick={() => { cerrar(); navigate('/consultas?tab=fisicos'); }}>
                        Ir a Documentos físicos
                    </Button>
                </div>
            )}>
            <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                    El día del retiro cuenta como día 1 y el plazo es de {datos.max_dias_habiles} días hábiles (sin fines de semana ni feriados).
                </p>
                <ul className="space-y-2.5">
                    {datos.lotes.map(l => (
                        <li key={l.lote_id} className="rounded-2xl border border-red-200 bg-red-50/60 p-3 dark:border-red-800/60 dark:bg-red-500/5">
                            <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                                <span className="text-sm font-semibold text-foreground break-words">
                                    {propios ? `Lote #${l.lote_id}` : `${l.portador_nombre || '(usuario eliminado)'} · Lote #${l.lote_id}`}
                                </span>
                                <span className="text-xs font-bold text-red-700 dark:text-red-300">
                                    {l.tenencia.dias_atraso} día{l.tenencia.dias_atraso === 1 ? '' : 's'} hábil{l.tenencia.dias_atraso === 1 ? '' : 'es'} de atraso
                                </span>
                            </p>
                            <p className="text-xs text-muted-foreground">Venció el {diaCorto(l.tenencia.vence_el)}</p>
                            <ul className="mt-2 space-y-1">
                                {l.documentos.map(d => (
                                    <li key={d.documento_id} className="rounded-lg bg-card px-2.5 py-1.5 text-xs">
                                        <span className="block font-semibold text-foreground break-words">{d.trabajador_nombre || '(sin trabajador)'}</span>
                                        <span className="block text-muted-foreground break-words">
                                            {[d.tipo_nombre, d.obra_nombre].filter(Boolean).join(' · ')}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </li>
                    ))}
                </ul>
            </div>
        </Modal>
    );
};
