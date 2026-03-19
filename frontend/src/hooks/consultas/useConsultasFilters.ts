import { useState, useCallback, useMemo, useEffect } from 'react';
import { useObra } from '../../context/ObraContext';

export const useConsultasFilters = () => {
    const { selectedObra } = useObra();

    const [search, setSearch] = useState('');
    const [filterObra, setFilterObra] = useState<string>('');
    const [filterEmpresa, setFilterEmpresa] = useState<string>('');
    const [filterCargo, setFilterCargo] = useState<string>('');
    const [filterCategoria, setFilterCategoria] = useState<string>('');
    const [filterActivo, setFilterActivo] = useState<string>('true');
    const [filterCompletitud, setFilterCompletitud] = useState<string>('');

    // Aplicar filtro de obra contextual
    useEffect(() => {
        if (selectedObra) {
            setFilterObra(selectedObra.id.toString());
        } else {
            setFilterObra('');
        }
    }, [selectedObra]);

    const handleClearFilters = useCallback(() => {
        setSearch('');
        setFilterObra(selectedObra ? selectedObra.id.toString() : '');
        setFilterEmpresa('');
        setFilterCargo('');
        setFilterCategoria('');
        setFilterActivo('true');
        setFilterCompletitud('');
    }, [selectedObra]);

    const activeFilterCount = useMemo(() => {
        return [
            !!search,
            !!filterObra && filterObra !== (selectedObra?.id.toString() || ''),
            !!filterEmpresa,
            !!filterCargo,
            !!filterCategoria,
            filterActivo !== 'true',
            !!filterCompletitud
        ].filter(Boolean).length;
    }, [search, filterObra, filterEmpresa, filterCargo, filterCategoria, filterActivo, filterCompletitud, selectedObra]);

    return {
        search, setSearch,
        filterObra, setFilterObra,
        filterEmpresa, setFilterEmpresa,
        filterCargo, setFilterCargo,
        filterCategoria, setFilterCategoria,
        filterActivo, setFilterActivo,
        filterCompletitud, setFilterCompletitud,
        handleClearFilters,
        activeFilterCount
    };
};
