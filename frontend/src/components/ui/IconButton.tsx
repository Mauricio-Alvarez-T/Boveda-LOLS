import React from 'react';
import { motion } from 'framer-motion';
import type { HTMLMotionProps } from 'framer-motion';
import { cn } from '../../utils/cn';

/**
 * Botón icon-only del design system (Fase 2). Reemplaza los `<button>` crudos
 * que solo envuelven un icono (cerrar, editar, eliminar, toggle, etc.).
 *
 * `aria-label` es OBLIGATORIO: un botón sin texto necesita etiqueta accesible.
 */
type IconButtonProps = Omit<HTMLMotionProps<'button'>, 'children'> & {
    icon: React.ReactNode;
    variant?: 'ghost' | 'danger' | 'primary';
    size?: 'sm' | 'md';
    'aria-label': string;
};

// Regla de iconos (design system): idle SIEMPRE gris (text-muted-foreground);
// al hover transiciona al color que le corresponde a la acción.
//   ghost   → gris → verde (brand-primary)  [acción neutra: calendarios, ver, editar…]
//   danger  → gris → rojo (destructive)      [eliminar/baja]
//   primary → relleno verde                  [CTA principal explícito, sin idle gris]
const variants = {
    ghost: 'text-muted-foreground hover:bg-brand-primary/10 hover:text-brand-primary dark:hover:bg-brand-primary/15',
    danger: 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive',
    primary: 'bg-brand-primary text-white hover:bg-[#027A3B]',
};

const sizes = {
    sm: 'h-8 w-8',
    md: 'h-9 w-9',
};

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
    ({ className, icon, variant = 'ghost', size = 'md', type = 'button', disabled, ...props }, ref) => (
        <motion.button
            ref={ref}
            type={type}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            disabled={disabled}
            className={cn(
                'inline-flex items-center justify-center rounded-full transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 focus-visible:ring-offset-2',
                'disabled:opacity-40 disabled:cursor-not-allowed',
                variants[variant],
                sizes[size],
                className,
            )}
            {...props}
        >
            {icon}
        </motion.button>
    ),
);

IconButton.displayName = 'IconButton';
