'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useState } from 'react';
import { Eye, EyeOff, Mail, Lock, Loader2, AlertCircle, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { authApi } from '../../../lib/api';
import { cn } from '../../../lib/utils';

const loginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });

  const onSubmit = async (data: LoginForm) => {
    setServerError('');
    try {
      await authApi.login(data);
      toast.success('Welcome back!');
      router.push('/dashboard');
      router.refresh();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Invalid email or password';
      setServerError(msg);
    }
  };

  return (
    <div className="min-h-screen bg-[#050508] flex items-center justify-center px-4 py-12 relative overflow-hidden">
      {/* ── Visuvate Ambient Cosmic Glow ────────────────────────────── */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[650px] h-[380px] bg-gradient-to-b from-blue-600/20 via-indigo-600/10 to-transparent blur-[120px] rounded-full pointer-events-none -z-0" />
      <div className="absolute bottom-[-100px] right-[-100px] w-[400px] h-[300px] bg-cyan-500/10 blur-[100px] rounded-full pointer-events-none -z-0" />

      <div className="relative w-full max-w-md animate-slide-up z-10">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-4 group">
            <div className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center font-bold text-sm shadow-xl transition-transform group-hover:scale-105">
              DS
            </div>
            <span className="font-bold text-lg text-white tracking-tight">DocSaarthi</span>
          </Link>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">
            Welcome <span className="font-serif italic font-normal text-white/90">Back.</span>
          </h1>
          <p className="text-xs text-white/40 mt-1 font-medium">Enter your credentials to access the workspace</p>
        </div>

        {/* Visuvate Floating Glass Card */}
        <div className="glass-card p-8 sm:p-9 rounded-[28px] border border-white/10 shadow-2xl bg-[#090a10]/80 backdrop-blur-2xl">
          {/* Server error */}
          {serverError && (
            <div className="mb-5 p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
              <p className="text-red-300 text-xs font-medium">{serverError}</p>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            {/* Email */}
            <div>
              <label className="label" htmlFor="email">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="name@company.com"
                  className={cn('input pl-11', errors.email && 'input-error')}
                  {...register('email')}
                />
              </div>
              {errors.email && (
                <p className="error-text"><AlertCircle className="w-3 h-3" />{errors.email.message}</p>
              )}
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="label mb-0" htmlFor="password">Password</label>
                <Link href="/forgot-password" className="text-xs text-white/40 hover:text-white transition-colors">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className={cn('input pl-11 pr-11', errors.password && 'input-error')}
                  {...register('password')}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="error-text"><AlertCircle className="w-3 h-3" />{errors.password.message}</p>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-pill-white w-full mt-4 py-3.5 text-xs font-bold tracking-wide shadow-xl shadow-white/10"
            >
              {isSubmitting ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Authenticating...</>
              ) : (
                <>Sign In to Workspace <ArrowRight className="w-3.5 h-3.5 ml-1" /></>
              )}
            </button>
          </form>

          {/* Switch to Register */}
          <div className="mt-6 pt-5 border-t border-white/[0.06] text-center text-xs text-white/40">
            Don&apos;t have an account?{' '}
            <Link href="/register" className="text-white hover:underline font-semibold transition-colors ml-1">
              Create an account
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
