require('dotenv').config({ path: '.env.test' });

// Fallback para variables críticas que algunos servicios exigen al importarse
if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'test-secret-key';
