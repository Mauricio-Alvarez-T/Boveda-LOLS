import React from 'react';
import { motion } from 'framer-motion';
import type { HTMLMotionProps } from 'framer-motion';
import { cn } from '../../utils/cn';
import { Loader2, ChevronRight } from 'lucide-react';

interface ButtonProps extends Omit<HTMLMotionProps<"button">, "children"> {
    variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'glass' | 'destructive' | 'link';
    size?: 'default' | 'sm' | 'md' | 'lg' | 'icon';
    isLoading?: boolean;
    leftIcon?: React.ReactNode;
    rightIcon?: React.ReactNode;
    children?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = 'primary', size = 'md', isLoading, leftIcon, rightIcon, children, disabled, ...props }, ref) => {

        const variants = {
            // Acento único = verde LOLS. El press oscurece a verde (nunca azul).
            primary: 'bg-brand-primary text-white hover:bg-[#027A3B] active:bg-[#016B36] shadow-sm',
            secondary: 'bg-muted text-brand-dark hover:bg-muted active:bg-border',
            outline: 'bg-transparent border border-brand-primary text-brand-primary hover:bg-brand-primary/5',
            ghost: 'bg-transparent text-brand-dark hover:bg-black/5',
            glass: 'bg-card border border-border text-brand-dark hover:bg-background shadow-sm',
            destructive: 'bg-destructive/10 text-destructive hover:bg-destructive hover:text-white',
            // Link estilo Apple "Más información ›": texto verde + chevron, sin caja.
            link: 'bg-transparent text-brand-primary px-0 py-0 h-auto rounded-none hover:opacity-70',
        };

        const sizes = {
            default: "h-11 px-4 py-2",
            sm: "h-9 rounded-full px-3",
            md: 'h-11 px-5 text-base rounded-full',
            lg: "h-12 rounded-full px-8",
            icon: "h-11 w-11 rounded-full p-0 flex items-center justify-center",
        };

        const isLink = variant === 'link';
        // El variant link inyecta un chevron a la derecha si no se pasó rightIcon.
        const resolvedRightIcon = isLink && !rightIcon
            ? <ChevronRight className="h-4 w-4" strokeWidth={2.5} />
            : rightIcon;

        return (
            <motion.button
                ref={ref}
                whileTap={{ scale: isLink ? 1 : 0.98 }}
                disabled={isLoading || disabled}
                className={cn(
                    'inline-flex items-center justify-center font-medium transition-all duration-200 ease-apple focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed gap-1.5',
                    !isLink && 'rounded-full',
                    variants[variant],
                    !isLink && sizes[size],
                    className
                )}
                {...props}
            >
                {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                    <>
                        {leftIcon && <span className="shrink-0">{leftIcon}</span>}
                        {children}
                        {resolvedRightIcon && <span className="shrink-0">{resolvedRightIcon}</span>}
                    </>
                )}
            </motion.button>
        );
    }
);

Button.displayName = 'Button';
