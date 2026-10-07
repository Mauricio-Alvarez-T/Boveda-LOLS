-- =============================================
-- 119 — "Falta justificada" (FJ) en el MISMO rojo que Falta
-- =============================================
-- Pedido de jefatura (Daphne, 2026-10-07, probando en staging): "Que sea todo de
-- color rojo, igual que la falta. Porque al decir FJ ya se hace la diferencia."
-- La mig 118 la había sembrado en naranjo para distinguirla a la vista; la sigla
-- basta y el rojo mantiene la lectura "esto es una falta" en calendario, Excel
-- y períodos.
--
-- Se copia el color que tenga F en esa base (y no un hex fijo) para que sigan
-- iguales aunque alguien cambie el rojo de F. Fallback al rojo de la mig 006.
-- MySQL no deja leer la misma tabla en el UPDATE: se pasa por variable.

SET @rojo_falta := (SELECT color FROM estados_asistencia WHERE codigo = 'F' LIMIT 1);

UPDATE estados_asistencia
SET color = COALESCE(@rojo_falta, '#FF3B30')
WHERE codigo = 'FJ';

-- Verificación esperada (manual post-migración):
--   SELECT codigo, color FROM estados_asistencia WHERE codigo IN ('F','FJ');  → mismo color
