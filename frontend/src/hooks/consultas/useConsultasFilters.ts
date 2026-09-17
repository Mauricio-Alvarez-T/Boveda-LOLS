import { useState, useCallback, useMemo, useEffect, useRef, useDeferredValue } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useObra } from '../../context/ObraContext';

export const useConsultasFilters = () => {
    const { selectedObra } = useObra();
    const [searchParams, setSearchParams] = useSearchParams();

    const [search, setSearch] = useState(searchParams.get('q') || '');
    // El buscador es dueño de su propio texto (ver BuscadorTrabajadores) para no perder teclas, así que
    // no se lo puede «resetear» pasándole un valor: se lo remonta cambiándole la `key`, que es la forma
    // que documenta React para reiniciar estado. Este contador es esa key.
    const [resetBusqueda, setResetBusqueda] = useState(0);

    // El buscador se DESMONTA en varios caminos que no desmontan la página: salir a la portada o a otra
    // sección (`esGrilla` pasa a false) y cruzar los 768px (cambia de sitio: header ↔ cuerpo). Al volver
    // tiene que re-leer el texto que el filtro está aplicando, o la caja aparece vacía sobre una lista
    // filtrada y el usuario no tiene cómo saber por qué ve 3 de 300.
    //
    // Va por un ref y no por una prop de valor a propósito: el elemento del buscador viaja al header
    // dentro de un `useMemo`, y meter `search` en sus deps recompondría el header en cada tecla. Un
    // getter con identidad estable da lo mismo sin ese costo. El componente lo llama UNA vez, en el
    // inicializador perezoso de su `useState`.
    const textoRef = useRef(searchParams.get('q') || '');
    const publicarBusqueda = useCallback((valor: string) => {
        textoRef.current = valor;
        setSearch(valor);
    }, []);
    const leerBusquedaInicial = useCallback(() => textoRef.current, []);

    // Todo lo que DEPENDE del texto usa el valor diferido, no el inmediato: así la tecla recién pulsada
    // solo repinta el input, y la lista, el contador de filtros y los ids de exportación se recalculan
    // juntos en el render de baja prioridad que React puede interrumpir. Si `activeFilterCount` usara
    // `search`, la primera letra lo movería de 0 a 1 en el render urgente y ese cambio de prop bastaría
    // para que la grilla memoizada se renderizara igual.
    const busquedaDiferida = useDeferredValue(search);
    const [filterObra, setFilterObra] = useState<string>(searchParams.get('obra_id') || '');
    const [filterEmpresa, setFilterEmpresa] = useState<string>(searchParams.get('empresa_id') || '');
    const [filterCargo, setFilterCargo] = useState<string>(searchParams.get('cargo_id') || '');
    const [filterCategoria, setFilterCategoria] = useState<string>(searchParams.get('categoria') || '');
    const [filterActivo, setFilterActivo] = useState<string>(searchParams.get('activo') || 'true');
    const [filterCompletitud, setFilterCompletitud] = useState<string>(searchParams.get('completitud') || '');
    const [filterAusentes, setFilterAusentes] = useState<boolean>(searchParams.get('ausentes') === 'true');
    // Filtro "cumplen 10 meses de contrato" en un mes objetivo (YYYY-MM). No tiene
    // control en el FilterPanel: lo activa el botón "Ver detalle" de la alerta del
    // dashboard. Se muestra como chip removible en Consultas.
    const [filterAniversario10m, setFilterAniversario10m] = useState<string>(searchParams.get('aniversario10m') || '');
    // Rango de fecha de ingreso (YYYY-MM-DD, extremos opcionales): "ingresos del período".
    const [filterIngresoDesde, setFilterIngresoDesde] = useState<string>(searchParams.get('ingreso_desde') || '');
    const [filterIngresoHasta, setFilterIngresoHasta] = useState<string>(searchParams.get('ingreso_hasta') || '');
    // ── Filtros de la tanda 2026-09-15 ──
    // Qué dato bloquea una gestión: 'contrato' (no se puede emitir), 'pago' (no se puede
    // transferir el día 5), 'tallas' (no se puede comprar el EPP).
    const [filterFaltaDato, setFilterFaltaDato] = useState<string>(searchParams.get('falta_dato') || '');
    // A quién le falta UN documento obligatorio concreto (id del tipo).
    const [filterDocTipoFalta, setFilterDocTipoFalta] = useState<string>(searchParams.get('doc_tipo_falta') || '');
    // Vigencia: 'vencido' | '30' | '60' | '90'. Distinto de completitud: "¿está el papel?"
    // y "¿sirve el papel?" son dos preguntas.
    const [filterDocVigencia, setFilterDocVigencia] = useState<string>(searchParams.get('doc_vigencia') || '');
    // Rango de fecha de desvinculación: bajas del período.
    const [filterSalidaDesde, setFilterSalidaDesde] = useState<string>(searchParams.get('salida_desde') || '');
    const [filterSalidaHasta, setFilterSalidaHasta] = useState<string>(searchParams.get('salida_hasta') || '');
    // Atajos de un clic (chips), sin control propio en el panel.
    const [filterNoRecontratar, setFilterNoRecontratar] = useState<boolean>(searchParams.get('no_recontratar') === 'true');
    const [filterFiniquito, setFilterFiniquito] = useState<string>(searchParams.get('finiquito') || '');
    const [filterSoloPrueba, setFilterSoloPrueba] = useState<boolean>(searchParams.get('solo_prueba') === 'true');

    // Aplicar filtro de obra contextual solo si no viene de la URL
    useEffect(() => {
        if (selectedObra && !searchParams.get('obra_id')) {
            setFilterObra(selectedObra.id.toString());
        }
    }, [selectedObra, searchParams]);

    const handleClearFilters = useCallback(() => {
        publicarBusqueda('');            // vacía el texto Y el ref del que lee el buscador al montar
        setResetBusqueda(n => n + 1);    // …y lo remonta, porque su texto es local y no se puede pisar
        setFilterObra(selectedObra ? selectedObra.id.toString() : '');
        setFilterEmpresa('');
        setFilterCargo('');
        setFilterCategoria('');
        setFilterActivo('true');
        setFilterCompletitud('');
        setFilterAusentes(false);
        setFilterAniversario10m('');
        setFilterIngresoDesde('');
        setFilterIngresoHasta('');
        setFilterFaltaDato('');
        setFilterDocTipoFalta('');
        setFilterDocVigencia('');
        setFilterSalidaDesde('');
        setFilterSalidaHasta('');
        setFilterNoRecontratar(false);
        setFilterFiniquito('');
        setFilterSoloPrueba(false);
        // Limpia los filtros de la URL pero conserva la sección (B8): sin esto "Limpiar" saltaría a la portada.
        setSearchParams(prev => { const tab = new URLSearchParams(prev).get('tab'); const next = new URLSearchParams(); if (tab) next.set('tab', tab); return next; });
    }, [selectedObra, setSearchParams, publicarBusqueda]);

    // Quita solo el filtro de aniversario (chip removible), limpiando también la URL.
    const clearAniversario10m = useCallback(() => {
        setFilterAniversario10m('');
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            next.delete('aniversario10m');
            return next;
        });
    }, [setSearchParams]);

    const activeFilterCount = useMemo(() => {
        return [
            !!busquedaDiferida,
            !!filterObra && filterObra !== (selectedObra?.id.toString() || ''),
            !!filterEmpresa,
            !!filterCargo,
            !!filterCategoria,
            filterActivo !== 'true',
            !!filterCompletitud,
            filterAusentes,
            !!filterAniversario10m,
            !!filterIngresoDesde || !!filterIngresoHasta,
            !!filterFaltaDato,
            !!filterDocTipoFalta,
            !!filterDocVigencia,
            !!filterSalidaDesde || !!filterSalidaHasta,   // el rango cuenta como uno
            filterNoRecontratar,
            !!filterFiniquito,
            filterSoloPrueba
        ].filter(Boolean).length;
    }, [busquedaDiferida, filterObra, filterEmpresa, filterCargo, filterCategoria, filterActivo, filterCompletitud, filterAusentes, filterAniversario10m, filterIngresoDesde, filterIngresoHasta, filterFaltaDato, filterDocTipoFalta, filterDocVigencia, filterSalidaDesde, filterSalidaHasta, filterNoRecontratar, filterFiniquito, filterSoloPrueba, selectedObra]);

    return {
        search, busquedaDiferida, resetBusqueda, publicarBusqueda, leerBusquedaInicial,
        filterObra, setFilterObra,
        filterEmpresa, setFilterEmpresa,
        filterCargo, setFilterCargo,
        filterCategoria, setFilterCategoria,
        filterActivo, setFilterActivo,
        filterCompletitud, setFilterCompletitud,
        filterAusentes, setFilterAusentes,
        filterAniversario10m, setFilterAniversario10m,
        filterIngresoDesde, setFilterIngresoDesde,
        filterIngresoHasta, setFilterIngresoHasta,
        filterFaltaDato, setFilterFaltaDato,
        filterDocTipoFalta, setFilterDocTipoFalta,
        filterDocVigencia, setFilterDocVigencia,
        filterSalidaDesde, setFilterSalidaDesde,
        filterSalidaHasta, setFilterSalidaHasta,
        filterNoRecontratar, setFilterNoRecontratar,
        filterFiniquito, setFilterFiniquito,
        filterSoloPrueba, setFilterSoloPrueba,
        clearAniversario10m,
        handleClearFilters,
        activeFilterCount
    };
};
