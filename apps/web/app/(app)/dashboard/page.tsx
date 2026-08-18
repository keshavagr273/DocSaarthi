'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { FileText, Clock, CheckCircle2, AlertTriangle, Upload, ArrowRight } from 'lucide-react';
import { documentsApi, type Document } from '../../../lib/api';
import { cn, formatDate, formatFileSize } from '../../../lib/utils';

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  loading,
}: {
  label: string;
  value: number | undefined;
  icon: React.ElementType;
  color: string;
  loading: boolean;
}) {
  return (
    <div className="glass p-5 flex items-center gap-4">
      <div className={cn('p-3 rounded-xl', color)}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-white/50 text-sm">{label}</p>
        {loading ? (
          <div className="h-7 w-10 bg-white/10 rounded animate-pulse mt-1" />
        ) : (
          <p className="text-2xl font-bold text-white">{value ?? 0}</p>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const classes: Record<string, string> = {
    QUEUED: 'badge badge-queued',
    PROCESSING: 'badge badge-processing',
    COMPLETED: 'badge badge-completed',
    FAILED: 'badge badge-failed',
    NEEDS_REVIEW: 'badge badge-needs_review',
  };
  return <span className={classes[status] ?? 'badge'}>{status.replace('_', ' ')}</span>;
}

export default function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['documents', 'list'],
    queryFn: () => documentsApi.list({ limit: 5, sortBy: 'createdAt', sortOrder: 'desc' }).then((r: { data: { data: { documents: Document[]; pagination: { total: number } } } }) => r.data.data),
  });

  const docs = data?.documents ?? [];
  const total = data?.pagination.total ?? 0;

  const stats = {
    total,
    processing: docs.filter((d: Document) => d.status === 'PROCESSING').length,
    completed: docs.filter((d: Document) => d.status === 'COMPLETED').length,
    needsReview: docs.filter((d: Document) => d.status === 'NEEDS_REVIEW').length,
    failed: docs.filter((d: Document) => d.status === 'FAILED').length,
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-white/40 text-sm mt-1">Your document intelligence overview</p>
        </div>
        <Link href="/documents/upload" className="btn-primary">
          <Upload className="w-4 h-4" />
          Upload Document
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Documents" value={total} icon={FileText} color="bg-brand-600/20 text-brand-400" loading={isLoading} />
        <StatCard label="Processing" value={stats.processing} icon={Clock} color="bg-purple-600/20 text-purple-400" loading={isLoading} />
        <StatCard label="Completed" value={stats.completed} icon={CheckCircle2} color="bg-emerald-600/20 text-emerald-400" loading={isLoading} />
        <StatCard label="Needs Review" value={stats.needsReview} icon={AlertTriangle} color="bg-amber-600/20 text-amber-400" loading={isLoading} />
      </div>

      {/* Recent Documents */}
      <div className="glass overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
          <h2 className="font-semibold text-white">Recent Documents</h2>
          <Link href="/documents" className="flex items-center gap-1.5 text-sm text-brand-400 hover:text-brand-300 transition-colors">
            View all <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {isLoading ? (
          <div className="divide-y divide-white/[0.04]">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="px-6 py-4 flex items-center gap-4">
                <div className="w-9 h-9 rounded-lg bg-white/10 animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 bg-white/10 rounded animate-pulse w-2/3" />
                  <div className="h-3 bg-white/5 rounded animate-pulse w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : docs.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="p-4 rounded-2xl bg-white/5 w-fit mx-auto mb-4">
              <FileText className="w-8 h-8 text-white/20" />
            </div>
            <p className="text-white/40 font-medium">No documents yet</p>
            <p className="text-white/25 text-sm mt-1 mb-5">Upload your first document to get started</p>
            <Link href="/documents/upload" className="btn-primary">
              <Upload className="w-4 h-4" /> Upload Document
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {docs.map((doc: Document) => (
              <Link
                key={doc.id}
                href={`/documents/${doc.id}`}
                className="flex items-center gap-4 px-6 py-4 hover:bg-white/[0.03] transition-colors group"
              >
                <div className="p-2.5 rounded-lg bg-brand-600/10 border border-brand-500/20 shrink-0">
                  <FileText className="w-4 h-4 text-brand-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-white/90 truncate group-hover:text-white transition-colors">
                    {doc.title}
                  </p>
                  <p className="text-xs text-white/30 mt-0.5">
                    {formatFileSize(doc.fileSizeBytes)} · {formatDate(doc.createdAt)}
                    {doc.currentVersion?.pageCount ? ` · ${doc.currentVersion.pageCount} pages` : ''}
                  </p>
                </div>
                <StatusBadge status={doc.status} />
                <ArrowRight className="w-4 h-4 text-white/20 group-hover:text-white/40 transition-colors shrink-0" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
