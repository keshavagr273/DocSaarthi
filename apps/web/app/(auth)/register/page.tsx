'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useState } from 'react';
import { Eye, EyeOff, Mail, Lock, User, Loader2, FileText, AlertCircle, Check } from 'lucide-react';
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
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors duration-300',
              i < strength ? colors[strength] : 'bg-white/10',
            )}
          />
        ))}
        <span className={cn('text-xs ml-1', strength === 3 ? 'text-emerald-400' : strength === 2 ? 'text-amber-400' : 'text-red-400')}>
          {labels[strength]}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {checks.map((c) => (
          <span key={c.label} className={cn('flex items-center gap-1 text-xs', c.ok ? 'text-emerald-400' : 'text-white/30')}>
            <Check className="w-3 h-3" /> {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function RegisterPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
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
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full bg-brand-600/10 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md animate-slide-up">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="p-2.5 rounded-xl bg-brand-600/20 border border-brand-500/30">
            <FileText className="w-7 h-7 text-brand-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gradient">DocSaarthi</h1>
            <p className="text-xs text-white/40 -mt-0.5">Document Intelligence Platform</p>
          </div>
        </div>

        <div className="glass p-8">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-white">Create your account</h2>
            <p className="text-white/50 text-sm mt-1">Start processing your documents with AI</p>
          </div>

          {serverError && (
            <div className="mb-4 p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
              <p className="text-red-300 text-sm">{serverError}</p>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            {/* Name */}
            <div>
              <label className="label" htmlFor="name">Full name</label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                <input
                  id="name"
                  type="text"
                  autoComplete="name"
                  placeholder="Rahul Sharma"
                  className={cn('input pl-10', errors.name && 'input-error')}
                  {...register('name')}
                />
              </div>
              {errors.name && <p className="error-text"><AlertCircle className="w-3 h-3" />{errors.name.message}</p>}
            </div>

            {/* Email */}
            <div>
              <label className="label" htmlFor="email">Email address</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  className={cn('input pl-10', errors.email && 'input-error')}
                  {...register('email')}
                />
              </div>
              {errors.email && <p className="error-text"><AlertCircle className="w-3 h-3" />{errors.email.message}</p>}
            </div>

            {/* Password */}
            <div>
              <label className="label" htmlFor="password">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Min 8 characters"
                  className={cn('input pl-10 pr-10', errors.password && 'input-error')}
                  {...register('password')}
                />
                <button type="button" tabIndex={-1} onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && <p className="error-text"><AlertCircle className="w-3 h-3" />{errors.password.message}</p>}
              <PasswordStrength password={password} />
            </div>

            {/* Confirm password */}
            <div>
              <label className="label" htmlFor="confirmPassword">Confirm password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                <input
                  id="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Repeat your password"
                  className={cn('input pl-10', errors.confirmPassword && 'input-error')}
                  {...register('confirmPassword')}
                />
              </div>
              {errors.confirmPassword && <p className="error-text"><AlertCircle className="w-3 h-3" />{errors.confirmPassword.message}</p>}
            </div>

            {/* Language preference */}
            <div>
              <label className="label">Preferred language</label>
              <div className="flex gap-3">
                {(['en', 'hi'] as const).map((lang) => (
                  <label key={lang} className="flex items-center gap-2 cursor-pointer group">
                    <input type="radio" value={lang} {...register('preferredLanguage')} className="hidden" />
                    <div className={cn(
                      'flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all',
                      watch('preferredLanguage') === lang
                        ? 'bg-brand-600/20 border-brand-500/50 text-brand-300'
                        : 'bg-white/5 border-white/10 text-white/50 hover:border-white/20',
                    )}>
                      {lang === 'en' ? '🇬🇧 English' : '🇮🇳 हिंदी'}
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <button type="submit" disabled={isSubmitting} className="btn-primary w-full mt-2 py-3">
              {isSubmitting ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Creating account...</>
              ) : (
                'Create account'
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-white/40">
            Already have an account?{' '}
            <Link href="/login" className="text-brand-400 hover:text-brand-300 font-medium transition-colors">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
