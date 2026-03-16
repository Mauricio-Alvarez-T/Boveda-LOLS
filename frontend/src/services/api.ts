import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

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

// Interceptor to handle global errors (like 401 Unauthorized)
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
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
        return Promise.reject(error);
    }
);

export default api;
