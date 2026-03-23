export type Permission = string;

export interface User {
    id: number;
    nombre: string;
    email: string;
    email_corporativo?: string;
    rol: string;
    rol_id: number;
    obra_id?: number | null;
    permisos: Permission[]; // Now a simple array of strings like ['asistencia.ver', ...]
}

export interface AuthResponse {
    token: string;
    user: User;
}

export interface LoginError {
    error: string;
    details?: any;
}

export interface ApiResponse<T> {
    data: T;
    message?: string;
    total?: number;
    pagination?: {
        total: number;
        pages: number;
        page: number;
        limit: number;
    };
}
