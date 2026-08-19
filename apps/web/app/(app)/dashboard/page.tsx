'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  FileText,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Upload,
  ArrowRight,
  HardDrive,
  Calendar,
  Activity,
  Search,
  MessageSquare,
  Sparkles,
  Tag,
} from 'lucide-react';
import { settingsApi, documentsApi, type Document } from '../../../lib/api';
import { cn, formatDate, formatFileSize } from '../../../lib/utils';

export default function DashboardPage() {
  const { data: dashboardData, isLoading: loadingStats } = useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: () => settingsApi.getDashboardStats().then((r) => r.data.data),
  });

  const { data: docsData, isLoading: loadingDocs } = useQuery({
    queryKey: ['documents', 'recent'],
    queryFn: () =>
      documentsApi
        .list({ limit: 5, sortBy: 'createdAt', sortOrder: 'desc' })
        .then((r) => r.data.data),
  });

  const stats = dashboardData?.stats ?? {
    totalDocuments: 0,
    processingCount: 0,
    completedCount: 0,
    failedCount: 0,
    needsReviewFieldsCount: 0,
    totalStorageBytes: 0,
  };

  const categories = dashboardData?.categoryBreakdown ?? [];
  const deadlines = dashboardData?.upcomingDeadlines ?? [];
  const recentLogs = dashboardData?.recentAuditLogs ?? [];
  const docs = docsData?.documents ?? [];

  // Max free tier storage: 50MB
  const maxStorageBytes = 50 * 1024 * 1024;
  const storagePct = Math.min(100, Math.round((stats.totalStorageBytes / maxStorageBytes) * 100));

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white">Document Intelligence Dashboard</h1>
          <p className="text-white/40 text-sm mt-1">
            Real-time analytics, upcoming document deadlines, and processing pipeline metrics
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/search"
            className="px-3.5 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-white/80 text-xs font-semibold border border-white/[0.08] transition-colors flex items-center gap-1.5"
          >
            <Search className="w-3.5 h-3.5 text-brand-400" /> Search
          </Link>
          <Link
            href="/conversations"
            className="px-3.5 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-white/80 text-xs font-semibold border border-white/[0.08] transition-colors flex items-center gap-1.5"
          >
            <MessageSquare className="w-3.5 h-3.5 text-brand-400" /> Chat
          </Link>
          <Link href="/documents/upload" className="btn-primary">
            <Upload className="w-4 h-4" /> Upload
          </Link>
        </div>
      </div>

      {/* Stats Cards Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass p-5 rounded-2xl flex items-center gap-4">
          <div className="p-3 rounded-xl bg-brand-600/20 text-brand-400 border border-brand-500/30">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <p className="text-white/50 text-xs font-medium">Total Documents</p>
            <p className="text-2xl font-bold text-white mt-0.5">{stats.totalDocuments}</p>
          </div>
        </div>

        <div className="glass p-5 rounded-2xl flex items-center gap-4">
          <div className="p-3 rounded-xl bg-purple-600/20 text-purple-400 border border-purple-500/30">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <p className="text-white/50 text-xs font-medium">Processing Queue</p>
            <p className="text-2xl font-bold text-white mt-0.5">{stats.processingCount}</p>
          </div>
        </div>

        <div className="glass p-5 rounded-2xl flex items-center gap-4">
          <div className="p-3 rounded-xl bg-emerald-600/20 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-white/50 text-xs font-medium">Fully Completed</p>
            <p className="text-2xl font-bold text-white mt-0.5">{stats.completedCount}</p>
          </div>
        </div>

        <div className="glass p-5 rounded-2xl flex items-center gap-4">
          <div className="p-3 rounded-xl bg-amber-600/20 text-amber-400 border border-amber-500/30">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <p className="text-white/50 text-xs font-medium">Pending Review</p>
            <p className="text-2xl font-bold text-amber-400 mt-0.5">{stats.needsReviewFieldsCount}</p>
          </div>
        </div>
      </div>

      {/* Two Column Section: Deadlines & Storage + Categories */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Upcoming Deadlines & Storage */}
        <div className="lg:col-span-7 space-y-6">
          {/* Deadlines Widget */}
          <div className="glass p-5 rounded-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
              <h2 className="font-bold text-white text-sm flex items-center gap-2">
                <Calendar className="w-4 h-4 text-brand-400" /> Upcoming Document Deadlines
              </h2>
              <span className="text-[10px] text-white/40">From verified extractions</span>
            </div>

            {deadlines.length === 0 ? (
              <div className="py-8 text-center text-xs text-white/30">
                No upcoming deadlines extracted
              </div>
            ) : (
              <div className="space-y-2">
                {deadlines.map((dl) => (
                  <Link
                    key={dl.id}
                    href={`/documents/${dl.documentId}`}
                    className="p-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.05] flex items-center justify-between transition-all group"
                  >
                    <div>
                      <p className="text-xs font-semibold text-white/90 group-hover:text-brand-300 transition-colors">
                        {dl.document.title}
                      </p>
                      <p className="text-[11px] text-white/40 capitalize">
                        {dl.fieldName.replace(/_/g, ' ')}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                        {dl.rawValue}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Storage Meter Card */}
          <div className="glass p-5 rounded-2xl space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 font-semibold text-white/80">
                <HardDrive className="w-4 h-4 text-brand-400" /> Cloud Storage
              </span>
              <span className="text-white/40 font-mono">
                {formatFileSize(stats.totalStorageBytes)} / 50 MB
              </span>
            </div>

            <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-brand-600 to-brand-400 rounded-full transition-all duration-500"
                style={{ width: `${storagePct}%` }}
              />
            </div>
            <p className="text-[10px] text-white/30">
              Free plan quota. Upgrade to Business for unlimited document storage.
            </p>
          </div>
        </div>

        {/* Right: Category Distribution & Activity */}
        <div className="lg:col-span-5 space-y-6">
          {/* Category Distribution */}
          <div className="glass p-5 rounded-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
              <h2 className="font-bold text-white text-sm flex items-center gap-2">
                <Tag className="w-4 h-4 text-brand-400" /> Document Categories
              </h2>
            </div>

            {categories.length === 0 ? (
              <div className="py-6 text-center text-xs text-white/30">No categorized documents</div>
            ) : (
              <div className="space-y-2">
                {categories.map((cat) => (
                  <div key={cat.category} className="flex items-center justify-between text-xs">
                    <span className="text-white/70 capitalize">
                      {cat.category.replace(/_/g, ' ').toLowerCase()}
                    </span>
                    <span className="font-mono text-white font-semibold px-2 py-0.5 rounded bg-white/[0.05]">
                      {cat.count}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Activity Feed */}
          <div className="glass p-5 rounded-2xl space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
              <h2 className="font-bold text-white text-sm flex items-center gap-2">
                <Activity className="w-4 h-4 text-brand-400" /> Recent Audit Activity
              </h2>
              <Link href="/settings" className="text-[10px] text-brand-400 hover:underline">
                View All
              </Link>
            </div>

            {recentLogs.length === 0 ? (
              <div className="py-4 text-center text-xs text-white/30">No recent activity</div>
            ) : (
              <div className="space-y-2">
                {recentLogs.slice(0, 5).map((log) => (
                  <div key={log.id} className="text-xs flex items-center justify-between py-1 border-b border-white/[0.02]">
                    <span className="text-white/80 font-medium truncate max-w-[180px]">
                      {log.eventType.replace(/_/g, ' ')}
                    </span>
                    <span className="text-[10px] text-white/30">{formatDate(log.createdAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Documents Table */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
          <h2 className="font-semibold text-white text-sm">Recent Documents</h2>
          <Link
            href="/documents"
            className="flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 transition-colors"
          >
            View all documents <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {loadingDocs ? (
          <div className="p-8 text-center text-white/40 text-xs">Loading documents...</div>
        ) : docs.length === 0 ? (
          <div className="p-12 text-center text-white/40 text-xs">No documents uploaded yet</div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {docs.map((doc: Document) => (
              <Link
                key={doc.id}
                href={`/documents/${doc.id}`}
                className="flex items-center gap-4 px-6 py-3.5 hover:bg-white/[0.03] transition-colors group"
              >
                <div className="p-2 rounded-lg bg-brand-600/10 border border-brand-500/20 shrink-0">
                  <FileText className="w-4 h-4 text-brand-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white/90 truncate group-hover:text-white transition-colors">
                    {doc.title}
                  </p>
                  <p className="text-[10px] text-white/30 mt-0.5">
                    {formatFileSize(doc.fileSizeBytes)} · {formatDate(doc.createdAt)}
                    {doc.currentVersion?.pageCount ? ` · ${doc.currentVersion.pageCount} pages` : ''}
                  </p>
                </div>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/[0.05] text-white/70">
                  {doc.category?.replace(/_/g, ' ') ?? 'General'}
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-white/20 group-hover:text-white/40 transition-colors shrink-0" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
