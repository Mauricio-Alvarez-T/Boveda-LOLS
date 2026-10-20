import React from 'react';
import { CheckSquare, Clock } from 'lucide-react';
import { Button } from '../../ui/Button';
import { EncabezadoTarjeta, CifraTarjeta } from './EncabezadoTarjeta';

/**
 * Inicio — obras que aún no guardan la asistencia de hoy (propuesta H, 2026-10-16). Reemplaza al
 * grupo «Asistencia» de la Bandeja: las 15 filas «Asistencia de hoy sin guardar · Obra X» pasan a
 * una cifra y una nube de nombres que se lee de un vistazo.
 */
interface Props {
    /** Nombres en orden alfabético (`resumenDelDia`). */
    sinGuardar: string[];
    total: number;
    onNavigate: () => void;
}

/** Nombres visibles antes de cortar con «y N más». */
const MAX_NOMBRES = 10;

const AsistenciaPendiente: React.FC<Props> = ({ sinGuardar, total, onNavigate }) => {
    const n = sinGuardar.length;
    if (n === 0) {
        return (
            <div>
                <EncabezadoTarjeta icon={CheckSquare} tono="verde" titulo="Asistencia de hoy" />
                <CifraTarjeta valor={total} etiqueta={total === 1 ? 'obra guardada' : 'obras guardadas'} tono="verde" />
                <p className="text-sm text-muted-foreground">Todas las obras ya guardaron la asistencia de hoy.</p>
            </div>
        );
    }
    const visibles = sinGuardar.slice(0, MAX_NOMBRES);
    return (
        <div className="flex h-full flex-col">
            <EncabezadoTarjeta icon={Clock} tono="ambar" titulo="Asistencia pendiente" subtitulo="Obras que aún no guardan la de hoy" />
            <CifraTarjeta valor={n} etiqueta={n === 1 ? 'obra sin guardar' : 'obras sin guardar'} tono="ambar" />
            <ul className="flex flex-wrap gap-1.5" aria-label="Obras sin guardar">
                {visibles.map(nombre => (
                    <li key={nombre} className="rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">
                        {nombre}
                    </li>
                ))}
                {n > MAX_NOMBRES && (
                    <li className="px-1 py-1 text-xs text-muted-foreground">y {n - MAX_NOMBRES} más</li>
                )}
            </ul>
            <div className="mt-auto pt-4">
                <Button variant="link" size="sm" onClick={onNavigate} className="text-green-700 dark:text-green-300">
                    Ir a Asistencia
                </Button>
            </div>
        </div>
    );
};

export default AsistenciaPendiente;
