import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '../../../utils/cn';

interface KpiCardProps {
    label: string;
    value: string | number;
    icon: React.ElementType;
    color: string;
    bg: string;
    description: string;
    onClick?: () => void;
    index?: number;
    delta?: number;
    deltaLabel?: string;
    deltaInverted?: boolean; // true = negative delta is good (e.g., absences going down)
}

const KpiCard: React.FC<KpiCardProps> = ({ label, value, icon: Icon, color, bg, description, onClick, index = 0, delta, deltaLabel, deltaInverted = false }) => {
    const hasDelta = delta !== undefined && delta !== null && delta !== 0;
    const isPositive = delta !== undefined && delta > 0;
    const isNegative = delta !== undefined && delta < 0;
    const isGood = deltaInverted ? isNegative : isPositive;
    const isBad = deltaInverted ? isPositive : isNegative;
    const DeltaIcon = isPositive ? TrendingUp : TrendingDown;

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.06, duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
            onClick={onClick}
            className={cn("group flex cursor-pointer flex-col gap-5 rounded-card p-6 transition-all duration-200 ease-apple", bg)}
        >
            {/* Cabecera: etiqueta + icono prominente de color (color = categoría, suave) */}
            <div className="flex items-start justify-between">
                <p className="text-sm font-medium text-muted-foreground">{label}</p>
                <Icon className={cn("h-6 w-6 shrink-0", color)} />
            </div>

            {/* Número protagonista */}
            <div>
                <p className="text-4xl font-semibold tracking-tight text-foreground tabular-nums">{value}</p>
                {(hasDelta || deltaLabel) && (
                    <p className={cn(
                        "mt-2 flex items-center gap-1 text-sm font-medium",
                        isGood ? "text-brand-primary" : isBad ? "text-destructive" : "text-muted-foreground"
                    )}>
                        {hasDelta && <DeltaIcon className="h-3.5 w-3.5" />}
                        <span>{isPositive ? '+' : ''}{hasDelta ? delta : ''} {deltaLabel}</span>
                    </p>
                )}
            </div>

            {/* Pie: descripción con flecha al hover */}
            <div className="mt-auto flex items-center gap-1 text-sm text-muted-foreground/70 transition-colors group-hover:text-brand-primary">
                <span className="truncate">{description}</span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 -translate-x-1 opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100" />
            </div>
        </motion.div>
    );
};

export default KpiCard;
