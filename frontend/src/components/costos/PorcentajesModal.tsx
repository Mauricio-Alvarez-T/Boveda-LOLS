import React, { useState } from 'react';
import { toast } from 'sonner';
import { Percent } from 'lucide-react';
import api from '../../services/api';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { FormError } from '../ui/FormError';
import { fmtMoney } from '../../utils/format';
import { CAMPO, ETIQUETA, mensajeError } from './costosConfig';
import { aNumero } from './excelPresupuesto';
import type { CostoPresupuesto } from '../../types/entities';

interface Props {
    obraId: number;
    presupuesto: CostoPresupuesto | null;
    costoDirecto: number;
    /** Obra cerrada: los porcentajes quedan congelados; la superficie y la observación, no. */
    bloqueada?: boolean;
    onClose: () => void;
    onGuardado: () => void;
}

const CAMPOS = [
    { key: 'gg_pct', label: 'Gastos generales', ayuda: 'Sobre el costo directo: faena, profesionales, seguros, garantías.' },
    { key: 'imprevistos_pct', label: 'Imprevistos', ayuda: 'Sobre el costo directo.' },
    { key: 'utilidad_pct', label: 'Utilidad', ayuda: 'Sobre el costo (directo + GG + imprevistos).' },
    { key: 'iva_pct', label: 'IVA', ayuda: 'Sobre el neto. En Chile, 19 %.' },
] as const;

type Clave = typeof CAMPOS[number]['key'];

const aTexto = (v: number | string | null | undefined, porDefecto: string) =>
    v === null || v === undefined || v === '' ? porDefecto : String(Number(v)).replace('.', ',');

/** Datos del presupuesto: porcentajes (con la cuenta a la vista) y superficie para el costo por m². */
export const PorcentajesModal: React.FC<Props> = ({ obraId, presupuesto, costoDirecto, bloqueada = false, onClose, onGuardado }) => {
    const [valores, setValores] = useState<Record<Clave, string>>({
        gg_pct: aTexto(presupuesto?.gg_pct, '0'),
        imprevistos_pct: aTexto(presupuesto?.imprevistos_pct, '0'),
        utilidad_pct: aTexto(presupuesto?.utilidad_pct, '0'),
        iva_pct: aTexto(presupuesto?.iva_pct, '19'),
    });
    const [observacion, setObservacion] = useState(presupuesto?.observacion || '');
    const [m2, setM2] = useState(presupuesto?.superficie_m2 ? String(Number(presupuesto.superficie_m2)).replace('.', ',') : '');
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const n = (k: Clave) => (aNumero(valores[k]) ?? 0) / 100;
    // Vista previa con la misma cuenta del backend (costos.service.js · calcularTotales).
    const cd = costoDirecto;
    const gg = Math.round(cd * n('gg_pct'));
    const imp = Math.round(cd * n('imprevistos_pct'));
    const costo = cd + gg + imp;
    const util = Math.round(costo * n('utilidad_pct'));
    const neto = costo + util;
    const iva = Math.round(neto * n('iva_pct'));

    const guardar = async () => {
        const datos: Record<string, number | string> = { observacion };
        const superficie = m2.trim() ? aNumero(m2) : null;
        if (m2.trim() && (superficie === null || superficie <= 0)) { setError('La superficie tiene que ser un número mayor que cero (m²).'); return; }
        datos.superficie_m2 = superficie ?? '';
        for (const c of CAMPOS) {
            if (bloqueada) break;
            const v = aNumero(valores[c.key]);
            if (v === null || v < 0 || v > 100) { setError(`"${c.label}" tiene que ser un porcentaje entre 0 y 100.`); return; }
            datos[c.key] = v;
        }
        setError(null);
        setGuardando(true);
        try {
            await api.put(`/costos/obras/${obraId}/presupuesto`, datos);
            toast.success('Datos del presupuesto guardados');
            onGuardado();
        } catch (e) {
            setError(mensajeError(e, 'No se pudieron guardar los datos del presupuesto.'));
        } finally {
            setGuardando(false);
        }
    };

    const fila = (label: string, valor: number, fuerte = false) => (
        <div className={fuerte ? 'flex items-baseline justify-between border-t border-border pt-1.5 font-semibold text-brand-dark' : 'flex items-baseline justify-between text-muted-foreground'}>
            <span>{label}</span><span className="tabular-nums">{fmtMoney(valor) || '$0'}</span>
        </div>
    );

    return (
        <Modal
            isOpen
            onClose={onClose}
            size="md"
            icon={Percent}
            title="Datos del presupuesto"
            footer={
                <div className="flex w-full justify-end gap-2">
                    <Button variant="ghost" onClick={onClose}>Cancelar</Button>
                    <Button onClick={guardar} isLoading={guardando}>Guardar</Button>
                </div>
            }
        >
            <div className="flex flex-col gap-4">
                <div className="max-w-[14rem]">
                    <label htmlFor="pres-m2" className={ETIQUETA}>Superficie construida</label>
                    <div className="relative">
                        <input id="pres-m2" value={m2} onChange={e => setM2(e.target.value)} inputMode="decimal" placeholder="Ej.: 1.250" className={CAMPO + ' pr-10 tabular-nums'} />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">m²</span>
                    </div>
                    <p className="mt-1 text-caption text-muted-foreground">Para comparar obras por su costo por m².</p>
                </div>
                {bloqueada && <p className="text-xs text-muted-foreground">La obra está cerrada: los porcentajes quedaron congelados.</p>}
                <div className="grid grid-cols-2 gap-3">
                    {CAMPOS.map(c => (
                        <div key={c.key}>
                            <label htmlFor={`pct-${c.key}`} className={ETIQUETA}>{c.label}</label>
                            <div className="relative">
                                <input id={`pct-${c.key}`} value={valores[c.key]} inputMode="decimal" disabled={bloqueada}
                                    onChange={e => setValores(v => ({ ...v, [c.key]: e.target.value }))}
                                    className={CAMPO + ' pr-8 tabular-nums disabled:opacity-60'} />
                                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                            </div>
                            <p className="mt-1 text-caption text-muted-foreground">{c.ayuda}</p>
                        </div>
                    ))}
                </div>

                <div className="flex flex-col gap-1 rounded-xl bg-muted/50 px-3 py-3 text-xs">
                    {fila('Costo directo', cd)}
                    {fila('Gastos generales', gg)}
                    {fila('Imprevistos', imp)}
                    {fila('Costo presupuestado', costo, true)}
                    {fila('Utilidad', util)}
                    {fila('Neto', neto, true)}
                    {fila('IVA', iva)}
                    {fila('Total con IVA', neto + iva, true)}
                </div>

                <div>
                    <label htmlFor="pct-obs" className={ETIQUETA}>Observación</label>
                    <textarea id="pct-obs" value={observacion} onChange={e => setObservacion(e.target.value)} maxLength={500} rows={2}
                        placeholder="Ej.: presupuesto aprobado por el mandante el 10/10" className={CAMPO} />
                </div>

                <FormError message={error} />
            </div>
        </Modal>
    );
};

export default PorcentajesModal;
