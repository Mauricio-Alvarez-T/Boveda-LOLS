import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, FileWarning, ChevronRight, Building2, Clock } from 'lucide-react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../ui/Button';
import { cn } from '../../utils/cn';

/** Respuesta de GET /api/documentos-alertas/mios (documentosAlertas.service · misAtrasos). */
interface MisAtrasos {
    documentos: {
        total: number;
        criticos: number;
        items: { documento_id: number; tipo_nombre: string; dias: number; critical: boolean; trabajador: { nombre: string }; obra_nombre: string | null; lote_id: number | null; en_oficina: boolean }[];
    };
    lotes: {
        sin_retirar: { lote_id: number; documentos: number; dias: number; critical: boolean }[];
        en_terreno: { lote_id: number; documentos: number; dias: number; critical: boolean }[];
    };
    por_devolver: number;
}

const REFRESCO_MS = 5 * 60 * 1000;
const VISIBLES = 5;
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/**
 * Cartel de atrasos del supervisor (portador) en la entrada de Bóveda — pedido de Matías (RRHH),
 * 2026-10-19: que quien lleva los documentos a firmar a la obra vea en grande, al entrar, lo que ya está
 * fuera de plazo o aún no devuelve. Solo con `documentos.entrega.portar` y solo sus lotes. Usa los mismos
 * plazos que RRHH configura (Configuración → Alertas de Documentos): ámbar desde el aviso, rojo desde el
 * crítico. No se puede cerrar: desaparece cuando RRHH registra lo que volvió firmado.
 */
export const AvisoAtrasosPortador: React.FC = () => {
    const { hasPermission } = useAuth();
    const navigate = useNavigate();
    const puede = hasPermission('documentos.entrega.portar');
    const [datos, setDatos] = useState<MisAtrasos | null>(null);

    useEffect(() => {
        if (!puede) return;
        let cancelado = false;
        const cargar = () => api.get<{ data: MisAtrasos }>('/documentos-alertas/mios')
            .then(res => { if (!cancelado) setDatos(res.data.data); })
            // Silencioso: si falla, el Inicio sigue igual (la Bandeja del Día también avisa).
            .catch(() => { /* sin cartel */ });
        cargar();
        const t = window.setInterval(cargar, REFRESCO_MS);
        return () => { cancelado = true; window.clearInterval(t); };
    }, [puede]);

    if (!puede || !datos) return null;
    const { documentos, lotes } = datos;
    const lotesAtrasados = [...lotes.sin_retirar.map(l => ({ ...l, sinRetirar: true })), ...lotes.en_terreno.map(l => ({ ...l, sinRetirar: false }))];
    if (!documentos.total && !lotesAtrasados.length) return null;

    const critico = documentos.criticos > 0 || lotesAtrasados.some(l => l.critical);
    const titulo = documentos.total
        ? `Tienes ${plural(documentos.total, 'documento', 'documentos')} fuera de plazo`
        : lotes.sin_retirar.length
            ? `Tienes ${plural(lotes.sin_retirar.length, 'lote esperándote', 'lotes esperándote')} en oficina`
            : `Tienes ${plural(lotes.en_terreno.length, 'lote', 'lotes')} en terreno hace demasiados días`;
    const subtitulo = documentos.total
        ? `Hay que hacerlos firmar y devolverlos a RRHH${documentos.criticos ? `: ${documentos.criticos === documentos.total ? 'todos' : documentos.criticos} ya ${documentos.criticos === 1 ? 'está' : 'están'} en rojo` : ''}.`
        : lotes.sin_retirar.length
            ? 'RRHH los dejó impresos a tu nombre: pasa a retirarlos y confirma en Bóveda.'
            : 'Hay que hacerlos firmar y devolverlos a RRHH.';

    return (
        <section role="alert" aria-label="Documentos atrasados"
            className={cn('overflow-hidden rounded-card border-2',
                critico ? 'border-destructive/50 bg-destructive/5' : 'border-warning/60 bg-warning/10')}>
            <div className="flex flex-col gap-4 p-4 sm:p-5">
                <div className="flex items-start gap-3 sm:gap-4">
                    <span className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white sm:h-14 sm:w-14',
                        critico ? 'bg-destructive' : 'bg-warning')}>
                        <AlertTriangle className="h-6 w-6 sm:h-7 sm:w-7" strokeWidth={2.25} />
                    </span>
                    <div className="min-w-0">
                        <h2 className="text-xl font-bold leading-tight tracking-headline text-brand-dark sm:text-2xl">{titulo}</h2>
                        <p className="mt-1 text-sm text-brand-dark/80 sm:text-base">{subtitulo}</p>
                    </div>
                </div>

                {documentos.items.length > 0 && (
                    <ul className="flex flex-col gap-1.5">
                        {documentos.items.slice(0, VISIBLES).map(d => (
                            <li key={d.documento_id} className="flex items-start gap-3 rounded-xl bg-card px-3 py-2.5 shadow-sm">
                                <FileWarning className={cn('mt-0.5 h-4 w-4 shrink-0', d.critical ? 'text-destructive' : 'text-warning')} />
                                <span className="min-w-0 flex-1">
                                    <span className="block text-sm font-semibold text-brand-dark">{d.tipo_nombre}</span>
                                    <span className="block break-words text-xs text-muted-foreground">
                                        {d.trabajador.nombre}{d.obra_nombre ? ` · ${d.obra_nombre}` : ''}{d.en_oficina ? ' · aún en oficina' : ''}
                                    </span>
                                </span>
                                <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums',
                                    d.critical ? 'bg-destructive text-white' : 'bg-warning/20 text-brand-dark')}>
                                    <Clock className="h-3 w-3" /> {d.dias} días
                                </span>
                            </li>
                        ))}
                        {documentos.items.length > VISIBLES && (
                            <li className="px-1 text-xs font-semibold text-muted-foreground">y {plural(documentos.items.length - VISIBLES, 'documento más', 'documentos más')}</li>
                        )}
                    </ul>
                )}

                {lotesAtrasados.length > 0 && (
                    <ul className="flex flex-col gap-1.5">
                        {lotesAtrasados.map(l => (
                            <li key={l.lote_id} className="flex items-start gap-3 rounded-xl bg-card px-3 py-2.5 shadow-sm">
                                <Building2 className={cn('mt-0.5 h-4 w-4 shrink-0', l.critical ? 'text-destructive' : 'text-warning')} />
                                <span className="min-w-0 flex-1 text-sm text-brand-dark">
                                    <strong>Lote #{l.lote_id}</strong> · {plural(l.documentos, 'documento', 'documentos')}{' '}
                                    {l.sinRetirar ? `esperándote en oficina hace ${plural(l.dias, 'día', 'días')}` : `en terreno hace ${plural(l.dias, 'día', 'días')}`}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-muted-foreground">
                        {datos.por_devolver > 0 ? `En total tienes ${plural(datos.por_devolver, 'documento', 'documentos')} por devolver a RRHH. ` : ''}
                        El aviso se va cuando RRHH registra lo que volvió firmado.
                    </p>
                    <Button onClick={() => navigate('/consultas?tab=fisicos')} rightIcon={<ChevronRight className="h-4 w-4" />}
                        className="w-full sm:w-auto sm:shrink-0">
                        Ver mis documentos
                    </Button>
                </div>
            </div>
        </section>
    );
};

export default AvisoAtrasosPortador;
