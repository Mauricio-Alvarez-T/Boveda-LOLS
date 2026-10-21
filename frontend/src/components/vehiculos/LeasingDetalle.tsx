import React, { useEffect, useState } from 'react';
import { Edit2, CheckCircle2 } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { EstadoVencimiento } from './EstadoVencimiento';
import api from '../../services/api';
import type { Vehiculo } from '../../types/entities';

const fmtFecha = (s?: string | null) => s ? String(s).split('T')[0].split('-').reverse().join('/') : 'Sin fecha';

const Fila = ({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) => (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-border/60 last:border-b-0">
        <dt className="text-sm text-muted-foreground">{etiqueta}</dt>
        <dd className="text-sm font-semibold text-foreground text-right">{children}</dd>
    </div>
);

interface Props {
    /** Vehículo cuyo leasing se muestra; null = cerrado. */
    vehiculo: Vehiculo | null;
    onClose: () => void;
    /** Solo con `vehiculos.editar`: abre el formulario del vehículo, donde vive el leasing. */
    onEditar?: (v: Vehiculo) => void;
}

/**
 * Datos del leasing en modo lectura, al tocar el sello «Leasing» de la fila (Daphne 2026-10-21:
 * antes solo se veían entrando a Editar). Se pide el DETALLE porque la fila del listado puede venir
 * sin los campos de leasing (ver VehiculoForm).
 */
export const LeasingDetalle: React.FC<Props> = ({ vehiculo, onClose, onEditar }) => {
    const [detalle, setDetalle] = useState<Vehiculo | null>(null);

    useEffect(() => {
        if (!vehiculo) return;
        let vivo = true;
        api.get<{ data: Vehiculo }>(`/vehiculos/${vehiculo.id}`)
            .then(res => { if (vivo) setDetalle(res.data.data); })
            .catch(() => { /* sin detalle: se queda con lo que trajo la fila */ });
        return () => { vivo = false; };
    }, [vehiculo]);

    const v = detalle && vehiculo && detalle.id === vehiculo.id ? detalle : vehiculo;
    // La BD lo manda como 0/1 y antes de la mig 106 no venía: sin dato = avisa (default de la columna).
    const avisa = v?.avisar_leasing_30d == null ? true : !!v.avisar_leasing_30d;

    return (
        <Modal isOpen={!!vehiculo} onClose={onClose} title="Leasing" size="sm"
            description={v ? `${v.patente} · ${v.marca} ${v.modelo ?? ''} ${v.anio ?? ''}`.trim() : undefined}
            footer={
                <div className="flex gap-3 w-full justify-end">
                    <Button variant="ghost" onClick={onClose} className="flex-1 md:flex-none">Cerrar</Button>
                    {onEditar && v && (
                        <Button variant="outline" onClick={() => onEditar(v)} leftIcon={<Edit2 className="h-4 w-4" />}
                            className="flex-1 md:flex-none">
                            Editar leasing
                        </Button>
                    )}
                </div>
            }>
            {v && (
                <dl>
                    <Fila etiqueta="Estado">
                        {v.leasing_terminado ? (
                            <span className="inline-flex items-center gap-1 text-micro font-bold px-1.5 py-0.5 rounded-md border bg-muted text-muted-foreground border-border">
                                <CheckCircle2 className="h-2.5 w-2.5" /> Terminado
                            </span>
                        ) : v.leasing_fecha_termino ? (
                            <EstadoVencimiento fecha={v.leasing_fecha_termino} className="mt-0" />
                        ) : (
                            <span className="text-muted-foreground font-normal">Sin fecha de término</span>
                        )}
                    </Fila>
                    <Fila etiqueta="Inicio del leasing">{fmtFecha(v.leasing_fecha_inicio)}</Fila>
                    <Fila etiqueta="Término del leasing">{fmtFecha(v.leasing_fecha_termino)}</Fila>
                    {!!v.leasing_terminado && (
                        <Fila etiqueta="Traspaso a">{v.leasing_traspaso_a || 'Sin indicar'}</Fila>
                    )}
                    <Fila etiqueta="Aviso del término">
                        {avisa ? '30 días antes' : 'No avisa'}
                    </Fila>
                </dl>
            )}
        </Modal>
    );
};
