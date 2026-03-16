import React from 'react';
import { cn } from '../../utils/cn';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
    helperText?: string;
    leftIcon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
    ({ className, label, error, helperText, type, leftIcon, ...props }, ref) => {
        return (
            <div className="w-full space-y-1.5">
                {label && (
                    <label className="text-sm font-medium text-muted-foreground ml-0.5">
                        {label}
                    </label>
                )}
                <div className="relative group flex items-center">
                    {leftIcon && (
                        <div className="absolute left-3 flex items-center pointer-events-none">
                            {leftIcon}
                        </div>
                    )}
                    <input
                        type={type}
                        className={cn(
                            "flex h-11 w-full rounded-xl border border-border bg-white py-2 text-base text-brand-dark ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/30 focus-visible:border-brand-primary transition-all hover:border-[#B0B0B5]",
                            leftIcon ? "pl-10 pr-4" : "px-4",
                            error && "border-destructive focus-visible:ring-destructive/30 focus-visible:border-destructive",
                            className
                        )}
                        ref={ref}
                        {...props}
                    />
                </div>
                {error && (
                    <p className="text-xs text-destructive font-medium ml-0.5">
                        {error}
                    </p>
                )}
                {helperText && !error && (
                    <p className="text-xs text-muted-foreground ml-0.5">
                        {helperText}
                    </p>
                )}
            </div>
        );
    }
);

Input.displayName = "Input";
