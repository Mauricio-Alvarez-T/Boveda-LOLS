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
}

interface PageHeaderDispatch {
    setTitle: (title: ReactNode) => void;
    setActions: (actions: ReactNode) => void;
    setNotifications: (notifications: NotificationState | undefined) => void;
}

const PageHeaderStateContext = createContext<PageHeaderState | undefined>(undefined);
const PageHeaderDispatchContext = createContext<PageHeaderDispatch | undefined>(undefined);

export const PageHeaderProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [title, setTitle] = useState<ReactNode>(null);
    const [actions, setActions] = useState<ReactNode>(null);
    const [notifications, setNotifications] = useState<NotificationState | undefined>(undefined);

    const dispatch = React.useMemo(() => ({ setTitle, setActions, setNotifications }), []);
    const state = React.useMemo(() => ({ title, actions, notifications }), [title, actions, notifications]);

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
