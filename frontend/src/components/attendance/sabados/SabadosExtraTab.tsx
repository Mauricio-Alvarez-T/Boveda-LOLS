import React, { useMemo, useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckSquare } from 'lucide-react';
import { useObra } from '../../../context/ObraContext';
import { useSetPageHeader } from '../../../context/PageHeaderContext';
import SabadosExtraList from './SabadosExtraList';
import SabadoExtraForm from './SabadoExtraForm';
import SabadoExtraAsistencia from './SabadoExtraAsistencia';

type View = 'list' | 'create' | 'detail';

/**
 * Container del tab "Sábados Extra".
 * Maneja la navegación interna entre 3 vistas:
 *   - list:   listado mensual de citaciones
 *   - create: form para crear nueva citación
 *   - detail: vista del día (marcar asistencia + WhatsApp)
 *
 * Usa query param `sabadoId` para deep-link al detalle.
 */
const SabadosExtraTab: React.FC = () => {
    const { selectedObra } = useObra();
    const [searchParams, setSearchParams] = useSearchParams();
    const sabadoIdParam = searchParams.get('sabadoId');
    const sabadoId = sabadoIdParam ? Number(sabadoIdParam) : null;

    const [view, setView] = useState<View>(sabadoId ? 'detail' : 'list');

    // Sincronizar vista con query param
    useEffect(() => {
        if (sabadoId && view !== 'detail') setView('detail');
        if (!sabadoId && view === 'detail') setView('list');
    }, [sabadoId, view]);

    // Header del tab (cuando no hay obra seleccionada igual mostramos algo)
    const headerTitle = useMemo(() => (
        <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-brand-primary/10 flex items-center justify-center text-brand-primary shadow-sm border border-brand-primary/20 shrink-0">
                <CheckSquare className="h-5 w-5" />
            </div>
            <div className="min-w-0">
                <h1 className="text-sm font-black text-brand-dark tracking-tighter leading-tight uppercase">
                    Sábados Extra
                </h1>
                <p className="text-[10px] text-muted-foreground font-bold truncate opacity-80">
                    {selectedObra ? selectedObra.nombre : 'Selecciona una obra'}
                </p>
            </div>
        </div>
    ), [selectedObra]);

    useSetPageHeader(headerTitle, null);

    const goToList = () => {
        setView('list');
        searchParams.delete('sabadoId');
        setSearchParams(searchParams, { replace: true });
    };

    const goToDetail = (id: number) => {
        searchParams.set('sabadoId', String(id));
        setSearchParams(searchParams, { replace: true });
        setView('detail');
    };

    const goToCreate = () => {
        searchParams.delete('sabadoId');
        setSearchParams(searchParams, { replace: true });
        setView('create');
    };

    return (
        <div className="flex flex-col flex-1 min-h-0 overflow-y-auto p-1">
            {view === 'list' && (
                <SabadosExtraList onSelect={goToDetail} onCreate={goToCreate} />
            )}
            {view === 'create' && (
                <SabadoExtraForm
                    onCreated={(id) => goToDetail(id)}
                    onCancel={goToList}
                />
            )}
            {view === 'detail' && sabadoId && (
                <SabadoExtraAsistencia sabadoId={sabadoId} onBack={goToList} />
            )}
        </div>
    );
};

export default SabadosExtraTab;
