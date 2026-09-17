import React, { useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '../ui/Input';
import { cn } from '../../utils/cn';

interface Props {
    /**
     * Getter del texto vigente, llamado UNA sola vez al montar. Es un getter y no un string para que el
     * elemento no dependa del texto: así el `useMemo` del header no se recompone en cada tecla, y aun así
     * cualquier remonte (cambio de sección, cruce de 768px) recupera lo que el filtro está aplicando.
     * Debe ser ESTABLE (`useCallback` sin deps).
     */
    obtenerValorInicial: () => string;
    /** Debe ser ESTABLE (`useCallback` o un `setState`): si cambia de identidad, el header se recompone. */
    onCambio: (valor: string) => void;
    /** `true` en el buscador del header (denso). En móvil se deja en 44px y 16px — ver abajo. */
    compacto?: boolean;
    className?: string;
}

/**
 * El buscador de Trabajadores, dueño de su propio texto (2026-09-17).
 *
 * Arregla el bug de «se pierden letras al escribir rápido». La causa no era el rendimiento: el input de
 * escritorio no lo dibujaba la página, sino que viajaba dentro de `headerTitle` →
 * `useSetPageHeader` → un `useEffect` que hace `dispatch.setTitle(...)` → estado de
 * `PageHeaderProvider` → `MainLayout`. Es decir, su `value` llegaba a la pantalla **un ciclo de render
 * más tarde**, y React, al cerrar el evento de cambio, le devuelve al nodo DOM el `value` de la prop que
 * tiene renderizada — todavía el viejo. Tecleando rápido, la carrera se acumula y las pulsaciones se
 * pierden. (El buscador móvil, que se renderiza directo en el árbol de la página, nunca tuvo el síntoma:
 * esa fue la prueba que lo confirmó.)
 *
 * Acá el `value` sale de un `useState` local, así que se pinta en el MISMO commit del evento y ningún
 * render lento de más arriba puede revertirlo. El texto se publica hacia arriba con `onCambio` para que
 * la grilla filtre; si esa publicación llega tarde, da igual: el input ya mostró la letra.
 *
 * El texto de arriba se lee **solo al montar**, a propósito. Sincronizarlo en cada render reintroduciría
 * exactamente el bug: si el valor de arriba viene atrasado, pisaría lo recién tecleado. Para un reset
 * externo («Limpiar filtros») el padre cambia la `key` del componente, que es la forma que documenta
 * React para reiniciar estado.
 *
 * En escritorio lo pinta el header y en móvil el cuerpo de la página (MainLayout esconde el título por
 * debajo de 768px). Son dos posiciones distintas del árbol, así que salir de la sección o cruzar los
 * 768px **desmonta y remonta** este componente: por eso el valor inicial llega como getter, que al
 * montar devuelve el texto vigente y no el de hace rato. Sin eso la caja aparecía vacía sobre una lista
 * filtrada, sin nada que explicara por qué se veían 3 de 300.
 */
export const BuscadorTrabajadores: React.FC<Props> = ({ obtenerValorInicial, onCambio, compacto, className }) => {
    // Inicializador perezoso: el getter corre una vez, en el primer render de esta instancia.
    const [texto, setTexto] = useState(obtenerValorInicial);

    return (
        <div className={className}>
            <div className="relative">
                <Search className={cn(
                    'absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground z-10 pointer-events-none',
                    compacto ? 'h-4 w-4' : 'h-5 w-5',
                )} />
                <Input
                    placeholder="Buscar por Nombre, RUT..."
                    aria-label="Buscar trabajador por nombre o RUT"
                    value={texto}
                    onChange={(e) => { setTexto(e.target.value); onCambio(e.target.value); }}
                    className={cn(
                        'bg-muted/50 border-border focus:bg-card transition-all',
                        // En móvil NO se baja de 16px: Safari iOS hace auto-zoom sobre la página al
                        // enfocar un campo con fuente menor, y el objetivo táctil se queda en 44px.
                        compacto ? 'pl-9 h-10 rounded-xl text-sm' : 'pl-10 h-11 rounded-2xl text-base',
                    )}
                />
            </div>
        </div>
    );
};
