import React from 'react';
import { CheckSquare, Clock } from 'lucide-react';
import WhatsAppIcon from '../../ui/WhatsAppIcon';
import { shareViaWhatsApp } from '../../../utils/whatsappShare';
import { EncabezadoTarjeta, CifraTarjeta } from './EncabezadoTarjeta';
import { EnlaceFicha } from './FichaInicio';
import { mensajeObrasSinGuardar } from './mensajesWhatsApp';

/**
 * Inicio — obras que aún no guardan la asistencia de hoy (propuesta H, 2026-10-16). Reemplaza al
 * grupo «Asistencia» de la Bandeja: las 15 filas «Asistencia de hoy sin guardar · Obra X» pasan a
 * una cifra y una nube de nombres que se lee de un vistazo.
 */
interface Props {
    /** Nombres en orden alfabético (`resumenDelDia`). */
    sinGuardar: string[];
    total: number;
    /** 'YYYY-MM-DD' de hoy, para el mensaje de WhatsApp. */
    hoyIso: string;
    onNavigate: () => void;
}

/** Nombres visibles antes de cortar con «y N más». */
const MAX_NOMBRES = 10;

const AsistenciaPendiente: React.FC<Props> = ({ sinGuardar, total, hoyIso, onNavigate }) => {
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
            {/* La acción va donde se ve el problema (dueño 2026-10-23): recordar a las obras por WhatsApp con
                todas las que faltan (no solo las visibles); se elige el grupo al enviar. */}
            <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4">
                <EnlaceFicha apagado onClick={() => { void shareViaWhatsApp(mensajeObrasSinGuardar(sinGuardar, hoyIso)); }}
                    icono={<WhatsAppIcon className="h-4 w-4 shrink-0 text-green-700 dark:text-green-300" />}>
                    Recordar por WhatsApp
                </EnlaceFicha>
                <EnlaceFicha onClick={onNavigate}>Ir a Asistencia</EnlaceFicha>
            </div>
        </div>
    );
};

export default AsistenciaPendiente;
