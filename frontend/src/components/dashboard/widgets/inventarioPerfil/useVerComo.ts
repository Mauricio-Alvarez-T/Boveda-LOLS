import { useCallback, useSyncExternalStore } from 'react';
import { almacenLocal, claveVerComo, guardarVerComo, VER_COMO_INICIAL, verComoGuardado, type VistaVerComo } from './verComo.modelo';

/**
 * La elección de «Ver como» del Super Administrador, compartida entre la barra de arriba del Inicio (VerComoInicio),
 * el tablero de gerencia (Dashboard) y la tarjeta Inventario (DetalleInventario), sin Provider: un almacén chico en
 * memoria, guardado por persona en localStorage (comodidad; si falla, vuelve a «Super Admin»).
 */
const oyentes = new Set<() => void>();
const enMemoria = new Map<string, VistaVerComo>();

const leer = (userId: number | string): VistaVerComo => {
    const clave = claveVerComo(userId);
    let v = enMemoria.get(clave);
    if (v === undefined) {
        v = verComoGuardado(almacenLocal(), userId);
        enMemoria.set(clave, v);
    }
    return v;
};

const suscribir = (aviso: () => void) => {
    oyentes.add(aviso);
    return () => { oyentes.delete(aviso); };
};

export function useVerComo(userId: number | string | null | undefined): [VistaVerComo, (v: VistaVerComo) => void] {
    const valor = useSyncExternalStore(suscribir, () => (userId == null ? VER_COMO_INICIAL : leer(userId)));
    const elegir = useCallback((v: VistaVerComo) => {
        if (userId == null) return;
        enMemoria.set(claveVerComo(userId), v);
        guardarVerComo(almacenLocal(), userId, v);
        oyentes.forEach(f => f());
    }, [userId]);
    return [valor, elegir];
}
