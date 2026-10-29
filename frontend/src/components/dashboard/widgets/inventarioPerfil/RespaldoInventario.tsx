import React from 'react';
import { Package } from 'lucide-react';
import BandejaDelDia, { type BandejaItem } from '../BandejaDelDia';
import { EncabezadoTarjeta } from '../EncabezadoTarjeta';
import { FilaInventarioInicio } from '../InventarioInicio';
import { Cargando, Skeleton } from '../../../ui/Skeleton';
import type { FilaInventario, ModeloInventarioInicio } from '../resumenInventarioInicio';

interface Props {
    /** La tarjeta blanca del Inicio (`Panel` de Dashboard), para que se vea igual que en producción. */
    Tarjeta: React.ComponentType<{ children: React.ReactNode }>;
    /** El modelo de la tarjeta «Inventario» (resumenInventarioInicio de GET /transferencias/inicio). */
    modelo: ModeloInventarioInicio;
    /** Ya llegó GET /transferencias/inicio (si no, la silueta de las filas). */
    cargado: boolean;
    /** Abre Inventario → Solicitudes con el filtro de esa fila. */
    onFila: (f: FilaInventario) => void;
    /** Alertas de transferencias (GET /inventario/dashboard-ejecutivo, las mismas de la bandeja). */
    alertas: BandejaItem[];
    onNavigate: (ruta: string) => void;
}

/**
 * Detalle «Inventario» del Inicio para los perfiles que no tienen vista propia (ni aprueban, ni ven diferencias, ni
 * piden para una obra: perfil `otro` de `perfil.ts`): EXACTAMENTE lo que mostraba producción antes de las vistas por
 * perfil (Dashboard.tsx de origin/main, 2026-10-22): «Solicitudes» con todos los grupos de la tarjeta y «Alertas de
 * inventario». Sin datos propios: todo llega de Dashboard.
 */
const RespaldoInventario: React.FC<Props> = ({ Tarjeta, modelo, cargado, onFila, alertas, onNavigate }) => (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Tarjeta>
            <EncabezadoTarjeta icon={Package} tono={modelo.tono} titulo="Solicitudes" subtitulo="Según tu perfil: aprobar, despachar, recibir y las tuyas" />
            {modelo.filas.length > 0
                ? <div>{modelo.filas.map(f => <FilaInventarioInicio key={f.clave} f={f} onClick={() => onFila(f)} />)}</div>
                : cargado
                    ? <p className="text-sm text-muted-foreground">Tu perfil no tiene solicitudes por revisar.</p>
                    : (
                        // Silueta de las filas (texto y detalle; la cifra a la derecha) mientras llega GET /transferencias/inicio.
                        <Cargando que="las solicitudes">
                            {[0, 1, 2].map(i => (
                                <div key={i} className="flex items-center gap-3 border-t border-border py-2.5 -mx-2 px-2" aria-hidden="true">
                                    <div className="flex-1 min-w-0 space-y-1.5">
                                        <Skeleton className={i === 1 ? 'h-4 w-1/2' : 'h-4 w-2/3'} />
                                        <Skeleton className="h-3 w-2/5" />
                                    </div>
                                    <Skeleton className="h-6 w-8 shrink-0" />
                                </div>
                            ))}
                        </Cargando>
                    )}
        </Tarjeta>
        <Tarjeta>
            <BandejaDelDia
                titulo="Alertas de inventario"
                vacio={{ titulo: 'Sin alertas', descripcion: 'Ninguna transferencia atrasada, rechazada ni con diferencias.' }}
                tasks={[]}
                inventoryItems={alertas}
                grupoAbierto="inventario"
                onNavigate={onNavigate}
            />
        </Tarjeta>
    </div>
);

export default RespaldoInventario;
