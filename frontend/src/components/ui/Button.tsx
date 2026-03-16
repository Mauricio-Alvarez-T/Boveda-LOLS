import React from 'react';
import { motion } from 'framer-motion';
import type { HTMLMotionProps } from 'framer-motion';
import { cn } from '../../utils/cn';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends Omit<HTMLMotionProps<"button">, "children"> {
    variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'glass';
    size?: 'default' | 'sm' | 'md' | 'lg' | 'icon';
    isLoading?: boolean;
    leftIcon?: React.ReactNode;
    rightIcon?: React.ReactNode;
    children?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = 'primary', size = 'md', isLoading, leftIcon, rightIcon, children, disabled, ...props }, ref) => {

        const variants = {
            primary: 'bg-brand-primary text-white hover:bg-[#027A3B] active:bg-[#006ACC] shadow-sm',
            secondary: 'bg-[#E8E8ED] text-brand-dark hover:bg-[#DDDDE2] active:bg-border',
            outline: 'bg-transparent border border-brand-primary text-brand-primary hover:bg-brand-primary/5',
            ghost: 'bg-transparent text-brand-dark hover:bg-black/5',
            glass: 'bg-white border border-border text-brand-dark hover:bg-background shadow-sm',
        };

        const sizes = {
            default: "h-11 px-4 py-2",
            sm: "h-9 rounded-full px-3",
            md: 'h-11 px-5 text-base rounded-full',
            lg: "h-12 rounded-full px-8",
            icon: "h-11 w-11 rounded-full p-0 flex items-center justify-center",
        };

        return (
            <motion.button
                ref={ref}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                disabled={isLoading || disabled}
                className={cn(
                    'inline-flex items-center justify-center rounded-full font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed gap-2',
                    variants[variant],
                    sizes[size],
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
                        {rightIcon && <span className="shrink-0">{rightIcon}</span>}
                    </>
                )}
            </motion.button>
        );
    }
);

Button.displayName = 'Button';
