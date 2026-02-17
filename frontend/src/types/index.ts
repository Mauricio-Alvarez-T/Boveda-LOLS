export interface User {
    id: number;
    nombre: string;
    email: string;
    email_corporativo: string | null;
    rol: string;
    rol_id: number;
    obra_id: number | null;
    permisos: Permission[];
}

export interface Permission {
    modulo: string;
    puede_ver: boolean;
    puede_crear: boolean;
    puede_editar: boolean;
    puede_eliminar: boolean;
}

export interface AuthResponse {
    token: string;
    user: User;
}

export interface ApiResponse<T> {
    data: T;
    pagination?: {
        page: number;
        limit: number;
        total: number;
        pages: number;
    };
    error?: string;
}
