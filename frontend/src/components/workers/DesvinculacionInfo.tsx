/**
 * Bloque "Desvinculación" de la ficha rápida (WorkerQuickView), plan Gestiones B4.
 * Solo lectura: causal, fecha, quién y la marca "No recontratar" (roja). Se alimenta de
 * GET /trabajadores/:id/resumen → `ultima_desvinculacion` (versión resumida, sin `detalle`).
 * El padre lo monta solo si el trabajador está inactivo y el usuario tiene trabajadores.ver.
 */
import React from 'react';
import { AlertTriangle, FileCheck2, UserX } from 'lucide-react';
import { fmtFecha } from '../../utils/format';
import type { UltimaDesvinculacion } from './desvinculacionSchema';

export const DesvinculacionInfo: React.FC<{ ultima: UltimaDesvinculacion }> = ({ ultima }) => (
    <div className="rounded-xl border border-border bg-background px-3 py-2">
        <p className="flex items-center gap-1 text-micro font-bold uppercase tracking-wide text-muted-foreground">
            <UserX className="h-3 w-3 text-destructive" /> Desvinculación
        </p>
        <p className="mt-0.5 text-sm font-bold text-brand-dark">
            {ultima.causal_nombre || ultima.causal_codigo || 'Sin causal registrada'}
        </p>
        <p className="text-xs text-muted-foreground">
            {ultima.fecha ? fmtFecha(ultima.fecha) : '—'}
            {ultima.articulo_texto ? ` · ${ultima.articulo_texto}` : ''}
            {ultima.desvinculado_por_nombre ? ` · por ${ultima.desvinculado_por_nombre}` : ''}
        </p>
        {ultima.no_recontratar && (
            <p className="mt-1.5 inline-flex items-center gap-1 rounded bg-destructive/10 px-2 py-0.5 text-caption font-bold uppercase text-destructive">
                <AlertTriangle className="h-3 w-3" /> No recontratar
            </p>
        )}
        {/* B5: el finiquito vigente de esta baja está en "Documentos laborales (Bóveda)", más abajo en la ficha. */}
        {ultima.finiquito_documento_id != null && (
            <p className="mt-1.5 flex items-center gap-1 text-caption font-semibold text-success">
                <FileCheck2 className="h-3 w-3" /> Finiquito emitido
            </p>
        )}
    </div>
);
