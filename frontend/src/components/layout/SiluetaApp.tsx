import React from 'react';
import { Logo } from '../ui/Logo';
import { Cargando, Skeleton, SkeletonCirculo, SkeletonTarjetas } from '../ui/Skeleton';
import { CIELO_CELULAR, CIELO_ESCRITORIO } from '../auth/faena';

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

/**
 * Mientras llega la pantalla de inicio de sesión: la misma noche del login (su cielo, quieto; la obra llega con la
 * pantalla, diseno.md §9.19), con el logo blanco, el titular en gris y la tarjeta de vidrio con el formulario en gris.
 * Va con `dark`, como el login, para que al llegar no haya un golpe de claro a oscuro.
 */
export const SiluetaLogin: React.FC = () => (
    <Cargando
        que="el inicio de sesión"
        className="dark relative flex min-h-[100dvh] w-full flex-col bg-[#030504] lg:grid lg:grid-cols-[44%_56%]"
    >
        <div aria-hidden="true" className="fixed inset-0 lg:hidden" style={{ background: CIELO_CELULAR }} />
        <div aria-hidden="true" className="fixed inset-0 hidden lg:block" style={{ background: CIELO_ESCRITORIO }} />
        <aside aria-hidden="true" className="relative flex flex-col px-5 pt-5 sm:px-8 sm:pt-8 lg:justify-center lg:px-14 lg:pt-14">
            <Logo variant="white" className="h-auto w-[120px] sm:w-[150px] lg:absolute lg:left-14 lg:top-14 lg:w-[176px]" />
            <div className="mt-10 max-w-md space-y-3 sm:mt-14 lg:mt-0 max-lg:[@media(max-height:600px)]:hidden">
                <Skeleton className="h-8 w-56 lg:h-12 lg:w-80" />
                <Skeleton className="h-8 w-44 lg:h-12 lg:w-64" />
            </div>
        </aside>
        <div aria-hidden="true" className="relative flex flex-1 flex-col items-center px-4 pt-6 sm:px-8 sm:pt-10 lg:justify-center lg:px-12 lg:pb-28 lg:pt-12">
            <div className="w-full max-w-[440px] space-y-5 rounded-[28px] border border-white/10 bg-[rgba(10,16,13,0.5)] px-[22px] pb-7 pt-[26px] sm:p-10">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-4 w-64 max-w-full" />
                <div className="space-y-2"><Skeleton className="h-3.5 w-20" /><Skeleton className="h-12 w-full rounded-control" /></div>
                <div className="space-y-2"><Skeleton className="h-3.5 w-24" /><Skeleton className="h-12 w-full rounded-control" /></div>
                <Skeleton className="h-12 w-full rounded-full" />
            </div>
        </div>
    </Cargando>
);
