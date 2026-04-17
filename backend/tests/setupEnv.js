require('dotenv').config({ path: '.env.test' });

// Fallback para variables críticas que algunos servicios exigen al importarse
if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'test-secret-key';
if (!process.env.DB_HOST) process.env.DB_HOST = 'localhost';
if (!process.env.DB_USER) process.env.DB_USER = 'test';
if (!process.env.DB_NAME) process.env.DB_NAME = 'test_db';
if (!process.env.DB_PASSWORD) process.env.DB_PASSWORD = '';
