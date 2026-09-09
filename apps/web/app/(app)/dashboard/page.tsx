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
  ArrowUpRight,
  Layers,
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
        .list({ limit: 6, sortBy: 'createdAt', sortOrder: 'desc' })
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
      {/* ── Visuvate Editorial Header ─────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-white/[0.06]">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.03] border border-white/[0.06] text-white/50 text-[10px] font-semibold uppercase tracking-wider mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live Telemetry
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Workspace <span className="font-serif italic font-normal text-white/90">Intelligence.</span>
          </h1>
          <p className="text-xs text-white/40 mt-1">
            Real-time ingestion throughput, coordinate OCR accuracy, and audit approvals
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            href="/search"
            className="btn-pill-glass text-xs !py-2 !px-4"
          >
            <Search className="w-3.5 h-3.5 text-brand-400" /> Search
          </Link>
          <Link
            href="/conversations"
            className="btn-pill-glass text-xs !py-2 !px-4"
          >
            <MessageSquare className="w-3.5 h-3.5 text-brand-400" /> Chat
          </Link>
          <Link href="/documents/upload" className="btn-pill-white text-xs !py-2 !px-4.5 shadow-xl shadow-white/10">
            <Upload className="w-3.5 h-3.5" /> Upload File
          </Link>
        </div>
      </div>

      {/* ── Visuvate Bento Metric Cards ──────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Documents */}
        <div className="glass-card p-5 rounded-2xl flex flex-col justify-between">
          <div className="flex items-center justify-between text-white/40 text-xs mb-3">
            <span className="font-semibold uppercase tracking-wider text-[10px]">Total Ingested</span>
            <div className="w-7 h-7 rounded-full bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-white/70">
              <FileText className="w-3.5 h-3.5" />
            </div>
          </div>
          <div>
            <p className="text-2xl sm:text-3xl font-extrabold text-white">{stats.totalDocuments}</p>
            <p className="text-[10px] text-white/30 mt-1">Files in repository</p>
          </div>
        </div>

        {/* Processing Queue */}
        <div className="glass-card p-5 rounded-2xl flex flex-col justify-between">
          <div className="flex items-center justify-between text-white/40 text-xs mb-3">
            <span className="font-semibold uppercase tracking-wider text-[10px]">Active Queue</span>
            <div className="w-7 h-7 rounded-full bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-300">
              <Clock className="w-3.5 h-3.5" />
            </div>
          </div>
          <div>
            <p className="text-2xl sm:text-3xl font-extrabold text-brand-300">{stats.processingCount}</p>
            <p className="text-[10px] text-white/30 mt-1">BullMQ workers running</p>
          </div>
        </div>

        {/* Fully Completed */}
        <div className="glass-card p-5 rounded-2xl flex flex-col justify-between">
          <div className="flex items-center justify-between text-white/40 text-xs mb-3">
            <span className="font-semibold uppercase tracking-wider text-[10px]">Indexed &amp; Verified</span>
            <div className="w-7 h-7 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
          </div>
          <div>
            <p className="text-2xl sm:text-3xl font-extrabold text-emerald-400">{stats.completedCount}</p>
            <p className="text-[10px] text-white/30 mt-1">Ready for search &amp; chat</p>
          </div>
        </div>

        {/* Pending Review */}
        <div className="glass-card p-5 rounded-2xl flex flex-col justify-between">
          <div className="flex items-center justify-between text-white/40 text-xs mb-3">
            <span className="font-semibold uppercase tracking-wider text-[10px]">Review Queue</span>
            <div className="w-7 h-7 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <AlertTriangle className="w-3.5 h-3.5" />
            </div>
          </div>
          <div>
            <p className="text-2xl sm:text-3xl font-extrabold text-amber-400">{stats.needsReviewFieldsCount}</p>
            <p className="text-[10px] text-white/30 mt-1">Low confidence fields</p>
          </div>
        </div>
      </div>

      {/* ── Two Column Section: Deadlines, Storage, and Categories ────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Upcoming Deadlines & Storage */}
        <div className="lg:col-span-7 space-y-6">
          {/* Deadlines Widget */}
          <div className="glass-card p-6 rounded-3xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
              <h2 className="font-bold text-white text-xs uppercase tracking-wider flex items-center gap-2">
                <Calendar className="w-4 h-4 text-brand-400" /> Upcoming Extracted Deadlines
              </h2>
              <span className="text-[10px] text-white/40 font-mono">From verified records</span>
            </div>

            {deadlines.length === 0 ? (
              <div className="py-8 text-center text-xs text-white/30 font-medium">
                No upcoming contract or invoice deadlines extracted
              </div>
            ) : (
              <div className="space-y-2.5">
                {deadlines.map((dl) => (
                  <Link
                    key={dl.id}
                    href={`/documents/${dl.documentId}`}
                    className="p-3.5 rounded-2xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.05] flex items-center justify-between transition-all group"
                  >
                    <div>
                      <p className="text-xs font-semibold text-white group-hover:text-brand-300 transition-colors">
                        {dl.document.title}
                      </p>
                      <p className="text-[10px] text-white/40 capitalize mt-0.5">
                        {dl.fieldName.replace(/_/g, ' ')}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30">
                        {dl.rawValue}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Storage Meter Card */}
          <div className="glass-card p-6 rounded-3xl space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 font-bold text-white/80 uppercase tracking-wider text-[10px]">
                <HardDrive className="w-4 h-4 text-brand-400" /> Object Storage Quota
              </span>
              <span className="text-white/40 font-mono text-xs">
                {formatFileSize(stats.totalStorageBytes)} / 50 MB
              </span>
            </div>

            <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-brand-600 via-cyan-400 to-white rounded-full transition-all duration-500"
                style={{ width: `${storagePct}%` }}
              />
            </div>
            <p className="text-[10px] text-white/30">
              Files stored in private local MinIO S3 instance.
            </p>
          </div>
        </div>

        {/* Right: Category Distribution & Activity */}
        <div className="lg:col-span-5 space-y-6">
          {/* Category Distribution */}
          <div className="glass-card p-6 rounded-3xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
              <h2 className="font-bold text-white text-xs uppercase tracking-wider flex items-center gap-2">
                <Tag className="w-4 h-4 text-brand-400" /> Document Categories
              </h2>
            </div>

            {categories.length === 0 ? (
              <div className="py-6 text-center text-xs text-white/30">No categorized documents</div>
            ) : (
              <div className="space-y-2">
                {categories.map((cat, idx) => (
                  <div key={`${cat.category}-${idx}`} className="flex items-center justify-between text-xs py-1">
                    <span className="text-white/70 capitalize text-xs">
                      {cat.category.replace(/_/g, ' ').toLowerCase()}
                    </span>
                    <span className="font-mono text-white text-xs font-semibold px-2.5 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.06]">
                      {cat.count}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Activity Feed */}
          <div className="glass-card p-6 rounded-3xl space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
              <h2 className="font-bold text-white text-xs uppercase tracking-wider flex items-center gap-2">
                <Activity className="w-4 h-4 text-brand-400" /> Audit Log
              </h2>
              <Link href="/settings" className="text-[10px] text-white/40 hover:text-white transition-colors">
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
                    <span className="text-[10px] text-white/30 font-mono">{formatDate(log.createdAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Recent Documents Repository Table ────────────────────────── */}
      <div className="glass-card rounded-3xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
          <h2 className="font-bold text-white text-xs uppercase tracking-wider">Recent Ingested Documents</h2>
          <Link
            href="/documents"
            className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white transition-colors font-semibold"
          >
            All Documents <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {loadingDocs ? (
          <div className="p-8 text-center text-white/40 text-xs font-mono">Loading documents...</div>
        ) : docs.length === 0 ? (
          <div className="p-12 text-center text-white/40 text-xs">No documents uploaded yet</div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {docs.map((doc: Document) => (
              <Link
                key={doc.id}
                href={`/documents/${doc.id}`}
                className="flex items-center gap-4 px-6 py-4 hover:bg-white/[0.03] transition-colors group"
              >
                <div className="w-9 h-9 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center shrink-0 text-white/60 group-hover:text-white group-hover:bg-white/10 transition-colors">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white/90 truncate group-hover:text-white transition-colors">
                    {doc.title}
                  </p>
                  <p className="text-[10px] text-white/30 mt-0.5 font-mono">
                    {formatFileSize(doc.fileSizeBytes)} · {formatDate(doc.createdAt)}
                    {doc.currentVersion?.pageCount ? ` · ${doc.currentVersion.pageCount} pages` : ''}
                  </p>
                </div>
                <span className="text-[10px] font-semibold px-3 py-1 rounded-full bg-white/[0.03] text-white/70 border border-white/[0.06]">
                  {doc.category?.replace(/_/g, ' ') ?? 'General'}
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-white/20 group-hover:text-white/60 transition-colors shrink-0" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
