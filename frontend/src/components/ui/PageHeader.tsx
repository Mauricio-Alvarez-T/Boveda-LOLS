import React, { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';
import { useSetPageHeader } from '../../context/PageHeaderContext';

export interface PageHeaderProps {
    title: ReactNode;
    icon: LucideIcon;
    badgeCount?: number;
    actions?: ReactNode;
}

export function useStandardHeader({ title, icon: Icon, badgeCount, actions }: PageHeaderProps) {
    const headerTitle = React.useMemo(() => (
        <div className="flex items-center gap-2 md:gap-3">
            <Icon className="h-5 w-5 md:h-6 md:w-6 text-brand-primary shrink-0" />
            <div className="flex flex-col md:flex-row md:items-center gap-0.5 md:gap-2 min-w-0">
                <h1 className="text-sm md:text-lg font-bold text-brand-dark truncate">{title}</h1>
                {badgeCount !== undefined && badgeCount > 0 && (
                    <span className="bg-[#E8E8ED] text-muted-foreground text-xs font-semibold px-2 py-0.5 rounded-full w-fit">
                        {badgeCount}
                    </span>
                )}
            </div>
        </div>
    ), [title, Icon, badgeCount]);

    useSetPageHeader(headerTitle, actions);
}

export const PageHeader: React.FC<PageHeaderProps> = (props) => {
    useStandardHeader(props);
    return null;
};
