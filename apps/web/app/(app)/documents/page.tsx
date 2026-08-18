'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Upload, FileText, Search, ArrowRight, Clock, CheckCircle2, AlertTriangle, XCircle, Grid, List } from 'lucide-react';
import { documentsApi, type Document, type DocumentListResponse } from '../../../lib/api';
import { cn, formatDate, formatFileSize } from '../../../lib/utils';

const CATEGORY_LABELS: Record<string, string> = {
  GOVERNMENT_NOTICE: 'Govt Notice', INVOICE: 'Invoice', RECEIPT: 'Receipt',
  CERTIFICATE: 'Certificate', COLLEGE_DOCUMENT: 'College', BANK_DOCUMENT: 'Bank',
  LEGAL_DOCUMENT: 'Legal', EMPLOYMENT_DOCUMENT: 'Employment', FORM: 'Form',
  LETTER: 'Letter', IDENTITY_DOCUMENT: 'ID Document', MEDICAL_DOCUMENT: 'Medical',
  INSURANCE_DOCUMENT: 'Insurance', TAX_DOCUMENT: 'Tax', UNKNOWN: 'Unknown',
};

function StatusIcon({ status }: { status: string }) {
  if (status === 'COMPLETED') return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
  if (status === 'PROCESSING') return <Clock className="w-4 h-4 text-purple-400 animate-pulse" />;
  if (status === 'NEEDS_REVIEW') return <AlertTriangle className="w-4 h-4 text-amber-400" />;
  if (status === 'FAILED') return <XCircle className="w-4 h-4 text-red-400" />;
  return <Clock className="w-4 h-4 text-blue-400" />;
}

function DocumentCard({ doc }: { doc: Document }) {
  return (
    <Link href={`/documents/${doc.id}`} className="glass p-5 flex flex-col gap-3 hover:bg-white/[0.07] transition-all group cursor-pointer">
      <div className="flex items-start gap-3">
        <div className="p-2.5 rounded-xl bg-brand-600/10 border border-brand-500/20 shrink-0">
          <FileText className="w-5 h-5 text-brand-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-white/90 group-hover:text-white transition-colors truncate">{doc.title}</p>
          <p className="text-xs text-white/35 mt-0.5 truncate">{doc.originalFileName}</p>
        </div>
        <StatusIcon status={doc.status} />
      </div>
      <div className="flex items-center justify-between text-xs text-white/30">
        <span>{formatFileSize(doc.fileSizeBytes)}</span>
        {doc.category && (
          <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10">
            {CATEGORY_LABELS[doc.category] ?? doc.category}
          </span>
        )}
        <span>{formatDate(doc.createdAt)}</span>
      </div>
    </Link>
  );
}

function DocumentRow({ doc }: { doc: Document }) {
  return (
    <Link href={`/documents/${doc.id}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-white/[0.04] transition-colors group border-b border-white/[0.04] last:border-0">
      <div className="p-2 rounded-lg bg-brand-600/10 border border-brand-500/20 shrink-0">
        <FileText className="w-4 h-4 text-brand-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-white/90 group-hover:text-white transition-colors truncate text-sm">{doc.title}</p>
        <p className="text-xs text-white/30 mt-0.5">{formatFileSize(doc.fileSizeBytes)}</p>
      </div>
      {doc.category && (
        <span className="hidden sm:inline-flex px-2 py-0.5 text-xs rounded-md bg-white/5 border border-white/10 text-white/40 shrink-0">
          {CATEGORY_LABELS[doc.category] ?? doc.category}
        </span>
      )}
      <div className="shrink-0"><StatusIcon status={doc.status} /></div>
      <span className="hidden md:block text-xs text-white/25 shrink-0">{formatDate(doc.createdAt)}</span>
      <ArrowRight className="w-4 h-4 text-white/20 group-hover:text-white/40 transition-colors shrink-0" />
    </Link>
  );
}

export default function DocumentsPage() {
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['documents', 'list', page, search],
    queryFn: () =>
      documentsApi.list({ page, limit: 20, search: search || undefined, sortBy: 'createdAt', sortOrder: 'desc' }).then((r: { data: { data: DocumentListResponse } }) => r.data.data),
    placeholderData: (prev) => prev,
  });

  const docs = data?.documents ?? [];
  const pagination = data?.pagination;

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Documents</h1>
          <p className="text-white/40 text-sm mt-1">
            {pagination ? `${pagination.total} document${pagination.total !== 1 ? 's' : ''}` : 'Loading...'}
          </p>
        </div>
        <Link href="/documents/upload" className="btn-primary">
          <Upload className="w-4 h-4" /> Upload
        </Link>
      </div>

      {/* Filters */}
      <div className="glass p-4 flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" />
          <input
            type="text"
            placeholder="Search documents..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="input pl-10 py-2 text-sm"
          />
        </div>
        <div className="flex items-center gap-1 p-1 bg-white/5 rounded-lg">
          <button onClick={() => setViewMode('list')} className={cn('p-1.5 rounded-md transition-colors', viewMode === 'list' ? 'bg-brand-600/30 text-brand-300' : 'text-white/30 hover:text-white/60')}>
            <List className="w-4 h-4" />
          </button>
          <button onClick={() => setViewMode('grid')} className={cn('p-1.5 rounded-md transition-colors', viewMode === 'grid' ? 'bg-brand-600/30 text-brand-300' : 'text-white/30 hover:text-white/60')}>
            <Grid className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Document list */}
      {isLoading ? (
        <div className="glass overflow-hidden">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-3.5 border-b border-white/[0.04]">
              <div className="w-8 h-8 bg-white/10 rounded-lg animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 bg-white/10 rounded animate-pulse w-1/2" />
                <div className="h-3 bg-white/5 rounded animate-pulse w-1/4" />
              </div>
            </div>
          ))}
        </div>
      ) : docs.length === 0 ? (
        <div className="glass p-16 text-center">
          <div className="p-4 rounded-2xl bg-white/5 w-fit mx-auto mb-4">
            <FileText className="w-10 h-10 text-white/15" />
          </div>
          <p className="text-white/40 font-semibold">
            {search ? 'No documents match your search' : 'No documents yet'}
          </p>
          <p className="text-white/25 text-sm mt-1 mb-6">
            {search ? 'Try a different search term' : 'Upload your first document to get started'}
          </p>
          {!search && (
            <Link href="/documents/upload" className="btn-primary">
              <Upload className="w-4 h-4" /> Upload Document
            </Link>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {docs.map((doc: Document) => <DocumentCard key={doc.id} doc={doc} />)}
        </div>
      ) : (
        <div className="glass overflow-hidden">
          {docs.map((doc: Document) => <DocumentRow key={doc.id} doc={doc} />)}
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="btn-secondary px-4 py-2 text-sm disabled:opacity-30">
            Previous
          </button>
          <span className="text-sm text-white/40">Page {page} of {pagination.totalPages}</span>
          <button disabled={page === pagination.totalPages} onClick={() => setPage((p) => p + 1)} className="btn-secondary px-4 py-2 text-sm disabled:opacity-30">
            Next
          </button>
        </div>
      )}
    </div>
  );
}
