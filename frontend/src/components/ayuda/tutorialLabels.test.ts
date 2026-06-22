import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Guard anti-drift: el realce (spotlight) de los tutoriales ubica los botones de las
 * pantallas reales POR SU TEXTO. Si alguien renombra uno de estos botones en
 * producción, el tutorial se rompe en silencio (tsc no lo ve: es un string). Este
 * test lee el SOURCE de cada componente real y exige que la etiqueta siga existiendo.
 * Si falla: actualizar el componente o la etiqueta-objetivo en los runners de Ayuda.
 */
const src = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8');

const CASOS: Array<{ archivo: string; etiquetas: string[] }> = [
    { archivo: 'inventario/nuevo-movimiento/NuevoMovimientoWizardView.tsx', etiquetas: ['Crear solicitud', 'Crear movimiento', 'Siguiente'] },
    { archivo: 'inventario/TransferenciaActionsMenu.tsx', etiquetas: ['Revisar y aprobar', 'Registrar lo que llegó'] },
    { archivo: 'inventario/transferencia-detail/RecibirForm.tsx', etiquetas: ['Esta es toda la entrega', 'Faltan más viajes'] },
    { archivo: 'inventario/transferencia-detail/AprobarForm.tsx', etiquetas: ['Confirmar Aprobación'] },
    { archivo: 'inventario/transferencia-detail/MaterialesRecepcionPanel.tsx', etiquetas: ['Cerrar entrega (total)', 'Registrar viaje (parcial)'] },
    { archivo: 'inventario/DiscrepanciaDetail.tsx', etiquetas: ['Resolver', 'Descartar', 'Marcar como resuelta'] },
    { archivo: 'attendance/ui/AttendanceHeaderActions.tsx', etiquetas: ['Guardar'] },
];

describe('etiquetas de botones que los tutoriales resaltan (no romper en silencio)', () => {
    CASOS.forEach(({ archivo, etiquetas }) => {
        const contenido = src(archivo);
        etiquetas.forEach(lbl => {
            it(`${archivo} contiene "${lbl}"`, () => {
                expect(contenido).toContain(lbl);
            });
        });
    });
});
