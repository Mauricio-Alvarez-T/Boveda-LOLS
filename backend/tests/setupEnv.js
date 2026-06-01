require('dotenv').config({ path: '.env.test' });

// Fallback para variables críticas que algunos servicios exigen al importarse
if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'test-secret-key';
if (!process.env.DB_HOST) process.env.DB_HOST = 'localhost';
if (!process.env.DB_USER) process.env.DB_USER = 'test';
if (!process.env.DB_NAME) process.env.DB_NAME = 'test_db';
if (!process.env.DB_PASSWORD) process.env.DB_PASSWORD = '';

// Rate limit alto en test: la suite hace ~100+ llamadas supertest (todas keyean
// como el mismo usuario u:1) y no debe toparse con el límite.
if (!process.env.RATE_LIMIT_MAX) process.env.RATE_LIMIT_MAX = '100000';
