// Resuelve una URL relativa de imagen servida por el backend (/api/uploads/...)
// a una URL absoluta usando VITE_API_URL. Mismo criterio que el helper local de
// ItemDetailModal.tsx; centralizado para reusarlo en las fotos de transferencias.
const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/api\/?$/, '');

export function resolveImageUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    if (/^https?:\/\//i.test(url)) return url;
    const withApi = url.startsWith('/api/') ? url : `/api${url.startsWith('/') ? '' : '/'}${url}`;
    return `${API_BASE}${withApi}`;
}
