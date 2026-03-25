<?php
/**
 * BOVEDA LOLS - Script de Reparación Automática de Staging
 * Visita: https://test.boveda.lols.cl/fix-staging.php
 * Este script diagnostica y repara la configuración del entorno de pruebas.
 */
header('Content-Type: text/html; charset=utf-8');

$results = [];
$fixes = [];

// ===== 1. INFO DEL ENTORNO =====
$results['ruta_actual'] = __DIR__;
$results['servidor'] = $_SERVER['SERVER_NAME'] ?? 'desconocido';
$results['home'] = getenv('HOME') ?: '/home/lolscl';

// ===== 2. ARREGLAR .htaccess DEL FRONTEND =====
$htaccessPath = __DIR__ . '/.htaccess';
$htaccessCorrect = '<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /

  # Excluir /api del enrutamiento frontend (Passenger maneja esto)
  RewriteRule ^api(/|$) - [L]

  # Enrutamiento de React (SPA)
  RewriteRule ^index\\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteCond %{REQUEST_FILENAME} !-l
  RewriteRule . /index.html [L]
</IfModule>';

$currentHtaccess = file_exists($htaccessPath) ? file_get_contents($htaccessPath) : 'NO EXISTE';
if (trim($currentHtaccess) !== trim($htaccessCorrect)) {
    file_put_contents($htaccessPath, $htaccessCorrect);
    $fixes[] = "✅ .htaccess REPARADO (antes estaba corrupto o mal configurado)";
} else {
    $fixes[] = "✅ .htaccess ya estaba correcto";
}

// ===== 3. VERIFICAR ARCHIVOS FRONTEND =====
$frontendFiles = ['index.html', 'vite.svg', 'manifest.json'];
foreach ($frontendFiles as $f) {
    $results['frontend_' . $f] = file_exists(__DIR__ . '/' . $f) ? '✅ Existe' : '❌ Falta';
}

// ===== 4. VERIFICAR BACKEND =====
$backendPaths = [
    $results['home'] . '/test-boveda',
    $results['home'] . '/test-boveda/index.js',
    $results['home'] . '/test-boveda/server.js',
    $results['home'] . '/test-boveda/app.js',
    $results['home'] . '/test-boveda/.env',
    $results['home'] . '/test-boveda/node_modules',
    $results['home'] . '/test-boveda/package.json',
];
foreach ($backendPaths as $p) {
    $name = basename($p);
    if (is_dir($p)) {
        $results['backend_' . $name] = '✅ Directorio existe';
    } elseif (file_exists($p)) {
        $results['backend_' . $name] = '✅ Archivo existe (' . filesize($p) . ' bytes)';
    } else {
        $results['backend_' . $name] = '❌ NO encontrado';
    }
}

// ===== 5. LISTAR ARCHIVOS EN test-boveda (raíz) =====
$backendRoot = $results['home'] . '/test-boveda';
$backendFileList = [];
if (is_dir($backendRoot)) {
    $items = scandir($backendRoot);
    foreach ($items as $item) {
        if ($item === '.' || $item === '..') continue;
        $fullPath = $backendRoot . '/' . $item;
        $type = is_dir($fullPath) ? '📁' : '📄';
        $size = is_dir($fullPath) ? '' : ' (' . filesize($fullPath) . 'b)';
        $backendFileList[] = $type . ' ' . $item . $size;
    }
}

// ===== 6. VERIFICAR server.js CONTENIDO =====
$serverJsPath = $backendRoot . '/server.js';
$serverJsContent = '';
if (file_exists($serverJsPath)) {
    $serverJsContent = file_get_contents($serverJsPath);
}

// ===== 7. ARREGLAR server.js SI FALTA =====
if (!file_exists($serverJsPath)) {
    // Si app.js existe, crear server.js que lo cargue
    if (file_exists($backendRoot . '/app.js')) {
        file_put_contents($serverJsPath, "require('./app.js');\n");
        $fixes[] = "✅ server.js CREADO (apunta a app.js)";
    } elseif (file_exists($backendRoot . '/index.js')) {
        file_put_contents($serverJsPath, "require('./index.js');\n");
        $fixes[] = "✅ server.js CREADO (apunta a index.js)";
    } else {
        $fixes[] = "❌ No se pudo crear server.js: no se encontró app.js ni index.js";
    }
}

// ===== 8. VERIFICAR .htaccess EN /api/ =====
$apiHtaccessPath = __DIR__ . '/api/.htaccess';
$apiHtaccessContent = file_exists($apiHtaccessPath) ? file_get_contents($apiHtaccessPath) : 'NO EXISTE';

// ===== 9. COMPARAR CON PRODUCCIÓN =====
$prodPaths = [
    $results['home'] . '/boveda/server.js',
    $results['home'] . '/boveda/index.js',
    $results['home'] . '/boveda/app.js',
    $results['home'] . '/boveda/.env',
    $results['home'] . '/boveda/node_modules',
];
$prodInfo = [];
foreach ($prodPaths as $p) {
    $name = basename($p);
    if (is_dir($p)) {
        $prodInfo[$name] = '✅ Directorio existe';
    } elseif (file_exists($p)) {
        $prodInfo[$name] = '✅ Existe (' . filesize($p) . 'b)';
    } else {
        $prodInfo[$name] = '❌ No encontrado';
    }
}

// Leer server.js de producción para comparar
$prodServerJs = '';
$prodServerJsPath = $results['home'] . '/boveda/server.js';
if (file_exists($prodServerJsPath)) {
    $prodServerJs = file_get_contents($prodServerJsPath);
}

// Leer .htaccess de producción frontend
$prodFrontendHtaccess = '';
$prodHtaccessPaths = [
    $results['home'] . '/public_html/boveda.lols.cl/.htaccess',
    $results['home'] . '/public_html/.htaccess',
];
foreach ($prodHtaccessPaths as $php) {
    if (file_exists($php)) {
        $prodFrontendHtaccess = file_get_contents($php);
        $results['prod_htaccess_path'] = $php;
        break;
    }
}

// ===== 10. PROBAR CONEXIÓN A DB =====
$envPath = $backendRoot . '/.env';
$dbStatus = '❌ No probado';
if (file_exists($envPath)) {
    $envContent = file_get_contents($envPath);
    preg_match('/DB_HOST=(.*)/', $envContent, $m); $dbHost = trim($m[1] ?? '');
    preg_match('/DB_NAME=(.*)/', $envContent, $m); $dbName = trim($m[1] ?? '');
    preg_match('/DB_USER=(.*)/', $envContent, $m); $dbUser = trim($m[1] ?? '');
    preg_match('/DB_PASSWORD=(.*)/', $envContent, $m); $dbPass = trim($m[1] ?? '');
    preg_match('/DB_PORT=(.*)/', $envContent, $m); $dbPort = trim($m[1] ?? '3306');

    if ($dbHost && $dbName && $dbUser) {
        try {
            $pdo = new PDO("mysql:host=$dbHost;port=$dbPort;dbname=$dbName", $dbUser, $dbPass);
            $stmt = $pdo->query("SELECT COUNT(*) as c FROM usuarios");
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            $dbStatus = "✅ Conectado - {$row['c']} usuarios encontrados";

            // Verificar si test@lols.cl existe
            $stmt2 = $pdo->query("SELECT id, email, nombre, rol_id FROM usuarios WHERE email = 'test@lols.cl'");
            $user = $stmt2->fetch(PDO::FETCH_ASSOC);
            if ($user) {
                $results['usuario_test'] = "✅ test@lols.cl existe (ID: {$user['id']}, Nombre: {$user['nombre']}, Rol: {$user['rol_id']})";
            } else {
                $results['usuario_test'] = "❌ test@lols.cl NO existe en la DB staging";
                // Listar usuarios existentes
                $stmt3 = $pdo->query("SELECT email FROM usuarios LIMIT 10");
                $emails = $stmt3->fetchAll(PDO::FETCH_COLUMN);
                $results['usuarios_disponibles'] = implode(', ', $emails);
            }
        } catch (Exception $e) {
            $dbStatus = "❌ Error: " . $e->getMessage();
        }
    }
}
$results['db_connection'] = $dbStatus;

// ===== OUTPUT =====
?>
<!DOCTYPE html>
<html>
<head><title>Bóveda LOLS - Diagnóstico Staging</title>
<style>
body { font-family: monospace; background: #1a1a2e; color: #e0e0e0; padding: 20px; }
h1 { color: #00b894; }
h2 { color: #fdcb6e; border-bottom: 1px solid #444; padding-bottom: 5px; }
.ok { color: #00b894; } .err { color: #e74c3c; } .warn { color: #fdcb6e; }
pre { background: #16213e; padding: 10px; border-radius: 5px; overflow-x: auto; max-height: 300px; }
.card { background: #16213e; border-radius: 8px; padding: 15px; margin: 10px 0; }
</style>
</head>
<body>
<h1>🔧 Bóveda LOLS - Diagnóstico y Reparación de Staging</h1>
<p>Ejecutado: <?= date('Y-m-d H:i:s') ?></p>

<h2>🛠️ Reparaciones Aplicadas</h2>
<div class="card">
<?php foreach ($fixes as $f): ?>
<p><?= $f ?></p>
<?php endforeach; ?>
</div>

<h2>📊 Estado General</h2>
<div class="card">
<?php foreach ($results as $key => $val): ?>
<p><strong><?= $key ?>:</strong> <?= htmlspecialchars($val) ?></p>
<?php endforeach; ?>
</div>

<h2>📁 Archivos en test-boveda/ (backend)</h2>
<div class="card">
<pre><?= implode("\n", $backendFileList) ?></pre>
</div>

<h2>📄 Contenido de server.js (staging)</h2>
<div class="card">
<pre><?= htmlspecialchars($serverJsContent ?: 'ARCHIVO NO ENCONTRADO') ?></pre>
</div>

<h2>📄 Contenido de server.js (PRODUCCIÓN - para comparar)</h2>
<div class="card">
<pre><?= htmlspecialchars($prodServerJs ?: 'ARCHIVO NO ENCONTRADO') ?></pre>
</div>

<h2>🌐 .htaccess Frontend (staging - ACTUAL)</h2>
<div class="card">
<pre><?= htmlspecialchars(file_get_contents($htaccessPath)) ?></pre>
</div>

<h2>🌐 .htaccess Frontend (PRODUCCIÓN)</h2>
<div class="card">
<pre><?= htmlspecialchars($prodFrontendHtaccess ?: 'NO ENCONTRADO') ?></pre>
<?php if (isset($results['prod_htaccess_path'])): ?>
<p class="warn">📍 Encontrado en: <?= $results['prod_htaccess_path'] ?></p>
<?php endif; ?>
</div>

<h2>⚙️ .htaccess en /api/ (Passenger)</h2>
<div class="card">
<pre><?= htmlspecialchars($apiHtaccessContent) ?></pre>
</div>

<h2>🏭 Comparación Producción vs Staging</h2>
<div class="card">
<table style="width:100%">
<tr><th>Archivo</th><th>Producción (boveda/)</th><th>Staging (test-boveda/)</th></tr>
<?php foreach ($prodInfo as $name => $status): ?>
<tr>
<td><?= $name ?></td>
<td><?= $status ?></td>
<td><?= $results['backend_' . $name] ?? '?' ?></td>
</tr>
<?php endforeach; ?>
</table>
</div>

<p style="color:#636e72; margin-top:30px;">⚠️ Elimina este archivo después de usarlo por seguridad.</p>
</body>
</html>
