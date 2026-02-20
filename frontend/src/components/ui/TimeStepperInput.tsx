import React from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { cn } from '../../utils/cn';

interface TimeStepperInputProps {
    value: string; // format "HH:MM"
    onChange: (value: string) => void;
    disabled?: boolean;
    className?: string;
    label?: string;
}

export const TimeStepperInput: React.FC<TimeStepperInputProps> = ({
    value,
    onChange,
    disabled = false,
    className,
    label
}) => {
    // "HH:MM" -> add or subtract 1 hour
    const adjustHour = (amount: number) => {
        if (!value || disabled) return;

        const [hoursStr, minutesStr] = value.split(':');
        let h = parseInt(hoursStr, 10);
        const m = parseInt(minutesStr, 10);

        if (isNaN(h) || isNaN(m)) return;

        h = (h + amount) % 24;
        if (h < 0) h = 24 + h; // Handle negative modulo

        const newHH = h.toString().padStart(2, '0');
        const newMM = m.toString().padStart(2, '0');

        onChange(`${newHH}:${newMM}`);
    };

    return (
        <div className={cn("flex flex-col gap-1.5", className)}>
            {label && (
                <label className="text-[10px] font-bold text-[#6E6E73] uppercase tracking-wider">
                    {label}
                </label>
            )}
            <div className="relative flex items-center">
                <input
                    type="time"
                    value={value || ''}
                    onChange={(e) => onChange(e.target.value)}
                    disabled={disabled}
                    className={cn(
                        "w-full h-10 px-3 pr-10 rounded-xl border border-[#D2D2D7] bg-white text-sm text-[#1D1D1F] transition-all focus:outline-none focus:ring-2 focus:ring-[#0071E3]/20 focus:border-[#0071E3] disabled:bg-[#F5F5F7] disabled:text-[#A1A1A6] disabled:cursor-not-allowed",
                        // Ocultamos el icono de reloj nativo de WebKit/Blink ya que los nuestros de flechas irán encima
                        "[&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:right-0 [&::-webkit-calendar-picker-indicator]:w-8 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:z-10"
                    )}
                />

                {/* Stepper Buttons Overlay */}
                <div className="absolute right-[2px] top-[2px] bottom-[2px] flex flex-col items-center justify-center w-8 bg-white/80 backdrop-blur-sm rounded-r-lg border-l border-[#E8E8ED] overflow-hidden z-20">
                    <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); adjustHour(1); }}
                        disabled={disabled}
                        className="flex-1 flex items-center justify-center w-full hover:bg-[#F5F5F7] text-[#6E6E73] hover:text-[#0071E3] disabled:opacity-50 transition-colors"
                        tabIndex={-1}
                    >
                        <ChevronUp className="h-3 w-3" strokeWidth={3} />
                    </button>
                    <div className="h-[1px] w-full bg-[#E8E8ED]" />
                    <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); adjustHour(-1); }}
                        disabled={disabled}
                        className="flex-1 flex items-center justify-center w-full hover:bg-[#F5F5F7] text-[#6E6E73] hover:text-[#0071E3] disabled:opacity-50 transition-colors"
                        tabIndex={-1}
                    >
                        <ChevronDown className="h-3 w-3" strokeWidth={3} />
                    </button>
                </div>
            </div>
        </div>
    );
};
