const { findUnexpectedDuplicates, getMigrationNumber, KNOWN_DUPLICATE_PREFIXES } = require('../scripts/migrate');

describe('migrate.js — guard anti-duplicados', () => {
    test('getMigrationNumber extrae el prefijo NNN', () => {
        expect(getMigrationNumber('075_participa_apartados.sql')).toBe('075');
        expect(getMigrationNumber('run_all.sql')).toBeNull();
    });

    test('los 6 prefijos duplicados conocidos NO se reportan', () => {
        const known = [
            '007_nomenclatura.sql', '007_update_config_horarios.sql',
            '032_cleanup_es_sabado.sql', '032_transferencia_parcial.sql',
            '054_decimal_cantidad_pendientes.sql', '054_stock_movimientos.sql',
            '070_solicitud_materiales_aprobacion.sql', '070_vehiculos_alertas.sql',
            '071_solicitud_materiales_origen.sql', '071_vehiculos_revision_direccion.sql',
            '074_obras_finalizada.sql', '074_vehiculo_permisos_circulacion.sql',
        ];
        expect(findUnexpectedDuplicates(known)).toEqual([]);
        // sanity: la whitelist contiene exactamente esos 6
        expect([...KNOWN_DUPLICATE_PREFIXES].sort()).toEqual(['007', '032', '054', '070', '071', '074']);
    });

    test('un prefijo duplicado NUEVO se reporta como offender', () => {
        const files = ['075_participa_apartados.sql', '076_alpha.sql', '076_beta.sql'];
        const offenders = findUnexpectedDuplicates(files);
        expect(offenders).toHaveLength(1);
        expect(offenders[0].n).toBe('076');
        expect(offenders[0].list).toEqual(['076_alpha.sql', '076_beta.sql']);
    });

    test('lista sin duplicados → []', () => {
        expect(findUnexpectedDuplicates(['001_a.sql', '002_b.sql', '003_c.sql'])).toEqual([]);
    });

    test('un nuevo duplicado en un prefijo whitelisteado igual pasa (whitelist por número)', () => {
        // El guard es por número; si el 070 sumara un 3er archivo, sigue tolerado.
        // Documenta el comportamiento elegido (whitelist por prefijo, no por par exacto).
        const files = ['070_a.sql', '070_b.sql', '070_c.sql'];
        expect(findUnexpectedDuplicates(files)).toEqual([]);
    });
});
