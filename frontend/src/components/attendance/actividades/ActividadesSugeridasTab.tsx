import React, { useMemo, useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ClipboardList } from 'lucide-react';
import { useObra } from '../../../context/ObraContext';
import { useSetPageHeader } from '../../../context/PageHeaderContext';
import ActividadesSugeridasList from './ActividadesSugeridasList';
import ActividadSugeridaForm from './ActividadSugeridaForm';
import ActividadSugeridaAsistencia from './ActividadSugeridaAsistencia';

type View = 'list' | 'create' | 'detail';

/**
 * Container de la pestaña "Actividades sugeridas" (lista de trabajadores en
 * actividades sugeridas, por obra y semana). Tres vistas internas:
 *   - list:   listas del mes
 *   - create: form para armar una lista nueva (semana + trabajadores)
 *   - detail: la lista (marcar asistencia + WhatsApp)
 *
 * Usa el query param `actividadId` para deep-link al detalle.
 */
const ActividadesSugeridasTab: React.FC = () => {
    const { selectedObra } = useObra();
    const [searchParams, setSearchParams] = useSearchParams();
    const actividadIdParam = searchParams.get('actividadId');
    const actividadId = actividadIdParam ? Number(actividadIdParam) : null;

    const [view, setView] = useState<View>(actividadId ? 'detail' : 'list');

    // Sincronizar vista con query param
    useEffect(() => {
        if (actividadId && view !== 'detail') setView('detail');
        if (!actividadId && view === 'detail') setView('list');
    }, [actividadId, view]);

    // Header de la pestaña (cuando no hay obra seleccionada igual mostramos algo)
    const headerTitle = useMemo(() => (
        <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center text-muted-foreground shadow-sm border border-border shrink-0">
                <ClipboardList className="h-5 w-5" />
            </div>
            <div className="min-w-0">
                <h1 className="text-sm font-black text-brand-dark tracking-tighter leading-tight uppercase">
                    Actividades sugeridas
                </h1>
                <p className="text-caption text-muted-foreground font-bold truncate opacity-80">
                    {selectedObra ? selectedObra.nombre : 'Selecciona una obra'}
                </p>
            </div>
        </div>
    ), [selectedObra]);

    useSetPageHeader(headerTitle, null);

    const goToList = () => {
        setView('list');
        searchParams.delete('actividadId');
        setSearchParams(searchParams, { replace: true });
    };

    const goToDetail = (id: number) => {
        searchParams.set('actividadId', String(id));
        setSearchParams(searchParams, { replace: true });
        setView('detail');
    };

    const goToCreate = () => {
        searchParams.delete('actividadId');
        setSearchParams(searchParams, { replace: true });
        setView('create');
    };

    return (
        <div className="flex flex-col flex-1 min-h-0 overflow-y-auto p-1">
            {view === 'list' && (
                <ActividadesSugeridasList onSelect={goToDetail} onCreate={goToCreate} />
            )}
            {view === 'create' && (
                <ActividadSugeridaForm
                    onCreated={(id) => goToDetail(id)}
                    onCancel={goToList}
                />
            )}
            {view === 'detail' && actividadId && (
                <ActividadSugeridaAsistencia actividadId={actividadId} onBack={goToList} />
            )}
        </div>
    );
};

export default ActividadesSugeridasTab;
