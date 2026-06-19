import React, { useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, RotateCcw, ShoppingBag } from 'lucide-react';
import { Button } from '../../ui/Button';
import { CatalogoCarrito } from '../../inventario/nuevo-movimiento/CatalogoCarrito';
import MaterialesAprobacionPanel from '../../inventario/transferencia-detail/MaterialesAprobacionPanel';
import type { ItemInput, CustomItemInput } from '../../../utils/inferMovimiento';
import { itemsDemo, categoriasDemo, disponibleTotalDemo, obrasDemo } from './mockData';

/**
 * Demo interactiva del flujo "Pedir materiales" (ítems fuera de catálogo). Reusa
 * componentes REALES en 2 fases, encadenando el ciclo sin backend:
 *   1) Crear: `CatalogoCarrito` (pestaña "Otros materiales") para agregar materiales.
 *   2) Aprobar: `MaterialesAprobacionPanel` con esos materiales (Comprar / Traer de
 *      obra). Lo que el usuario agrega en la fase 1 alimenta la aprobación.
 */
type Fase = 'crear' | 'aprobar' | 'listo';

export const DemoMateriales: React.FC = () => {
    const [fase, setFase] = useState<Fase>('crear');
    const [cart, setCart] = useState<ItemInput[]>([]);
    const [customItems, setCustomItems] = useState<CustomItemInput[]>([]);

    const customLimpios = useMemo(() => customItems.filter(c => c.descripcion.trim()), [customItems]);

    // Materiales agregados → forma que espera MaterialesAprobacionPanel.
    const matItems = useMemo(
        () => customLimpios.map((c, i) => ({
            id: i + 1,
            descripcion: c.descripcion.trim(),
            cantidad: c.cantidad,
            unidad: c.unidad?.trim() || null,
        })),
        [customLimpios],
    );

    const reset = () => { setFase('crear'); setCart([]); setCustomItems([]); };

    if (fase === 'listo') {
        return (
            <div className="rounded-2xl border border-success/30 bg-success/5 p-6 text-center space-y-3">
                <CheckCircle2 className="h-10 w-10 text-success mx-auto" />
                <div>
                    <h3 className="text-title-sm font-bold text-brand-dark">¡Materiales aprobados! (demo)</h3>
                    <p className="text-caption text-muted-foreground mt-1">
                        En la app real la solicitud de materiales pasaría a <span className="font-bold">Aprobada</span>,
                        con cada material marcado para <span className="font-bold">comprar</span> o <span className="font-bold">traer de otra obra</span>.
                    </p>
                </div>
                <Button variant="secondary" size="sm" onClick={reset} leftIcon={<RotateCcw className="h-3.5 w-3.5" />}>
                    Empezar de nuevo
                </Button>
            </div>
        );
    }

    if (fase === 'aprobar') {
        return (
            <div className="space-y-3">
                <p className="text-caption text-muted-foreground">
                    Paso 2 de 2 — <span className="font-bold text-brand-dark">Aprobar materiales</span>: por cada uno, define si se <span className="font-bold">compra</span> o se <span className="font-bold">trae de otra obra</span>.
                </p>
                <MaterialesAprobacionPanel
                    items={matItems}
                    obras={obrasDemo}
                    loading={false}
                    onConfirm={() => setFase('listo')}
                    onCancel={() => setFase('crear')}
                />
            </div>
        );
    }

    // fase === 'crear'
    return (
        <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-4">
            <div>
                <p className="text-section font-bold text-brand-dark">Pedir materiales</p>
                <p className="text-caption text-muted-foreground mt-1 flex items-center gap-1.5">
                    <ShoppingBag className="h-3.5 w-3.5 shrink-0 text-brand-primary" />
                    Paso 1 de 2 — Agrega lo que necesitas en la pestaña <span className="font-bold">Otros materiales</span> (cosas que no están en el catálogo).
                </p>
            </div>

            <CatalogoCarrito
                catalogo={itemsDemo} stockEnOrigen={{}} conStockFiltro={false}
                disponibleTotal={disponibleTotalDemo} categorias={categoriasDemo} loading={false}
                cart={cart} setCart={setCart}
                allowCustom customItems={customItems} setCustomItems={setCustomItems}
            />

            <div className="flex items-center justify-end pt-3 border-t border-border">
                <Button
                    onClick={() => setFase('aprobar')}
                    disabled={customLimpios.length === 0}
                    rightIcon={<ArrowRight className="h-4 w-4" />}
                    title={customLimpios.length === 0 ? 'Agrega al menos un material en "Otros materiales"' : undefined}
                >
                    Continuar a aprobación
                </Button>
            </div>
        </div>
    );
};

export default DemoMateriales;
