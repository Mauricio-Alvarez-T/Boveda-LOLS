import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

interface ThemeContextType {
    /** Selección del usuario (puede ser 'system'). */
    theme: ThemeMode;
    /** Tema realmente aplicado tras resolver 'system'. */
    resolvedTheme: ResolvedTheme;
    setTheme: (mode: ThemeMode) => void;
}

const STORAGE_KEY = 'sgdl_theme';

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const applyThemeClass = (resolved: ResolvedTheme) => {
    document.documentElement.classList.toggle('dark', resolved === 'dark');
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [theme, setThemeState] = useState<ThemeMode>(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
        } catch (error) {
            console.error('Error loading theme preference:', error);
        }
        return 'system';
    });

    // El script anti-FOUC de index.html ya aplicó la clase antes del primer
    // paint; aquí sólo reflejamos el estado en React.
    const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
        typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
            ? 'dark'
            : 'light'
    );

    useEffect(() => {
        const mql = window.matchMedia('(prefers-color-scheme: dark)');

        const resolve = (): ResolvedTheme =>
            theme === 'system' ? (mql.matches ? 'dark' : 'light') : theme;

        const apply = () => {
            const r = resolve();
            applyThemeClass(r);
            setResolvedTheme(r);
        };

        apply();

        // Sólo seguimos los cambios del SO cuando el modo es 'system'.
        if (theme === 'system') {
            mql.addEventListener('change', apply);
            return () => mql.removeEventListener('change', apply);
        }
    }, [theme]);

    const setTheme = useCallback((mode: ThemeMode) => {
        setThemeState(mode);
        try {
            localStorage.setItem(STORAGE_KEY, mode);
        } catch (error) {
            console.error('Error saving theme preference:', error);
        }
    }, []);

    return (
        <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
};
