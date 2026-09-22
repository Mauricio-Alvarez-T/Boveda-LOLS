/**
 * Abrir un documento generado por Bóveda (plan Gestiones B2): descargar el Word o mandarlo a la
 * vista de impresión. Vive fuera de los modales porque lo usan tres componentes (kit, amonestación y
 * la lista de la ficha) y un archivo de componentes no puede exportar helpers (fast-refresh).
 * El gate real es del backend: documentos.laborales.descargar (exclusivo).
 */
import api from '../../services/api';
import { showApiError } from '../../utils/toastUtils';
import { descargarArchivo } from '../../utils/descargarArchivo';
import { printDoc } from '../../utils/printHtml';

export async function abrirGenerado(documentoId: number, nombre: string, modo: 'download' | 'print'): Promise<void> {
    if (modo === 'download') {
        await descargarArchivo(api, `/documentos-laborales/${documentoId}/download`, { nombre, modo: 'download' });
        return;
    }
    try {
        const res = await api.get<{ data: { html: string } }>(`/documentos-laborales/${documentoId}/html`);
        printDoc(res.data.data.html);
    } catch (err) {
        showApiError(err, 'No se pudo abrir la vista de impresión');
    }
}
