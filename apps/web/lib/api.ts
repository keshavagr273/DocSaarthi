import axios, { AxiosError } from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const api = axios.create({
  baseURL: `${API_URL}/api/v1`,
  withCredentials: true, // Sends HttpOnly cookies automatically
  headers: { 'Content-Type': 'application/json' },
});

let isRefreshing = false;
let refreshQueue: Array<(token: void) => void> = [];

// ── Response interceptor: auto-refresh on 401 ─────────────────
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as typeof error.config & {
      _retry?: boolean;
    };

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        // Queue this request until refresh completes
        return new Promise((resolve) => {
          refreshQueue.push(() => {
            originalRequest._retry = true;
            resolve(api(originalRequest));
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        await api.post('/auth/refresh');
        refreshQueue.forEach((cb) => cb());
        refreshQueue = [];
        return api(originalRequest);
      } catch {
        // Refresh failed — redirect to login
        refreshQueue = [];
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
        return Promise.reject(error);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

export default api;

// ── Typed API helpers ─────────────────────────────────────────

export const authApi = {
  register: (data: { name: string; email: string; password: string; preferredLanguage?: string }) =>
    api.post<{ data: { user: User; message: string } }>('/auth/register', data),

  login: (data: { email: string; password: string }) =>
    api.post<{ data: { user: User; message: string } }>('/auth/login', data),

  logout: () => api.post('/auth/logout'),

  me: () => api.get<{ data: User }>('/auth/me'),
};

export const documentsApi = {
  initiateUpload: (data: {
    fileName: string;
    mimeType: string;
    fileSize: number;
    title?: string;
  }) =>
    api.post<{ data: PresignedUploadResponse }>('/documents', data),

  confirmUpload: (documentId: string, versionId: string) =>
    api.post<{ data: { documentId: string; status: string; message: string } }>(
      `/documents/${documentId}/confirm`,
      { versionId },
    ),

  list: (params?: {
    page?: number;
    limit?: number;
    category?: string;
    status?: string;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) => api.get<{ data: DocumentListResponse }>('/documents', { params }),

  get: (documentId: string) =>
    api.get<{ data: Document }>(`/documents/${documentId}`),

  getStatus: (documentId: string) =>
    api.get<{ data: ProcessingStatus }>(`/documents/${documentId}/status`),

  update: (documentId: string, data: { title?: string; tags?: string[] }) =>
    api.patch<{ data: Document }>(`/documents/${documentId}`, data),

  delete: (documentId: string) => api.delete(`/documents/${documentId}`),
};

// ── Types ─────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  name: string | null;
  role: string;
  preferredLanguage: string;
  avatarUrl: string | null;
  createdAt: string;
}

export interface PresignedUploadResponse {
  documentId: string;
  versionId: string;
  uploadUrl: string;
  uploadFields: Record<string, string>;
  storageKey: string;
  expiresAt: string;
}

export interface Document {
  id: string;
  title: string;
  originalFileName: string;
  mimeType: string;
  fileSizeBytes: number;
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'NEEDS_REVIEW';
  category: string | null;
  categoryConfidence: number | null;
  primaryLanguage: string | null;
  tags: string[];
  createdAt: string;
  currentVersion: {
    id: string;
    versionNumber: number;
    pageCount: number | null;
    processingStatus: string;
    processingStage: string;
  } | null;
}

export interface DocumentListResponse {
  documents: Document[];
  pagination: { total: number; page: number; limit: number; totalPages: number };
}

export interface ProcessingStatus {
  documentId: string;
  status: string;
  currentStage: string | null;
  completedStages: string[];
  progress: number;
  startedAt: string | null;
  completedAt: string | null;
  error: { message: string; code: string | null } | null;
}
