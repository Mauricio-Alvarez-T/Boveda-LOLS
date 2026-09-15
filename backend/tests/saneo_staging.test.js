/**
 * Saneo de datos personales en staging. Lo crítico que se prueba acá es la GUARDA: este código
 * borra trabajadores, así que lo primero es que se niegue a correr fuera de un entorno de pruebas.
 * `db` se inyecta como parámetro → mock directo, sin jest.mock ni base real.
 */
const saneo = require('../src/services/saneoStaging.service');
const siembra = require('../src/services/saneoSiembra.service');
const archivos = require('../src/services/saneoArchivos.service');
const { validateRut, cleanRut } = require('../src/utils/rut');

describe('saneoStaging — guarda de entorno', () => {
    test('la base de PRODUCCIÓN queda bloqueada, escriba como escriba el nombre', () => {
        expect(saneo.esBaseDeTest('lolscl_boveda').ok).toBe(false);
        expect(saneo.esBaseDeTest('LOLSCL_BOVEDA').ok).toBe(false);
        expect(saneo.esBaseDeTest('  lolscl_boveda  ').ok).toBe(false);
        expect(saneo.esBaseDeTest('lolscl_boveda').motivo).toMatch(/PRODUCCIÓN/);
    });

    test('solo pasa una base cuyo nombre diga que es de pruebas', () => {
        expect(saneo.esBaseDeTest('lolscl_boveda_test').ok).toBe(true);
        expect(saneo.esBaseDeTest('boveda_staging').ok).toBe(true);
        expect(saneo.esBaseDeTest('boveda_dev').ok).toBe(true);
        // Una base desconocida NO se sanea: el fail-safe es negarse, no adivinar.
        expect(saneo.esBaseDeTest('sgdl').ok).toBe(false);
        expect(saneo.esBaseDeTest('produccion_boveda').ok).toBe(false);
        expect(saneo.esBaseDeTest('').ok).toBe(false);
        expect(saneo.esBaseDeTest(null).ok).toBe(false);
        expect(saneo.esBaseDeTest(undefined).ok).toBe(false);
    });
});

describe('saneoStaging — bloque de RUT ficticios', () => {
    test('los 1000 RUT del bloque son válidos por módulo 11', () => {
        for (let i = 0; i < 1000; i++) {
            expect(validateRut(saneo.rutFicticio(i))).toBe(true);
        }
    });

    test('rutFicticio es determinista, va formateado y cicla dentro del bloque', () => {
        expect(saneo.rutFicticio(0)).toBe(saneo.rutFicticio(0));
        expect(saneo.rutFicticio(0)).toMatch(/^44\.000\.000-/);
        expect(saneo.rutFicticio(1000)).toBe(saneo.rutFicticio(0));   // 1000 ≡ 0
        expect(saneo.rutFicticio(5)).not.toBe(saneo.rutFicticio(6));
    });

    test('esRutFicticio distingue el bloque de un RUT real, con o sin puntos', () => {
        expect(saneo.esRutFicticio(saneo.rutFicticio(7))).toBe(true);
        expect(saneo.esRutFicticio(cleanRut(saneo.rutFicticio(7)))).toBe(true);
        expect(saneo.esRutFicticio('12.345.678-5')).toBe(false);
        expect(saneo.esRutFicticio('44.001.000-1')).toBe(false);   // justo fuera del tope
        expect(saneo.esRutFicticio('43.999.999-9')).toBe(false);   // justo bajo el piso
        expect(saneo.esRutFicticio('')).toBe(false);
        expect(saneo.esRutFicticio(null)).toBe(false);
    });
});

describe('saneoStaging — detección', () => {
    const dbCon = (foraneos, ficticios = 40, enGracia = 0) => ({
        query: jest.fn(async (sql) => {
            if (/COUNT\(\*\) AS ficticios/.test(sql)) return [[{ ficticios }]];
            if (/COUNT\(\*\) AS en_gracia/.test(sql)) return [[{ en_gracia: enGracia }]];
            return [foraneos];
        }),
    });

    test('devuelve los ids foráneos y los conteos', async () => {
        const db = dbCon([
            { id: 3, rut: '12.345.678-5', nombres: 'Real', apellido_paterno: 'Persona', created_at: '2026-01-01' },
            { id: 9, rut: '9.876.543-3', nombres: 'Otra', apellido_paterno: 'Persona', created_at: '2026-02-01' },
        ], 40, 2);
        const r = await saneo.detectar(db);
        expect(r.ids).toEqual([3, 9]);
        expect(r.total).toBe(2);
        expect(r.ficticios).toBe(40);
        expect(r.enGracia).toBe(2);
    });

    test('la gracia por defecto son 48 h y viaja como parámetro a la query', async () => {
        const db = dbCon([]);
        await saneo.detectar(db);
        const conGracia = db.query.mock.calls.find(c => /INTERVAL \? HOUR/.test(c[0]));
        expect(conGracia[1]).toContain(saneo.GRACIA_HORAS);
        expect(saneo.GRACIA_HORAS).toBe(48);
    });

    test('sin foráneos no hay ids que purgar', async () => {
        const r = await saneo.detectar(dbCon([]), { graciaHoras: 12 });
        expect(r.total).toBe(0);
        expect(r.ids).toEqual([]);
    });
});

describe('saneoStaging — purga', () => {
    const dbPurga = () => {
        const sqls = [];
        return {
            sqls,
            query: jest.fn(async (sql) => {
                sqls.push(sql.replace(/\s+/g, ' ').trim());
                if (/SELECT ruta_archivo/.test(sql)) return [[{ ruta_archivo: '5/doc.pdf' }, { ruta_archivo: null }]];
                return [{ affectedRows: 1 }];
            }),
        };
    };

    test('sin ids no toca la base', async () => {
        const db = dbPurga();
        const r = await saneo.purgar(db, { ids: [] });
        expect(db.query).not.toHaveBeenCalled();
        expect(r.rutas).toEqual([]);
    });

    test('borra las tablas que sobrevivirían con PII y en orden compatible con las FK', async () => {
        const db = dbPurga();
        await saneo.purgar(db, { ids: [5] });
        const sql = db.sqls.join(' | ');

        // Las dos que la FK deja vivas (SET NULL) y guardan RUT/nombre o la ficha completa.
        expect(sql).toMatch(/DELETE FROM trabajador_desvinculaciones/);
        expect(sql).toMatch(/DELETE FROM solicitudes_ingreso/);
        // Documentos antes que trabajadores (FK RESTRICT).
        const iDocs = db.sqls.findIndex(s => /^DELETE FROM documentos WHERE/.test(s));
        const iAsis = db.sqls.findIndex(s => /^DELETE FROM asistencias/.test(s));
        const iTrab = db.sqls.findIndex(s => /^DELETE FROM trabajadores/.test(s));
        expect(iDocs).toBeGreaterThanOrEqual(0);
        expect(iTrab).toBeGreaterThan(iDocs);
        expect(iTrab).toBeGreaterThan(iAsis);
    });

    test('recoge las rutas de archivo antes de borrar las filas, descartando nulos', async () => {
        const db = dbPurga();
        const r = await saneo.purgar(db, { ids: [5] });
        expect(r.rutas).toEqual(['5/doc.pdf']);
        expect(db.sqls[0]).toMatch(/^SELECT ruta_archivo/);
    });

    test('una tabla que no existe en el esquema (1146) no aborta el saneo', async () => {
        const db = {
            query: jest.fn(async (sql) => {
                if (/SELECT ruta_archivo/.test(sql)) return [[]];
                if (/sabados_extra_trabajadores/.test(sql)) { const e = new Error('no existe'); e.errno = 1146; throw e; }
                return [{ affectedRows: 2 }];
            }),
        };
        const r = await saneo.purgar(db, { ids: [1] });
        expect(r.borrados.sabados_extra_trabajadores).toBeNull();
        expect(r.borrados.trabajadores).toBe(2);
    });

    test('un error real sí se propaga', async () => {
        const db = {
            query: jest.fn(async (sql) => {
                if (/SELECT ruta_archivo/.test(sql)) return [[]];
                const e = new Error('deadlock'); e.errno = 1213; throw e;
            }),
        };
        await expect(saneo.purgar(db, { ids: [1] })).rejects.toThrow('deadlock');
    });
});

describe('saneoStaging — correo saliente y rastros', () => {
    const dbOk = () => ({ query: jest.fn(async () => [{ affectedRows: 1 }]) });

    test('vacía suscriptores, anula email_alerta y la clave de correo, y NO toca el login', async () => {
        const db = dbOk();
        await saneo.neutralizarCorreo(db);
        const sql = db.query.mock.calls.map(c => c[0]).join(' | ');
        expect(sql).toMatch(/DELETE FROM reportes_suscriptores/);
        expect(sql).toMatch(/DELETE FROM avisos_suscriptores/);
        expect(sql).toMatch(/vehiculo_seguros SET email_alerta = NULL/);
        expect(sql).toMatch(/usuarios SET email_password_enc = NULL/);
        // El login vive de estas dos: si alguna se tocara, staging quedaría inaccesible.
        expect(sql).not.toMatch(/usuarios SET email =/);
        expect(sql).not.toMatch(/password_hash/);
    });

    test('limpia logs_actividad y los nombres de persona de las tablas que se conservan', async () => {
        const db = dbOk();
        await saneo.limpiarRastros(db);
        const sql = db.query.mock.calls.map(c => c[0]).join(' | ');
        expect(sql).toMatch(/DELETE FROM logs_actividad/);
        expect(sql).toMatch(/obras SET encargado_nombre/);
        expect(sql).toMatch(/empresas SET representante_nombre/);
        expect(sql).toMatch(/conductores SET nombre/);
    });
});

describe('saneoSiembra', () => {
    test('la ficha ficticia viene completa: sin huecos el contrato no se puede emitir', () => {
        const f = siembra.fichaFicticia(3);
        for (const k of ['rut', 'nombres', 'apellido_paterno', 'fecha_nacimiento', 'estado_civil', 'direccion', 'comuna', 'nacionalidad', 'afp', 'salud']) {
            expect(f[k]).toBeTruthy();
        }
        expect(validateRut(f.rut)).toBe(true);
        expect(saneo.esRutFicticio(f.rut)).toBe(true);
    });

    test('es determinista y los correos usan un dominio que no puede existir', () => {
        expect(siembra.fichaFicticia(7)).toEqual(siembra.fichaFicticia(7));
        expect(siembra.fichaFicticia(7).email).toMatch(/@ejemplo\.invalid$/);
    });

    test('sin usuarios en la base falla con un mensaje claro (registrado_por es obligatorio)', async () => {
        const db = { query: jest.fn(async () => [[]]) };
        await expect(siembra.sembrar(db, {})).rejects.toThrow(/usuarios/i);
    });
});

describe('saneoArchivos — marcadores', () => {
    test('el PDF es estructuralmente válido y su xref apunta a los objetos', () => {
        const pdf = archivos.pdfMarcador().toString('latin1');
        expect(pdf.startsWith('%PDF-1.4')).toBe(true);
        expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);

        const startxref = Number(pdf.match(/startxref\n(\d+)/)[1]);
        expect(pdf.slice(startxref, startxref + 4)).toBe('xref');
        // Cada offset de la tabla debe caer exactamente en el "N 0 obj" que declara.
        const offsets = [...pdf.slice(startxref).matchAll(/^(\d{10}) 00000 n $/gm)].map(m => Number(m[1]));
        expect(offsets).toHaveLength(5);
        offsets.forEach((off, i) => {
            expect(pdf.slice(off, off + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`);
        });
    });

    test('el .doc lleva BOM y cabecera de Word; el resto cae a texto plano', () => {
        const doc = archivos.docMarcador();
        expect(doc[0]).toBe(0xEF);                                   // BOM UTF-8
        expect(doc.toString('utf8')).toContain('urn:schemas-microsoft-com:office:word');
        expect(archivos.marcadorPara('x.PDF').slice(0, 5).toString()).toBe('%PDF-');
        expect(archivos.marcadorPara('x.docx')[0]).toBe(0xEF);
        expect(archivos.marcadorPara('x.txt').toString()).toMatch(/DOCUMENTO DE PRUEBA/);
    });

    test('carpetasHuerfanas y borrado ignoran rutas fuera de uploads', () => {
        expect(archivos.borrarArchivo('../../../etc/passwd')).toBe(false);
        expect(archivos.borrarArchivo(null)).toBe(false);
        expect(() => archivos.escribirMarcador('../fuera.pdf')).toThrow(/fuera de uploads/);
    });
});
