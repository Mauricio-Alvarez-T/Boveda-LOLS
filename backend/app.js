/**
 * Bóveda LOLS — Passenger Startup File
 * 
 * cPanel's Phusion Passenger requires a specific entry point.
 * This file wraps the main Express app for production deployment.
 */
require('dotenv').config();
const app = require('./index');
