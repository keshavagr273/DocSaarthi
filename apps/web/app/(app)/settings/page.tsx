'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  User as UserIcon,
  Shield,
  Clock,
  Languages,
  Lock,
  Loader2,
  Activity,
  AlertCircle,
  CheckCircle2,
  Globe,
} from 'lucide-react';
import {
  authApi,
  settingsApi,
  auditLogsApi,
  type User,
  type AuditLogItem,
} from '../../../lib/api';
import { cn, formatDate } from '../../../lib/utils';
import toast from 'react-hot-toast';

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'audit'>('profile');

  // User Profile Query
  const { data: user } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => authApi.me().then((r) => r.data.data),
  });

  // Profile Form State
  const [name, setName] = useState('');
  const [preferredLang, setPreferredLang] = useState('en');
  const [initializedProfile, setInitializedProfile] = useState(false);

  if (user && !initializedProfile) {
    setName(user.name ?? '');
    setPreferredLang(user.preferredLanguage ?? 'en');
    setInitializedProfile(true);
  }

  // Profile Update Mutation
  const updateProfileMutation = useMutation({
    mutationFn: () =>
      settingsApi.updateProfile({
        name,
        preferredLanguage: preferredLang,
      }),
    onSuccess: () => {
      toast.success('Profile preferences updated');
      void queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
    onError: () => toast.error('Failed to update profile'),
  });

  // Password Change State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const changePasswordMutation = useMutation({
    mutationFn: () =>
      settingsApi.changePassword({
        currentPassword,
        newPassword,
      }),
    onSuccess: () => {
      toast.success('Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    },
    onError: () => toast.error('Failed to update password. Check current password.'),
  });

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error('New password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }
    changePasswordMutation.mutate();
  };

  // Audit Logs Query
  const [auditPage, setAuditPage] = useState(1);
  const { data: auditData, isLoading: loadingAudit } = useQuery({
    queryKey: ['audit-logs', auditPage],
    queryFn: () => auditLogsApi.list({ page: auditPage, limit: 15 }).then((r) => r.data.data),
  });

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
      {/* ── Visuvate Editorial Header ─────────────────────────────────── */}
      <div className="pb-4 border-b border-white/[0.06]">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.03] border border-white/[0.06] text-white/50 text-[10px] font-semibold uppercase tracking-wider mb-2">
          <Globe className="w-3 h-3 text-brand-400" /> User Profile &amp; Preferences
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          Settings &amp; <span className="font-serif italic font-normal text-white/90">Security.</span>
        </h1>
        <p className="text-xs text-white/40 mt-1">
          Manage your account credentials, default OCR language, and audit security trail
        </p>
      </div>

      {/* ── Pill Tabs Navigation ─────────────────────────────────────── */}
      <div className="flex items-center gap-2 border-b border-white/[0.06] pb-4 overflow-x-auto">
        {[
          { id: 'profile', label: 'Profile & Language', icon: UserIcon },
          { id: 'security', label: 'Security & Password', icon: Shield },
          { id: 'audit', label: 'Audit Trail', icon: Activity },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id as typeof activeTab)}
            className={cn(
              'inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold transition-all shrink-0',
              activeTab === id
                ? 'bg-white text-black shadow-lg shadow-white/10'
                : 'text-white/50 hover:text-white hover:bg-white/[0.04]',
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab Content: Profile ─────────────────────────────────────── */}
      {activeTab === 'profile' && (
        <div className="glass-card p-8 rounded-3xl space-y-6 max-w-2xl">
          <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <UserIcon className="w-4 h-4 text-brand-400" /> Account Profile
            </h2>
            <span className="text-[10px] text-white/40 font-mono">Persisted in PostgreSQL</span>
          </div>

          <div className="space-y-4">
            <div>
              <label className="label">Registered Email</label>
              <input
                type="email"
                disabled
                value={user?.email ?? ''}
                className="input cursor-not-allowed opacity-50 font-mono text-xs"
              />
              <p className="text-[10px] text-white/30 mt-1">Email address cannot be changed.</p>
            </div>

            <div>
              <label className="label">Full Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your Full Name"
                className="input"
              />
            </div>

            <div>
              <label className="label">Default OCR &amp; Assistant Language</label>
              <div className="grid grid-cols-2 gap-3 mt-1.5">
                <button
                  type="button"
                  onClick={() => setPreferredLang('en')}
                  className={cn(
                    'p-3.5 rounded-2xl border text-xs font-semibold flex items-center justify-between transition-all text-left',
                    preferredLang === 'en'
                      ? 'bg-white text-black border-white shadow-lg'
                      : 'bg-white/[0.02] border-white/10 text-white/60 hover:border-white/20',
                  )}
                >
                  <div>
                    <p className="font-bold">English (EN)</p>
                    <p className={cn('text-[10px]', preferredLang === 'en' ? 'text-black/60' : 'text-white/30')}>
                      Latin OCR &amp; Standard Docs
                    </p>
                  </div>
                  {preferredLang === 'en' && <CheckCircle2 className="w-4 h-4 text-black" />}
                </button>

                <button
                  type="button"
                  onClick={() => setPreferredLang('hi')}
                  className={cn(
                    'p-3.5 rounded-2xl border text-xs font-semibold flex items-center justify-between transition-all text-left',
                    preferredLang === 'hi'
                      ? 'bg-white text-black border-white shadow-lg'
                      : 'bg-white/[0.02] border-white/10 text-white/60 hover:border-white/20',
                  )}
                >
                  <div>
                    <p className="font-bold">हिंदी (HI)</p>
                    <p className={cn('text-[10px]', preferredLang === 'hi' ? 'text-black/60' : 'text-white/30')}>
                      Devanagari OCR &amp; Hindi VLM
                    </p>
                  </div>
                  {preferredLang === 'hi' && <CheckCircle2 className="w-4 h-4 text-black" />}
                </button>
              </div>
            </div>

            <div className="pt-3">
              <button
                onClick={() => updateProfileMutation.mutate()}
                disabled={updateProfileMutation.isPending}
                className="btn-pill-white text-xs font-bold shadow-lg"
              >
                {updateProfileMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
                Save Profile Preferences
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Tab Content: Security ────────────────────────────────────── */}
      {activeTab === 'security' && (
        <div className="glass-card p-8 rounded-3xl space-y-6 max-w-2xl">
          <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Lock className="w-4 h-4 text-brand-400" /> Change Account Password
            </h2>
            <span className="text-[10px] text-white/40 font-mono">Argon2id Hashed</span>
          </div>

          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <label className="label">Current Password</label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="input"
                placeholder="••••••••"
              />
            </div>

            <div>
              <label className="label">New Password (min 8 characters)</label>
              <input
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="input"
                placeholder="••••••••"
              />
            </div>

            <div>
              <label className="label">Confirm New Password</label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="input"
                placeholder="••••••••"
              />
            </div>

            <div className="pt-3">
              <button
                type="submit"
                disabled={changePasswordMutation.isPending}
                className="btn-pill-white text-xs font-bold shadow-lg"
              >
                {changePasswordMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
                Update Password
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Tab Content: Audit Trail ─────────────────────────────────── */}
      {activeTab === 'audit' && (
        <div className="glass-card p-8 rounded-3xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Activity className="w-4 h-4 text-brand-400" /> Account Security &amp; Audit Trail
            </h2>
            <span className="text-[10px] text-white/40 font-mono">Immutable Log</span>
          </div>

          {loadingAudit ? (
            <div className="py-8 text-center text-xs text-white/40 font-mono">Loading audit trail...</div>
          ) : !auditData || auditData.logs.length === 0 ? (
            <div className="py-12 text-center text-xs text-white/30">No audit events recorded yet</div>
          ) : (
            <div className="border border-white/[0.06] rounded-2xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-white/[0.02] border-b border-white/[0.06] text-white/40 uppercase font-semibold text-[10px] tracking-wider">
                  <tr>
                    <th className="p-3.5">Timestamp</th>
                    <th className="p-3.5">Event Type</th>
                    <th className="p-3.5">Resource</th>
                    <th className="p-3.5">Target Document</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {auditData.logs.map((log) => (
                    <tr key={log.id} className="hover:bg-white/[0.01]">
                      <td className="p-3.5 font-mono text-white/40 text-[11px]">{formatDate(log.createdAt)}</td>
                      <td className="p-3.5 font-semibold text-brand-300">{log.eventType}</td>
                      <td className="p-3.5 text-white/70">{log.resourceType}</td>
                      <td className="p-3.5 text-white/50">{log.document?.title || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
