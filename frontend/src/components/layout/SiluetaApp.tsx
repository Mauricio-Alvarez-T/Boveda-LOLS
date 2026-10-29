import React from 'react';
import { Logo } from '../ui/Logo';
import { Cargando, Skeleton, SkeletonCirculo, SkeletonTarjetas } from '../ui/Skeleton';

/**
 * Lo que se ve mientras abre Bóveda (Marcos 2026-10-29, «silueta en toda la página»): en vez de la rueda verde en medio
 * de la pantalla vacía, la forma de la app —logo de verdad, menú lateral, barra de arriba y las tarjetas del Inicio—
 * con el brillo suave de `.silueta`. La usa App.tsx mientras se revisa la sesión. No sabe todavía qué menú le toca a la
 * persona: las filas del menú son genéricas.
 */
const ANCHOS_MENU = [112, 128, 120, 136, 112, 144, 128, 96, 120];

export const SiluetaApp: React.FC = () => (
    <Cargando que="Bóveda" className="flex h-[100dvh] bg-background">
        <aside className="hidden w-64 shrink-0 flex-col border-r border-border md:flex" aria-hidden="true">
            <div className="flex h-[84px] items-center pl-3"><Logo variant="green" className="h-14 w-auto" /></div>
            <div className="mt-4 flex flex-col gap-3 px-4">
                {ANCHOS_MENU.map((w, i) => (
                    <div key={i} className="flex h-9 items-center gap-3">
                        <Skeleton className="h-5 w-5" />
                        <Skeleton className="h-3.5" style={{ width: w }} />
                    </div>
                ))}
            </div>
        </aside>
        <main className="flex min-w-0 flex-1 flex-col" aria-hidden="true">
            <header className="flex h-14 items-center justify-between gap-3 px-3 md:h-16 md:px-5">
                <div className="flex items-center gap-3">
                    <Skeleton className="h-9 w-9 rounded-full md:hidden" />
                    <Skeleton className="h-5 w-32" />
                </div>
                <div className="flex items-center gap-3">
                    <SkeletonCirculo className="h-8 w-8" />
                    <Skeleton className="hidden h-4 w-24 sm:block" />
                    <Skeleton className="h-9 w-28 rounded-full md:w-36" />
                </div>
            </header>
            <div className="flex-1 overflow-hidden px-3 pb-6 md:px-5">
                <Skeleton className="mb-5 h-8 w-56 max-w-full" />
                <SkeletonTarjetas />
            </div>
        </main>
    </Cargando>
);

/** Mientras llega la pantalla de inicio de sesión: el panel oscuro con el logo (computador) y el formulario en gris. */
export const SiluetaLogin: React.FC = () => (
    <Cargando que="el inicio de sesión" className="min-h-[100dvh] w-full bg-background lg:grid lg:grid-cols-[44%_56%]">
        <aside
            aria-hidden="true"
            className="relative hidden flex-col p-14 lg:flex"
            style={{ background: 'radial-gradient(125% 125% at 0% 0%, #0d2c1c 0%, #0a0a0b 58%)' }}
        >
            <Logo variant="white" className="h-auto w-[176px]" />
        </aside>
        <div className="flex min-h-[100dvh] items-center justify-center px-6" aria-hidden="true">
            <div className="w-full max-w-sm space-y-5">
                <div className="lg:hidden"><Logo variant="green" className="h-14 w-auto" /></div>
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-4 w-64 max-w-full" />
                <div className="space-y-2"><Skeleton className="h-3.5 w-20" /><Skeleton className="h-12 w-full rounded-control" /></div>
                <div className="space-y-2"><Skeleton className="h-3.5 w-24" /><Skeleton className="h-12 w-full rounded-control" /></div>
                <Skeleton className="h-12 w-full rounded-full" />
            </div>
        </div>
    </Cargando>
);
