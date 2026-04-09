import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
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
    trendData?: number[];
    delta?: number;
    deltaLabel?: string;
    deltaInverted?: boolean; // true = negative delta is good (e.g., absences going down)
}

const KpiCard: React.FC<KpiCardProps> = ({ label, value, icon: Icon, color, bg, description, onClick, index = 0, trendData, delta, deltaLabel, deltaInverted = false }) => {
    // Si no hay datos, usamos unos por defecto para que no se vea vacío
    const defaultData = [40, 30, 45, 50, 40, 55, 50, 60, 55];
    const dataPoints = trendData && trendData.length > 0 ? trendData : defaultData;
    const chartData = dataPoints.map((val, i) => ({ val, i }));

    // Extraer el color hex del string si existe (e.g., text-brand-primary)
    const hexMatch = color.match(/#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})/);
    const strokeColor = hexMatch ? `#${hexMatch[1]}` : '#029E4D';

    // Delta display logic
    const hasDelta = delta !== undefined && delta !== null && delta !== 0;
    const isPositive = delta !== undefined && delta > 0;
    const isNegative = delta !== undefined && delta < 0;
    const isGood = deltaInverted ? isNegative : isPositive;
    const isBad = deltaInverted ? isPositive : isNegative;
    const DeltaIcon = hasDelta ? (isPositive ? TrendingUp : TrendingDown) : Minus;

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.08 }}
            onClick={onClick}
            className="bg-white rounded-2xl border border-border p-5 relative overflow-hidden group hover:shadow-md hover:border-[#B0B0B5] transition-all cursor-pointer h-[150px] flex flex-col justify-between"
        >
            <div className="flex items-center gap-4 relative z-10">
                <div className={cn("p-3 rounded-2xl", bg, color)}>
                    <Icon className="h-5 w-5" />
                </div>
                <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">{label}</p>
                    <div className="flex items-end gap-2">
                        <p className="text-3xl font-bold text-brand-dark mt-0.5 tracking-tight">{value}</p>
                        {hasDelta && (
                            <div className={cn(
                                "flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold mb-1",
                                isGood ? "bg-brand-accent/10 text-brand-accent"
                                    : isBad ? "bg-destructive/10 text-destructive"
                                        : "bg-muted/10 text-muted-foreground"
                            )}>
                                <DeltaIcon className="h-2.5 w-2.5" />
                                <span>{isPositive ? '+' : ''}{delta}{typeof delta === 'number' && deltaLabel?.includes('%') ? '' : ''}</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex items-end justify-between mt-auto relative z-10">
                <div className="flex flex-col gap-0.5">
                    {deltaLabel && (
                        <span className="text-[9px] text-muted-foreground font-medium">{deltaLabel}</span>
                    )}
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground opacity-60 group-hover:opacity-100 transition-opacity">
                        <ArrowRight className="h-3 w-3" />
                        <span className="truncate max-w-[120px]">{description}</span>
                    </div>
                </div>

                <div className="h-10 w-20">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData}>
                            <defs>
                                <linearGradient id={`grad-${index}`} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor={strokeColor} stopOpacity={0.3} />
                                    <stop offset="100%" stopColor={strokeColor} stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <Area
                                type="monotone"
                                dataKey="val"
                                stroke={strokeColor}
                                strokeWidth={2}
                                fill={`url(#grad-${index})`}
                                dot={false}
                                isAnimationActive={true}
                                animationDuration={2000}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div className={cn("absolute -right-4 -top-4 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity", color)}>
                <Icon className="h-24 w-24 rotate-12" />
            </div>
        </motion.div>
    );
};

export default KpiCard;
