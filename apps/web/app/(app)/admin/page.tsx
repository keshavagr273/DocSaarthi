'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users,
  ShieldCheck,
  ShieldAlert,
  FileText,
  Layers,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Search,
  Activity,
  Database,
  Cpu,
  ArrowUpRight,
  ChevronRight,
  Eye,
  UserCheck,
  UserX,
  Play,
  HardDrive,
  Filter,
  ExternalLink,
  Loader2,
  Mail,
  Calendar,
  X,
} from 'lucide-react';
import {
  adminApi,
  authApi,
  type AdminUserItem,
  type AdminUserDetailResponse,
  type User,
} from '../../../lib/api';
import { cn, formatDate, formatFileSize } from '../../../lib/utils';
import toast from 'react-hot-toast';

const ADMIN_AUTHORIZED_EMAIL = 'keshavagrawal273@gmail.com';

type ActiveTab = 'users' | 'queue' | 'documents';

export default function AdminPortalPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<ActiveTab>('users');
  const [userSearch, setUserSearch] = useState('');
  const [docSearch, setDocSearch] = useState('');
  const [docStatusFilter, setDocStatusFilter] = useState('ALL');
  const [selectedUser, setSelectedUser] = useState<AdminUserItem | null>(null);

  // Authenticated user check
  const { data: currentUser, isLoading: authLoading } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => authApi.me().then((r: { data: { data: User } }) => r.data.data),
  });

  const isAuthorized =
    currentUser?.email?.toLowerCase() === ADMIN_AUTHORIZED_EMAIL.toLowerCase() ||
    currentUser?.role === 'ADMIN';

  // Admin Stats
  const { data: statsData, isLoading: statsLoading, refetch: refetchStats } = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: () => adminApi.getStats().then((r) => r.data),
    enabled: isAuthorized,
    refetchInterval: 10000,
  });

  // Admin Users List
  const { data: usersData, isLoading: usersLoading, refetch: refetchUsers } = useQuery({
    queryKey: ['admin', 'users', userSearch],
    queryFn: () => adminApi.getUsers({ search: userSearch, limit: 50 }).then((r) => r.data),
    enabled: isAuthorized,
  });

  // Admin Queue Details
  const { data: queueData, isLoading: queueLoading, refetch: refetchQueue } = useQuery({
    queryKey: ['admin', 'queue'],
    queryFn: () => adminApi.getQueue().then((r) => r.data),
    enabled: isAuthorized && activeTab === 'queue',
    refetchInterval: 5000,
  });

  // Admin Documents List
  const { data: documentsData, isLoading: docsLoading, refetch: refetchDocs } = useQuery({
    queryKey: ['admin', 'documents', docSearch, docStatusFilter],
    queryFn: () =>
      adminApi
        .getDocuments({
          search: docSearch,
          status: docStatusFilter,
          limit: 50,
        })
        .then((r) => r.data),
    enabled: isAuthorized && activeTab === 'documents',
  });

  // Selected User Submissions Query
  const { data: userSubmissions, isLoading: userSubmissionsLoading } = useQuery({
    queryKey: ['admin', 'user-documents', selectedUser?.id],
    queryFn: () => adminApi.getUserDocuments(selectedUser!.id).then((r) => r.data),
    enabled: isAuthorized && !!selectedUser,
  });

  // Toggle user status mutation
  const toggleUserMutation = useMutation({
    mutationFn: ({ userId, isActive }: { userId: string; isActive: boolean }) =>
      adminApi.toggleUserStatus(userId, isActive),
    onSuccess: (res) => {
      toast.success(
        res.data.isActive ? 'User account activated' : 'User account disabled',
      );
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (err: unknown) => {
      toast.error(`Action failed: ${err instanceof Error ? err.message : String(err)}`);
    },
  });

  // Bulk retry failed queue mutation
  const retryFailedMutation = useMutation({
    mutationFn: () => adminApi.retryFailedQueue(),
    onSuccess: (res) => {
      toast.success(res.data.message || 'Retry jobs enqueued');
      void refetchStats();
      void refetchQueue();
      void refetchUsers();
    },
    onError: (err: unknown) => {
      toast.error(`Retry failed: ${err instanceof Error ? err.message : String(err)}`);
    },
  });

  const handleRefreshAll = () => {
    void refetchStats();
    if (activeTab === 'users') void refetchUsers();
    if (activeTab === 'queue') void refetchQueue();
    if (activeTab === 'documents') void refetchDocs();
    toast.success('Admin data refreshed');
  };

  // ── Access Denied Screen ───────────────────────────────────────────
  if (!authLoading && !isAuthorized) {
    return (
      <div className="max-w-2xl mx-auto py-24 px-4 text-center">
        <div className="glass p-10 rounded-3xl border border-red-500/20 shadow-2xl relative overflow-hidden space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto text-red-400 shadow-lg shadow-red-500/10">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-white tracking-tight">Access Restricted</h1>
            <p className="text-sm text-white/50 max-w-md mx-auto">
              This admin portal is restricted exclusively to authorized account:{' '}
              <span className="text-brand-300 font-mono font-medium">{ADMIN_AUTHORIZED_EMAIL}</span>.
            </p>
          </div>
          <div className="pt-4">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white text-black font-semibold text-xs hover:bg-white/90 transition-all shadow-lg shadow-white/10"
            >
              Return to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-16 animate-fade-in">
      {/* ── Top Header Bar ────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-white/[0.06]">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-brand-500/20 border border-brand-500/30 flex items-center justify-center text-brand-400 shadow-lg shadow-brand-500/20">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Admin Command Center</h1>
            <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-brand-500/20 text-brand-300 border border-brand-500/30 font-semibold font-mono tracking-wider">
              SUPERADMIN
            </span>
          </div>
          <p className="text-xs text-white/40">
            Dedicated system management for{' '}
            <span className="text-brand-300 font-mono">{ADMIN_AUTHORIZED_EMAIL}</span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Live Engine Active
          </div>
          <button
            onClick={handleRefreshAll}
            className="btn-pill-glass !py-2 !px-3.5 text-xs flex items-center gap-1.5"
            title="Refresh All Data"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
      </div>

      {/* ── Executive Stat Cards ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Users */}
        <div className="glass p-5 rounded-2xl relative overflow-hidden border border-white/[0.08] hover:border-white/20 transition-all">
          <div className="flex items-center justify-between text-white/50 mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Users</span>
            <Users className="w-4 h-4 text-brand-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-white tracking-tight font-mono">
              {statsLoading ? '...' : statsData?.users.total ?? 0}
            </span>
            <span className="text-[11px] text-emerald-400 font-medium">Registered</span>
          </div>
          <p className="text-[11px] text-white/40 mt-1">Platform user accounts</p>
        </div>

        {/* Total Submissions */}
        <div className="glass p-5 rounded-2xl relative overflow-hidden border border-white/[0.08] hover:border-white/20 transition-all">
          <div className="flex items-center justify-between text-white/50 mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Submissions</span>
            <FileText className="w-4 h-4 text-blue-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-white tracking-tight font-mono">
              {statsLoading ? '...' : statsData?.documents.total ?? 0}
            </span>
            <span className="text-[11px] text-white/40 font-mono">
              ({formatFileSize(statsData?.documents.totalBytes ?? 0)})
            </span>
          </div>
          <p className="text-[11px] text-white/40 mt-1">Uploaded across all accounts</p>
        </div>

        {/* Processing Success Rate */}
        <div className="glass p-5 rounded-2xl relative overflow-hidden border border-white/[0.08] hover:border-white/20 transition-all">
          <div className="flex items-center justify-between text-white/50 mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">Success Rate</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-white tracking-tight font-mono">
              {statsLoading ? '...' : `${statsData?.documents.successRate ?? 100}%`}
            </span>
            <span className="text-[11px] text-emerald-400">
              {statsData?.documents.completed ?? 0} Done
            </span>
          </div>
          <div className="w-full bg-white/[0.06] h-1.5 rounded-full mt-2 overflow-hidden">
            <div
              className="bg-emerald-400 h-full rounded-full transition-all duration-700"
              style={{ width: `${statsData?.documents.successRate ?? 100}%` }}
            />
          </div>
        </div>

        {/* Queue Backlog & Engine */}
        <div className="glass p-5 rounded-2xl relative overflow-hidden border border-white/[0.08] hover:border-white/20 transition-all">
          <div className="flex items-center justify-between text-white/50 mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">Queue Backlog</span>
            <Layers className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-white tracking-tight font-mono">
              {statsLoading ? '...' : statsData?.queue.backlog ?? 0}
            </span>
            <span className="text-[11px] text-amber-400 font-medium">
              {statsData?.queue.active ?? 0} active / {statsData?.queue.waiting ?? 0} waiting
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span
              className={cn(
                'text-[10px] px-2 py-0.5 rounded-full font-mono font-semibold',
                (statsData?.queue.failed ?? 0) > 0
                  ? 'bg-red-500/20 text-red-300'
                  : 'bg-emerald-500/20 text-emerald-300',
              )}
            >
              {statsData?.queue.failed ?? 0} Failed
            </span>
            <span className="text-[10px] text-white/40">Bull + Redis engine</span>
          </div>
        </div>
      </div>

      {/* ── Navigation Tabs ───────────────────────────────────────────── */}
      <div className="flex items-center gap-2 border-b border-white/[0.06] pb-3">
        <button
          onClick={() => setActiveTab('users')}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold transition-all',
            activeTab === 'users'
              ? 'bg-white text-black shadow-lg shadow-white/10'
              : 'text-white/60 hover:text-white hover:bg-white/[0.04]',
          )}
        >
          <Users className="w-3.5 h-3.5" />
          Users Directory & Submissions
          <span
            className={cn(
              'px-1.5 py-0.2 rounded-full text-[10px] font-mono',
              activeTab === 'users' ? 'bg-black/10 text-black' : 'bg-white/10 text-white/60',
            )}
          >
            {usersData?.pagination.total ?? 0}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('queue')}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold transition-all',
            activeTab === 'queue'
              ? 'bg-white text-black shadow-lg shadow-white/10'
              : 'text-white/60 hover:text-white hover:bg-white/[0.04]',
          )}
        >
          <Cpu className="w-3.5 h-3.5" />
          Queue & Processing Engine
          {(statsData?.queue.backlog ?? 0) > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-amber-500/20 text-amber-300">
              {statsData?.queue.backlog}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('documents')}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold transition-all',
            activeTab === 'documents'
              ? 'bg-white text-black shadow-lg shadow-white/10'
              : 'text-white/60 hover:text-white hover:bg-white/[0.04]',
          )}
        >
          <Database className="w-3.5 h-3.5" />
          Global Submissions Oversight
        </button>
      </div>

      {/* ── TAB 1: USERS DIRECTORY & SUBMISSIONS BREAKDOWN ───────────── */}
      {activeTab === 'users' && (
        <div className="space-y-6 animate-fade-in">
          {/* Search & Description Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                <Users className="w-5 h-5 text-brand-400" /> Users Directory
              </h2>
              <p className="text-xs text-white/40">
                Manage and view registered accounts and their document submission breakdowns.
              </p>
            </div>

            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 text-white/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search users by name or email..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-full bg-white/[0.04] border border-white/[0.08] text-xs text-white placeholder-white/30 focus:outline-none focus:border-brand-400/50 transition-colors"
              />
            </div>
          </div>

          {/* Users Table (Matching the reference UI style) */}
          <div className="glass rounded-2xl border border-white/[0.08] overflow-hidden shadow-2xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/[0.06] bg-white/[0.02] text-[11px] font-semibold text-white/40 uppercase tracking-wider">
                    <th className="py-3.5 px-6">User / Name</th>
                    <th className="py-3.5 px-6">Email</th>
                    <th className="py-3.5 px-6">Submissions Breakdown</th>
                    <th className="py-3.5 px-6">Success Rate</th>
                    <th className="py-3.5 px-6">Status</th>
                    <th className="py-3.5 px-6">Joined Date</th>
                    <th className="py-3.5 px-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04] text-xs">
                  {usersLoading ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-white/40">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto text-brand-400 mb-2" />
                        Loading registered accounts...
                      </td>
                    </tr>
                  ) : usersData?.items.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-white/40">
                        No users found matching your search.
                      </td>
                    </tr>
                  ) : (
                    usersData?.items.map((user) => {
                      const isOwner =
                        user.email.toLowerCase() === ADMIN_AUTHORIZED_EMAIL.toLowerCase();
                      return (
                        <tr
                          key={user.id}
                          className="hover:bg-white/[0.02] transition-colors group"
                        >
                          {/* Name & Avatar */}
                          <td className="py-4 px-6">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-brand-500/20 border border-brand-500/30 flex items-center justify-center font-bold text-xs text-brand-300 shrink-0">
                                {user.name?.[0]?.toUpperCase() ?? user.email[0].toUpperCase()}
                              </div>
                              <div>
                                <span className="font-semibold text-white block">
                                  {user.name ?? 'Unnamed User'}
                                </span>
                                {isOwner && (
                                  <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-brand-500/20 text-brand-300 font-mono font-bold">
                                    OWNER
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Email */}
                          <td className="py-4 px-6 text-white/70">
                            <div className="flex items-center gap-1.5">
                              <Mail className="w-3.5 h-3.5 text-white/30" />
                              <span className="font-mono text-xs">{user.email}</span>
                            </div>
                          </td>

                          {/* Submissions Breakdown */}
                          <td className="py-4 px-6">
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5 font-mono text-xs font-semibold text-white">
                                <span>{user.totalDocuments} total</span>
                              </div>
                              <div className="flex items-center gap-1.5 text-[10px]">
                                <span className="px-1.5 py-0.2 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                  {user.completedDocuments} Done
                                </span>
                                {user.queuedDocuments > 0 && (
                                  <span className="px-1.5 py-0.2 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                    {user.queuedDocuments} Queued
                                  </span>
                                )}
                                {user.failedDocuments > 0 && (
                                  <span className="px-1.5 py-0.2 rounded-md bg-red-500/15 text-red-300 border border-red-500/30">
                                    {user.failedDocuments} Failed
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Success Rate */}
                          <td className="py-4 px-6">
                            <div className="space-y-1 w-24">
                              <span className="font-mono text-xs text-white/80">
                                {user.totalDocuments > 0 ? `${user.successRate}%` : '—'}
                              </span>
                              <div className="w-full bg-white/[0.06] h-1 rounded-full overflow-hidden">
                                <div
                                  className="bg-brand-400 h-full rounded-full"
                                  style={{ width: `${user.successRate}%` }}
                                />
                              </div>
                            </div>
                          </td>

                          {/* Status */}
                          <td className="py-4 px-6">
                            <span
                              className={cn(
                                'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium',
                                user.isActive
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  : 'bg-red-500/10 text-red-400 border border-red-500/20',
                              )}
                            >
                              <span
                                className={cn(
                                  'w-1.5 h-1.5 rounded-full',
                                  user.isActive ? 'bg-emerald-400' : 'bg-red-400',
                                )}
                              />
                              {user.isActive ? 'Active' : 'Disabled'}
                            </span>
                          </td>

                          {/* Joined Date */}
                          <td className="py-4 px-6 text-white/50 text-xs font-mono">
                            <div className="flex items-center gap-1.5">
                              <Calendar className="w-3.5 h-3.5 text-white/30" />
                              {formatDate(user.createdAt)}
                            </div>
                          </td>

                          {/* Actions */}
                          <td className="py-4 px-6 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => setSelectedUser(user)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/[0.06] text-white/80 hover:text-white hover:bg-white/[0.1] text-xs font-medium transition-colors"
                              >
                                <Eye className="w-3.5 h-3.5" /> Submissions
                              </button>
                              {!isOwner && (
                                <button
                                  onClick={() =>
                                    toggleUserMutation.mutate({
                                      userId: user.id,
                                      isActive: !user.isActive,
                                    })
                                  }
                                  className={cn(
                                    'p-1.5 rounded-lg transition-colors',
                                    user.isActive
                                      ? 'text-white/30 hover:text-red-400 hover:bg-red-500/10'
                                      : 'text-white/30 hover:text-emerald-400 hover:bg-emerald-500/10',
                                  )}
                                  title={user.isActive ? 'Disable User' : 'Activate User'}
                                >
                                  {user.isActive ? (
                                    <UserX className="w-3.5 h-3.5" />
                                  ) : (
                                    <UserCheck className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: QUEUE & PROCESSING ENGINE ("WHAT IS QUEUE") ──────── */}
      {activeTab === 'queue' && (
        <div className="space-y-6 animate-fade-in">
          {/* Educational / Explainer Card: What is Queue */}
          <div className="glass p-6 rounded-3xl border border-brand-500/20 bg-gradient-to-r from-brand-950/40 via-black to-blue-950/20 space-y-4 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-brand-500/20 border border-brand-500/30 flex items-center justify-center text-brand-300">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white tracking-tight">
                  What is the DocSaarthi Queue?
                </h3>
                <p className="text-xs text-white/50">
                  Understanding the asynchronous processing pipeline & worker engine
                </p>
              </div>
            </div>

            <p className="text-xs text-white/70 leading-relaxed max-w-4xl">
              When documents are uploaded, DocSaarthi doesn’t block the web server. Instead, it
              enqueues jobs into a distributed <strong>Redis + BullMQ queue</strong>. Specialized
              background workers asynchronously execute a <strong>14-stage AI pipeline</strong>:
              validating file signatures, rasterizing PDF pages with Sharp, running OCR extraction,
              detecting languages, categorizing document types, extracting key-value pairs with LLM,
              chunking text, generating 1536-dimensional vector embeddings, and indexing them into{' '}
              <strong>pgvector</strong> for semantic search and conversational AI.
            </p>

            {/* Pipeline Step Badges */}
            <div className="flex flex-wrap gap-2 pt-2">
              {[
                '1. Ingestion',
                '2. Validation',
                '3. S3 Storage',
                '4. PDF Rasterizer',
                '5. OCR Extraction',
                '6. Language Detect',
                '7. AI Classification',
                '8. Normalization',
                '9. Field Extraction',
                '10. Confidence Score',
                '11. Text Chunking',
                '12. Vector Embeddings',
                '13. pgvector Index',
              ].map((step, idx) => (
                <div
                  key={step}
                  className="px-2.5 py-1 rounded-full text-[10px] font-mono font-medium bg-white/[0.04] border border-white/[0.08] text-white/60 flex items-center gap-1.5"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-400" />
                  {step}
                </div>
              ))}
            </div>
          </div>

          {/* Live Queue Gauges */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              {
                label: 'Waiting in Line',
                value: queueData?.stats.waiting ?? 0,
                color: 'text-amber-400',
                desc: 'Pending worker pickup',
              },
              {
                label: 'Active Crunching',
                value: queueData?.stats.active ?? 0,
                color: 'text-blue-400',
                desc: 'Running in pipeline',
              },
              {
                label: 'Completed',
                value: queueData?.stats.completed ?? 0,
                color: 'text-emerald-400',
                desc: 'Processed successfully',
              },
              {
                label: 'Failed',
                value: queueData?.stats.failed ?? 0,
                color: 'text-red-400',
                desc: 'Errored / timed out',
              },
              {
                label: 'Delayed',
                value: queueData?.stats.delayed ?? 0,
                color: 'text-purple-400',
                desc: 'Scheduled retries',
              },
            ].map((meter) => (
              <div
                key={meter.label}
                className="glass p-4 rounded-2xl border border-white/[0.06] space-y-1"
              >
                <span className="text-[11px] font-semibold text-white/40 uppercase tracking-wider block">
                  {meter.label}
                </span>
                <span className={cn('text-2xl font-bold font-mono', meter.color)}>
                  {queueLoading ? '...' : meter.value}
                </span>
                <p className="text-[10px] text-white/30">{meter.desc}</p>
              </div>
            ))}
          </div>

          {/* Queue Administration Actions */}
          <div className="glass p-5 rounded-2xl border border-white/[0.08] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h4 className="text-sm font-bold text-white">Queue Recovery & Maintenance</h4>
              <p className="text-xs text-white/40">
                Bulk re-enqueue failed documents or clean backlog across workers.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => retryFailedMutation.mutate()}
                disabled={retryFailedMutation.isPending}
                className="btn-pill-white !py-2 !px-4 text-xs font-semibold flex items-center gap-2"
              >
                <Play className="w-3.5 h-3.5 text-black" />
                {retryFailedMutation.isPending ? 'Enqueuing...' : 'Retry All Failed Jobs'}
              </button>
            </div>
          </div>

          {/* Recent Stuck or Failed Documents */}
          <div className="glass rounded-2xl border border-white/[0.08] overflow-hidden">
            <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between">
              <div>
                <h4 className="text-xs font-semibold text-white uppercase tracking-wider">
                  Recent Queue Anomalies & Failures
                </h4>
                <p className="text-[11px] text-white/40">
                  Documents requiring attention or worker re-processing
                </p>
              </div>
              <span className="text-[11px] text-white/40 font-mono">
                {queueData?.stuckDocuments.length ?? 0} found
              </span>
            </div>

            <div className="divide-y divide-white/[0.04]">
              {queueData?.stuckDocuments.length === 0 ? (
                <div className="py-12 text-center text-white/40 text-xs">
                  <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto mb-2" />
                  No failed or stuck documents detected. All queues are running smoothly!
                </div>
              ) : (
                queueData?.stuckDocuments.map((doc) => (
                  <div
                    key={doc.id}
                    className="p-4 px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-white/[0.02]"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs text-white">{doc.title}</span>
                        <span
                          className={cn(
                            'text-[9px] px-2 py-0.2 rounded-full font-mono font-bold',
                            doc.status === 'FAILED'
                              ? 'bg-red-500/20 text-red-300'
                              : 'bg-amber-500/20 text-amber-300',
                          )}
                        >
                          {doc.status}
                        </span>
                      </div>
                      <p className="text-[11px] text-white/40 font-mono">
                        User: {doc.userEmail} · Updated: {formatDate(doc.updatedAt)}
                      </p>
                      {doc.error && (
                        <p className="text-[11px] text-red-300/80 bg-red-500/10 px-2.5 py-1 rounded-lg border border-red-500/20 font-mono">
                          {doc.error}
                        </p>
                      )}
                    </div>
                    <Link
                      href={`/documents/${doc.id}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-white/60 hover:text-white text-xs font-medium shrink-0"
                    >
                      <ExternalLink className="w-3.5 h-3.5" /> Inspect File
                    </Link>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 3: GLOBAL SUBMISSIONS OVERSIGHT ───────────────────────── */}
      {activeTab === 'documents' && (
        <div className="space-y-6 animate-fade-in">
          {/* Filter Bar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                <Database className="w-5 h-5 text-blue-400" /> Platform Submissions
              </h2>
              <p className="text-xs text-white/40">
                System-wide overview of all documents uploaded across all users.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 bg-white/[0.04] p-1 rounded-full border border-white/[0.08]">
                {['ALL', 'COMPLETED', 'QUEUED', 'FAILED'].map((status) => (
                  <button
                    key={status}
                    onClick={() => setDocStatusFilter(status)}
                    className={cn(
                      'px-3 py-1 rounded-full text-[10px] font-semibold transition-all',
                      docStatusFilter === status
                        ? 'bg-white text-black'
                        : 'text-white/50 hover:text-white',
                    )}
                  >
                    {status}
                  </button>
                ))}
              </div>

              <div className="relative w-64">
                <Search className="w-3.5 h-3.5 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter by title or email..."
                  value={docSearch}
                  onChange={(e) => setDocSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-xs text-white placeholder-white/30 focus:outline-none focus:border-brand-400/50"
                />
              </div>
            </div>
          </div>

          {/* Platform Documents Table */}
          <div className="glass rounded-2xl border border-white/[0.08] overflow-hidden shadow-2xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/[0.06] bg-white/[0.02] text-[11px] font-semibold text-white/40 uppercase tracking-wider">
                    <th className="py-3.5 px-6">Document Title</th>
                    <th className="py-3.5 px-6">Submitter</th>
                    <th className="py-3.5 px-6">Size</th>
                    <th className="py-3.5 px-6">Status</th>
                    <th className="py-3.5 px-6">Stage</th>
                    <th className="py-3.5 px-6">Created Date</th>
                    <th className="py-3.5 px-6 text-right">View</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04] text-xs">
                  {docsLoading ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-white/40">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto text-brand-400 mb-2" />
                        Loading platform documents...
                      </td>
                    </tr>
                  ) : documentsData?.items.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-white/40">
                        No submissions found matching criteria.
                      </td>
                    </tr>
                  ) : (
                    documentsData?.items.map((doc) => (
                      <tr key={doc.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="py-3.5 px-6">
                          <div className="font-semibold text-white truncate max-w-xs">
                            {doc.title}
                          </div>
                          <span className="text-[10px] text-white/30 font-mono block">
                            {doc.originalFileName}
                          </span>
                        </td>
                        <td className="py-3.5 px-6 font-mono text-white/60">
                          {doc.user.email}
                        </td>
                        <td className="py-3.5 px-6 text-white/40 font-mono">
                          {formatFileSize(doc.fileSizeBytes)}
                        </td>
                        <td className="py-3.5 px-6">
                          <span
                            className={cn(
                              'text-[10px] px-2 py-0.5 rounded-full font-mono font-bold',
                              doc.status === 'COMPLETED' && 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30',
                              doc.status === 'QUEUED' && 'bg-amber-500/15 text-amber-300 border border-amber-500/30',
                              doc.status === 'PROCESSING' && 'bg-blue-500/15 text-blue-300 border border-blue-500/30',
                              doc.status === 'FAILED' && 'bg-red-500/15 text-red-300 border border-red-500/30',
                            )}
                          >
                            {doc.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-6 text-white/50 font-mono text-[11px]">
                          {doc.latestVersion?.processingStage ?? '—'}
                        </td>
                        <td className="py-3.5 px-6 text-white/40 font-mono text-[11px]">
                          {formatDate(doc.createdAt)}
                        </td>
                        <td className="py-3.5 px-6 text-right">
                          <Link
                            href={`/documents/${doc.id}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-white/80 hover:text-white transition-colors"
                          >
                            <ArrowUpRight className="w-3.5 h-3.5" /> Open
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── USER SUBMISSIONS DRAWER / MODAL ─────────────────────────── */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="glass w-full max-w-3xl rounded-3xl border border-white/10 shadow-2xl p-6 space-y-5 max-h-[85vh] flex flex-col relative overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-white/[0.06]">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-brand-500/20 border border-brand-500/30 flex items-center justify-center text-brand-300 font-bold text-xs">
                  {selectedUser.name?.[0]?.toUpperCase() ?? selectedUser.email[0].toUpperCase()}
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    {selectedUser.name ?? 'User'}’s Submissions
                  </h3>
                  <p className="text-xs text-white/40 font-mono">{selectedUser.email}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedUser(null)}
                className="w-8 h-8 rounded-full bg-white/[0.05] hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* User Submission Metrics */}
            <div className="grid grid-cols-4 gap-2 text-center py-2 bg-white/[0.02] rounded-2xl border border-white/[0.04]">
              <div>
                <span className="text-[10px] text-white/40 font-semibold uppercase">Total</span>
                <p className="text-lg font-bold font-mono text-white">
                  {selectedUser.totalDocuments}
                </p>
              </div>
              <div>
                <span className="text-[10px] text-emerald-400 font-semibold uppercase">Done</span>
                <p className="text-lg font-bold font-mono text-emerald-400">
                  {selectedUser.completedDocuments}
                </p>
              </div>
              <div>
                <span className="text-[10px] text-amber-400 font-semibold uppercase">Queued</span>
                <p className="text-lg font-bold font-mono text-amber-400">
                  {selectedUser.queuedDocuments}
                </p>
              </div>
              <div>
                <span className="text-[10px] text-red-400 font-semibold uppercase">Failed</span>
                <p className="text-lg font-bold font-mono text-red-400">
                  {selectedUser.failedDocuments}
                </p>
              </div>
            </div>

            {/* Submissions List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {userSubmissionsLoading ? (
                <div className="py-12 text-center text-white/40">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-brand-400 mb-2" />
                  Fetching user documents...
                </div>
              ) : userSubmissions?.documents.length === 0 ? (
                <div className="py-12 text-center text-white/40 text-xs">
                  This user has not submitted any documents yet.
                </div>
              ) : (
                userSubmissions?.documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:border-white/10 flex items-center justify-between gap-3 transition-colors"
                  >
                    <div className="space-y-0.5 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs text-white truncate block">
                          {doc.title}
                        </span>
                        <span
                          className={cn(
                            'text-[9px] px-1.5 py-0.2 rounded font-mono font-bold shrink-0',
                            doc.status === 'COMPLETED' && 'bg-emerald-500/15 text-emerald-300',
                            doc.status === 'QUEUED' && 'bg-amber-500/15 text-amber-300',
                            doc.status === 'PROCESSING' && 'bg-blue-500/15 text-blue-300',
                            doc.status === 'FAILED' && 'bg-red-500/15 text-red-300',
                          )}
                        >
                          {doc.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-white/30 font-mono">
                        <span>{doc.originalFileName}</span>
                        <span>·</span>
                        <span>{formatFileSize(doc.fileSizeBytes)}</span>
                        <span>·</span>
                        <span>{formatDate(doc.createdAt)}</span>
                      </div>
                      {doc.latestVersion?.processingError && (
                        <p className="text-[10px] text-red-300 font-mono truncate">
                          Error: {doc.latestVersion.processingError}
                        </p>
                      )}
                    </div>

                    <Link
                      href={`/documents/${doc.id}`}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white text-black font-semibold text-xs hover:bg-white/90 transition-all shrink-0 shadow-sm"
                    >
                      <ExternalLink className="w-3 h-3" /> View File
                    </Link>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
