'use client';

import { use, useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  FileText,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Loader2,
  BarChart2,
  Clock,
  Languages,
  Tag,
  FileDigit,
  ThumbsUp,
  AlertTriangle,
  Eye,
  EyeOff,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  Edit2,
  Check,
  X,
  History,
  GitCompare,
  Plus,
  UploadCloud,
  Sparkles,
  MessageSquare,
} from 'lucide-react';
import {
  documentsApi,
  reviewApi,
  type DocumentProcessingStatus,
  type DocumentField,
  type DocumentDetail,
  type DocumentPage,
  type OcrResult,
  type VersionCompareResponse,
} from '../../../../lib/api';
import { cn, formatDate, formatFileSize } from '../../../../lib/utils';
import toast from 'react-hot-toast';

// ── Categories ─────────────────────────────────────────────────────

const CATEGORIES = [
  'GOVERNMENT_NOTICE',
  'INVOICE',
  'RECEIPT',
  'CERTIFICATE',
  'COLLEGE_DOCUMENT',
  'BANK_DOCUMENT',
  'LEGAL_DOCUMENT',
  'EMPLOYMENT_DOCUMENT',
  'FORM',
  'LETTER',
  'IDENTITY_DOCUMENT',
  'MEDICAL_DOCUMENT',
  'INSURANCE_DOCUMENT',
  'TAX_DOCUMENT',
  'UNKNOWN',
];

const STAGE_LABELS: Record<string, string> = {
  FILE_VALIDATION: 'File Validated',
  FILE_STORAGE: 'Stored to Cloud',
  PDF_RENDERING: 'Pages Rendered',
  IMAGE_PREPROCESSING: 'Images Enhanced',
  OCR: 'OCR Complete',
  LANGUAGE_DETECTION: 'Language Detected',
  DOCUMENT_CLASSIFICATION: 'Document Classified',
  TEXT_NORMALIZATION: 'Text Normalized',
  STRUCTURED_EXTRACTION: 'Fields Extracted',
  CONFIDENCE_SCORING: 'Confidence Scored',
  VALIDATION: 'Fields Validated',
  CHUNKING: 'Text Chunked',
  EMBEDDING: 'Embeddings Created',
  INDEXING: 'Indexed for Search',
  COMPLETED: 'Processing Complete',
};

const ALL_STAGES = [
  'FILE_VALIDATION',
  'FILE_STORAGE',
  'PDF_RENDERING',
  'IMAGE_PREPROCESSING',
  'OCR',
  'LANGUAGE_DETECTION',
  'DOCUMENT_CLASSIFICATION',
  'TEXT_NORMALIZATION',
  'STRUCTURED_EXTRACTION',
  'CONFIDENCE_SCORING',
  'VALIDATION',
  'CHUNKING',
  'EMBEDDING',
  'INDEXING',
  'COMPLETED',
];

function ConfidenceBadge({ level, pct }: { level: 'HIGH' | 'MEDIUM' | 'LOW'; pct?: number }) {
  const cfg = {
    HIGH: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    MEDIUM: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    LOW: 'bg-red-500/15 text-red-400 border-red-500/30',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border',
        cfg[level],
      )}
    >
      {level}
      {pct !== undefined ? ` ${Math.round(pct * 100)}%` : ''}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, string> = {
    QUEUED: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
    PROCESSING: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    COMPLETED: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    FAILED: 'bg-red-500/15 text-red-400 border-red-500/30',
    NEEDS_REVIEW: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border',
        cfg[status] ?? cfg['QUEUED'],
      )}
    >
      {status.replace('_', ' ')}
    </span>
  );
}

export default function DocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: documentId } = use(params);
  const queryClient = useQueryClient();

  // State
  const [selectedVersionId, setSelectedVersionId] = useState<string | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<'content' | 'compare'>('content');
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isNewVersionModalOpen, setIsNewVersionModalOpen] = useState(false);
  const [compareV1, setCompareV1] = useState<string>('');
  const [compareV2, setCompareV2] = useState<string>('');
  const [highlightedFieldId, setHighlightedFieldId] = useState<string | null>(null);

  // Document query
  const { data: doc, isLoading: docLoading } = useQuery({
    queryKey: ['documents', documentId],
    queryFn: () => documentsApi.get(documentId).then((r) => r.data.data),
  });

  // Processing status polling
  const { data: status, refetch: refetchStatus } = useQuery({
    queryKey: ['documents', documentId, 'status'],
    queryFn: () => documentsApi.getStatus(documentId).then((r) => r.data.data),
    refetchInterval: (query: { state: { data?: DocumentProcessingStatus } }) => {
      const s = query.state.data?.status;
      if (s === 'COMPLETED' || s === 'FAILED') return false;
      return 2000;
    },
  });

  // When status becomes completed, reload document
  useEffect(() => {
    if (status?.status === 'COMPLETED') {
      void queryClient.invalidateQueries({ queryKey: ['documents', documentId] });
    }
  }, [status?.status, documentId, queryClient]);

  // Set default version
  const currentVersion = doc?.versions?.[0];
  const activeVersionId = selectedVersionId ?? currentVersion?.id;

  const isProcessing = doc?.status === 'PROCESSING' || doc?.status === 'QUEUED';
  const isCompleted = doc?.status === 'COMPLETED';
  const isFailed = doc?.status === 'FAILED';

  if (docLoading) {
    return (
      <div className="max-w-6xl mx-auto animate-pulse space-y-4">
        <div className="h-4 w-32 bg-white/[0.06] rounded" />
        <div className="h-8 w-64 bg-white/[0.06] rounded" />
        <div className="glass p-8 flex items-center justify-center min-h-64 rounded-2xl">
          <Loader2 className="w-8 h-8 text-brand-400 animate-spin" />
        </div>
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="max-w-4xl mx-auto text-center py-20">
        <p className="text-white/30 mb-4">Document not found</p>
        <Link
          href="/documents"
          className="inline-flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Documents
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in">
      {/* Header with Navigation & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Link
            href="/documents"
            className="inline-flex items-center gap-2 text-xs text-white/30 hover:text-white/60 transition-colors mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Documents
          </Link>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-bold text-white">{doc.title}</h1>
            <StatusBadge status={doc.status} />
            {doc.categoryOverride && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-300 border border-brand-500/20">
                User Classified
              </span>
            )}
          </div>
          <p className="text-white/30 text-xs mt-1">
            {doc.originalFileName} · {formatFileSize(doc.fileSizeBytes)} · Uploaded {formatDate(doc.createdAt)}
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Version Selector */}
          {doc.versions && doc.versions.length > 1 && (
            <div className="flex items-center gap-1.5 bg-white/[0.04] border border-white/[0.08] px-3 py-1.5 rounded-xl">
              <History className="w-3.5 h-3.5 text-white/40" />
              <select
                value={activeVersionId}
                onChange={(e) => setSelectedVersionId(e.target.value)}
                className="bg-transparent text-xs text-white/80 focus:outline-none"
              >
                {doc.versions.map((v) => (
                  <option key={v.id} value={v.id} className="bg-surface-50 text-white">
                    Version {v.versionNumber} ({formatDate(v.createdAt)})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Compare Button */}
          {doc.versions && doc.versions.length >= 2 && (
            <button
              onClick={() => {
                setCompareV1(doc.versions[1]!.id);
                setCompareV2(doc.versions[0]!.id);
                setActiveTab(activeTab === 'compare' ? 'content' : 'compare');
              }}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors',
                activeTab === 'compare'
                  ? 'bg-brand-600/20 text-brand-300 border-brand-500/30'
                  : 'bg-white/[0.04] text-white/70 border-white/[0.08] hover:bg-white/[0.08]',
              )}
            >
              <GitCompare className="w-3.5 h-3.5" />
              {activeTab === 'compare' ? 'View Document' : 'Compare Versions'}
            </button>
          )}

          {/* Chat with Document */}
          <Link
            href={`/documents/${documentId}/chat`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-white transition-colors"
          >
            <MessageSquare className="w-3.5 h-3.5 text-brand-400" /> Chat
          </Link>

          {/* Upload New Version */}
          <button
            onClick={() => setIsNewVersionModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-brand-600 hover:bg-brand-500 text-white transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> New Version
          </button>
        </div>
      </div>

      {/* Processing State */}
      {(isProcessing || isFailed) && status && (
        <ProcessingPanel status={status} isFailed={isFailed} onRefetch={refetchStatus} />
      )}

      {/* Completed View: Compare Versions Tab or Main Viewer */}
      {isCompleted && (
        <>
          {activeTab === 'compare' ? (
            <VersionCompareView
              documentId={documentId}
              versions={doc.versions}
              v1Id={compareV1}
              v2Id={compareV2}
              onV1Change={setCompareV1}
              onV2Change={setCompareV2}
            />
          ) : (
            <DocumentMainView
              doc={doc as unknown as DocumentDetail}
              activeVersionId={activeVersionId}
              highlightedFieldId={highlightedFieldId}
              onHighlightField={setHighlightedFieldId}
              onOpenCategoryModal={() => setIsCategoryModalOpen(true)}
            />
          )}
        </>
      )}

      {/* Category Override Modal */}
      {isCategoryModalOpen && (
        <CategoryOverrideModal
          documentId={documentId}
          currentCategory={doc.category ?? 'UNKNOWN'}
          onClose={() => setIsCategoryModalOpen(false)}
        />
      )}

      {/* New Version Upload Modal */}
      {isNewVersionModalOpen && (
        <NewVersionModal
          documentId={documentId}
          onClose={() => setIsNewVersionModalOpen(false)}
        />
      )}
    </div>
  );
}

// ── Document Main View (Viewer + Fields) ──────────────────────────

function DocumentMainView({
  doc,
  activeVersionId,
  highlightedFieldId,
  onHighlightField,
  onOpenCategoryModal,
}: {
  doc: DocumentDetail;
  activeVersionId?: string;
  highlightedFieldId: string | null;
  onHighlightField: (id: string | null) => void;
  onOpenCategoryModal: () => void;
}) {
  const [currentPageNum, setCurrentPageNum] = useState(1);
  const [showOcrBoxes, setShowOcrBoxes] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(100);

  // Fetch pages with URLs
  const { data: pagesData } = useQuery({
    queryKey: ['documents', doc.id, 'pages', activeVersionId],
    queryFn: () => documentsApi.getPages(doc.id, activeVersionId).then((r) => r.data.data),
  });

  // Fetch page detail with OCR
  const { data: pageDetail } = useQuery({
    queryKey: ['documents', doc.id, 'page', currentPageNum, activeVersionId],
    queryFn: () =>
      documentsApi.getPage(doc.id, currentPageNum, activeVersionId).then((r) => r.data.data),
  });

  const pages = pagesData?.pages ?? [];
  const totalPages = pages.length || 1;
  const currentPage = pages.find((p) => p.pageNumber === currentPageNum);
  const ocrBlocks = pageDetail?.ocrResult?.blocks ?? [];

  const fields = doc.fields ?? [];
  const overallConfidence =
    fields.length > 0 ? fields.reduce((s, f) => s + f.confidence, 0) / fields.length : 0;

  return (
    <div className="space-y-6">
      {/* Top summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="glass px-4 py-3 rounded-2xl flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-white/30 text-xs">
            <FileDigit className="w-3.5 h-3.5" /> Pages
          </div>
          <p className="text-white font-semibold text-sm">{totalPages}</p>
        </div>

        <div className="glass px-4 py-3 rounded-2xl flex flex-col gap-1 relative group">
          <div className="flex items-center justify-between text-white/30 text-xs">
            <span className="flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5" /> Category
            </span>
            <button
              onClick={onOpenCategoryModal}
              className="text-brand-400 hover:text-brand-300 text-[10px] font-semibold flex items-center gap-0.5"
            >
              <Edit2 className="w-2.5 h-2.5" /> Change
            </button>
          </div>
          <p className="text-white font-semibold text-sm truncate">
            {(doc.category ?? 'Unknown').replace(/_/g, ' ')}
          </p>
        </div>

        <div className="glass px-4 py-3 rounded-2xl flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-white/30 text-xs">
            <Languages className="w-3.5 h-3.5" /> Language
          </div>
          <p className="text-white font-semibold text-sm">{doc.primaryLanguage?.toUpperCase() ?? '—'}</p>
        </div>

        <div className="glass px-4 py-3 rounded-2xl flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-white/30 text-xs">
            <BarChart2 className="w-3.5 h-3.5" /> Overall Confidence
          </div>
          <p className="text-white font-semibold text-sm">
            {fields.length > 0 ? `${Math.round(overallConfidence * 100)}%` : '—'}
          </p>
        </div>
      </div>

      {/* Two-panel Grid: Left = Document Viewer / OCR, Right = Fields */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Panel: Document Viewer */}
        <div className="lg:col-span-7 glass p-5 rounded-2xl space-y-4">
          {/* Controls Bar */}
          <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-white/[0.06]">
            {/* Page Navigation */}
            <div className="flex items-center gap-2">
              <button
                disabled={currentPageNum <= 1}
                onClick={() => setCurrentPageNum((p) => Math.max(1, p - 1))}
                className="p-1.5 rounded-lg border border-white/[0.08] text-white/60 hover:text-white disabled:opacity-30 transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="text-xs font-semibold text-white/80">
                Page {currentPageNum} of {totalPages}
              </span>
              <button
                disabled={currentPageNum >= totalPages}
                onClick={() => setCurrentPageNum((p) => Math.min(totalPages, p + 1))}
                className="p-1.5 rounded-lg border border-white/[0.08] text-white/60 hover:text-white disabled:opacity-30 transition-colors"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* OCR Toggle & Zoom */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowOcrBoxes(!showOcrBoxes)}
                className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors',
                  showOcrBoxes
                    ? 'bg-brand-600/20 text-brand-300 border-brand-500/30'
                    : 'bg-white/[0.04] text-white/50 border-white/[0.06] hover:text-white',
                )}
              >
                {showOcrBoxes ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                OCR Overlay
              </button>

              <div className="flex items-center gap-1 bg-white/[0.04] border border-white/[0.08] rounded-lg p-0.5">
                <button
                  onClick={() => setZoomLevel((z) => Math.max(50, z - 25))}
                  className="p-1 text-white/50 hover:text-white"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-3 h-3" />
                </button>
                <span className="text-[10px] font-mono text-white/60 px-1">{zoomLevel}%</span>
                <button
                  onClick={() => setZoomLevel((z) => Math.min(150, z + 25))}
                  className="p-1 text-white/50 hover:text-white"
                  title="Zoom In"
                >
                  <ZoomIn className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>

          {/* Interactive Document Image Container */}
          <div className="relative overflow-auto max-h-[680px] rounded-xl bg-black/40 border border-white/[0.04] flex items-center justify-center p-4">
            <div
              className="relative transition-all duration-200"
              style={{
                width: `${zoomLevel}%`,
                maxWidth: zoomLevel > 100 ? 'none' : '100%',
              }}
            >
              {currentPage?.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={currentPage.imageUrl}
                  alt={`Page ${currentPageNum}`}
                  className="w-full h-auto rounded-lg shadow-2xl pointer-events-none select-none"
                />
              ) : (
                <div className="w-full aspect-[1/1.4] bg-white/[0.02] border border-white/[0.06] rounded-xl flex flex-col items-center justify-center text-white/30 space-y-2">
                  <FileText className="w-12 h-12 opacity-30" />
                  <p className="text-xs">Page {currentPageNum} Rendering</p>
                </div>
              )}

              {/* OCR Bounding Boxes Overlay */}
              {showOcrBoxes && ocrBlocks.length > 0 && (
                <div className="absolute inset-0 pointer-events-auto">
                  {ocrBlocks.map((block) => {
                    const [x1, y1, x2, y2] = block.bbox;
                    const imgW = pageDetail?.page?.width || 1000;
                    const imgH = pageDetail?.page?.height || 1400;

                    const leftPct = (x1 / imgW) * 100;
                    const topPct = (y1 / imgH) * 100;
                    const widthPct = ((x2 - x1) / imgW) * 100;
                    const heightPct = ((y2 - y1) / imgH) * 100;

                    const isHigh = block.confidence >= 0.85;
                    const isMed = block.confidence >= 0.65 && block.confidence < 0.85;

                    return (
                      <div
                        key={block.id}
                        style={{
                          left: `${leftPct}%`,
                          top: `${topPct}%`,
                          width: `${Math.max(2, widthPct)}%`,
                          height: `${Math.max(1.5, heightPct)}%`,
                        }}
                        className={cn(
                          'absolute border transition-all cursor-pointer group rounded-[2px]',
                          isHigh
                            ? 'border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/30'
                            : isMed
                            ? 'border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/30'
                            : 'border-red-500/50 bg-red-500/15 hover:bg-red-500/35',
                        )}
                      >
                        {/* Tooltip */}
                        <div className="absolute left-1/2 -top-8 -translate-x-1/2 hidden group-hover:flex items-center gap-1.5 px-2 py-1 bg-surface-100 border border-white/20 rounded-lg shadow-xl text-[10px] text-white z-30 whitespace-nowrap pointer-events-none">
                          <span className="font-semibold">{Math.round(block.confidence * 100)}%</span>
                          <span className="text-white/60 truncate max-w-[160px]">{block.text}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Panel: Extracted Fields & HITL Verification */}
        <div className="lg:col-span-5 space-y-4">
          <ExtractedFieldsPanel
            documentId={doc.id}
            fields={fields}
            currentPageNum={currentPageNum}
            onJumpToPage={setCurrentPageNum}
            highlightedFieldId={highlightedFieldId}
            onHighlightField={onHighlightField}
          />
        </div>
      </div>
    </div>
  );
}

// ── Extracted Fields Panel with HITL Controls ─────────────────────

function ExtractedFieldsPanel({
  documentId,
  fields,
  currentPageNum,
  onJumpToPage,
  highlightedFieldId,
  onHighlightField,
}: {
  documentId: string;
  fields: DocumentField[];
  currentPageNum: number;
  onJumpToPage: (p: number) => void;
  highlightedFieldId: string | null;
  onHighlightField: (id: string | null) => void;
}) {
  const queryClient = useQueryClient();

  const acceptMutation = useMutation({
    mutationFn: (id: string) => reviewApi.accept(id),
    onSuccess: () => {
      toast.success('Field verified');
      void queryClient.invalidateQueries({ queryKey: ['documents', documentId] });
      void queryClient.invalidateQueries({ queryKey: ['review'] });
    },
    onError: () => toast.error('Failed to accept field'),
  });

  const editMutation = useMutation({
    mutationFn: ({ id, newValue }: { id: string; newValue: string }) =>
      reviewApi.edit(id, { newValue }),
    onSuccess: () => {
      toast.success('Field updated and verified');
      void queryClient.invalidateQueries({ queryKey: ['documents', documentId] });
      void queryClient.invalidateQueries({ queryKey: ['review'] });
    },
    onError: () => toast.error('Failed to update field'),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => reviewApi.reject(id),
    onSuccess: () => {
      toast.success('Field rejected');
      void queryClient.invalidateQueries({ queryKey: ['documents', documentId] });
      void queryClient.invalidateQueries({ queryKey: ['review'] });
    },
    onError: () => toast.error('Failed to reject field'),
  });

  const needsReviewFields = fields.filter((f) => f.confidenceLevel === 'LOW' && !f.isVerified);
  const verifiedFields = fields.filter((f) => f.isVerified && !f.isRejected);
  const otherFields = fields.filter((f) => f.confidenceLevel !== 'LOW' && !f.isVerified && !f.isRejected);

  return (
    <div className="glass p-5 rounded-2xl space-y-5">
      <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
        <h2 className="font-semibold text-white text-sm flex items-center gap-2">
          Extracted Fields
          <span className="text-xs font-normal text-white/30">({fields.length} total)</span>
        </h2>
      </div>

      {fields.length === 0 ? (
        <div className="py-12 text-center text-white/30 text-sm">No fields extracted</div>
      ) : (
        <div className="space-y-4">
          {/* Needs Verification Section */}
          {needsReviewFields.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" /> Needs Verification ({needsReviewFields.length})
              </p>
              <div className="space-y-2">
                {needsReviewFields.map((f) => (
                  <InteractiveFieldRow
                    key={f.id}
                    field={f}
                    onAccept={() => acceptMutation.mutate(f.id)}
                    onEdit={(val) => editMutation.mutate({ id: f.id, newValue: val })}
                    onReject={() => rejectMutation.mutate(f.id)}
                    onJumpToPage={onJumpToPage}
                    isHighlighted={highlightedFieldId === f.id}
                    onHighlight={() => onHighlightField(f.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Other High / Medium Extractions */}
          {otherFields.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-bold text-white/40 uppercase tracking-wider">
                AI Extractions ({otherFields.length})
              </p>
              <div className="space-y-2">
                {otherFields.map((f) => (
                  <InteractiveFieldRow
                    key={f.id}
                    field={f}
                    onAccept={() => acceptMutation.mutate(f.id)}
                    onEdit={(val) => editMutation.mutate({ id: f.id, newValue: val })}
                    onReject={() => rejectMutation.mutate(f.id)}
                    onJumpToPage={onJumpToPage}
                    isHighlighted={highlightedFieldId === f.id}
                    onHighlight={() => onHighlightField(f.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Verified Fields */}
          {verifiedFields.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-bold text-emerald-400/70 uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> Verified ({verifiedFields.length})
              </p>
              <div className="space-y-2">
                {verifiedFields.map((f) => (
                  <InteractiveFieldRow
                    key={f.id}
                    field={f}
                    onAccept={() => acceptMutation.mutate(f.id)}
                    onEdit={(val) => editMutation.mutate({ id: f.id, newValue: val })}
                    onReject={() => rejectMutation.mutate(f.id)}
                    onJumpToPage={onJumpToPage}
                    isHighlighted={highlightedFieldId === f.id}
                    onHighlight={() => onHighlightField(f.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function InteractiveFieldRow({
  field,
  onAccept,
  onEdit,
  onReject,
  onJumpToPage,
  isHighlighted,
  onHighlight,
}: {
  field: DocumentField;
  onAccept: () => void;
  onEdit: (val: string) => void;
  onReject: () => void;
  onJumpToPage: (page: number) => void;
  isHighlighted: boolean;
  onHighlight: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(field.rawValue);

  const handleSave = () => {
    if (value.trim() !== field.rawValue.trim()) {
      onEdit(value);
    }
    setIsEditing(false);
  };

  return (
    <div
      onClick={onHighlight}
      className={cn(
        'p-3 rounded-xl border transition-all space-y-2',
        isHighlighted
          ? 'bg-brand-600/10 border-brand-500/40 ring-1 ring-brand-500/20'
          : 'bg-white/[0.02] border-white/[0.05] hover:border-white/[0.1]',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-white/50 capitalize font-medium">
            {field.fieldName.replace(/_/g, ' ')}
          </span>
          {field.sourcePage && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onJumpToPage(field.sourcePage!);
              }}
              className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.05] hover:bg-white/[0.1] text-white/40 transition-colors"
            >
              p{field.sourcePage}
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {field.isVerified && (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" aria-label="Verified" />
          )}
          <ConfidenceBadge level={field.confidenceLevel} pct={field.confidence} />
        </div>
      </div>

      {isEditing ? (
        <div className="flex items-center gap-1.5 pt-1">
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
            className="flex-1 bg-surface-50 border border-brand-500/50 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none"
          />
          <button
            onClick={handleSave}
            className="p-1 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              setValue(field.rawValue);
              setIsEditing(false);
            }}
            className="p-1 rounded-lg bg-white/[0.05] text-white/50 hover:text-white text-xs"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-white/90 truncate">{field.rawValue}</p>

          {/* Actions */}
          <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 shrink-0">
            {!field.isVerified && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAccept();
                }}
                className="p-1 rounded-lg hover:bg-emerald-500/20 text-emerald-400 text-xs transition-colors"
                title="Accept"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsEditing(true);
              }}
              className="p-1 rounded-lg hover:bg-white/[0.1] text-white/50 hover:text-white text-xs transition-colors"
              title="Edit"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            {!field.isRejected && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onReject();
                }}
                className="p-1 rounded-lg hover:bg-rose-500/20 text-rose-400/70 hover:text-rose-400 text-xs transition-colors"
                title="Reject"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Version Compare View ──────────────────────────────────────────

function VersionCompareView({
  documentId,
  versions,
  v1Id,
  v2Id,
  onV1Change,
  onV2Change,
}: {
  documentId: string;
  versions: DocumentDetail['versions'];
  v1Id: string;
  v2Id: string;
  onV1Change: (id: string) => void;
  onV2Change: (id: string) => void;
}) {
  const { data: compareData, isLoading } = useQuery({
    queryKey: ['documents', documentId, 'compare', v1Id, v2Id],
    queryFn: () =>
      documentsApi.compareVersions(documentId, v1Id, v2Id).then((r) => r.data.data),
    enabled: Boolean(v1Id && v2Id && v1Id !== v2Id),
  });

  return (
    <div className="glass p-6 rounded-2xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/[0.06]">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <GitCompare className="w-5 h-5 text-brand-400" /> Version Comparison
          </h2>
          <p className="text-xs text-white/40 mt-0.5">
            Compare extracted fields and changes across document versions
          </p>
        </div>

        {/* Version Selectors */}
        <div className="flex items-center gap-2">
          <select
            value={v1Id}
            onChange={(e) => onV1Change(e.target.value)}
            className="bg-white/[0.04] border border-white/[0.08] px-3 py-1.5 rounded-xl text-xs text-white focus:outline-none"
          >
            {versions.map((v) => (
              <option key={v.id} value={v.id} className="bg-surface-50">
                Base: V{v.versionNumber} ({formatDate(v.createdAt)})
              </option>
            ))}
          </select>
          <span className="text-white/30 text-xs">vs</span>
          <select
            value={v2Id}
            onChange={(e) => onV2Change(e.target.value)}
            className="bg-white/[0.04] border border-white/[0.08] px-3 py-1.5 rounded-xl text-xs text-white focus:outline-none"
          >
            {versions.map((v) => (
              <option key={v.id} value={v.id} className="bg-surface-50">
                New: V{v.versionNumber} ({formatDate(v.createdAt)})
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="py-16 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-brand-400 mx-auto mb-2" />
          <p className="text-xs text-white/40">Comparing versions...</p>
        </div>
      ) : compareData ? (
        <div className="space-y-6">
          {/* Summary Box */}
          <div className="p-4 rounded-xl bg-brand-500/[0.06] border border-brand-500/20 flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-brand-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-brand-300">Semantic Diff Summary</p>
              <p className="text-sm text-white/80 mt-0.5">{compareData.summary}</p>
            </div>
          </div>

          {/* Diffs Table */}
          <div className="border border-white/[0.06] rounded-xl overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-white/[0.03] border-b border-white/[0.06] text-white/40 uppercase font-medium">
                <tr>
                  <th className="p-3">Field</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">V{compareData.v1.versionNumber} (Old)</th>
                  <th className="p-3">V{compareData.v2.versionNumber} (New)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {compareData.fieldDiffs.map((diff) => (
                  <tr key={diff.fieldName} className="hover:bg-white/[0.01]">
                    <td className="p-3 font-semibold text-white/70 capitalize">
                      {diff.fieldName.replace(/_/g, ' ')}
                    </td>
                    <td className="p-3">
                      <span
                        className={cn('inline-block px-2 py-0.5 rounded-full text-[10px] font-bold', {
                          'bg-amber-500/15 text-amber-400 border border-amber-500/25':
                            diff.status === 'CHANGED',
                          'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25':
                            diff.status === 'ADDED',
                          'bg-rose-500/15 text-rose-400 border border-rose-500/25':
                            diff.status === 'REMOVED',
                          'bg-white/[0.04] text-white/30': diff.status === 'UNCHANGED',
                        })}
                      >
                        {diff.status}
                      </span>
                    </td>
                    <td className="p-3 text-white/50">{diff.v1Value ?? '—'}</td>
                    <td className="p-3 font-medium text-white">{diff.v2Value ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ── Modals: Category Override & New Version ───────────────────────

function CategoryOverrideModal({
  documentId,
  currentCategory,
  onClose,
}: {
  documentId: string;
  currentCategory: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [category, setCategory] = useState(currentCategory);
  const [reason, setReason] = useState('');

  const mutation = useMutation({
    mutationFn: () => documentsApi.overrideCategory(documentId, { category, reason }),
    onSuccess: () => {
      toast.success('Document category updated');
      void queryClient.invalidateQueries({ queryKey: ['documents', documentId] });
      onClose();
    },
    onError: () => toast.error('Failed to update category'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="glass p-6 rounded-2xl w-full max-w-md space-y-4 border-white/[0.1]">
        <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
          <h3 className="font-bold text-white text-base">Change Document Category</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-white/40 block mb-1">Select Correct Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white focus:outline-none"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat} className="bg-surface-50 text-white">
                  {cat.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-white/40 block mb-1">Reason for correction (optional)</label>
            <input
              type="text"
              placeholder="e.g. AI misclassified government order"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white focus:outline-none"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-white/60 hover:text-white rounded-xl"
          >
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="px-4 py-1.5 text-xs font-semibold bg-brand-600 hover:bg-brand-500 text-white rounded-xl transition-colors"
          >
            {mutation.isPending ? 'Saving...' : 'Save Category'}
          </button>
        </div>
      </div>
    </div>
  );
}

function NewVersionModal({
  documentId,
  onClose,
}: {
  documentId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  const handleUpload = async () => {
    if (!file) return;
    setIsUploading(true);

    try {
      // 1. Get presigned upload URL
      const { data: presign } = await documentsApi.createVersion(documentId, {
        fileName: file.name,
        mimeType: file.type || 'application/pdf',
        fileSize: file.size,
        notes: notes.trim() || undefined,
      });

      // 2. Direct upload to MinIO
      const formData = new FormData();
      Object.entries(presign.data.uploadFields).forEach(([k, v]) => formData.append(k, v));
      formData.append('file', file);

      const uploadRes = await fetch(presign.data.uploadUrl, {
        method: 'POST',
        body: formData,
      });

      if (!uploadRes.ok && uploadRes.status !== 204) {
        throw new Error('Upload to storage failed');
      }

      // 3. Confirm upload
      await documentsApi.confirmUpload(documentId, presign.data.versionId);

      toast.success(`Version ${presign.data.versionNumber} uploaded and queued!`);
      void queryClient.invalidateQueries({ queryKey: ['documents', documentId] });
      onClose();
    } catch (err) {
      toast.error(`Version upload failed: ${String(err)}`);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="glass p-6 rounded-2xl w-full max-w-md space-y-4 border-white/[0.1]">
        <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
          <h3 className="font-bold text-white text-base">Upload New Document Version</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-white/40 block mb-1">Select File (PDF, PNG, JPG)</label>
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full text-xs text-white/70 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-brand-600 file:text-white hover:file:bg-brand-500"
            />
          </div>

          <div>
            <label className="text-xs text-white/40 block mb-1">Version Notes / Changes (optional)</label>
            <textarea
              rows={2}
              placeholder="e.g. Revised edition with extended deadline"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white focus:outline-none resize-none"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-white/60 hover:text-white rounded-xl"
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={!file || isUploading}
            className="px-4 py-1.5 text-xs font-semibold bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white rounded-xl transition-colors flex items-center gap-1.5"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading...
              </>
            ) : (
              <>
                <UploadCloud className="w-3.5 h-3.5" /> Upload Version
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Processing Progress Panel ─────────────────────────────────────

function ProcessingPanel({
  status,
  isFailed,
  onRefetch,
}: {
  status: DocumentProcessingStatus;
  isFailed: boolean;
  onRefetch: () => void;
}) {
  return (
    <div className="glass p-6 space-y-5 rounded-2xl">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-white">
          {isFailed ? 'Processing Failed' : 'Processing Status'}
        </h2>
        {isFailed && (
          <button
            onClick={onRefetch}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-white/10 text-white/60 hover:text-white transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Retry
          </button>
        )}
      </div>

      <div>
        <div className="flex justify-between text-sm mb-2">
          <span className="text-white/50">
            {isFailed ? (
              <span className="text-red-400 flex items-center gap-1.5">
                <XCircle className="w-4 h-4" /> Failed
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <Loader2 className="w-4 h-4 animate-spin text-brand-400" />
                {status.currentStage ? STAGE_LABELS[status.currentStage] ?? status.currentStage : 'Processing...'}
              </span>
            )}
          </span>
          <span className="text-white/30 font-mono">{status.progress}%</span>
        </div>
        <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-700 ease-out',
              isFailed
                ? 'bg-red-500'
                : 'bg-gradient-to-r from-brand-700 via-brand-500 to-brand-400',
            )}
            style={{ width: `${status.progress}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
        {ALL_STAGES.map((stage) => {
          const isCompleted = status.completedStages?.includes(stage);
          const isCurrent = status.currentStage === stage && !isCompleted;
          return (
            <div
              key={stage}
              className={cn(
                'flex items-center gap-2 text-xs py-1.5 px-2.5 rounded-lg transition-all',
                isCompleted
                  ? 'text-emerald-400 bg-emerald-500/5'
                  : isCurrent
                  ? 'text-brand-400 bg-brand-500/10 border border-brand-500/20'
                  : 'text-white/20',
              )}
            >
              {isCompleted ? (
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              ) : isCurrent ? (
                <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />
              ) : (
                <div className="w-3.5 h-3.5 rounded-full border border-current shrink-0 opacity-40" />
              )}
              <span className="truncate">{STAGE_LABELS[stage]}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
