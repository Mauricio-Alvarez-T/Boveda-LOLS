import axios from 'axios';
import { toast } from 'sonner';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

// Auditoría 4.6: throttle del toast 403 — evita 5+ popups si una pantalla
// dispara varios fetchs en paralelo y todos retornan 403 a la vez.
let _last403Ts = 0;
const TOAST_403_THROTTLE_MS = 3000;

const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Interceptor to add JWT token to requests
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('sgdl_token');
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
        if (status === 403) {
            const now = Date.now();
            if (now - _last403Ts > TOAST_403_THROTTLE_MS) {
                _last403Ts = now;
                const msg = error.response?.data?.error || 'No tienes permiso para esta acción.';
                toast.error(msg);
            }
        }

        return Promise.reject(error);
    }
);

export default api;
