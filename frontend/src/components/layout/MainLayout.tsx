import React, { Suspense, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sidebar } from './Sidebar';
import { ObraSelector } from './ObraSelector';
import { AlertaAtrasosAlEntrar } from '../documentos-fisicos/AlertaAtrasosAlEntrar';
import { IconButton } from '../ui/IconButton';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { EntornoBanner } from './EntornoBanner';
import { Menu, Smartphone } from 'lucide-react';
import { usePageHeader } from '../../context/PageHeaderContext';
import { useAuth } from '../../context/AuthContext';
import { precargarSecciones } from '../../paginas';

/**
 * Secciones que no dependen de la obra elegida: en el celular no muestran el selector «Obra» del encabezado
 * (Marcos 2026-10-21: «acá no es necesario su uso»), así la barra respira. En el computador sigue visible.
 * Las demás páginas pueden ocultarlo igual con `useSetCentroMovil(…, { ocultarObra: true })`.
 */
const SIN_OBRA_EN_CELULAR = ['/configuracion', '/ideas', '/ayuda', '/costos', '/obras-finalizadas', '/vehiculos'];

export const MainLayout: React.FC = () => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const { title, actions, centroMovil, ocultarObraMovil } = usePageHeader();
    const { user } = useAuth();
    const location = useLocation();

    // Con sesión, bajar en reposo el código de todas las secciones: así ningún clic del menú espera.
    useEffect(() => {
        const w = window as Window & { requestIdleCallback?: (cb: () => void) => number; cancelIdleCallback?: (id: number) => void };
        if (w.requestIdleCallback) {
            const id = w.requestIdleCallback(precargarSecciones);
            return () => w.cancelIdleCallback?.(id);
        }
        const t = window.setTimeout(precargarSecciones, 1500);
        return () => window.clearTimeout(t);
    }, []);

    return (
        <div className="flex min-h-[100dvh] bg-background">
            {/* Mobile Orientation Lock Overlay — superficie oscura constante (independiente del tema) */}
            <div className="fixed inset-0 z-[9999] bg-neutral-900 flex-col items-center justify-center p-8 text-center overflow-hidden hidden max-md:landscape:flex">
                {/* Giro en CSS (`.gira-telefono`, index.css): no corre mientras el overlay está oculto.
                    Sin backdrop-blur: el fondo es opaco, no había nada que desenfocar. */}
                <div className="gira-telefono h-24 w-24 rounded-[2rem] bg-brand-primary/10 flex items-center justify-center mb-8 border border-brand-primary/20">
                    <Smartphone className="h-12 w-12 text-brand-primary" />
                </div>
                <h2 className="text-2xl font-black text-white uppercase tracking-tighter mb-3">
                    Gira tu dispositivo
                </h2>
                <p className="text-white/70 text-sm font-medium leading-relaxed max-w-[260px]">
                    Bóveda LOLS está diseñada para una experiencia vertical óptima. Por favor, vuelve a la orientación vertical.
                </p>
                <div className="mt-12 flex items-center gap-2 px-4 py-2 bg-white/5 rounded-full border border-white/10">
                    <div className="h-1.5 w-1.5 rounded-full bg-brand-primary motion-safe:animate-pulse" />
                    <span className="text-caption font-bold text-white/50 uppercase tracking-widest">Esperando rotación...</span>
                </div>
            </div>

            {/* Sidebar */}
            <Sidebar
                isCollapsed={isCollapsed}
                setIsCollapsed={setIsCollapsed}
                mobileOpen={mobileOpen}
                setMobileOpen={setMobileOpen}
            />

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col min-w-0 h-[100dvh]">
                {/* Franja de entorno: solo en staging (VITE_ENTORNO), encima de todo. */}
                <EntornoBanner />
                {/* Al iniciar sesión: documentos en terreno pasados de 4 días hábiles (jefatura 2026-10-21). */}
                <AlertaAtrasosAlEntrar />

                {/* Top Navbar — fixed above scroll area. Sin marco (dueño 2026-10-20, idea de la propuesta L del
                    lienzo): mismo fondo que la página, sin borde ni sombra, alineado con el contenido (md:px-5). */}
                <header className="shrink-0 h-14 md:h-16 bg-background flex items-center justify-between px-3 md:px-5 z-50 relative gap-2">
                    {/* Mobile Hamburger */}
                    <IconButton
                        variant="ghost"
                        aria-label="Abrir menú"
                        onClick={() => setMobileOpen(true)}
                        icon={<Menu className="h-5 w-5" />}
                        className="md:hidden shrink-0"
                    />

                    {/* Page Title — hidden on mobile */}
                    <div className="hidden md:flex flex-1 min-w-0 items-center overflow-hidden">
                        {title}
                    </div>
                    {/* Centro en el celular: lo que ponga la página (el Inicio, su módulo en curso); si no, espacio. */}
                    <div className="flex min-w-0 flex-1 justify-center md:hidden">{centroMovil}</div>

                    <div className="flex items-center justify-end gap-1.5 md:gap-3 min-w-0">
                        {/* Page Actions Injected */}
                        {actions && (
                            <div className="flex items-center gap-1 md:gap-2 mr-1 md:mr-2 shrink-0">
                                {actions}
                            </div>
                        )}

                        {/* Usuario (nombre en el header) */}
                        {user && (
                            <div className="hidden md:flex items-center gap-2 min-w-0">
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
                                    {user.nombre?.charAt(0)?.toUpperCase() ?? 'U'}
                                </span>
                                <span className="text-sm font-medium text-foreground truncate max-w-[180px]">{user.nombre}</span>
                            </div>
                        )}

                        <div className="hidden md:block h-6 w-px bg-border mx-1" />
                        {/* Una página que no depende de la obra lo oculta en el celular (lista de arriba o useSetCentroMovil). */}
                        <div className={ocultarObraMovil || SIN_OBRA_EN_CELULAR.some(r => location.pathname.startsWith(r)) ? 'hidden md:contents' : 'contents'}><ObraSelector /></div>
                    </div>
                </header>

                {/* Page Content — actual scroll container */}
                <div className="flex-1 min-h-0 p-2 md:px-5 md:pt-2 pb-12 overflow-y-auto overflow-x-hidden relative flex flex-col">
                    {/* Cambio de sección (dueño 2026-10-22: «no me gusta que salga una animación de carga entremedio de
                        un click… da a entender que la web es lenta»): la nueva entra de inmediato con un fundido de
                        0,16 s, sin esperar la salida de la vieja ni desplazarse. Su código ya está precargado
                        (`precargarSecciones`); si aún no llegó, el Suspense de acá no muestra nada (la barra lateral
                        y el encabezado siguen) en vez del círculo a pantalla completa de App. Cada sección pinta su
                        contorno quieto y sus datos aparecen con `.datos-aparecen` (index.css). */}
                    <motion.div
                        key={location.pathname}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.16, ease: [0.25, 0.1, 0.25, 1] }}
                        className="bg-transparent flex-1 flex flex-col min-h-0"
                    >
                        <ErrorBoundary resetKey={location.pathname}>
                            <Suspense fallback={null}>
                                <Outlet />
                            </Suspense>
                        </ErrorBoundary>
                    </motion.div>
                </div>
            </main>
        </div>
    );
};
