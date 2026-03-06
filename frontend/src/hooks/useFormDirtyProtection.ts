import { useEffect } from 'react';

/**
 * Hook para proteger formularios no guardados (Dirty State).
 * 
 * Previene que el usuario cierre el navegador accidentalmente o 
 * informa al componente Modal global (mediante un atributo en el body) 
 * que hay cambios pendientes para pedir confirmación antes de cerrar.
 */
export function useFormDirtyProtection(isDirty: boolean) {
    useEffect(() => {
        // Evitar que recargue la página o vaya atrás en el navegador
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (isDirty) {
                e.preventDefault();
                e.returnValue = ''; // Requerido por Chrome
            }
        };

        if (isDirty) {
            window.addEventListener('beforeunload', handleBeforeUnload);
            // Avisar al ecosistema Modal que estamos sucios
            document.body.setAttribute('data-modal-dirty', 'true');
        } else {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            document.body.removeAttribute('data-modal-dirty');
        }

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            document.body.removeAttribute('data-modal-dirty');
        };
    }, [isDirty]);
}
