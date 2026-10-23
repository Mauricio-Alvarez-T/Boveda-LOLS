import { useCallback, useEffect, useState } from 'react';
import api from '../../../../services/api';
import {
    RUTA_INVENTARIO_PERFIL, cargaFallida, cargaLista, esInventarioPerfil, estadoInventarioPerfil,
    type CargaInventarioPerfil, type EstadoInventarioPerfil,
} from './cargaInventarioPerfil';
import type { RespuestaInventarioPerfil } from './tipos';

/**
 * Datos del detalle «Inventario» del Inicio por perfil (GET /transferencias/inicio/perfil). Pide al montar y cada
 * vez que cambia `version` (el `lastUpdated` de «Actualizar»), igual que DetalleVehiculos. Mientras recarga deja lo
 * que ya se veía; si falla sin nada que mostrar, `error` y `reintentar()`.
 */
export function useInventarioPerfil(version?: unknown): EstadoInventarioPerfil & { reintentar: () => void } {
    const [intento, setIntento] = useState(0);
    const [carga, setCarga] = useState<CargaInventarioPerfil | null>(null);

    useEffect(() => {
        let vigente = true;
        api.get<RespuestaInventarioPerfil>(RUTA_INVENTARIO_PERFIL)
            .then(res => {
                if (!vigente) return;
                const datos = res.data?.data;
                setCarga(c => (esInventarioPerfil(datos) ? cargaLista(version, intento, datos) : cargaFallida(c, version, intento)));
            })
            .catch(() => { if (vigente) setCarga(c => cargaFallida(c, version, intento)); });
        return () => { vigente = false; };
    }, [version, intento]);

    const reintentar = useCallback(() => setIntento(i => i + 1), []);
    return { ...estadoInventarioPerfil(carga, version, intento), reintentar };
}
