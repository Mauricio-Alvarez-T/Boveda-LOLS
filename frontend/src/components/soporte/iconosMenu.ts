import type React from 'react';
import {
    Archive, BookOpen, Calculator, CheckSquare, Globe, Inbox, KeyRound, LayoutDashboard, Lightbulb, Package, SearchCheck, Settings,
    Truck, UserSearch,
} from 'lucide-react';
import type { ClaveTarjeta } from './accesosPerfil';

/**
 * Los íconos del menú lateral (Sidebar.tsx, `extras`; «Comparte tu idea» = el botón del pie), para Soporte: el recuadro
 * «Lo que puede usar…» (AccesosVerComo) y el Panorama. Si cambian en el Sidebar, cambiarlos aquí.
 */
export const ICONO_MENU: Record<ClaveTarjeta, React.ElementType> = {
    inicio: LayoutDashboard,
    asistencia: CheckSquare,
    gestiones: SearchCheck,
    inventario: Package,
    vehiculos: Truck,
    obras_finalizadas: Archive,
    presupuestos: Calculator,
    sitio_web: Globe,
    ayuda: BookOpen,
    revisar_ideas: Inbox,
    soporte: UserSearch,
    configuracion: Settings,
    buzon_ideas: Lightbulb,
    otros: KeyRound,
};
