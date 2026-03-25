# Guía de Configuración: Entorno Staging (Pruebas) Bóveda LOLS

## 📌 Estado Actual (Lo que ya está listo)
Hasta este momento, hemos avanzado exitosamente con la infraestructura base en el servidor y en el control de versiones:

1. **GitHub GitFlow**: Se creó y subió la rama `develop`. A partir de ahora, todo código nuevo va a `develop` y `main` se protege como entorno de producción sagrado.
2. **Subdominio Creado**: `test.boveda.lols.cl` ya existe en cPanel y apunta a la carpeta `/public_html/test.boveda.lols.cl`.
3. **Base de Datos Clonada**: 
   - Se creó la base de datos `lolscl_boveda_test`.
   - Se clonaron las 22 tablas con los trabajadores y asistencia de producción.
   - Se creó el usuario `lolscl_dev` vinculado con TODOS los privilegios.
   - **Contraseña del usuario DB**: `BfB?gW{YS)nh7W_`

---

## 🚀 Lo que falta por hacer (Pasos Finales)
Para que el entorno de pruebas funcione por completo, necesitas ejecutar los siguientes pasos en tu cPanel. (He diseñado esto para que puedas copiar y pegar).

### Paso 1: Crear la App de Node.js (El Backend de Pruebas)
En cPanel, busca la herramienta **"Setup Node.js App"** y haz clic en **"Create Application"**. Llena los campos exactamente así:

*   **Node.js version**: `20.x.x` (la versión 20 que esté disponible).
*   **Application mode**: `Production`
*   **Application root**: `test-boveda`
*   **Application URL**: Selecciona `test.boveda.lols.cl` en el desplegable, y en el recuadro de la derecha escribe: `api`
*   **Application startup file**: `server.js`

Presiona el botón **CREATE**. (Esto creará una carpeta llamada `/home/lolscl/test-boveda` en el servidor).

---

### Paso 2: Inyectar las variables de entorno (.env)
En lugar de añadir las variables una por una en la interfaz engorrosa de Node.js, usaremos un archivo oculto.

1. En cPanel, abre el **"Administrador de Archivos"** (File Manager).
2. Ve a la carpeta `/home/lolscl/test-boveda`.
3. Haz clic en **"+ Archivo"** en la barra superior y crea un archivo llamado exactamente `.env` (asegúrate de que cPanel esté configurado para "Mostrar archivos ocultos" en Configuración arriba a la derecha).
4. Haz clic derecho sobre `.env`, elige **Edit** (Editar), y Pega exactamente el siguiente bloque de texto:

```properties
# Base de datos clonada de staging
DB_HOST=127.0.0.1
DB_NAME=lolscl_boveda_test
DB_USER=lolscl_dev
DB_PASSWORD=BfB?gW{YS)nh7W_
DB_PORT=3306

# Secretos de prueba
JWT_SECRET=boveda_staging_super_secret_jwt_321
JWT_EXPIRES_IN=8h
PORT=3000

# Correo y encriptación
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
EMAIL_ENC_KEY=llave_de_encriptacion_pruebas_boveda_123
```
5. Guarda los cambios. Vuelve a "Setup Node.js App" y presiona el botón **RESTART** en tu nueva aplicación de staging.

---

### Paso 3: Configurar GitHub Actions
Una vez la infraestructura en cPanel esté lista, debemos instruirle a GitHub que envíe el código automáticamente cuando programemos en la rama `develop`.

1. En tu editor de código local, navega a la carpeta `.github/workflows/`
2. Si existe un archivo llamado `deploy-cpanel-staging.yml`, ábrelo. Si no existe, créalo y pega el siguiente código:

```yaml
name: Deploy Staging to cPanel 🧪

on:
  push:
    branches:
      - develop
  workflow_dispatch:

jobs:
  web-deploy:
    name: 🎉 Build & Deploy Staging
    runs-on: ubuntu-latest
    
    steps:
      - name: 🚚 Obtener el código más reciente
        uses: actions/checkout@v4

      - name: ⚙️ Setup Node.js 20
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: 📦 Instalar Dependencias Frontend
        working-directory: ./frontend
        run: npm ci

      - name: 🔨 Compilar Frontend (React)
        working-directory: ./frontend
        # Usa el flag para apuntar al backend de pruebas si es necesario en vite
        run: npm run build

      - name: 🌐 Sincronizar Frontend vía FTP a cPanel (Staging)
        uses: SamKirkland/FTP-Deploy-Action@v4.3.5
        with:
          server: ftp.lols.cl
          username: lolscl
          password: ${{ secrets.CPANEL_FTP_PASSWORD }}
          local-dir: ./frontend/dist/
          server-dir: /public_html/test.boveda.lols.cl/
          exclude: |
            **/.git*
            **/.git*/**
            **/node_modules/**

      - name: ⚙️ Sincronizar Backend vía FTP a cPanel (Staging)
        uses: SamKirkland/FTP-Deploy-Action@v4.3.5
        with:
          server: ftp.lols.cl
          username: lolscl
          password: ${{ secrets.CPANEL_FTP_PASSWORD }}
          local-dir: ./backend/
          server-dir: /test-boveda/
          exclude: |
            **/.git*
            **/.git*/**
            **/node_modules/**
            .env*

      - name: 🔄 Crear carpeta temporal para reinicio de la app Node
        run: |
          mkdir -p ./backend/tmp
          touch ./backend/tmp/restart.txt

      - name: 🚀 Reiniciar Servidor Phusion Passenger (Staging)
        uses: SamKirkland/FTP-Deploy-Action@v4.3.5
        with:
          server: ftp.lols.cl
          username: lolscl
          password: ${{ secrets.CPANEL_FTP_PASSWORD }}
          local-dir: ./backend/tmp/
          server-dir: /test-boveda/tmp/
```

### Resumen Final
Al terminar estos 3 pasos, cada vez que hagamos un `git push origin develop`, tu entorno de pruebas en `test.boveda.lols.cl` se actualizará automáticamente, dejando a los Jefes de obra trabajando tranquilos en `boveda.lols.cl`.
