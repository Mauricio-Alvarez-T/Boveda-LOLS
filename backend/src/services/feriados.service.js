const db = require('../config/db');

class FeriadosService {
    async getAll() {
        const [rows] = await db.query('SELECT * FROM feriados WHERE activo = 1 ORDER BY fecha ASC');
        return rows;
    }

    async getByDateRange(start, end) {
        const [rows] = await db.query(
            'SELECT * FROM feriados WHERE fecha BETWEEN ? AND ? AND activo = 1',
            [start, end]
        );
        return rows;
    }

    async create(data) {
        const { fecha, nombre, tipo, irrenunciable } = data;
        const [result] = await db.query(
            'INSERT INTO feriados (fecha, nombre, tipo, irrenunciable) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE nombre = VALUES(nombre), tipo = VALUES(tipo), irrenunciable = VALUES(irrenunciable), activo = 1',
            [fecha, nombre, tipo || 'obra', irrenunciable || false]
        );
        return { id: result.insertId || null, ...data };
    }

    async update(id, data) {
        const { fecha, nombre, tipo, irrenunciable } = data;
        await db.query(
            'UPDATE feriados SET fecha = ?, nombre = ?, tipo = ?, irrenunciable = ? WHERE id = ?',
            [fecha, nombre, tipo || 'obra', irrenunciable || false, id]
        );
        return { id, ...data };
    }

    async delete(id) {
        await db.query('UPDATE feriados SET activo = 0 WHERE id = ?', [id]);
        return true;
    }

    async syncNacionalHolidays(year) {
        try {
            // Usamos la API de digital.gob.cl como primera opción
            const response = await fetch(`https://apis.digital.gob.cl/fl/feriados/${year}`, {
                headers: { 'User-Agent': 'BovedaLOLS/1.0' }
            });
            
            if (!response.ok) throw new Error('API Feriados no disponible');
            
            const holidays = await response.json();
            let count = 0;

            for (const h of holidays) {
                // Formato esperado: { nombre: "...", fecha: "YYYY-MM-DD", irrenunciable: "1/0" }
                await this.create({
                    fecha: h.fecha,
                    nombre: h.nombre,
                    tipo: 'nacional',
                    irrenunciable: h.irrenunciable === "1" || h.irrenunciable === true
                });
                count++;
            }
            
            return { success: true, count };
        } catch (error) {
            console.error('Error syncing holidays:', error);
            // Fallback opcional aquí si es necesario
            throw error;
        }
    }
}

module.exports = new FeriadosService();
