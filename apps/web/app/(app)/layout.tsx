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
    <aside className="flex flex-col h-full w-64 bg-surface-50 border-r border-white/[0.06]">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-white/[0.06]">
        <div className="p-2 rounded-lg bg-brand-600/20 border border-brand-500/30 shrink-0">
          <FileText className="w-5 h-5 text-brand-400" />
        </div>
        <div>
          <span className="font-bold text-white">DocSaarthi</span>
          <p className="text-[10px] text-white/30 leading-tight">Document Intelligence</p>
        </div>
        {onClose && (
          <button onClick={onClose} className="ml-auto text-white/30 hover:text-white lg:hidden">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group',
                active
                  ? 'bg-brand-600/20 text-brand-300 border border-brand-500/20'
                  : 'text-white/50 hover:text-white/80 hover:bg-white/5',
              )}
            >
              <Icon className={cn('w-4 h-4 shrink-0', active ? 'text-brand-400' : 'text-white/30 group-hover:text-white/50')} />
              {label}
              {active && <ChevronRight className="w-3.5 h-3.5 ml-auto text-brand-400/60" />}
            </Link>
          );
        })}
      </nav>

      {/* User info */}
      <div className="border-t border-white/[0.06] p-3">
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors">
          <div className="w-8 h-8 rounded-full bg-brand-600/30 border border-brand-500/30 flex items-center justify-center shrink-0">
            <span className="text-xs font-semibold text-brand-300">
              {userData?.name?.[0]?.toUpperCase() ?? 'U'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white/80 truncate">{userData?.name ?? 'User'}</p>
            <p className="text-xs text-white/30 truncate">{userData?.email ?? ''}</p>
          </div>
          <button
            onClick={handleLogout}
            className="text-white/20 hover:text-red-400 transition-colors"
            title="Logout"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex shrink-0">
        <Sidebar />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="relative z-10 flex h-full">
            <Sidebar onClose={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile top bar */}
        <div className="lg:hidden flex items-center gap-3 px-4 py-3 border-b border-white/[0.06] bg-surface-50">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-white/40 hover:text-white transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-semibold text-white/80">DocSaarthi</span>
        </div>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
