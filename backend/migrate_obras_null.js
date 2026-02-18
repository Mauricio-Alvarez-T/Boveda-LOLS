const mysql = require('mysql2/promise');

async function migrate() {
    const connection = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: '', // Empty password as per .env
        database: 'sgdl' // As per .env
    });

    try {
        console.log('Running migration: obras.empresa_id NULLable...');

        // Make empresa_id nullable
        await connection.query('ALTER TABLE obras MODIFY COLUMN empresa_id INT NULL');

        console.log('✅ Migration successful: obras.empresa_id is now NULLable.');
    } catch (err) {
        if (err.code === 'ER_BAD_DB_ERROR') {
            // Maybe it's 'boveda_lols'?
            console.error('❌ Check DB name. Trying "boveda_lols"...');
            try {
                await connection.changeUser({ database: 'boveda_lols' });
                await connection.query('ALTER TABLE obras MODIFY COLUMN empresa_id INT NULL');
                console.log('✅ Migration success on boveda_lols');
                return;
            } catch (e) {
                console.error('❌ Migration failed on both db names:', e);
            }
        } else {
            console.error('❌ Migration failed:', err);
        }
    } finally {
        await connection.end();
    }
}

migrate();
