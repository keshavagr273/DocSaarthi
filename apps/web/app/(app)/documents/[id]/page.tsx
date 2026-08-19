'use client';

import { use } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
} from 'lucide-react';
import {
  documentsApi,
  type DocumentProcessingStatus,
  type DocumentField,
  type DocumentDetail,
} from '../../../../lib/api';
import { cn, formatDate, formatFileSize } from '../../../../lib/utils';
import { useEffect } from 'react';

// ── Stage metadata ─────────────────────────────────────────────────

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

// ── Sub-components ────────────────────────────────────────────────

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
      {level}{pct !== undefined ? ` ${Math.round(pct * 100)}%` : ''}
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

// ── Processing Status Panel ────────────────────────────────────────

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
    <div className="glass p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-white">
          {isFailed ? 'Processing Failed' : 'Processing Status'}
        </h2>
        {isFailed && (
          <button
            onClick={onRefetch}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-white/10 text-white/60 hover:text-white hover:border-white/20 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Retry
          </button>
        )}
      </div>

      {/* Progress bar */}
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
        {status.startedAt && (
          <p className="text-xs text-white/20 mt-1.5 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Started {formatDate(status.startedAt)}
          </p>
        )}
      </div>

      {/* Stage checklist */}
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

      {/* Error message */}
      {status.error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20">
          <p className="text-red-300 text-sm font-semibold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> Processing Error
          </p>
          <p className="text-red-300/70 text-sm mt-1">{status.error.message}</p>
        </div>
      )}
    </div>
  );
}

// ── Completed Panel ───────────────────────────────────────────────

function CompletedPanel({ doc }: { doc: DocumentDetail }) {
  const fields = doc.fields ?? [];
  const highFields = fields.filter((f) => f.confidenceLevel === 'HIGH');
  const medFields = fields.filter((f) => f.confidenceLevel === 'MEDIUM');
  const lowFields = fields.filter((f) => f.confidenceLevel === 'LOW');

  const overallConfidence = fields.length > 0
    ? fields.reduce((s, f) => s + f.confidence, 0) / fields.length
    : 0;

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            icon: FileDigit,
            label: 'Pages',
            value: doc.currentVersion?.pageCount?.toString() ?? '—',
          },
          {
            icon: Tag,
            label: 'Category',
            value: (doc.category ?? 'Unknown').replace(/_/g, ' '),
          },
          {
            icon: Languages,
            label: 'Language',
            value: doc.primaryLanguage?.toUpperCase() ?? '—',
          },
          {
            icon: BarChart2,
            label: 'Confidence',
            value: fields.length > 0 ? `${Math.round(overallConfidence * 100)}%` : '—',
          },
        ].map(({ icon: Icon, label, value }) => (
          <div
            key={label}
            className="glass px-4 py-3 flex flex-col gap-1 rounded-xl"
          >
            <div className="flex items-center gap-2 text-white/30 text-xs">
              <Icon className="w-3.5 h-3.5" />
              {label}
            </div>
            <p className="text-white font-semibold text-sm truncate">{value}</p>
          </div>
        ))}
      </div>

      {/* Fields */}
      <div className="glass p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-semibold text-white flex items-center gap-2">
            Extracted Fields
            {fields.length > 0 && (
              <span className="text-xs font-normal text-white/30">({fields.length} total)</span>
            )}
          </h2>
          {doc.categoryConfidence !== null && (
            <div className="text-xs text-white/30 flex items-center gap-1.5">
              Category confidence:
              <span
                className={cn('font-semibold', {
                  'text-emerald-400': (doc.categoryConfidence ?? 0) >= 0.8,
                  'text-amber-400':
                    (doc.categoryConfidence ?? 0) >= 0.5 &&
                    (doc.categoryConfidence ?? 0) < 0.8,
                  'text-red-400': (doc.categoryConfidence ?? 0) < 0.5,
                })}
              >
                {Math.round((doc.categoryConfidence ?? 0) * 100)}%
              </span>
            </div>
          )}
        </div>

        {fields.length === 0 ? (
          <div className="py-8 text-center">
            <FileText className="w-10 h-10 text-white/10 mx-auto mb-2" />
            <p className="text-white/30 text-sm">No fields extracted</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* HIGH confidence */}
            {highFields.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-emerald-400/60 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <ThumbsUp className="w-3 h-3" /> High Confidence ({highFields.length})
                </p>
                <div className="space-y-2">
                  {highFields.map((f) => (
                    <FieldRow key={f.id} field={f} />
                  ))}
                </div>
              </div>
            )}

            {/* MEDIUM confidence */}
            {medFields.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-amber-400/60 uppercase tracking-wider mb-2">
                  Medium Confidence ({medFields.length})
                </p>
                <div className="space-y-2">
                  {medFields.map((f) => (
                    <FieldRow key={f.id} field={f} />
                  ))}
                </div>
              </div>
            )}

            {/* LOW confidence */}
            {lowFields.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-red-400/60 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <AlertTriangle className="w-3 h-3" /> Needs Review ({lowFields.length})
                </p>
                <div className="space-y-2">
                  {lowFields.map((f) => (
                    <FieldRow key={f.id} field={f} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function FieldRow({ field }: { field: DocumentField }) {
  const normalizedDisplay =
    field.normalizedValue !== null && field.normalizedValue !== undefined
      ? String(field.normalizedValue)
      : null;

  return (
    <div className="flex items-start justify-between gap-3 py-2.5 px-3 rounded-xl bg-white/[0.03] border border-white/[0.04] group hover:border-white/[0.08] transition-colors">
      <div className="flex-1 min-w-0">
        <p className="text-xs text-white/35 capitalize mb-0.5">
          {field.fieldName.replace(/_/g, ' ')}
          {field.sourcePage && (
            <span className="ml-1 text-white/20">· p{field.sourcePage}</span>
          )}
        </p>
        <p className="text-sm text-white/80 truncate">{field.rawValue}</p>
        {normalizedDisplay && normalizedDisplay !== field.rawValue && (
          <p className="text-[11px] text-white/25 mt-0.5 font-mono">→ {normalizedDisplay}</p>
        )}
      </div>
      <div className="shrink-0 flex items-center gap-2">
        {field.isVerified && (
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" aria-label="Verified" />
        )}
        <ConfidenceBadge level={field.confidenceLevel} pct={field.confidence} />
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────

export default function DocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: documentId } = use(params);
  const queryClient = useQueryClient();

  // Document data
  const { data: docRaw, isLoading: docLoading } = useQuery({
    queryKey: ['documents', documentId],
    queryFn: () =>
      documentsApi.get(documentId).then((r) => r.data.data),
  });

  // Processing status — poll every 2s while not terminal
  const { data: statusRaw, refetch: refetchStatus } = useQuery({
    queryKey: ['documents', documentId, 'status'],
    queryFn: () =>
      documentsApi.getStatus(documentId).then((r) => r.data.data),
    refetchInterval: (query: { state: { data?: DocumentProcessingStatus } }) => {
      const s = query.state.data?.status;
      if (s === 'COMPLETED' || s === 'FAILED') return false;
      return 2000;
    },
  });

  const doc = docRaw;
  const status = statusRaw;

  const isProcessing = doc?.status === 'PROCESSING' || doc?.status === 'QUEUED';
  const isCompleted = doc?.status === 'COMPLETED';
  const isFailed = doc?.status === 'FAILED';

  // When status transitions to COMPLETED, invalidate the doc query to reload with fields
  useEffect(() => {
    if (status?.status === 'COMPLETED') {
      void queryClient.invalidateQueries({ queryKey: ['documents', documentId] });
    }
  }, [status?.status, documentId, queryClient]);

  // ── Loading ──────────────────────────────────────────────────────
  if (docLoading) {
    return (
      <div className="max-w-4xl mx-auto animate-pulse space-y-4">
        <div className="h-4 w-32 bg-white/[0.06] rounded" />
        <div className="h-8 w-64 bg-white/[0.06] rounded" />
        <div className="glass p-8 flex items-center justify-center min-h-48">
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
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      {/* Breadcrumb + header */}
      <div>
        <Link
          href="/documents"
          className="inline-flex items-center gap-2 text-sm text-white/30 hover:text-white/60 transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" /> Documents
        </Link>

        <div className="flex items-start gap-4 flex-wrap">
          <div className="p-3 rounded-xl bg-brand-600/10 border border-brand-500/20 shrink-0">
            <FileText className="w-6 h-6 text-brand-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-white">{doc.title}</h1>
              <StatusBadge status={doc.status} />
            </div>
            <p className="text-white/30 text-sm mt-0.5">
              {doc.originalFileName} · {formatFileSize(doc.fileSizeBytes)} · Uploaded{' '}
              {formatDate(doc.createdAt)}
            </p>
          </div>
        </div>
      </div>

      {/* Processing status */}
      {(isProcessing || isFailed) && status && (
        <ProcessingPanel
          status={status}
          isFailed={isFailed}
          onRefetch={refetchStatus}
        />
      )}

      {/* Completed view */}
      {isCompleted && <CompletedPanel doc={doc as unknown as DocumentDetail} />}

      {/* Queued placeholder */}
      {doc.status === 'QUEUED' && !status && (
        <div className="glass p-8 text-center">
          <Clock className="w-10 h-10 text-white/10 mx-auto mb-3" />
          <p className="text-white/40 text-sm">Document is queued for processing</p>
          <p className="text-white/20 text-xs mt-1">Processing will begin shortly</p>
        </div>
      )}
    </div>
  );
}
