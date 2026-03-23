<?php
header('Content-Type: text/plain');
echo "=== BOVEDA LOLS DIAGNOSTIC SECURE PROBE ===\n\n";

$logPaths = [
    '../boveda/stderr.log',
    '../boveda/startup_debug.log',
    '../boveda/error_debug.log',
    '../boveda/package.json'
];

foreach ($logPaths as $path) {
    echo "--- LEYENDO: $path ---\n";
    if (file_exists($path)) {
        $content = file_get_contents($path);
        // Si el archivo es muy grande, mostrar solo las últimas 50 líneas
        $lines = explode("\n", $content);
        if (count($lines) > 50) {
            echo "... (archivo truncado) ...\n";
            echo implode("\n", array_slice($lines, -50));
        } else {
            echo $content;
        }
    } else {
        echo "[ERROR] Archivo no encontrado en esta ruta.\n";
    }
    echo "\n\n";
}
?>
