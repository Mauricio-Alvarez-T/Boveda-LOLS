import React, { useId } from 'react';
import { ChevronDown } from 'lucide-react';
import { BarraPaginada } from '../../../ui/BarraPaginada';
import { PestanasElasticas } from '../../../ui/PestanasElasticas';
import { ROTULO_FICHAS } from '../fichasInicio';
import type { ObraVerComo } from './comoObra';
import { plural } from './formato';
import type { PersonaPerfil } from './tipos';
import { OPCIONES_VER_COMO, notaVerComo, type OpcionVerComo, type VistaVerComo } from './verComo.modelo';

interface Props {
    /** La vista que se está mostrando. */
    como: VistaVerComo;
    onComo: (vista: VistaVerComo) => void;
    /** Las opciones con sus etiquetas (`opcionesVerComo(datos.aprobadores)`: la de quien aprueba lleva su nombre). */
    opciones?: readonly OpcionVerComo[];
    /** Quiénes aprueban (`datos.aprobadores`), para la nota de su opción. */
    aprobadores?: readonly PersonaPerfil[] | null;
    /** Obras para «Jefe de obra» (`obrasVerComo`), ya ordenadas. */
    obras: readonly ObraVerComo[];
    /** La obra que se muestra en «Jefe de obra» (`obraPorDefecto`); null si no hay ninguna. */
    obra: number | null;
    onObra: (id: number) => void;
}

const cuantas = (n: number) => (n === 0 ? 'sin solicitudes' : `${n} ${plural(n, 'solicitud', 'solicitudes')}`);

/**
 * Selector «Ver como» del detalle «Inventario» del Inicio, SOLO para el Super Administrador (las opciones y lo que
 * muestra cada una: verComo.modelo.ts). Va arriba del contenido, bajo el encabezado del DetalleModulo.
 *   - Control segmentado neutro como los filtros del Inicio (`FiltroFichas`: marco blanco con sombra chica y el
 *     indicador verde de ítem seleccionado, ui/PestanasElasticas). En el celular, si no cabe, va de a páginas con
 *     flechas (ui/BarraPaginada, diseno.md §9.6): ninguna palabra cortada y la página no se desborda. Opciones de
 *     44 px de alto en el celular (36 px desde 640 px, que con el marco suman 44).
 *   - En «Jefe de obra», un selector de obra al lado (abajo en el celular).
 *   - Una nota chica en cada opción que no es la propia: qué se está viendo (lo recordado no vence: al otro día puede
 *     abrir directo en otra, y así no se confunde con su vista).
 */
const VerComo: React.FC<Props> = ({ como, onComo, opciones = OPCIONES_VER_COMO, aprobadores, obras, obra, onObra }) => {
    const id = useId();
    const nombreObra = obras.find(o => o.id === obra)?.nombre ?? null;
    const nota = notaVerComo(como, { obra: nombreObra, aprobadores });
    return (
        <div data-ver-como={como} className="space-y-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className={ROTULO_FICHAS} aria-hidden>Ver como</span>
                <div className="flex w-fit min-w-0 max-w-full items-center rounded-2xl bg-card p-1 shadow-[var(--shadow-sm)]">
                    <BarraPaginada>{p => (
                        <PestanasElasticas opciones={opciones} activa={como} onCambiar={onComo}
                            aria-label="Ver el detalle de Inventario como"
                            claseFila="gap-1" radio={12}
                            claseOpcion="flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-xl px-3 text-sm font-semibold sm:min-h-9"
                            claseInactiva="text-zinc-600 hover:text-foreground dark:text-zinc-300"
                            estiloOpcion={p.estiloOpcion}
                            revelar={p.revelar}
                            render={o => o.texto} />
                    )}</BarraPaginada>
                </div>
                {como === 'obra' && obras.length > 0 && obra != null && (
                    <div className="flex min-w-0 max-w-full items-center gap-2">
                        <label htmlFor={`${id}-obra`} className="shrink-0 text-sm font-medium text-muted-foreground">Obra</label>
                        <div className="relative min-w-0">
                            <select id={`${id}-obra`} value={obra} onChange={e => onObra(Number(e.target.value))}
                                className="h-11 w-full min-w-0 max-w-full appearance-none truncate rounded-xl border border-input bg-card py-2 pl-3 pr-9 text-sm font-semibold text-foreground transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-brand-primary/40 sm:w-72">
                                {obras.map(o => (
                                    <option key={o.id} value={o.id} className="bg-card text-foreground">
                                        {o.nombre} · {cuantas(o.solicitudes)}
                                    </option>
                                ))}
                            </select>
                            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                        </div>
                    </div>
                )}
            </div>
            {nota && <p className="text-xs text-muted-foreground">{nota}</p>}
        </div>
    );
};

export default VerComo;
