import React from 'react';
import { motion } from 'framer-motion';
import type { HTMLMotionProps } from 'framer-motion';
import { cn } from '../../utils/cn';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends Omit<HTMLMotionProps<"button">, "children"> {
    variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'glass';
    size?: 'sm' | 'md' | 'lg' | 'icon';
    isLoading?: boolean;
    leftIcon?: React.ReactNode;
    rightIcon?: React.ReactNode;
    children?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = 'primary', size = 'md', isLoading, leftIcon, rightIcon, children, disabled, ...props }, ref) => {

        const variants = {
            primary: 'bg-[#0071E3] text-white hover:bg-[#0077ED] active:bg-[#006ACC] shadow-sm',
            secondary: 'bg-[#E8E8ED] text-[#1D1D1F] hover:bg-[#DDDDE2] active:bg-[#D2D2D7]',
            outline: 'bg-transparent border border-[#0071E3] text-[#0071E3] hover:bg-[#0071E3]/5',
            ghost: 'bg-transparent text-[#1D1D1F] hover:bg-black/5',
            glass: 'bg-white border border-[#D2D2D7] text-[#1D1D1F] hover:bg-[#F5F5F7] shadow-sm',
        };

        const sizes = {
            sm: 'h-8 px-4 text-xs',
            md: 'h-10 px-5 text-sm',
            lg: 'h-12 px-8 text-base',
            icon: 'h-10 w-10 p-0',
        };

        return (
            <motion.button
                ref={ref}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                disabled={isLoading || disabled}
                className={cn(
                    'inline-flex items-center justify-center rounded-full font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3]/40 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed gap-2',
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
