# Instrucciones para la IA del navegador (operar cPanel) + protocolo de iteración

Este documento sirve para coordinar a **dos** asistentes:
- **Claude Code** (terminal, este repo): diagnostica, decide los fixes y verifica.
- **IA del navegador** (Chrome, con acceso a la UI de cPanel): ejecuta pasos en cPanel y **devuelve un
  informe estructurado**.

El objetivo es dejar el deploy **pull-side** de staging funcionando (ver
`docs/PLAYBOOK_PULL_SIDE_CPANEL.md` para el detalle técnico). Se itera en rounds:
**RECON → FIX dirigido → VERIFY**, hasta cumplir los criterios de éxito.

---

## A) PAQUETE PARA PEGAR A LA IA DEL NAVEGADOR — Round 1 (RECON)

> Copia y pega TODO el bloque siguiente en la IA del navegador.

```
Eres una IA operando dentro de Chrome con acceso a la interfaz web de cPanel del hosting de
"Bóveda LOLS" (usuario cPanel: lolscl). OBJETIVO: diagnosticar el estado del deploy "pull-side" de
staging. El servidor debe (eventualmente) clonar la rama deploy-staging del repo PÚBLICO y correr un
cron cada 5 min que ejecuta un script de deploy. NO empujamos por FTP (está baneado por cPHulk); el
servidor hace git pull saliente.

REGLAS ESTRICTAS:
- Sigue los pasos EN ORDEN. NO improvises fuera de estos pasos. Si algo no aparece como se describe,
  NO inventes alternativas: marca el paso como "NO PUDE" y describe exactamente qué viste.
- En este Round 1 NO cambies nada: solo MIRAR y COPIAR. NO borres archivos, NO edites .env, NO
  desbloquees IPs en cPHulk, NO crees ni edites crons todavía.
- Para CADA paso reúne EVIDENCIA: captura de pantalla y/o copia el TEXTO LITERAL (output de comandos,
  contenido de logs, filas de cron). Pega el texto crudo, NO lo resumas.
- El repo es PÚBLICO: en cualquier campo de "token"/"usuario/contraseña" de Git, déjalo VACÍO.

PASO 0 — Inventario de herramientas:
  En la barra "Search Tools" (arriba en cPanel), busca y anota cuáles EXISTEN:
  Terminal, Git™ Version Control, Cron Jobs, Setup Node.js App, File Manager.

SI EXISTE "Terminal" (Advanced → Terminal), úsala para R1–R6 pegando estos bloques y copiando su
salida COMPLETA:

  [R1]
    ls -la ~/deploy-staging
    cd ~/deploy-staging && git rev-parse --abbrev-ref HEAD && git rev-parse HEAD
    git fetch origin deploy-staging && git rev-parse origin/deploy-staging
    git log -1 --format='%h %ci %s'

  [R2] crontab -l

  [R3]
    ls -la ~/deploy-staging.log
    tail -n 50 ~/deploy-staging.log

  [R4] which git; git --version; which rsync; rsync --version | head -n 1

  [R5]
    file ~/deploy-staging/scripts/cpanel-deploy-staging.sh
    grep -c $'\r' ~/deploy-staging/scripts/cpanel-deploy-staging.sh
    head -1 ~/deploy-staging/scripts/cpanel-deploy-staging.sh | cat -A

  [R6]
    grep -oE '/assets/[A-Za-z0-9_.-]+\.js' ~/deploy-staging/frontend/dist/index.html
    curl -s https://test.boveda.lols.cl/ | grep -oE '/assets/[A-Za-z0-9_.-]+\.js'

SI NO EXISTE "Terminal", haz el equivalente por UI:
  [R1-UI] Git™ Version Control → ¿hay un repo cuya ruta sea /home/lolscl/deploy-staging? Anota su
          "Checked-Out Branch" y el último hash/fecha que muestre. Captura.
  [R2-UI] Cron Jobs → "Current Cron Jobs" → copia la fila que mencione cpanel-deploy-staging.sh
          (o reporta "no hay ninguna"). Captura.
  [R3-UI] File Manager → /home/lolscl → abre deploy-staging.log con "View" → copia las últimas ~30
          líneas. Si no existe el archivo, repórtalo. Captura.
  [R6-UI] Abre https://test.boveda.lols.cl, F12 → Network → recarga → anota el nombre del archivo
          principal assets/index-XXXX.js que carga. Captura.

PASO R7 — cPHulk (SOLO MIRAR): Security → cPHulk Brute Force Protection → ¿hay IPs bloqueadas?
  Anota cuántas y si parecen IPs cloud. NO desbloquees nada. Captura.

>>> DETENTE AQUÍ y entrega el INFORME con el formato de la sección B. Espera instrucciones del
    siguiente round antes de cambiar nada.
```

---

## B) PLANTILLA DE INFORME DE VUELTA (la IA del navegador la rellena y la devuelve)

```
# INFORME IA-NAVEGADOR — Round: [1=RECON / 2=FIX / 3=VERIFY]   Fecha/hora: __________

## A. Inventario de herramientas cPanel
- Terminal:[SÍ/NO]  Git Version Control:[SÍ/NO]  Cron Jobs:[SÍ/NO]  Setup Node.js App:[SÍ/NO]  File Manager:[SÍ/NO]

## B. Resultado por paso (OK / FALLÓ / NO PUDE)
| Paso | Estado | Resumen |
|------|--------|---------|
| R1 clone/rama/SHA | | rama=____ HEAD=____ origin=____ |
| R2 cron existe    | | [línea del cron o "no existe"] |
| R3 log            | | [último estado/línea del log] |
| R4 git/rsync      | | git=____ rsync=____ |
| R5 LF/CRLF        | | CR count=____ |
| R6 build servida  | | servido=____ rama=____ ¿coinciden?=__ |
| R7 cPHulk         | | IPs bloqueadas=____ |

## C. Volcados LITERALES (pegar crudo, SIN resumir)
### C1. R1 (git rev-parse / git log)
```
[pegar aquí]
```
### C2. R2 (crontab -l o filas de la UI)
```
[pegar aquí]
```
### C3. R3 (~/deploy-staging.log, últimas líneas)
```
[pegar aquí]
```
### C4. R4 (which git / which rsync / versiones)
```
[pegar aquí]
```
### C5. R5 (file + grep CR + head|cat -A)
```
[pegar aquí]
```
### C6. R6 (hashes de assets: rama vs sitio)
```
RAMA  : [pegar]
SITIO : [pegar]
```
### C7. (Solo en rounds FIX) output de cada comando ejecutado + exit codes
```
[pegar aquí]
```

## D. Bloqueadores
- [ej: "No existe Terminal y Git Version Control no deja cambiar la rama"]

## E. Preguntas para Claude Code
- [ej: "El cron muestra command not found para rsync; ¿uso la variante con PATH?"]

## F. Capturas adjuntas
- [lista/descripción de cada captura]
```

---

## C) ROUND 2 — FIX (Claude Code entrega SOLO los pasos necesarios)

La IA del navegador **no decide** los fixes: Claude Code los determina con el informe del Round 1 y le
pasa los comandos/clics exactos. Posibles fixes (Claude Code elige):

- **FIX-A — clone faltante o rama equivocada**
  - Terminal: `cd ~ && git clone --branch deploy-staging https://github.com/Mauricio-Alvarez-T/Boveda-LOLS.git ~/deploy-staging`
    (si ya existía: `cd ~/deploy-staging && git fetch origin && git checkout deploy-staging && git reset --hard origin/deploy-staging`)
  - UI: Git™ Version Control → Create → Clone URL `https://github.com/Mauricio-Alvarez-T/Boveda-LOLS.git` (sin token), Repository Path `deploy-staging` → Create → Manage → Checked-Out Branch `deploy-staging` → Update.
- **FIX-B — CRLF**: `sed -i 's/\r$//' ~/deploy-staging/scripts/cpanel-deploy-staging.sh`
- **FIX-C — crear el cron**: Cron Jobs → Add New Cron Job → "Every 5 Minutes" → Command:
  `/bin/bash ~/deploy-staging/scripts/cpanel-deploy-staging.sh >> ~/deploy-staging.log 2>&1`
  - Variante PATH (si el recon mostró `command not found`): prefijar `PATH=/usr/local/bin:/usr/bin:/bin:$PATH`.
- **FIX-D — probar a mano (si hay Terminal)**: `/bin/bash ~/deploy-staging/scripts/cpanel-deploy-staging.sh ; echo "exit=$?"`

Tras cada FIX, copiar el output literal (sección C7) y devolver el informe.

---

## D) ROUND 3 — VERIFY

1. Alguien del equipo (o Claude Code) hace un push real a `develop` → el workflow publica `deploy-staging`.
2. Esperar ≤ 5 min (un ciclo de cron) y la IA del navegador ejecuta:
   ```
   tail -n 20 ~/deploy-staging.log
   curl -s https://test.boveda.lols.cl/ | grep -oE '/assets/[A-Za-z0-9_.-]+\.js'
   ```
3. Reportar si el log dice `deploy OK` y si el hash del `.js` servido coincide con el de la rama.

---

## E) PROTOCOLO DE ITERACIÓN (resumen)

```
RECON → (Claude Code diagnostica) → FIX dirigido → VERIFY → [repetir hasta éxito]
```
- Cada round: la IA del navegador devuelve SIEMPRE el informe con **volcados literales** (no resúmenes).
- Claude Code responde SIEMPRE con **pasos numerados inequívocos**; **un solo cambio por iteración**
  cuando la causa no sea obvia (para aislar qué lo arregló).

### Criterios de ÉXITO (todos)
1. `~/deploy-staging.log` muestra `… · deploy OK → <sha>` con `<sha>` == `origin/deploy-staging`.
2. Tras un push a `develop`, en **≤ 5 min** el sitio sirve el nuevo build.
3. Hash del bundle de `test.boveda.lols.cl` == el de `~/deploy-staging/frontend/dist/index.html`.
4. El cron `*/5` con el script está presente y persistente en Cron Jobs.

### Escalar al hosting si
- No hay Terminal NI forma de fijar la rama en Git Version Control → pedir SSH.
- `git`/`rsync` ausentes incluso con PATH absoluto → pedir al hosting que los habilite.
- (Improbable) cPHulk bloquea también el `git pull` saliente → ticket al hosting.
```
