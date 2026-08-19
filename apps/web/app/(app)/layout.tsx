'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard,
  FileText,
  Search,
  MessageSquare,
  CheckSquare,
  Settings,
  LogOut,
  ChevronRight,
  Menu,
  X,
  Sparkles,
  Upload,
} from 'lucide-react';
import { useState } from 'react';
import { authApi, type User } from '../../lib/api';
import { cn } from '../../lib/utils';
import toast from 'react-hot-toast';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/documents', label: 'Documents', icon: FileText },
  { href: '/search', label: 'Search', icon: Search },
  { href: '/conversations', label: 'Chat', icon: MessageSquare },
  { href: '/review', label: 'Review Queue', icon: CheckSquare },
  { href: '/settings', label: 'Settings', icon: Settings },
];

function Sidebar({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();

  const { data: userData } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => authApi.me().then((r: { data: { data: User } }) => r.data.data),
    staleTime: 5 * 60 * 1000,
  });

  const handleLogout = async () => {
    try {
      await authApi.logout();
      toast.success('Logged out');
      router.push('/login');
      router.refresh();
    } catch {
      router.push('/login');
    }
  };

  return (
    <aside className="flex flex-col h-full w-64 bg-[#07080c] border-r border-white/[0.06] relative z-20">
      {/* Brand Header */}
      <div className="flex items-center gap-3 px-6 py-6 border-b border-white/[0.06]">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center font-bold text-xs shadow-xl transition-transform group-hover:scale-105">
            DS
          </div>
          <div>
            <span className="font-bold text-sm tracking-tight text-white flex items-center gap-1.5">
              DocSaarthi
              <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-brand-500/20 text-brand-300 border border-brand-500/30">
                v2.0
              </span>
            </span>
            <p className="text-[10px] text-white/40 leading-tight">दस्तावेज़ सारथी</p>
          </div>
        </Link>
        {onClose && (
          <button onClick={onClose} className="ml-auto text-white/30 hover:text-white lg:hidden">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Upload Quick CTA in Sidebar */}
      <div className="px-4 pt-4">
        <Link
          href="/documents/upload"
          onClick={onClose}
          className="btn-pill-white w-full !py-2.5 text-xs font-semibold shadow-lg shadow-white/5"
        >
          <Upload className="w-3.5 h-3.5" /> Upload Document
        </Link>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <div className="px-3 py-1.5 text-[10px] font-semibold text-white/30 uppercase tracking-widest">
          Platform
        </div>
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className={cn(
                'flex items-center gap-3 px-3.5 py-2.5 rounded-full text-xs font-semibold transition-all group',
                active
                  ? 'bg-white text-black shadow-lg shadow-white/10'
                  : 'text-white/50 hover:text-white hover:bg-white/[0.04]',
              )}
            >
              <Icon className={cn('w-4 h-4 shrink-0', active ? 'text-black' : 'text-white/40 group-hover:text-white')} />
              {label}
              {active && <ChevronRight className="w-3.5 h-3.5 ml-auto text-black/60" />}
            </Link>
          );
        })}
      </nav>

      {/* User Info Card */}
      <div className="border-t border-white/[0.06] p-3">
        <div className="flex items-center gap-3 px-3 py-2 rounded-2xl bg-white/[0.02] border border-white/[0.04]">
          <div className="w-8 h-8 rounded-full bg-brand-500/20 border border-brand-500/30 flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-brand-300">
              {userData?.name?.[0]?.toUpperCase() ?? 'U'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-white/90 truncate">{userData?.name ?? 'User'}</p>
            <p className="text-[10px] text-white/40 truncate">{userData?.email ?? ''}</p>
          </div>
          <button
            onClick={handleLogout}
            className="text-white/30 hover:text-red-400 transition-colors p-1"
            title="Logout"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen bg-[#050508] text-white overflow-hidden relative">
      {/* ── Background Ambient Glow Orb ────────────────────────────── */}
      <div className="absolute top-[-100px] right-[-100px] w-[500px] h-[400px] bg-gradient-to-bl from-blue-600/10 via-indigo-600/5 to-transparent blur-[120px] rounded-full pointer-events-none -z-0" />

      {/* Desktop sidebar */}
      <div className="hidden lg:flex shrink-0">
        <Sidebar />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-md"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="relative z-10 flex h-full">
            <Sidebar onClose={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      {/* Main Content Viewport */}
      <div className="flex-1 flex flex-col overflow-hidden relative z-10">
        {/* Mobile top bar */}
        <div className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-white/[0.06] bg-[#07080c]/80 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="text-white/50 hover:text-white transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
            <span className="font-bold text-white text-sm">DocSaarthi</span>
          </div>
          <Link href="/documents/upload" className="btn-pill-white text-[11px] !py-1.5 !px-3">
            <Upload className="w-3 h-3" /> Upload
          </Link>
        </div>

        {/* Page Content Viewport */}
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
