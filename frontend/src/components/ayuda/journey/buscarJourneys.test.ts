import { coincideBusqueda, textoBusqueda } from './buscarJourneys';

const gestiones = { titulo: 'Consultar un trabajador', descripcion: 'Buscar y abrir la ficha', modulo: 'Gestiones', alias: ['consultas'] };
const asistencia = { titulo: 'Marcar asistencia', descripcion: 'Pantalla diaria', modulo: 'Asistencia' };

describe('buscarJourneys — alias de módulos renombrados', () => {
    it('indexa título, descripción, módulo y alias en minúsculas', () => {
        expect(textoBusqueda(gestiones)).toBe('consultar un trabajador buscar y abrir la ficha gestiones consultas');
    });
    it('encuentra por el nombre nuevo del módulo', () => {
        expect(coincideBusqueda(gestiones, 'Gestiones')).toBe(true);
    });
    it('sigue encontrando por el nombre anterior (alias "consultas")', () => {
        expect(coincideBusqueda(gestiones, 'consultas')).toBe(true);
        expect(coincideBusqueda(asistencia, 'consultas')).toBe(false);
    });
    it('query vacía o con espacios coincide con todo', () => {
        expect(coincideBusqueda(asistencia, '')).toBe(true);
        expect(coincideBusqueda(asistencia, '   ')).toBe(true);
    });
    it('no coincide con texto ajeno', () => {
        expect(coincideBusqueda(gestiones, 'vehículo')).toBe(false);
    });
});
