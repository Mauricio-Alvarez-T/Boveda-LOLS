/**
 * Ficha de ingreso digital — lógica PURA del form (sin DOM): qué exige el schema
 * de terreno vs. el de la oficina, y cómo se traducen los opcionales a la API.
 */
import {
    solicitudIngresoSchema, aprobarSolicitudSchema,
    normalizarDatosPersonales, buildSolicitudPayload, buildAprobarPayload,
    datosPersonalesDefaults, listarDatosPersonales,
    avisoRutExiste, AVISO_SOLICITUD_PENDIENTE,
} from './solicitudIngresoSchema';

describe('avisos del check de RUT (texto acordado con el dueño, sin link)', () => {
    it('trabajador existente: nombre entre paréntesis + instrucción de WhatsApp', () => {
        expect(avisoRutExiste('Juan Pérez')).toBe(
            'Ya existe un trabajador con este RUT (Juan Pérez). Revisa si hay un error en la digitación; si el RUT es correcto, contacta a administración vía WhatsApp.'
        );
    });
    it('solicitud pendiente', () => {
        expect(AVISO_SOLICITUD_PENDIENTE).toBe('Ya hay una solicitud de ingreso pendiente para este RUT.');
    });
});

// RUT con dígito verificador válido (módulo 11).
const RUT_OK = '12.345.678-5';

const fichaTerreno = {
    rut: RUT_OK,
    nombres: ' Juan Andrés ',
    apellido_paterno: 'Pérez',
    apellido_materno: '',
    cargo_id: 3,
    obra_id: 7,
    fecha_ingreso: '2026-09-15',
    observaciones: '  ',
    fecha_nacimiento: '',
    estado_civil: 'Soltero/a',
    direccion: ' Los Aromos 123 ',
    comuna: '',
    afp: '',
    salud: 'FONASA',
    nacionalidad: '',
    telefono: '',
    cargas_familiares: '2',
};

describe('solicitudIngresoSchema (terreno)', () => {
    it('acepta la ficha con solo los ○ obligatorios y opcionales vacíos', () => {
        expect(solicitudIngresoSchema.safeParse(fichaTerreno).success).toBe(true);
    });

    it('rechaza RUT con dígito verificador malo', () => {
        const r = solicitudIngresoSchema.safeParse({ ...fichaTerreno, rut: '12.345.678-9' });
        expect(r.success).toBe(false);
    });

    it('exige cargo, obra y fecha de ingreso (los IDs en 0 = sin selección)', () => {
        expect(solicitudIngresoSchema.safeParse({ ...fichaTerreno, cargo_id: 0 }).success).toBe(false);
        expect(solicitudIngresoSchema.safeParse({ ...fichaTerreno, obra_id: 0 }).success).toBe(false);
        expect(solicitudIngresoSchema.safeParse({ ...fichaTerreno, fecha_ingreso: '' }).success).toBe(false);
    });

    it('NO exige empresa: la define la oficina al aprobar', () => {
        expect('empresa_id' in solicitudIngresoSchema.shape).toBe(false);
    });

    it('cargas familiares solo acepta enteros ≥ 0 (o vacío)', () => {
        expect(solicitudIngresoSchema.safeParse({ ...fichaTerreno, cargas_familiares: '' }).success).toBe(true);
        expect(solicitudIngresoSchema.safeParse({ ...fichaTerreno, cargas_familiares: '0' }).success).toBe(true);
        expect(solicitudIngresoSchema.safeParse({ ...fichaTerreno, cargas_familiares: '-1' }).success).toBe(false);
        expect(solicitudIngresoSchema.safeParse({ ...fichaTerreno, cargas_familiares: 'dos' }).success).toBe(false);
    });
});

describe('aprobarSolicitudSchema (oficina)', () => {
    it('exige empresa y categoría de reporte además de la ficha de terreno', () => {
        expect(aprobarSolicitudSchema.safeParse({ ...fichaTerreno, empresa_id: 0, categoria_reporte: 'obra' }).success).toBe(false);
        expect(aprobarSolicitudSchema.safeParse({ ...fichaTerreno, empresa_id: 2, categoria_reporte: '' }).success).toBe(false);
        expect(aprobarSolicitudSchema.safeParse({ ...fichaTerreno, empresa_id: 2, categoria_reporte: 'rotativo' }).success).toBe(true);
    });
});

describe('normalizarDatosPersonales / payloads', () => {
    it("'' y espacios → null; cargas → número; textos sin espacios en los bordes", () => {
        const n = normalizarDatosPersonales(fichaTerreno);
        expect(n).toEqual({
            fecha_nacimiento: null,
            estado_civil: 'Soltero/a',
            direccion: 'Los Aromos 123',
            comuna: null,
            afp: null,
            salud: 'FONASA',
            nacionalidad: null,
            telefono: null,
            cargas_familiares: 2,
        });
    });

    it('cargas vacías → null (no 0): "sin dato" ≠ "cero cargas"', () => {
        expect(normalizarDatosPersonales({ ...fichaTerreno, cargas_familiares: '' }).cargas_familiares).toBeNull();
        expect(normalizarDatosPersonales({ ...fichaTerreno, cargas_familiares: '0' }).cargas_familiares).toBe(0);
    });

    it('buildSolicitudPayload arma el body del POST sin empresa y con nombres limpios', () => {
        const p = buildSolicitudPayload(fichaTerreno);
        expect(p.nombres).toBe('Juan Andrés');
        expect(p.apellido_materno).toBeNull();
        expect(p.observaciones).toBeNull();
        expect(p.cargo_id).toBe(3);
        expect(p.obra_id).toBe(7);
        expect('empresa_id' in p).toBe(false);
    });

    it('buildAprobarPayload suma empresa_id y categoria_reporte', () => {
        const p = buildAprobarPayload({ ...fichaTerreno, empresa_id: 4, categoria_reporte: 'obra' });
        expect(p.empresa_id).toBe(4);
        expect(p.categoria_reporte).toBe('obra');
        expect(p.rut).toBe(RUT_OK);
    });
});

describe('datosPersonalesDefaults / listarDatosPersonales', () => {
    it('defaults: API (null/number/ISO) → strings de form; sin fuente → todo vacío', () => {
        const d = datosPersonalesDefaults({ fecha_nacimiento: '1990-05-20T00:00:00.000Z', cargas_familiares: 1, afp: null });
        expect(d.fecha_nacimiento).toBe('1990-05-20');
        expect(d.cargas_familiares).toBe('1');
        expect(d.afp).toBe('');
        expect(Object.values(datosPersonalesDefaults(null)).every(v => v === '')).toBe(true);
    });

    it('listar: solo los presentes, en orden de la ficha, con 0 cargas como dato válido', () => {
        const items = listarDatosPersonales({ salud: 'ISAPRE', cargas_familiares: 0, comuna: '', afp: null });
        expect(items.map(i => i.key)).toEqual(['salud', 'cargas_familiares']);
        expect(items[1].value).toBe('0');
        expect(listarDatosPersonales(null)).toEqual([]);
    });
});
