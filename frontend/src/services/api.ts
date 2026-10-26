import axios from 'axios';
import { toast } from 'sonner';
import {
    AVISOS_VER_COMO, almacenSesion, borrarSesionVerComo, esErrorCambiosInvalido, esErrorSoloLectura, guardarAvisoVerComo, rutaAlSalir,
    tokenVerComoGuardado,
} from '../context/verComoSesion';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

// Auditoría 4.6: throttle del toast 403 — evita 5+ popups si una pantalla
// dispara varios fetchs en paralelo y todos retornan 403 a la vez.
let _last403Ts = 0;
const TOAST_403_THROTTLE_MS = 3000;

// 429 (rate limit): throttle más alto que 403 — si ya hay saturación no queremos
// sumar toasts. NO se reintenta automáticamente (evitar tormentas de peticiones).
let _last429Ts = 0;
const TOAST_429_THROTTLE_MS = 5000;

const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// «Ver como» (Soporte · usuarios): el aviso de «solo lectura», con su propio throttle (una pantalla puede disparar
// más de un guardado automático a la vez).
let _lastSoloLecturaTs = 0;

// Interceptor to add JWT token to requests
api.interceptors.request.use((config) => {
    // Con «ver como» en esta pestaña va el token prestado (sessionStorage), aunque haya vencido: el 401 de abajo
    // devuelve a la cuenta propia. Sin él, el de la cuenta propia (localStorage).
    const token = tokenVerComoGuardado(almacenSesion()) ?? localStorage.getItem('sgdl_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Interceptor to handle global errors (like 401 Unauthorized, 403 Forbidden)
api.interceptors.response.use(
    (response) => response,
    (error) => {
        const status = error.response?.status;

        // «Ver como»: el 401 es del token prestado (venció, o cambiaron los permisos de esa persona). Se vuelve a la
        // cuenta propia sin tocarla; si la propia tampoco sirve, su propio 401 llevará al login.
        // Lo mismo si el modo cambios dejó de valer (403 `VER_COMO_CAMBIOS_INVALIDO`: quien mira ya no es Super
        // Administrador activo, o la persona quedó inactiva): se vuelve a la cuenta propia con el motivo del servidor.
        const cambiosInvalido = status === 403 && esErrorCambiosInvalido(error.response?.data);
        if ((status === 401 || cambiosInvalido) && tokenVerComoGuardado(almacenSesion()) && !String(error.config?.url || '').includes('/auth/login')) {
            const ses = almacenSesion();
            const volverA = rutaAlSalir(ses);
            borrarSesionVerComo(ses);
            guardarAvisoVerComo(ses, (cambiosInvalido && error.response?.data?.error) || AVISOS_VER_COMO.terminoServidor);
            window.location.href = volverA;
            return Promise.reject(error);
        }

        // «Ver como»: el servidor rechazó un guardado (solo lectura). Un aviso claro, aunque sea un 403.
        if (status === 403 && esErrorSoloLectura(error.response?.data)) {
            const now = Date.now();
            if (now - _lastSoloLecturaTs > TOAST_403_THROTTLE_MS) {
                _lastSoloLecturaTs = now;
                toast.warning(AVISOS_VER_COMO.soloLectura, { description: AVISOS_VER_COMO.soloLecturaDetalle });
            }
            return Promise.reject(error);
        }

        if (status === 401) {
            const isLogged = !!localStorage.getItem('sgdl_token');
            const isByVersion = error.response?.data?.expired_by_version;

            localStorage.removeItem('sgdl_token');
            localStorage.removeItem('sgdl_user');

            if (!window.location.pathname.includes('/login')) {
                if (isLogged) {
                    // Try to use a small delay or a query param to show the toast on the login page
                    // Since a full redirect clears the memory JS state of the toast, we use sessionStorage
                    sessionStorage.setItem('sgdl_logout_reason', isByVersion ? 'permissions' : 'expired');
                    window.location.href = '/login';
                }
            }
        }

        // Auditoría 4.6: 403 centralizado. Antes cada hook tenía que mostrar su propio
        // toast — ahora el interceptor se encarga, con throttle para no spamear.
        //
        // Mayo 2026: skip toast en GET/HEAD/OPTIONS — esos son fetches de lectura
        // en background (cargar resumen, listar items, etc). El frontend filtra
        // qué se renderiza por permisos, así que un 403 en lectura suele ser
        // ruido. Toast sólo en acciones explícitas (POST/PUT/DELETE/PATCH).
        // El error sigue propagándose al caller → puede mostrar UI vacía o
        // logear a consola si necesita.
        if (status === 403) {
            const method = String(error.config?.method || '').toLowerCase();
            const isReadOnly = method === 'get' || method === 'head' || method === 'options';
            if (!isReadOnly) {
                const now = Date.now();
                if (now - _last403Ts > TOAST_403_THROTTLE_MS) {
                    _last403Ts = now;
                    const msg = error.response?.data?.error || 'No tienes permiso para esta acción.';
                    toast.error(msg);
                }
            }
        }

        // 429 Too Many Requests (rate limit). Mostramos UN toast informativo por
        // ventana (throttled) y NO reintentamos: reintentar alimentaría el límite.
        // El error se propaga al caller como siempre.
        if (status === 429) {
            const now = Date.now();
            if (now - _last429Ts > TOAST_429_THROTTLE_MS) {
                _last429Ts = now;
                const msg = error.response?.data?.error
                    || 'El servidor está recibiendo muchas peticiones. Espera unos segundos e intenta de nuevo.';
                toast.error(msg);
            }
        }

        return Promise.reject(error);
    }
);

export default api;
