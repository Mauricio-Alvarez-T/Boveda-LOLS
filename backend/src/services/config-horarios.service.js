const db = require('../config/db');

class ConfigHorariosService {
    async getByObraId(obraId) {
        const [rows] = await db.execute(
            `SELECT * FROM configuracion_horarios 
             WHERE obra_id = ? AND activo = TRUE
             ORDER BY 
               CASE dia_semana 
                 WHEN 'lun' THEN 1 
                 WHEN 'mar' THEN 2 
                 WHEN 'mie' THEN 3 
                 WHEN 'jue' THEN 4 
                 WHEN 'vie' THEN 5 
                 WHEN 'sab' THEN 6 
               END`,
            [obraId]
        );

        if (rows.length === 0) {
            const defaultDays = ['lun', 'mar', 'mie', 'jue', 'vie'];
            const defaults = defaultDays.map(dia => ({
                dia_semana: dia,
                hora_entrada: '08:00:00',
                hora_salida: '18:00:00',
                hora_colacion_inicio: '13:00:00',
                hora_colacion_fin: '14:00:00',
                obra_id: parseInt(obraId),
                activo: 1
            }));
            return defaults;
        }

        return rows;
    }

    async updateWeeklyConfig(obraId, weeklyData) {
        // weeklyData as an array of objects: { dia_semana, hora_entrada, hora_salida, hora_colacion_inicio, hora_colacion_fin }

        // Start a transaction in case of failure
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            for (const dia of weeklyData) {
                // Upsert logic based on UNIQUE KEY uk_horario_obra_dia (obra_id, dia_semana)
                await conn.execute(
                    `INSERT INTO configuracion_horarios 
                     (obra_id, dia_semana, hora_entrada, hora_salida, hora_colacion_inicio, hora_colacion_fin) 
                     VALUES (?, ?, ?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE 
                     hora_entrada = VALUES(hora_entrada),
                     hora_salida = VALUES(hora_salida),
                     hora_colacion_inicio = VALUES(hora_colacion_inicio),
                     hora_colacion_fin = VALUES(hora_colacion_fin)`,
                    [
                        obraId,
                        dia.dia_semana,
                        dia.hora_entrada,
                        dia.hora_salida,
                        dia.hora_colacion_inicio,
                        dia.hora_colacion_fin
                    ]
                );
            }

            await conn.commit();
            return { message: 'Configuración actualizada correctamente.' };
        } catch (error) {
            await conn.rollback();
            throw error;
        } finally {
            conn.release();
        }
    }
}

module.exports = new ConfigHorariosService();
