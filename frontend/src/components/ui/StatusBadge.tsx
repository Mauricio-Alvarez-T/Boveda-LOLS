import React from 'react';
import { cn } from '../../utils/cn';
import { statusDomains, FALLBACK_STATUS, type StatusDomain } from '../../utils/statusConfig';
import { Chip, type ChipTone } from './Chip';

/**
 * Badge de estado del design system (Fase 2).
 *
 * Dos formas de uso:
 *  1) Por dominio (recomendado): <StatusBadge domain="transferencia" status={t.estado} showIcon />
 *     → busca label/clases/icono en utils/statusConfig.
 *  2) Explícito: <StatusBadge tone="success" label="Listo" />  → delega en <Chip>.
 */
type ByDomain = {
    domain: StatusDomain;
    status: string;
    showIcon?: boolean;
    className?: string;
    tone?: never;
    label?: never;
};

type Explicit = {
    tone: ChipTone;
    label: React.ReactNode;
    icon?: React.ReactNode;
    className?: string;
    domain?: never;
    status?: never;
};

type StatusBadgeProps = ByDomain | Explicit;

export const StatusBadge: React.FC<StatusBadgeProps> = (props) => {
    if ('domain' in props && props.domain) {
        const { domain, status, showIcon, className } = props;
        const map = statusDomains[domain] as Record<string, typeof FALLBACK_STATUS>;
        const entry = map[status] ?? FALLBACK_STATUS;
        const Icon = entry.icon;
        return (
            <span
                className={cn(
                    'inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-caption font-bold',
                    entry.classes,
                    className,
                )}
            >
                {showIcon && Icon ? <Icon className="h-3 w-3 shrink-0" /> : null}
                {entry.label}
            </span>
        );
    }

    const { tone, label, icon, className } = props as Explicit;
    return <Chip tone={tone} label={label} icon={icon} className={className} />;
};
