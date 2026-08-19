'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useState } from 'react';
import { Eye, EyeOff, Mail, Lock, User, Loader2, AlertCircle, Check, ArrowRight, Globe } from 'lucide-react';
import toast from 'react-hot-toast';
import { authApi } from '../../../lib/api';
import { cn } from '../../../lib/utils';

const registerSchema = z
  .object({
    name: z.string().min(2, 'Name must be at least 2 characters').max(100),
    email: z.string().email('Enter a valid email address'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(128),
    confirmPassword: z.string(),
    preferredLanguage: z.enum(['en', 'hi']).default('en'),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type RegisterForm = z.infer<typeof registerSchema>;

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label: '8+ characters', ok: password.length >= 8 },
    { label: 'Uppercase letter', ok: /[A-Z]/.test(password) },
    { label: 'Number', ok: /\d/.test(password) },
  ];
  const strength = checks.filter((c) => c.ok).length;
  const colors = ['', 'bg-red-500', 'bg-amber-500', 'bg-emerald-500'];
  const labels = ['', 'Weak', 'Medium', 'Strong'];

  if (!password) return null;

  return (
    <div className="mt-2 space-y-2">
      <div className="flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors duration-300',
              i < strength ? colors[strength] : 'bg-white/10',
            )}
          />
        ))}
        <span className={cn('text-[10px] font-mono ml-1 font-semibold', strength === 3 ? 'text-emerald-400' : strength === 2 ? 'text-amber-400' : 'text-red-400')}>
          {labels[strength]}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {checks.map((c) => (
          <span key={c.label} className={cn('flex items-center gap-1 text-[10px] font-mono', c.ok ? 'text-emerald-400' : 'text-white/30')}>
            <Check className="w-2.5 h-2.5" /> {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function RegisterPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [serverError, setServerError] = useState('');

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: { preferredLanguage: 'en' },
  });

  const password = watch('password', '');
  const selectedLang = watch('preferredLanguage');

  const onSubmit = async (data: RegisterForm) => {
    setServerError('');
    try {
      await authApi.register({
        name: data.name,
        email: data.email,
        password: data.password,
        preferredLanguage: data.preferredLanguage,
      });
      toast.success('Account created! Welcome to DocSaarthi 🎉');
      router.push('/dashboard');
      router.refresh();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Registration failed. Please try again.';
      setServerError(msg);
    }
  };

  return (
    <div className="min-h-screen bg-[#050508] flex items-center justify-center px-4 py-12 relative overflow-hidden">
      {/* ── Visuvate Ambient Cosmic Glow ────────────────────────────── */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[450px] bg-gradient-to-b from-blue-600/20 via-indigo-600/10 to-transparent blur-[130px] rounded-full pointer-events-none -z-0" />
      <div className="absolute top-[-50px] right-[-100px] w-[400px] h-[300px] bg-cyan-500/10 blur-[100px] rounded-full pointer-events-none -z-0" />

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
            Create <span className="font-serif italic font-normal text-white/90">Account.</span>
          </h1>
          <p className="text-xs text-white/40 mt-1 font-medium">Start processing intelligent documents in seconds</p>
        </div>

        {/* Visuvate Floating Glass Card */}
        <div className="glass-card p-8 sm:p-9 rounded-[28px] border border-white/10 shadow-2xl bg-[#090a10]/80 backdrop-blur-2xl">
          {serverError && (
            <div className="mb-5 p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
              <p className="text-red-300 text-xs font-medium">{serverError}</p>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            {/* Name */}
            <div>
              <label className="label" htmlFor="name">Full Name</label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                <input
                  id="name"
                  type="text"
                  autoComplete="name"
                  placeholder="Keshav Agrawal"
                  className={cn('input pl-11', errors.name && 'input-error')}
                  {...register('name')}
                />
              </div>
              {errors.name && <p className="error-text"><AlertCircle className="w-3 h-3" />{errors.name.message}</p>}
            </div>

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
              {errors.email && <p className="error-text"><AlertCircle className="w-3 h-3" />{errors.email.message}</p>}
            </div>

            {/* Password */}
            <div>
              <label className="label" htmlFor="password">Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Min 8 characters"
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
              {errors.password && <p className="error-text"><AlertCircle className="w-3 h-3" />{errors.password.message}</p>}
              <PasswordStrength password={password} />
            </div>

            {/* Confirm password with Eye Toggle */}
            <div>
              <label className="label" htmlFor="confirmPassword">Confirm Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                <input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Repeat your password"
                  className={cn('input pl-11 pr-11', errors.confirmPassword && 'input-error')}
                  {...register('confirmPassword')}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.confirmPassword && <p className="error-text"><AlertCircle className="w-3 h-3" />{errors.confirmPassword.message}</p>}
            </div>

            {/* Default OCR Language Selection */}
            <div>
              <label className="label">Default OCR Language</label>
              <div className="grid grid-cols-2 gap-2.5">
                <label className="cursor-pointer group">
                  <input type="radio" value="en" {...register('preferredLanguage')} className="hidden" />
                  <div className={cn(
                    'flex items-center justify-center gap-2 px-4 py-3 rounded-full border text-xs font-semibold transition-all select-none',
                    selectedLang === 'en'
                      ? 'bg-white text-black border-white shadow-lg font-bold'
                      : 'bg-white/[0.03] border-white/10 text-white/60 hover:text-white hover:border-white/20',
                  )}>
                    <Globe className="w-3.5 h-3.5" />
                    <span>English (EN)</span>
                  </div>
                </label>

                <label className="cursor-pointer group">
                  <input type="radio" value="hi" {...register('preferredLanguage')} className="hidden" />
                  <div className={cn(
                    'flex items-center justify-center gap-2 px-4 py-3 rounded-full border text-xs font-semibold transition-all select-none',
                    selectedLang === 'hi'
                      ? 'bg-white text-black border-white shadow-lg font-bold'
                      : 'bg-white/[0.03] border-white/10 text-white/60 hover:text-white hover:border-white/20',
                  )}>
                    <span className="font-bold">अ</span>
                    <span>हिंदी (Devanagari)</span>
                  </div>
                </label>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-pill-white w-full mt-4 py-3.5 text-xs font-bold tracking-wide shadow-xl shadow-white/10"
            >
              {isSubmitting ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Initializing Workspace...</>
              ) : (
                <>Create Free Account <ArrowRight className="w-3.5 h-3.5 ml-1" /></>
              )}
            </button>
          </form>

          {/* Switch to Login */}
          <div className="mt-6 pt-5 border-t border-white/[0.06] text-center text-xs text-white/40">
            Already have an account?{' '}
            <Link href="/login" className="text-white hover:underline font-semibold transition-colors ml-1">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
