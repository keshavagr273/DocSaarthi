'use client';

import { use, useRef } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, FileText, CheckCircle2,
  XCircle, RefreshCw, Loader2,
} from 'lucide-react';
import { documentsApi, type ProcessingStatus } from '../../../../lib/api';
import { cn, formatDate, formatFileSize } from '../../../../lib/utils';

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

const ALL_STAGES = Object.keys(STAGE_LABELS);

function ConfidenceBadge({ level }: { level: string }) {
  return (
    <span className={cn('badge', {
      'badge-high': level === 'HIGH',
      'badge-medium': level === 'MEDIUM',
      'badge-low': level === 'LOW',
    })}>
      {level}
    </span>
  );
}

export default function DocumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: documentId } = use(params);
  const _pollingRef = useRef<number | null>(null); // reserved for future polling

  const { data: docData, isLoading: docLoading } = useQuery({
    queryKey: ['documents', documentId],
    queryFn: () => documentsApi.get(documentId).then((r: { data: { data: unknown } }) => r.data.data as ReturnType<typeof documentsApi.get> extends Promise<{ data: { data: infer T } }> ? T : never),
  });

  const { data: statusData, refetch: refetchStatus } = useQuery({
    queryKey: ['documents', documentId, 'status'],
    queryFn: () => documentsApi.getStatus(documentId).then((r: { data: { data: unknown } }) => r.data.data as ProcessingStatus),
    refetchInterval: (query: { state: { data?: ProcessingStatus } }) => {
      const status = query.state.data?.status;
      if (status === 'COMPLETED' || status === 'FAILED') return false;
      return 2000;
    },
  });

  const doc = docData;
  const status = statusData;
  const isProcessing = doc?.status === 'PROCESSING' || doc?.status === 'QUEUED';
  const isCompleted = doc?.status === 'COMPLETED';
  const isFailed = doc?.status === 'FAILED';

  if (docLoading) {
    return (
      <div className="max-w-4xl mx-auto animate-fade-in">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-6 h-6 bg-white/10 rounded animate-pulse" />
          <div className="h-6 w-48 bg-white/10 rounded animate-pulse" />
        </div>
        <div className="glass p-8 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-brand-400 animate-spin" />
        </div>
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="max-w-4xl mx-auto text-center py-16">
        <p className="text-white/40">Document not found</p>
        <Link href="/documents" className="btn-secondary mt-4">Back to Documents</Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <Link href="/documents" className="inline-flex items-center gap-2 text-sm text-white/40 hover:text-white/70 transition-colors mb-4">
          <ArrowLeft className="w-4 h-4" /> Documents
        </Link>
        <div className="flex items-start gap-4 flex-wrap">
          <div className="p-3 rounded-xl bg-brand-600/10 border border-brand-500/20 shrink-0">
            <FileText className="w-6 h-6 text-brand-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-white">{doc.title}</h1>
            <p className="text-white/40 text-sm mt-0.5">
              {doc.originalFileName} · {formatFileSize(doc.fileSizeBytes)} · Uploaded {formatDate(doc.createdAt)}
            </p>
          </div>
          <span className={cn('badge shrink-0', {
            'badge-queued': doc.status === 'QUEUED',
            'badge-processing': doc.status === 'PROCESSING',
            'badge-completed': doc.status === 'COMPLETED',
            'badge-failed': doc.status === 'FAILED',
            'badge-needs_review': doc.status === 'NEEDS_REVIEW',
          })}>
            {doc.status.replace('_', ' ')}
          </span>
        </div>
      </div>

      {/* Processing status */}
      {(isProcessing || isFailed) && status && (
        <div className="glass p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-white">
              {isFailed ? 'Processing Failed' : 'Processing Status'}
            </h2>
            {isFailed && (
              <button onClick={() => refetchStatus()} className="btn-secondary text-xs px-3 py-1.5 gap-1.5">
                <RefreshCw className="w-3.5 h-3.5" /> Retry
              </button>
            )}
          </div>

          {/* Progress bar */}
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-white/50">
                {isFailed ? (
                  <span className="text-red-400 flex items-center gap-1.5"><XCircle className="w-4 h-4" />Failed</span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="w-4 h-4 animate-spin text-brand-400" />
                    {status.currentStage ? STAGE_LABELS[status.currentStage] : 'Processing...'}
                  </span>
                )}
              </span>
              <span className="text-white/30">{status.progress}%</span>
            </div>
            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500',
                  isFailed ? 'bg-red-500' : 'bg-gradient-to-r from-brand-600 to-brand-400',
                )}
                style={{ width: `${status.progress}%` }}
              />
            </div>
          </div>

          {/* Stage checklist */}
          <div className="grid grid-cols-2 gap-2">
            {ALL_STAGES.map((stage) => {
              const isCompleted = status.completedStages?.includes(stage);
              const isCurrent = status.currentStage === stage;
              return (
                <div key={stage} className={cn('flex items-center gap-2 text-xs py-1.5 px-2 rounded-lg transition-colors', {
                  'text-emerald-400': isCompleted,
                  'text-brand-400 bg-brand-600/10': isCurrent && !isCompleted,
                  'text-white/25': !isCompleted && !isCurrent,
                })}>
                  {isCompleted ? (
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  ) : isCurrent ? (
                    <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />
                  ) : (
                    <div className="w-3.5 h-3.5 rounded-full border border-current shrink-0 opacity-30" />
                  )}
                  {STAGE_LABELS[stage]}
                </div>
              );
            })}
          </div>

          {/* Error */}
          {status.error && (
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30">
              <p className="text-red-300 text-sm font-medium">Error</p>
              <p className="text-red-300/70 text-sm mt-0.5">{status.error.message}</p>
            </div>
          )}
        </div>
      )}

      {/* Completed document info */}
      {isCompleted && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Document info */}
          <div className="glass p-6 space-y-4">
            <h2 className="font-semibold text-white">Document Info</h2>
            <div className="space-y-3">
              {[
                { label: 'Category', value: doc.category?.replace('_', ' ') ?? 'Unknown' },
                { label: 'Primary Language', value: doc.primaryLanguage ?? 'Unknown' },
                { label: 'Page Count', value: doc.currentVersion?.pageCount?.toString() ?? '—' },
                { label: 'Processing Status', value: doc.currentVersion?.processingStatus ?? '—' },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between text-sm">
                  <span className="text-white/40">{label}</span>
                  <span className="text-white/80 font-medium">{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Extracted fields */}
          <div className="glass p-6 space-y-4">
            <h2 className="font-semibold text-white">Extracted Fields</h2>
            {(doc as unknown as { fields?: Array<{ id: string; fieldName: string; rawValue: string; confidenceLevel: string }> }).fields?.length === 0 ? (
              <p className="text-white/30 text-sm">No fields extracted yet</p>
            ) : (
              <div className="space-y-2.5">
                {((doc as unknown as { fields?: Array<{ id: string; fieldName: string; rawValue: string; confidenceLevel: string }> }).fields ?? []).slice(0, 8).map((field) => (
                  <div key={field.id} className="flex items-start justify-between gap-3 text-sm">
                    <span className="text-white/40 capitalize">{field.fieldName.replace(/_/g, ' ')}</span>
                    <div className="flex items-center gap-2 text-right">
                      <span className="text-white/80 truncate max-w-[140px]">{field.rawValue}</span>
                      <ConfidenceBadge level={field.confidenceLevel} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
