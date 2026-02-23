# Bóveda LOLS - Sistema de Gestión de Nómina y Asistencia

Sistema profesional de gestión documental, control de asistencia y reportabilidad automatizada para la construcción. Diseñado con una interfaz premium inspirada en los estándares estéticos de Apple.

## 🚀 Características Principales

- **Gestión de Trabajadores**: Fichas técnicas, carga de documentos y seguimiento de vigencia.
- **Asistencia Avanzada**: Registro diario con geolocalización de obra, cálculos de horas extra automáticos y estados dinámicos.
- **Nómina & Reportes**: Generación de nóminas en Excel con filtros cruzados inteligentes.
- **Envío de Correo Seguro**: Sistema de plantillas de email con contraseñas cifradas vía AES-256 en el servidor.
- **Reportabilidad WhatsApp**: Formato de reporte personalizado por categorías de cargo.

---

## 🛠️ Requisitos Previos

- **Node.js**: Versión 18 o superior.
- **MySQL**: Versión 8.0 o superior.
- **NPM**: Incluido con Node.js.

---

## ⚙️ Instalación y Configuración

Siga estos pasos para poner el proyecto en marcha localmente:

### 1. Clonar el repositorio
```bash
git clone https://github.com/Mauricio-Alvarez-T/Boveda-LOLS.git
cd Boveda-LOLS
```

### 2. Configuración del Backend
Entra en la carpeta del servidor e instala las dependencias:
```bash
cd backend
npm install
```

Crea un archivo `.env` en la raíz de la carpeta `backend` y completa los datos de tu base de datos:
```env
PORT=3000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=tu_contraseña_mysql
DB_NAME=sgdl
JWT_SECRET=una_clave_para_los_tokens_jwt
EMAIL_ENC_KEY=clave_de_32_caracteres_minimo_para_cifrar
```

### 3. Base de Datos
1. Crea una base de datos llamada `sgdl` en tu MySQL.
2. Ejecuta los scripts encontrados en `backend/db/migrations` en orden correlativo (001 al 009) o utiliza el archivo `run_all.sql` si está disponible.

### 4. Configuración del Frontend
En una nueva terminal, entra en la carpeta del cliente e instala las dependencias:
```bash
cd frontend
npm install
```

---

## 🏃‍♂️ Ejecución en Desarrollo

Para iniciar el sistema, debes correr ambos servicios:

**Iniciar Backend (desde carpeta `/backend`):**
```bash
npm run dev
```

**Iniciar Frontend (desde carpeta `/frontend`):**
```bash
npm run dev
```

El sistema estará disponible en `http://localhost:5173`.

---

## 🛡️ Notas de Seguridad
- El sistema utiliza cifrado **AES-256-CBC** para manejar contraseñas corporativas de correo.
- Asegúrate de que tu `EMAIL_ENC_KEY` en el `.env` sea privada y no se comparta.

---
_Desarrollado para Bóveda LOLS_
