import React from 'react';
import { CheckSquare, PackageOpen, ShoppingBag, UserPlus } from 'lucide-react';

import { cn } from '../../../utils/cn';
import { Logo } from '../../ui/Logo';

interface Acceso { clave: string; titulo: string; sub: string; icon: React.ElementType; ruta: string; permiso: string }

/** Accesos directos de la franja; cada uno solo con su permiso. */
const ACCESOS: Acceso[] = [
    { clave: 'asistencia', titulo: 'Marcar asistencia', sub: 'La de hoy, por obra', icon: CheckSquare, ruta: '/asistencia', permiso: 'asistencia.guardar' },
    { clave: 'ingreso', titulo: 'Nuevo ingreso', sub: 'Ficha de un trabajador', icon: UserPlus, ruta: '/consultas?tab=solicitudes', permiso: 'trabajadores.solicitud.crear' },
    { clave: 'lote', titulo: 'Nuevo lote', sub: 'Documentos para firmar', icon: PackageOpen, ruta: '/consultas?tab=fisicos', permiso: 'documentos.entrega.registrar' },
    { clave: 'materiales', titulo: 'Pedir materiales', sub: 'Solicitud a bodega', icon: ShoppingBag, ruta: '/inventario?tab=transferencias', permiso: 'inventario.transferencias.solicitar' },
];

const saludo = (h: number) => (h < 12 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches');

/**
 * Franja de marca del Inicio (propuesta C del lienzo, dueño 2026-10-21): bajo las tarjetas, cuando no hay
 * detalle abierto, el logo LOLS en grande con un saludo y accesos directos a lo más usado según el perfil.
 * Solo en pantallas anchas: en el celular el Inicio entra directo a un módulo.
 */
export const InicioMarca: React.FC<{ nombre: string | null | undefined; permisos: string[]; onIr: (ruta: string) => void; className?: string }> = ({ nombre, permisos, onIr, className }) => {
    const accesos = ACCESOS.filter(a => permisos.includes(a.permiso));
    const primerNombre = (nombre ?? '').trim().split(/\s+/)[0];
    return (
        <section aria-label="LOLS Ingeniería"
            className={cn('grid grid-cols-1 items-center gap-8 rounded-[28px] bg-card p-8 shadow-[var(--shadow-md)] lg:grid-cols-[22rem_1fr] lg:gap-10', className)}>
            <div className={cn('flex flex-col gap-4', accesos.length > 0 && 'lg:border-r lg:border-border lg:pr-9')}>
                <Logo variant="green" className="w-72 max-w-full" aria-label="LOLS Ingeniería" role="img" />
                <div>
                    <p className="text-xl font-bold text-foreground">{saludo(new Date().getHours())}{primerNombre ? `, ${primerNombre}` : ''}</p>
                    <p className="text-sm text-muted-foreground">{accesos.length > 0 ? '¿Qué necesitas hacer hoy?' : 'Construyendo desde 1995'}</p>
                </div>
            </div>
            {accesos.length > 0 && (
                <div className="grid grid-cols-2 gap-3.5 xl:grid-cols-4">
                    {accesos.map(a => (
                        // eslint-disable-next-line no-restricted-syntax -- acceso directo (tarjeta completa)
                        <button key={a.clave} type="button" onClick={() => onIr(a.ruta)}
                            className="flex min-h-36 flex-col items-start justify-between gap-4 rounded-[20px] border border-border bg-card p-4 text-left transition-colors duration-200 hover:bg-green-50 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 motion-reduce:transition-none dark:hover:bg-green-500/10">
                            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300">
                                <a.icon className="h-[22px] w-[22px]" aria-hidden />
                            </span>
                            <span>
                                <span className="block text-ui font-bold text-foreground">{a.titulo}</span>
                                <span className="block text-xs text-muted-foreground">{a.sub}</span>
                            </span>
                        </button>
                    ))}
                </div>
            )}
        </section>
    );
};
