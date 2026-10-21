import React, { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';

export interface NotificationState {
    count: number;
    content: ReactNode;
}

interface PageHeaderState {
    title: ReactNode;
    actions: ReactNode;
    notifications?: NotificationState;
    /** Centro del encabezado en el celular (entre el menú y el selector de obra); null = vacío. */
    centroMovil: ReactNode;
    /** true = en el celular no se muestra el selector de obra (la página no depende de la obra). */
    ocultarObraMovil: boolean;
}

interface PageHeaderDispatch {
    setTitle: (title: ReactNode) => void;
    setActions: (actions: ReactNode) => void;
    setNotifications: (notifications: NotificationState | undefined) => void;
    setCentroMovil: (contenido: ReactNode) => void;
    setOcultarObraMovil: (ocultar: boolean) => void;
}

const PageHeaderStateContext = createContext<PageHeaderState | undefined>(undefined);
const PageHeaderDispatchContext = createContext<PageHeaderDispatch | undefined>(undefined);

export const PageHeaderProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [title, setTitle] = useState<ReactNode>(null);
    const [actions, setActions] = useState<ReactNode>(null);
    const [notifications, setNotifications] = useState<NotificationState | undefined>(undefined);
    const [centroMovil, setCentroMovil] = useState<ReactNode>(null);
    const [ocultarObraMovil, setOcultarObraMovil] = useState(false);

    const dispatch = React.useMemo(() => ({ setTitle, setActions, setNotifications, setCentroMovil, setOcultarObraMovil }), []);
    const state = React.useMemo(() => ({ title, actions, notifications, centroMovil, ocultarObraMovil }),
        [title, actions, notifications, centroMovil, ocultarObraMovil]);

    return (
        <PageHeaderDispatchContext.Provider value={dispatch}>
            <PageHeaderStateContext.Provider value={state}>
                {children}
            </PageHeaderStateContext.Provider>
        </PageHeaderDispatchContext.Provider>
    );
};

export const usePageHeader = () => {
    const context = useContext(PageHeaderStateContext);
    if (context === undefined) {
        throw new Error('usePageHeader must be used within a PageHeaderProvider');
    }
    return context;
};

// Hook utility to set headers from page components without triggering re-renders on the page itself
export const useSetPageHeader = (title: ReactNode, actions?: ReactNode, notifications?: NotificationState) => {
    const dispatch = useContext(PageHeaderDispatchContext);

    if (dispatch === undefined) {
        throw new Error('useSetPageHeader must be used within a PageHeaderProvider');
    }

    useEffect(() => {
        dispatch.setTitle(title);
        dispatch.setActions(actions || null);
        dispatch.setNotifications(notifications);

        return () => {
            // Uncomment if you want cleanup on unmount, but often better to let next page overwrite 
            // dispatch.setTitle(null);
            // dispatch.setActions(null);
            // dispatch.setNotifications(undefined);
        };
    }, [title, actions, notifications, dispatch]);
};

/**
 * Pone algo en el CENTRO del encabezado del celular (entre el menú y el selector de obra) mientras la
 * página está montada, y lo quita al salir — a diferencia del título, que la página siguiente pisa. Lo usa
 * el Inicio para el módulo en curso (dueño 2026-10-20). Pasar un nodo memoizado.
 */
export const useSetCentroMovil = (contenido: ReactNode, { ocultarObra = false }: { ocultarObra?: boolean } = {}) => {
    const dispatch = useContext(PageHeaderDispatchContext);
    if (dispatch === undefined) {
        throw new Error('useSetCentroMovil must be used within a PageHeaderProvider');
    }
    useEffect(() => { dispatch.setCentroMovil(contenido); }, [contenido, dispatch]);
    // `ocultarObra`: la página no depende de la obra (Documentos físicos) y el centro necesita el ancho.
    useEffect(() => { dispatch.setOcultarObraMovil(ocultarObra); }, [ocultarObra, dispatch]);
    useEffect(() => () => { dispatch.setCentroMovil(null); dispatch.setOcultarObraMovil(false); }, [dispatch]);
};
