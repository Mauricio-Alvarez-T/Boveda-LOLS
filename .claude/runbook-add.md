---
name: runbook-add
description: Proponer y aplicar una entrada nueva a RUNBOOK.md § 6 (Errores Comunes) o una sección nueva
---

# /runbook-add — Capturar un aprendizaje en RUNBOOK.md

Cuando encuentres un problema no trivial que merezca ser documentado pero quieras capturarlo después (o reafirmarlo), usa este comando.

**Uso:**
```
/runbook-add "tu descripción del problema y la solución"
```

**Ejemplo:**
```
/runbook-add "Images return 404 in production but work in local — forgot /api prefix on image URL serving. Solution: serve as /api/uploads/..."
```

**Qué hace:**
1. Leo tu descripción
2. Propongo una entrada formateada para `docs/RUNBOOK.md`
3. Si es un error común: la agrego a la tabla § 6
4. Si es un patrón/sección nueva: creo una sección nueva
5. Aplico el cambio y hago commit automático

**Nota:** Este skill es para casos donde quieras reafirmar documentación o capturar algo que pasamos por alto. Si el problema es obvio durante la sesión, propongo la entrada de forma proactiva sin esperar a que lo pidas.
