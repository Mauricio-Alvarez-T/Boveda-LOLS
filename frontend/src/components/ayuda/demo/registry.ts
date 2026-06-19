import React from 'react';

/**
 * Mapa guiaId → componente de demo interactiva (lazy, para no inflar el bundle del
 * Centro de ayuda). Agregar una entrada aquí + marcar la guía con ese `demoId` en
 * `guiasData.ts` habilita su demo.
 */
export const DEMO_REGISTRY: Record<string, React.LazyExoticComponent<React.ComponentType>> = {
    'pedir-solicitud': React.lazy(() => import('./DemoPedir')),
    'aprobar-solicitud': React.lazy(() => import('./DemoAprobar')),
    'recibir-materiales': React.lazy(() => import('./DemoRecibir')),
};
