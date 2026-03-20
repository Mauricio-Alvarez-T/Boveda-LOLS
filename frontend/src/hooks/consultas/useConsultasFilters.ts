import { useState, useCallback, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useObra } from '../../context/ObraContext';

export const useConsultasFilters = () => {
    const { selectedObra } = useObra();
    const [searchParams, setSearchParams] = useSearchParams();

    const [search, setSearch] = useState(searchParams.get('q') || '');
    const [filterObra, setFilterObra] = useState<string>(searchParams.get('obra_id') || '');
    const [filterEmpresa, setFilterEmpresa] = useState<string>(searchParams.get('empresa_id') || '');
    const [filterCargo, setFilterCargo] = useState<string>(searchParams.get('cargo_id') || '');
    const [filterCategoria, setFilterCategoria] = useState<string>(searchParams.get('categoria') || '');
    const [filterActivo, setFilterActivo] = useState<string>(searchParams.get('activo') || 'true');
    const [filterCompletitud, setFilterCompletitud] = useState<string>(searchParams.get('completitud') || '');
    const [filterAusentes, setFilterAusentes] = useState<boolean>(searchParams.get('ausentes') === 'true');

    // Aplicar filtro de obra contextual solo si no viene de la URL
    useEffect(() => {
        if (selectedObra && !searchParams.get('obra_id')) {
            setFilterObra(selectedObra.id.toString());
        }
    }, [selectedObra, searchParams]);

    const handleClearFilters = useCallback(() => {
        setSearch('');
        setFilterObra(selectedObra ? selectedObra.id.toString() : '');
        setFilterEmpresa('');
        setFilterCargo('');
        setFilterCategoria('');
        setFilterActivo('true');
        setFilterCompletitud('');
        setFilterAusentes(false);
        setSearchParams({}); // Clear URL params too
    }, [selectedObra, setSearchParams]);

    const activeFilterCount = useMemo(() => {
        return [
            !!search,
            !!filterObra && filterObra !== (selectedObra?.id.toString() || ''),
            !!filterEmpresa,
            !!filterCargo,
            !!filterCategoria,
            filterActivo !== 'true',
            !!filterCompletitud,
            filterAusentes
        ].filter(Boolean).length;
    }, [search, filterObra, filterEmpresa, filterCargo, filterCategoria, filterActivo, filterCompletitud, filterAusentes, selectedObra]);

    return {
        search, setSearch,
        filterObra, setFilterObra,
        filterEmpresa, setFilterEmpresa,
        filterCargo, setFilterCargo,
        filterCategoria, setFilterCategoria,
        filterActivo, setFilterActivo,
        filterCompletitud, setFilterCompletitud,
        filterAusentes, setFilterAusentes,
        handleClearFilters,
        activeFilterCount
    };
};
