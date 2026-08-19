'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  User as UserIcon,
  Key,
  Shield,
  Clock,
  Plus,
  Trash2,
  Copy,
  Check,
  Languages,
  Lock,
  Loader2,
  Activity,
  AlertCircle,
  X,
} from 'lucide-react';
import {
  authApi,
  settingsApi,
  auditLogsApi,
  type User,
  type ApiKeyItem,
  type AuditLogItem,
} from '../../../lib/api';
import { cn, formatDate } from '../../../lib/utils';
import toast from 'react-hot-toast';

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'api-keys' | 'audit'>('profile');

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

  // API Keys Queries & Mutations
  const { data: apiKeys, isLoading: loadingKeys } = useQuery({
    queryKey: ['settings', 'api-keys'],
    queryFn: () => settingsApi.listApiKeys().then((r) => r.data.data),
  });

  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [createdKeySecret, setCreatedKeySecret] = useState<string | null>(null);
  const [hasCopied, setHasCopied] = useState(false);

  const createKeyMutation = useMutation({
    mutationFn: () => settingsApi.createApiKey({ name: newKeyName }),
    onSuccess: (res) => {
      setCreatedKeySecret(res.data.data.key);
      setNewKeyName('');
      void queryClient.invalidateQueries({ queryKey: ['settings', 'api-keys'] });
    },
    onError: () => toast.error('Failed to create API key'),
  });

  const revokeKeyMutation = useMutation({
    mutationFn: (id: string) => settingsApi.revokeApiKey(id),
    onSuccess: () => {
      toast.success('API key revoked');
      void queryClient.invalidateQueries({ queryKey: ['settings', 'api-keys'] });
    },
    onError: () => toast.error('Failed to revoke API key'),
  });

  // Audit Logs Query
  const [auditPage, setAuditPage] = useState(1);
  const { data: auditData, isLoading: loadingAudit } = useQuery({
    queryKey: ['audit-logs', auditPage],
    queryFn: () => auditLogsApi.list({ page: auditPage, limit: 15 }).then((r) => r.data.data),
  });

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-white">Settings & Preferences</h1>
        <p className="text-white/40 text-sm mt-1">
          Manage your profile, authentication security, B2B API keys, and audit trail
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-white/[0.06] pb-3 overflow-x-auto">
        {[
          { id: 'profile', label: 'Profile & Language', icon: UserIcon },
          { id: 'security', label: 'Security & Password', icon: Shield },
          { id: 'api-keys', label: 'B2B API Keys', icon: Key },
          { id: 'audit', label: 'Audit Trail', icon: Activity },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id as typeof activeTab)}
            className={cn(
              'inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all shrink-0',
              activeTab === id
                ? 'bg-brand-600/20 text-brand-300 border border-brand-500/30'
                : 'text-white/50 hover:text-white hover:bg-white/[0.04]',
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content: Profile */}
      {activeTab === 'profile' && (
        <div className="glass p-6 rounded-2xl space-y-5 max-w-2xl border-white/[0.08]">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <UserIcon className="w-4 h-4 text-brand-400" /> Account Profile
          </h2>

          <div className="space-y-4">
            <div>
              <label className="text-xs text-white/50 block mb-1">Email Address</label>
              <input
                type="email"
                disabled
                value={user?.email ?? ''}
                className="w-full bg-white/[0.02] border border-white/[0.06] rounded-xl px-3 py-2 text-sm text-white/50 cursor-not-allowed"
              />
            </div>

            <div>
              <label className="text-xs text-white/50 block mb-1">Full Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your Name"
                className="w-full bg-white/[0.04] border border-white/[0.08] focus:border-brand-500/50 rounded-xl px-3 py-2 text-sm text-white focus:outline-none"
              />
            </div>

            <div>
              <label className="text-xs text-white/50 block mb-1">Preferred Language for AI Assistant</label>
              <select
                value={preferredLang}
                onChange={(e) => setPreferredLang(e.target.value)}
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white focus:outline-none"
              >
                <option value="en" className="bg-surface-50">English</option>
                <option value="hi" className="bg-surface-50">Hindi (हिंदी)</option>
              </select>
            </div>

            <button
              onClick={() => updateProfileMutation.mutate()}
              disabled={updateProfileMutation.isPending}
              className="px-5 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold transition-colors flex items-center gap-2"
            >
              {updateProfileMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Save Preferences
            </button>
          </div>
        </div>
      )}

      {/* Tab Content: Security */}
      {activeTab === 'security' && (
        <div className="glass p-6 rounded-2xl space-y-5 max-w-2xl border-white/[0.08]">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Lock className="w-4 h-4 text-brand-400" /> Change Password
          </h2>

          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <label className="text-xs text-white/50 block mb-1">Current Password</label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full bg-white/[0.04] border border-white/[0.08] focus:border-brand-500/50 rounded-xl px-3 py-2 text-sm text-white focus:outline-none"
              />
            </div>

            <div>
              <label className="text-xs text-white/50 block mb-1">New Password (min 8 characters)</label>
              <input
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full bg-white/[0.04] border border-white/[0.08] focus:border-brand-500/50 rounded-xl px-3 py-2 text-sm text-white focus:outline-none"
              />
            </div>

            <div>
              <label className="text-xs text-white/50 block mb-1">Confirm New Password</label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-white/[0.04] border border-white/[0.08] focus:border-brand-500/50 rounded-xl px-3 py-2 text-sm text-white focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={changePasswordMutation.isPending}
              className="px-5 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold transition-colors flex items-center gap-2"
            >
              {changePasswordMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Update Password
            </button>
          </form>
        </div>
      )}

      {/* Tab Content: API Keys */}
      {activeTab === 'api-keys' && (
        <div className="glass p-6 rounded-2xl space-y-6 border-white/[0.08]">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Key className="w-4 h-4 text-brand-400" /> B2B Programmatic API Keys
              </h2>
              <p className="text-xs text-white/40 mt-0.5">
                Authenticate direct server-to-server requests using `Authorization: Bearer dsk_live_...`
              </p>
            </div>
            <button
              onClick={() => {
                setCreatedKeySecret(null);
                setIsKeyModalOpen(true);
              }}
              className="px-3.5 py-1.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold transition-colors flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> Create New Key
            </button>
          </div>

          {loadingKeys ? (
            <div className="py-8 text-center text-xs text-white/40">Loading keys...</div>
          ) : !apiKeys || apiKeys.length === 0 ? (
            <div className="py-12 text-center text-xs text-white/30">No active API keys created yet</div>
          ) : (
            <div className="border border-white/[0.06] rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-white/[0.03] border-b border-white/[0.06] text-white/40 uppercase font-medium">
                  <tr>
                    <th className="p-3">Name</th>
                    <th className="p-3">Key Prefix</th>
                    <th className="p-3">Last Used</th>
                    <th className="p-3">Created</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {apiKeys.map((k) => (
                    <tr key={k.id} className="hover:bg-white/[0.01]">
                      <td className="p-3 font-semibold text-white">{k.name}</td>
                      <td className="p-3 font-mono text-brand-300">{k.keyPrefix}••••••••</td>
                      <td className="p-3 text-white/50">{k.lastUsedAt ? formatDate(k.lastUsedAt) : 'Never'}</td>
                      <td className="p-3 text-white/50">{formatDate(k.createdAt)}</td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => revokeKeyMutation.mutate(k.id)}
                          className="p-1 text-white/30 hover:text-rose-400 transition-colors"
                          title="Revoke Key"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab Content: Audit Trail */}
      {activeTab === 'audit' && (
        <div className="glass p-6 rounded-2xl space-y-4 border-white/[0.08]">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Activity className="w-4 h-4 text-brand-400" /> Account Audit Trail
          </h2>

          {loadingAudit ? (
            <div className="py-8 text-center text-xs text-white/40">Loading audit trail...</div>
          ) : !auditData || auditData.logs.length === 0 ? (
            <div className="py-12 text-center text-xs text-white/30">No audit events recorded yet</div>
          ) : (
            <div className="border border-white/[0.06] rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-white/[0.03] border-b border-white/[0.06] text-white/40 uppercase font-medium">
                  <tr>
                    <th className="p-3">Timestamp</th>
                    <th className="p-3">Event Type</th>
                    <th className="p-3">Resource</th>
                    <th className="p-3">Document</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {auditData.logs.map((log) => (
                    <tr key={log.id} className="hover:bg-white/[0.01]">
                      <td className="p-3 font-mono text-white/50">{formatDate(log.createdAt)}</td>
                      <td className="p-3 font-semibold text-brand-300">{log.eventType}</td>
                      <td className="p-3 text-white/70">{log.resourceType}</td>
                      <td className="p-3 text-white/50">{log.document?.title || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal: Create API Key */}
      {isKeyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="glass p-6 rounded-2xl w-full max-w-md space-y-4 border-white/[0.1]">
            <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
              <h3 className="font-bold text-white text-base">Create New API Key</h3>
              <button onClick={() => setIsKeyModalOpen(false)} className="text-white/40 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            {createdKeySecret ? (
              <div className="space-y-4">
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>Copy this API key now. It will NEVER be shown to you again!</span>
                </div>

                <div className="p-3 rounded-xl bg-black/40 border border-white/[0.08] flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-white truncate">{createdKeySecret}</span>
                  <button
                    onClick={() => {
                      void navigator.clipboard.writeText(createdKeySecret);
                      setHasCopied(true);
                      setTimeout(() => setHasCopied(false), 2000);
                      toast.success('Copied to clipboard');
                    }}
                    className="p-1.5 rounded-lg bg-white/[0.08] hover:bg-white/[0.15] text-white"
                  >
                    {hasCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={() => setIsKeyModalOpen(false)}
                    className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-white/50 block mb-1">Key Description / Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Tally ERP Sync"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white focus:outline-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => setIsKeyModalOpen(false)}
                    className="px-3 py-1.5 text-xs text-white/60 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => createKeyMutation.mutate()}
                    disabled={!newKeyName.trim() || createKeyMutation.isPending}
                    className="px-4 py-1.5 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white text-xs font-semibold"
                  >
                    {createKeyMutation.isPending ? 'Generating...' : 'Generate Key'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
