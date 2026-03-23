<?php
header('Content-Type: text/plain');
echo "=== BOVEDA LOLS DIAGNOSTIC SECURE PROBE V2 ===\n\n";

$baseDirs = [
    __DIR__ . '/../boveda/',
    __DIR__ . '/../../boveda/',
    __DIR__ . '/../../../boveda/'
];

$foundBase = null;
foreach ($baseDirs as $dir) {
    if (is_dir($dir)) {
        $foundBase = $dir;
        break;
    }
}

if (!$foundBase) {
    echo "NO SE ENCONTRÓ EL DIRECTORIO BACKEND 'boveda'.\n";
    echo "Ruta actual: " . __DIR__ . "\n";
    exit;
}

$logPaths = [
    $foundBase . 'stderr.log',
    $foundBase . 'startup_debug.log',
    $foundBase . 'error_debug.log',
    $foundBase . 'package.json'
];

foreach ($logPaths as $path) {
    $real = realpath($path) ?: $path;
    echo "--- LEYENDO: $real ---\n";
    if (file_exists($path)) {
        $content = file_get_contents($path);
        $lines = explode("\n", $content);
        if (count($lines) > 50) {
            echo "... (archivo muy largo, mostrando 50 líneas finales) ...\n";
            echo implode("\n", array_slice($lines, -50));
        } else {
            echo $content;
        }
    } else {
        echo "[ERROR] Archivo no encontrado.\n";
    }
    echo "\n\n";
}
?>
