import React from 'react';

/**
 * Píldora de metadato (pantalla, obra, dispositivo, fecha, señales). Neutra y en
 * minúsculas a propósito: el `<Chip>` del design system va en MAYÚSCULAS y es para
 * estados; el contexto de una idea es dato, no estado, y en mayúsculas grita.
 *
 * Sin `cn()` a propósito: tailwind-merge no conoce los tamaños propios
 * (`text-caption`, `text-micro`…) y los BORRA cuando hay un color `text-*` al lado.
 */
export const Meta: React.FC<{ icon?: React.ReactNode; children: React.ReactNode; tono?: 'neutro' | 'peligro' }> = ({ icon, children, tono = 'neutro' }) => (
    <span className={`inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-label font-medium ${tono === 'peligro' ? 'border-destructive/30 text-destructive' : 'border-border text-muted-foreground'}`}>
        {icon}
        {children}
    </span>
);

export default Meta;
