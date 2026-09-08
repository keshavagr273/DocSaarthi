import axios, { AxiosError } from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const api = axios.create({
  baseURL: `${API_URL}/api/v1`,
  withCredentials: true, // Sends HttpOnly cookies automatically
  headers: { 'Content-Type': 'application/json' },
});

let isRefreshing = false;
let refreshQueue: Array<(token: void) => void> = [];

function setAuthCookie() {
  if (typeof document !== 'undefined') {
    const isSecure = window.location.protocol === 'https:';
    document.cookie = `ds_auth=1; path=/; max-age=604800; SameSite=Lax${isSecure ? '; Secure' : ''}`;
  }
}

function clearAuthCookie() {
  if (typeof document !== 'undefined') {
    document.cookie = 'ds_auth=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax';
    document.cookie = 'ds_auth=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=None; Secure';
  }
}

// ── Response interceptor: auto-refresh on 401 ─────────────────
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as typeof error.config & {
      _retry?: boolean;
    };

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
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
        setAuthCookie();
        refreshQueue.forEach((cb) => cb());
        refreshQueue = [];
        return api(originalRequest);
      } catch {
        refreshQueue = [];
        clearAuthCookie();
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
  register: async (data: { name: string; email: string; password: string; preferredLanguage?: string }) => {
    const res = await api.post<{ data: { user: User; message: string } }>('/auth/register', data);
    setAuthCookie();
    return res;
  },

  login: async (data: { email: string; password: string }) => {
    const res = await api.post<{ data: { user: User; message: string } }>('/auth/login', data);
    setAuthCookie();
    return res;
  },

  logout: async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      clearAuthCookie();
    }
  },

  me: () => api.get<{ data: User }>('/auth/me'),
};

export const documentsApi = {
  uploadDirect: (
    file: File,
    metadata?: { title?: string; tags?: string[] },
    onProgress?: (percent: number) => void,
  ) => {
    const formData = new FormData();
    formData.append('file', file);
    if (metadata?.title) formData.append('title', metadata.title);
    if (metadata?.tags?.length) formData.append('tags', metadata.tags.join(','));

    return api.post<{ data: { documentId: string; versionId: string; status: string; message: string } }>(
      '/documents/upload-direct',
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (event) => {
          if (event.total && onProgress) {
            onProgress(Math.round((event.loaded / event.total) * 100));
          }
        },
      },
    );
  },

  initiateUpload: (data: {
    fileName: string;
    mimeType: string;
    fileSize: number;
    title?: string;
    tags?: string[];
  }) => api.post<{ data: PresignedUploadResponse }>('/documents', data),

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
    api.get<{ data: DocumentDetail }>(`/documents/${documentId}`),

  getStatus: (documentId: string) =>
    api.get<{ data: DocumentProcessingStatus }>(`/documents/${documentId}/status`),

  retryProcessing: (documentId: string) =>
    api.post<{ data: { documentId: string; versionId: string; status: string; message: string } }>(
      `/documents/${documentId}/retry`,
    ),

  getFields: (documentId: string) =>
    api.get<{ data: DocumentFieldsResponse }>(`/documents/${documentId}/fields`),

  getPages: (documentId: string, versionId?: string) =>
    api.get<{ data: { documentId: string; versionId: string; pages: DocumentPage[] } }>(
      `/documents/${documentId}/pages`,
      { params: { versionId } },
    ),

  getPage: (documentId: string, pageNum: number, versionId?: string) =>
    api.get<{ data: { documentId: string; page: DocumentPage; ocrResult: OcrResult | null } }>(
      `/documents/${documentId}/pages/${pageNum}`,
      { params: { versionId } },
    ),

  getOcr: (documentId: string, versionId?: string) =>
    api.get<{ data: { documentId: string; pages: OcrResult[] } }>(
      `/documents/${documentId}/ocr`,
      { params: { versionId } },
    ),

  overrideCategory: (documentId: string, data: { category: string; reason?: string }) =>
    api.patch<{ data: { id: string; category: string; categoryOverride: boolean } }>(
      `/documents/${documentId}/category`,
      data,
    ),

  getVersions: (documentId: string) =>
    api.get<{ data: { documentId: string; versions: DocumentVersionInfo[] } }>(
      `/documents/${documentId}/versions`,
    ),

  createVersion: (
    documentId: string,
    data: { fileName: string; mimeType: string; fileSize: number; notes?: string },
  ) => api.post<{ data: PresignedUploadResponse & { versionNumber: number } }>(
    `/documents/${documentId}/versions`,
    data,
  ),

  compareVersions: (documentId: string, v1: string, v2: string) =>
    api.get<{ data: VersionCompareResponse }>(`/documents/${documentId}/versions/compare`, {
      params: { v1, v2 },
    }),

  update: (documentId: string, data: { title?: string; tags?: string[] }) =>
    api.patch<{ data: Document }>(`/documents/${documentId}`, data),

  delete: (documentId: string) => api.delete(`/documents/${documentId}`),
};

export const reviewApi = {
  getQueue: (params?: { page?: number; limit?: number; category?: string; search?: string }) =>
    api.get<{ data: ReviewQueueResponse }>('/review', { params }),

  getStats: () =>
    api.get<{ data: ReviewStats }>('/review/stats'),

  accept: (fieldId: string) =>
    api.post<{ data: DocumentField }>(`/review/fields/${fieldId}/accept`),

  edit: (fieldId: string, data: { newValue: string; reason?: string }) =>
    api.post<{ data: DocumentField }>(`/review/fields/${fieldId}/edit`, data),

  reject: (fieldId: string, data?: { reason?: string }) =>
    api.post<{ data: DocumentField }>(`/review/fields/${fieldId}/reject`, data ?? {}),
};

export const searchApi = {
  search: (params: {
    q: string;
    mode?: 'hybrid' | 'semantic' | 'keyword';
    category?: string;
    lang?: string;
    documentId?: string;
    uploadedAfter?: string;
    uploadedBefore?: string;
    page?: number;
    limit?: number;
  }) => api.get<{ data: SearchResponse }>('/search', { params }),

  semantic: (data: { query: string; documentId?: string; category?: string; limit?: number }) =>
    api.post<{ data: { query: string; mode: string; results: SearchResultItem[]; totalResults: number } }>(
      '/search/semantic',
      data,
    ),

  keyword: (data: { query: string; documentId?: string; category?: string; limit?: number }) =>
    api.post<{ data: { query: string; mode: string; results: SearchResultItem[]; totalResults: number } }>(
      '/search/keyword',
      data,
    ),
};

export const conversationsApi = {
  create: (data: { documentId?: string; title?: string; language?: string }) =>
    api.post<{ data: ConversationSummary }>('/conversations', data),

  list: () =>
    api.get<{ data: ConversationSummary[] }>('/conversations'),

  get: (conversationId: string) =>
    api.get<{ data: ConversationDetail }>(`/conversations/${conversationId}`),

  delete: (conversationId: string) =>
    api.delete(`/conversations/${conversationId}`),

  sendMessageSync: (conversationId: string, data: { content: string }) =>
    api.post<{ data: { userMessage: MessageItem; assistantMessage: MessageItem } }>(
      `/conversations/${conversationId}/messages`,
      { ...data, stream: false },
    ),
};

export const settingsApi = {
  updateProfile: (data: { name?: string; preferredLanguage?: string }) =>
    api.patch<{ data: User }>('/settings/profile', data),

  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    api.post<{ data: { message: string } }>('/settings/password', data),

  listApiKeys: () =>
    api.get<{ data: ApiKeyItem[] }>('/settings/api-keys'),

  createApiKey: (data: { name: string; expiresInDays?: number }) =>
    api.post<{ data: ApiKeyItem & { key: string } }>('/settings/api-keys', data),

  revokeApiKey: (keyId: string) =>
    api.delete<{ data: { message: string } }>(`/settings/api-keys/${keyId}`),

  getDashboardStats: () =>
    api.get<{ data: DashboardStatsResponse }>('/settings/dashboard-stats'),
};

export const auditLogsApi = {
  list: (params?: {
    eventType?: string;
    resourceType?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  }) => api.get<{ data: AuditLogsResponse }>('/audit-logs', { params }),
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
  categoryOverride?: boolean;
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

export interface DocumentVersionInfo {
  id: string;
  versionNumber: number;
  pageCount: number | null;
  fileSizeBytes: number | null;
  thumbnailStorageKey: string | null;
  processingStatus: string;
  processingStage: string;
  notes: string | null;
  startedAt: string | null;
  completedAt: string | null;
  processingDurationMs: number | null;
  createdAt: string;
}

export interface DocumentDetail extends Document {
  versions: DocumentVersionInfo[];
  fields: DocumentField[];
}

export interface DocumentField {
  id: string;
  documentId?: string;
  fieldName: string;
  fieldType: string;
  rawValue: string;
  normalizedValue: unknown;
  confidence: number;
  confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  sourcePage: number | null;
  sourceBbox: [number, number, number, number] | null;
  isVerified: boolean;
  isRejected: boolean;
  extractionMethod: string | null;
  createdAt: string;
}

export interface DocumentFieldsResponse {
  documentId: string;
  category: string | null;
  categoryConfidence: number | null;
  categoryOverride?: boolean;
  overallConfidence: number | null;
  fields: DocumentField[];
}

export interface DocumentPage {
  id: string;
  pageNumber: number;
  storageKey: string;
  imageUrl?: string | null;
  width: number | null;
  height: number | null;
  language: string | null;
  confidence: number | null;
}

export interface OcrBlock {
  id: string;
  text: string;
  bbox: [number, number, number, number];
  confidence: number;
  readingOrder: number;
  blockType: string;
}

export interface OcrResult {
  id: string;
  pageNumber: number;
  rawText: string;
  blocks: OcrBlock[];
  pageConfidence: number;
  pageLanguage: string;
  ocrProvider: string;
  fallbackUsed: boolean;
  fallbackProvider?: string | null;
  processingTimeMs: number | null;
}

export interface DocumentListResponse {
  documents: Document[];
  pagination: { total: number; page: number; limit: number; totalPages: number };
}

export interface DocumentProcessingStatus {
  documentId: string;
  status: string;
  currentStage: string | null;
  processingStatus: string | null;
  completedStages: string[];
  progress: number;
  stageHistory: unknown;
  startedAt: string | null;
  completedAt: string | null;
  error: { message: string; code: string | null } | null;
  retryCount: number;
}

export interface ReviewFieldItem extends DocumentField {
  document: {
    id: string;
    title: string;
    originalFileName: string;
    category: string | null;
    createdAt: string;
  };
}

export interface ReviewQueueResponse {
  fields: ReviewFieldItem[];
  pagination: { total: number; page: number; limit: number; totalPages: number };
}

export interface ReviewStats {
  pendingCount: number;
  verifiedCount: number;
  rejectedCount: number;
}

export interface FieldDiffItem {
  fieldName: string;
  status: 'UNCHANGED' | 'CHANGED' | 'ADDED' | 'REMOVED';
  v1Value: string | null;
  v2Value: string | null;
  v1Confidence: number | null;
  v2Confidence: number | null;
}

export interface VersionCompareResponse {
  documentId: string;
  documentTitle: string;
  v1: { id: string; versionNumber: number; createdAt: string };
  v2: { id: string; versionNumber: number; createdAt: string };
  summary: string;
  fieldDiffs: FieldDiffItem[];
}

export interface SearchResultItem {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  documentCategory: string | null;
  pageNumber: number;
  sectionTitle: string | null;
  snippet: string;
  semanticScore: number;
  keywordScore: number;
  finalScore: number;
}

export interface SearchResponse {
  query: string;
  mode: 'hybrid' | 'semantic' | 'keyword';
  results: SearchResultItem[];
  totalResults: number;
  searchDurationMs: number;
}

export interface CitationItem {
  id?: string;
  chunkId: string;
  documentId: string;
  documentTitle?: string;
  pageNumber: number;
  sectionTitle?: string | null;
  relevanceScore?: number | null;
  chunk?: {
    content: string;
    pageNumber: number;
    sectionTitle: string | null;
  };
}

export interface MessageItem {
  id: string;
  role: 'USER' | 'ASSISTANT' | 'SYSTEM';
  content: string;
  language?: string | null;
  createdAt: string;
  citations?: CitationItem[];
}

export interface ConversationSummary {
  id: string;
  title: string | null;
  language: string | null;
  documentId: string | null;
  document?: {
    id: string;
    title: string;
    category: string | null;
  } | null;
  lastMessage: {
    content: string;
    role: string;
    createdAt: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationDetail {
  id: string;
  title: string | null;
  language: string | null;
  documentId: string | null;
  document?: {
    id: string;
    title: string;
    category: string | null;
    primaryLanguage: string | null;
  } | null;
  messages: MessageItem[];
  createdAt: string;
  updatedAt: string;
}

export interface ApiKeyItem {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface AuditLogItem {
  id: string;
  eventType: string;
  resourceType: string;
  resourceId: string;
  createdAt: string;
  document?: { title: string } | null;
}

export interface AuditLogsResponse {
  logs: AuditLogItem[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface DashboardStatsResponse {
  stats: {
    totalDocuments: number;
    processingCount: number;
    completedCount: number;
    failedCount: number;
    needsReviewFieldsCount: number;
    totalStorageBytes: number;
  };
  categoryBreakdown: Array<{ category: string; count: number }>;
  recentAuditLogs: AuditLogItem[];
  upcomingDeadlines: Array<{
    id: string;
    fieldName: string;
    rawValue: string;
    documentId: string;
    document: { title: string; category: string | null };
  }>;
}
