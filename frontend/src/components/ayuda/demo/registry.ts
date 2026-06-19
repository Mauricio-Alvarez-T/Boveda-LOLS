import React from 'react';

/**
 * Mapa guiaId → componente de demo interactiva (lazy, para no inflar el bundle del
 * Centro de ayuda). Agregar una entrada aquí + marcar la guía con ese `demoId` en
 * `guiasData.ts` habilita su demo.
 */
/** Demo de "Mover" parametrizada por escenario (5 flujos comparten DemoMover). */
const moverDemo = (key: string): React.LazyExoticComponent<React.ComponentType> =>
    React.lazy(() => import('./DemoMover').then(m => ({
        default: () => React.createElement(m.DemoMover, { escenario: m.ESCENARIOS[key] }),
    })));

export const DEMO_REGISTRY: Record<string, React.LazyExoticComponent<React.ComponentType>> = {
    'pedir-solicitud': React.lazy(() => import('./DemoPedir')),
    'aprobar-solicitud': React.lazy(() => import('./DemoAprobar')),
    'recibir-materiales': React.lazy(() => import('./DemoRecibir')),
    'pedir-materiales': React.lazy(() => import('./DemoMateriales')),
    'envio-directo': moverDemo('envio-directo'),
    'devolucion': moverDemo('devolucion'),
    'traslado-obras': moverDemo('traslado-obras'),
    'movimiento-bodegas': moverDemo('movimiento-bodegas'),
    'orden-gerencia': moverDemo('orden-gerencia'),
};
