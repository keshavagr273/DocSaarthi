'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CheckSquare,
  Check,
  Edit2,
  X,
  Search,
  FileText,
  AlertCircle,
  Clock,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react';
import { reviewApi, type ReviewFieldItem } from '../../../lib/api';
import { cn, formatDate } from '../../../lib/utils';
import toast from 'react-hot-toast';

const CATEGORIES = [
  'ALL',
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
];

export default function ReviewQueuePage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');

  // Stats query
  const { data: statsData } = useQuery({
    queryKey: ['review', 'stats'],
    queryFn: () => reviewApi.getStats().then((r) => r.data.data),
    refetchInterval: 5000,
  });

  // Queue query
  const { data: queueData, isLoading } = useQuery({
    queryKey: ['review', 'queue', { page, category: selectedCategory, search }],
    queryFn: () =>
      reviewApi
        .getQueue({
          page,
          limit: 15,
          category: selectedCategory === 'ALL' ? undefined : selectedCategory,
          search: search.trim() || undefined,
        })
        .then((r) => r.data.data),
  });

  // Mutations
  const acceptMutation = useMutation({
    mutationFn: (fieldId: string) => reviewApi.accept(fieldId),
    onSuccess: () => {
      toast.success('Field verified and accepted');
      void queryClient.invalidateQueries({ queryKey: ['review'] });
      void queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
    onError: () => toast.error('Failed to accept field'),
  });

  const editMutation = useMutation({
    mutationFn: ({ fieldId, newValue }: { fieldId: string; newValue: string }) =>
      reviewApi.edit(fieldId, { newValue }),
    onSuccess: () => {
      toast.success('Field updated and verified');
      void queryClient.invalidateQueries({ queryKey: ['review'] });
      void queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
    onError: () => toast.error('Failed to update field'),
  });

  const rejectMutation = useMutation({
    mutationFn: (fieldId: string) => reviewApi.reject(fieldId),
    onSuccess: () => {
      toast.success('Field rejected');
      void queryClient.invalidateQueries({ queryKey: ['review'] });
      void queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
    onError: () => toast.error('Failed to reject field'),
  });

  const stats = statsData ?? { pendingCount: 0, verifiedCount: 0, rejectedCount: 0 };
  const fields = queueData?.fields ?? [];
  const pagination = queueData?.pagination;

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <CheckSquare className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Human Verification Queue</h1>
            <p className="text-white/40 text-sm">
              Review and verify low-confidence extractions from your documents
            </p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass p-5 rounded-2xl flex items-center gap-4 border-amber-500/20 bg-amber-500/[0.03]">
          <div className="p-3 rounded-xl bg-amber-500/15 text-amber-400">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-white/40 font-medium">Pending Review</p>
            <p className="text-2xl font-bold text-white mt-0.5">{stats.pendingCount}</p>
          </div>
        </div>

        <div className="glass p-5 rounded-2xl flex items-center gap-4 border-emerald-500/20 bg-emerald-500/[0.03]">
          <div className="p-3 rounded-xl bg-emerald-500/15 text-emerald-400">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-white/40 font-medium">Verified Fields</p>
            <p className="text-2xl font-bold text-white mt-0.5">{stats.verifiedCount}</p>
          </div>
        </div>

        <div className="glass p-5 rounded-2xl flex items-center gap-4 border-white/[0.06]">
          <div className="p-3 rounded-xl bg-rose-500/15 text-rose-400">
            <XCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-white/40 font-medium">Rejected Fields</p>
            <p className="text-2xl font-bold text-white mt-0.5">{stats.rejectedCount}</p>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="glass p-4 rounded-2xl flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            type="text"
            placeholder="Search by field name, value, or document title..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl pl-10 pr-4 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-brand-500/50"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          <select
            value={selectedCategory}
            onChange={(e) => {
              setSelectedCategory(e.target.value);
              setPage(1);
            }}
            className="bg-white/[0.04] border border-white/[0.08] rounded-xl px-3.5 py-2 text-sm text-white/80 focus:outline-none focus:border-brand-500/50"
          >
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat} className="bg-surface-50 text-white">
                {cat === 'ALL' ? 'All Categories' : cat.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Review List */}
      {isLoading ? (
        <div className="glass p-12 text-center rounded-2xl">
          <Loader2 className="w-8 h-8 animate-spin text-brand-400 mx-auto mb-3" />
          <p className="text-white/40 text-sm">Loading review items...</p>
        </div>
      ) : fields.length === 0 ? (
        <div className="glass p-16 text-center rounded-2xl space-y-3">
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
            <Sparkles className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-semibold text-white">All Caught Up!</h3>
          <p className="text-white/40 text-sm max-w-md mx-auto">
            There are currently no low-confidence fields requiring manual review. All extracted data is verified or meets high confidence standards.
          </p>
          <Link
            href="/documents"
            className="inline-flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-white transition-colors"
          >
            <FileText className="w-3.5 h-3.5" /> View Documents
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {fields.map((field) => (
            <ReviewItemCard
              key={field.id}
              field={field}
              onAccept={() => acceptMutation.mutate(field.id)}
              onEdit={(val) => editMutation.mutate({ fieldId: field.id, newValue: val })}
              onReject={() => rejectMutation.mutate(field.id)}
              isAccepting={acceptMutation.isPending}
              isEditing={editMutation.isPending}
              isRejecting={rejectMutation.isPending}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-white/30">
            Showing {(pagination.page - 1) * pagination.limit + 1}–
            {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} fields
          </p>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="p-2 rounded-lg border border-white/[0.08] text-white/60 hover:text-white disabled:opacity-30 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs text-white/50 px-2">
              Page {page} of {pagination.totalPages}
            </span>
            <button
              disabled={page >= pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="p-2 rounded-lg border border-white/[0.08] text-white/60 hover:text-white disabled:opacity-30 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ReviewItemCard({
  field,
  onAccept,
  onEdit,
  onReject,
  isAccepting,
  isEditing,
  isRejecting,
}: {
  field: ReviewFieldItem;
  onAccept: () => void;
  onEdit: (newValue: string) => void;
  onReject: () => void;
  isAccepting: boolean;
  isEditing: boolean;
  isRejecting: boolean;
}) {
  const [isEditingInline, setIsEditingInline] = useState(false);
  const [editValue, setEditValue] = useState(field.rawValue);

  const handleSave = () => {
    if (editValue.trim() !== field.rawValue.trim()) {
      onEdit(editValue);
    }
    setIsEditingInline(false);
  };

  return (
    <div className="glass p-4 sm:p-5 rounded-2xl border-white/[0.06] hover:border-white/[0.12] transition-all space-y-3">
      {/* Top info line */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href={`/documents/${field.document.id}`}
            className="text-xs font-medium text-brand-400 hover:text-brand-300 transition-colors flex items-center gap-1.5"
          >
            <FileText className="w-3.5 h-3.5" />
            {field.document.title}
          </Link>
          <span className="text-white/20 text-xs">·</span>
          <span className="text-[11px] text-white/40">
            {field.document.category?.replace(/_/g, ' ') ?? 'General'}
          </span>
          {field.sourcePage && (
            <span className="text-[10px] px-2 py-0.5 rounded-md bg-white/[0.05] text-white/40">
              Page {field.sourcePage}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-red-500/15 text-red-400 border border-red-500/25">
            <AlertCircle className="w-3 h-3" />
            {Math.round(field.confidence * 100)}% Confidence
          </span>
        </div>
      </div>

      {/* Field content */}
      <div className="bg-white/[0.02] border border-white/[0.04] p-3.5 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-1">
            {field.fieldName.replace(/_/g, ' ')}
          </p>
          {isEditingInline ? (
            <div className="flex items-center gap-2 mt-1">
              <input
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                autoFocus
                className="flex-1 bg-surface-50 border border-brand-500/50 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none"
              />
              <button
                onClick={handleSave}
                disabled={isEditing}
                className="px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-xs font-semibold text-white transition-colors"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setEditValue(field.rawValue);
                  setIsEditingInline(false);
                }}
                className="px-2.5 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-xs text-white/60 transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <p className="text-sm font-medium text-white/90 break-words">{field.rawValue}</p>
          )}
        </div>

        {/* Actions */}
        {!isEditingInline && (
          <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
            <button
              onClick={onAccept}
              disabled={isAccepting}
              title="Accept as verified"
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 transition-all"
            >
              <Check className="w-3.5 h-3.5" /> Accept
            </button>

            <button
              onClick={() => setIsEditingInline(true)}
              title="Edit value"
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-white/80 border border-white/[0.08] transition-all"
            >
              <Edit2 className="w-3.5 h-3.5" /> Edit
            </button>

            <button
              onClick={onReject}
              disabled={isRejecting}
              title="Reject field"
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition-all"
            >
              <X className="w-3.5 h-3.5" /> Reject
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
