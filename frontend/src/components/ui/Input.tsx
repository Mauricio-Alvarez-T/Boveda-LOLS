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
                    <label className="text-sm font-medium text-[#6E6E73] ml-0.5">
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
                            "flex h-11 w-full rounded-xl border border-[#D2D2D7] bg-white py-2 text-base text-[#1D1D1F] ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-[#A1A1A6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3]/30 focus-visible:border-[#0071E3] transition-all hover:border-[#B0B0B5]",
                            leftIcon ? "pl-10 pr-4" : "px-4",
                            error && "border-[#FF3B30] focus-visible:ring-[#FF3B30]/30 focus-visible:border-[#FF3B30]",
                            className
                        )}
                        ref={ref}
                        {...props}
                    />
                </div>
                {error && (
                    <p className="text-xs text-[#FF3B30] font-medium ml-0.5">
                        {error}
                    </p>
                )}
                {helperText && !error && (
                    <p className="text-xs text-[#6E6E73] ml-0.5">
                        {helperText}
                    </p>
                )}
            </div>
        );
    }
);

Input.displayName = "Input";
