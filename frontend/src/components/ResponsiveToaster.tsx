import { useEffect, useState } from 'react';
import { Toaster } from 'sonner';

type ToastPosition = 'top-right' | 'bottom-center';

const MOBILE_QUERY = '(max-width: 767px)'; // tailwind md breakpoint

/**
 * Toaster con posición responsive: top-right en desktop (>=768px) y
 * bottom-center en mobile (<768px). En mobile, top-right tapa el selector
 * de obras y el botón "guardar asistencia"; bottom-center queda fuera del
 * camino de los controles principales.
 */
export function ResponsiveToaster() {
    const [position, setPosition] = useState<ToastPosition>(() =>
        typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches
            ? 'bottom-center'
            : 'top-right'
    );

    useEffect(() => {
        const mq = window.matchMedia(MOBILE_QUERY);
        const handler = (e: MediaQueryListEvent) => {
            setPosition(e.matches ? 'bottom-center' : 'top-right');
        };
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, []);

    return (
        <Toaster
            position={position}
            closeButton
            duration={3000}
            toastOptions={{
                style: {
                    background: 'white',
                },
                className: 'shadow-lg border border-[#E8E8ED] !opacity-100',
                classNames: {
                    closeButton:
                        '!bg-background !text-brand-dark !border border-[#E8E8ED] hover:!bg-[#E8E8ED] !opacity-100 focus:!ring-2 focus:!ring-brand-primary',
                },
            }}
        />
    );
}
