-- =============================================
-- 107 — Tipos de vehículo: moto, maquinaria y remolque
-- =============================================
-- Pedido del dueño (2026-08-31): no se podía registrar una moto. El ENUM de
-- `tipo` (mig 069) solo tenía camioneta/camion/auto/furgon/bus/otro, y además
-- el formulario exigía patente de 4 letras + 2 dígitos, que es el formato de
-- vehículos de 4+ ruedas — rechazaba el 100% de las motos.
--
-- Se agregan los tres tipos que faltaban en una flota de constructora, para no
-- volver a quedar trabados: moto, maquinaria (retroexcavadora, motoniveladora,
-- cargador frontal...) y remolque / carro de arrastre.
--
-- Formatos de patente asociados (Decreto 53/1984 MTT, art. 2 y 2º bis):
--   · 4+ ruedas, incluidos maquinaria y remolques del Registro Especial → 4L+2D
--   · 2-3 ruedas (motos) → 3L+2D hoy; 2L+3D las antiguas, aún vigentes
--   · carros de arrastre livianos → registro municipal REMUCAR, placa aparte
-- La validación de formato pasó a ser una ADVERTENCIA en el front, no un
-- bloqueo (frontend/src/utils/patente.ts): coexisten varios formatos válidos y
-- las patentes anteriores a 2007 (2L+4D) nunca se recambiaron.
--
-- Revisión técnica: el calendario por último dígito (DS 156/1990 art. 7) aplica
-- a autos y motos, pero NO a maquinaria (cada 4 años, DTO 289/1995) ni a
-- remolques (cada 6 meses). El formulario oculta el recuadro para esos dos.
--
-- Idempotente: MODIFY COLUMN reescribe el ENUM completo al mismo valor si ya
-- estaba aplicada. No convierte datos: los tipos existentes siguen en la lista
-- y ninguna fila cambia de valor.

ALTER TABLE vehiculos
    MODIFY COLUMN tipo ENUM('camioneta','camion','auto','furgon','bus','moto','maquinaria','remolque','otro')
    NOT NULL DEFAULT 'camioneta';
