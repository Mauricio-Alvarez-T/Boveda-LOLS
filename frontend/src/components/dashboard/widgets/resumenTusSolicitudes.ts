/**
 * Tarjeta «Tus solicitudes de ingreso» del Inicio del perfil TERRENO (perfil terreno del lienzo, dueño
 * 2026-10-21): quien manda fichas a RRHH ve primero cómo van —rechazadas, esperando revisión y aprobadas
 * en los últimos 30 días—. Lógica pura (con test). Las filas vienen de GET /solicitudes-ingreso, que a quien
 * no aprueba ya le devuelve solo las suyas.
 */
import type { TonoTarjeta } from './tarjetaActiva';
import { diaCorto, diasDesde } from '../../documentos-fisicos/documentosFisicos';
import type { SolicitudIngreso } from '../../../types/entities';

export type GrupoSolicitud = 'rechazada' | 'pendiente' | 'aprobada';
export interface FilaSolicitud {
    id: number;
    grupo: GrupoSolicitud;
    nombre: string;
    detalle: string;
    nota: string;
    chip: string;
    tono: 'rojo' | 'ambar' | 'neutro' | 'verde';
}
export interface ResumenTusSolicitudes {
    pendientes: number;
    tono: TonoTarjeta;
    filas: FilaSolicitud[];
    grupos: Record<GrupoSolicitud, FilaSolicitud[]>;
}

const VENTANA_DIAS = 30;
const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);
const nombreDe = (s: SolicitudIngreso) => [s.apellido_paterno, s.apellido_materno, s.nombres].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

export function resumenTusSolicitudes(rows: SolicitudIngreso[], hoy: Date = new Date()): ResumenTusSolicitudes {
    const reciente = (f: string | null) => !!f && diasDesde(f, hoy) <= VENTANA_DIAS;
    const base = (s: SolicitudIngreso) => [s.cargo_nombre, s.obra_nombre].filter(Boolean).join(' · ');

    const rechazadas: FilaSolicitud[] = rows.filter(s => s.estado === 'rechazada' && reciente(s.fecha_resolucion)).map(s => ({
        id: s.id, grupo: 'rechazada', nombre: nombreDe(s), detalle: base(s),
        nota: s.motivo_rechazo ? `Motivo: ${s.motivo_rechazo}` : 'Rechazada por RRHH',
        chip: 'rechazada', tono: 'rojo',
    }));
    const pendientes: FilaSolicitud[] = rows.filter(s => s.estado === 'pendiente')
        .sort((a, b) => String(a.fecha_solicitud).localeCompare(String(b.fecha_solicitud)))
        .map(s => {
            const d = diasDesde(s.fecha_solicitud, hoy);
            return {
                id: s.id, grupo: 'pendiente', nombre: nombreDe(s), detalle: base(s),
                nota: d === 0 ? 'Enviada hoy' : `Enviada el ${diaCorto(s.fecha_solicitud)} · lleva ${d} ${plural(d, 'día', 'días')}`,
                chip: d === 0 ? 'hoy' : `${d} ${plural(d, 'día', 'días')}`, tono: d >= 2 ? 'ambar' : 'neutro',
            };
        });
    const aprobadas: FilaSolicitud[] = rows.filter(s => s.estado === 'aprobada' && reciente(s.fecha_resolucion))
        .sort((a, b) => String(b.fecha_resolucion).localeCompare(String(a.fecha_resolucion)))
        .map(s => ({
            id: s.id, grupo: 'aprobada', nombre: nombreDe(s), detalle: base(s),
            nota: `Aprobada el ${diaCorto(s.fecha_resolucion as string)}: ya es trabajador`,
            chip: 'aprobada', tono: 'verde',
        }));

    const tono: TonoTarjeta = rechazadas.length > 0 ? 'rojo' : pendientes.length > 0 ? 'ambar' : 'verde';
    return {
        pendientes: pendientes.length,
        tono,
        // En la tarjeta: lo que pide acción primero, hasta 4.
        filas: [...rechazadas, ...pendientes, ...aprobadas].slice(0, 4),
        grupos: { rechazada: rechazadas, pendiente: pendientes, aprobada: aprobadas },
    };
}
