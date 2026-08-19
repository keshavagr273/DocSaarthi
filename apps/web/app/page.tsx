'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  ArrowRight,
  Sparkles,
  FileText,
  Layers,
  Cpu,
  ShieldCheck,
  Search,
  MessageSquare,
  ChevronRight,
  Eye,
  CheckCircle2,
  Lock,
  Zap,
  Globe,
  Database,
  ArrowUpRight,
} from 'lucide-react';
import { cn } from '../lib/utils';

export default function LandingPage() {
  const [activeTab, setActiveTab] = useState<'invoice' | 'resume' | 'gov'>('resume');

  return (
    <div className="min-h-screen bg-[#050508] text-white selection:bg-brand-500/30 selection:text-white relative overflow-hidden">
      {/* ── Background Ambient Cosmic Glow Orbs ───────────────────────── */}
      <div className="absolute top-[-100px] left-1/2 -translate-x-1/2 w-[800px] h-[450px] bg-gradient-to-b from-blue-600/20 via-indigo-600/10 to-transparent blur-[120px] rounded-full pointer-events-none -z-0" />
      <div className="absolute top-[600px] left-[-200px] w-[600px] h-[400px] bg-gradient-to-tr from-cyan-500/10 via-blue-500/5 to-transparent blur-[140px] rounded-full pointer-events-none -z-0" />
      <div className="absolute top-[1200px] right-[-150px] w-[600px] h-[500px] bg-gradient-to-bl from-purple-600/15 via-brand-600/10 to-transparent blur-[150px] rounded-full pointer-events-none -z-0" />

      {/* ── Floating Visuvate Navigation Bar ─────────────────────────── */}
      <header className="fixed top-6 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-5xl">
        <nav className="glass px-6 py-3.5 rounded-full border border-white/[0.08] shadow-2xl backdrop-blur-2xl flex items-center justify-between">
          {/* Brand Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-lg transition-transform group-hover:scale-105">
              <span className="font-bold text-black text-sm tracking-tighter">DS</span>
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-sm tracking-tight text-white flex items-center gap-1.5">
                DocSaarthi
                <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-brand-500/20 text-brand-300 border border-brand-500/30">
                  v2.0
                </span>
              </span>
            </div>
          </Link>

          {/* Center Links */}
          <div className="hidden md:flex items-center gap-7 text-xs font-medium text-white/60">
            <a href="#features" className="hover:text-white transition-colors">Capabilities</a>
            <a href="#pipeline" className="hover:text-white transition-colors">14-Stage Pipeline</a>
            <a href="#demo" className="hover:text-white transition-colors">Interactive Demo</a>
            <a href="#multilingual" className="hover:text-white transition-colors">Multilingual</a>
            <Link href="/search" className="hover:text-white transition-colors">Search</Link>
          </div>

          {/* Right Action Buttons */}
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-xs font-medium text-white/70 hover:text-white transition-colors px-3 py-1.5"
            >
              Sign In
            </Link>
            <Link
              href="/dashboard"
              className="btn-pill-white text-xs !py-2 !px-4.5 shadow-lg shadow-white/10"
            >
              Open Workspace <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </nav>
      </header>

      {/* ── HERO SECTION ─────────────────────────────────────────────── */}
      <section className="pt-40 pb-20 px-6 max-w-5xl mx-auto text-center relative z-10 flex flex-col items-center">
        {/* Eyebrow Pill Tag */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-white/70 text-xs font-medium mb-8 backdrop-blur-xl animate-fade-in shadow-inner">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
          <span className="tracking-wide uppercase text-[10px] font-semibold text-white/80">Intelligent Document Platform</span>
          <span className="text-white/20">|</span>
          <span className="text-brand-300 text-[11px]">14-Stage Precision Engine</span>
        </div>

        {/* Editorial Visuvate Headline */}
        <h1 className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight text-white leading-[1.08] mb-6 max-w-4xl">
          Autonomous <span className="font-serif italic font-normal text-white/90">Extraction.</span>
          <br />
          <span className="text-gradient-visuvate">Lasting Precision.</span>
        </h1>

        {/* Subtitle */}
        <p className="text-base sm:text-lg text-white/50 max-w-2xl font-normal leading-relaxed mb-10">
          Enterprise-grade document intelligence crafted for high-volume pipelines.
          From scanned bilingual invoices to complex contracts with exact coordinate grounding.
        </p>

        {/* CTA Button Row */}
        <div className="flex flex-col sm:flex-row items-center gap-3.5 mb-16">
          <Link href="/dashboard" className="btn-pill-white text-sm px-7 py-3.5 font-semibold">
            Launch Workspace <ArrowRight className="w-4 h-4" />
          </Link>
          <a href="#demo" className="btn-pill-glass text-sm px-7 py-3.5 font-semibold">
            Explore Interactive Demo
          </a>
        </div>

        {/* ── Visuvate Glowing Cosmic Disc & Device Mockup ───────────── */}
        <div id="demo" className="w-full max-w-5xl relative mt-4">
          {/* Luminous Glow Disc */}
          <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 w-[85%] h-[180px] bg-gradient-to-t from-blue-500/25 via-cyan-400/15 to-transparent blur-[60px] rounded-full pointer-events-none -z-10" />

          {/* Interactive Document Showcase Window */}
          <div className="glass-card p-4 sm:p-6 rounded-[28px] border border-white/10 shadow-2xl relative bg-[#090a10]/80 backdrop-blur-2xl">
            {/* Window Topbar */}
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-white/[0.06] flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500/60" />
                <div className="w-3 h-3 rounded-full bg-amber-500/60" />
                <div className="w-3 h-3 rounded-full bg-emerald-500/60" />
                <span className="text-xs font-mono text-white/40 ml-2">document_inspector.workspace</span>
              </div>

              {/* Sample Tabs */}
              <div className="flex items-center gap-1.5 p-1 bg-white/[0.03] border border-white/[0.06] rounded-full">
                <button
                  onClick={() => setActiveTab('resume')}
                  className={cn(
                    'px-3 py-1 rounded-full text-xs font-semibold transition-all',
                    activeTab === 'resume' ? 'bg-white text-black shadow' : 'text-white/40 hover:text-white',
                  )}
                >
                  Resume
                </button>
                <button
                  onClick={() => setActiveTab('invoice')}
                  className={cn(
                    'px-3 py-1 rounded-full text-xs font-semibold transition-all',
                    activeTab === 'invoice' ? 'bg-white text-black shadow' : 'text-white/40 hover:text-white',
                  )}
                >
                  Tax Invoice
                </button>
                <button
                  onClick={() => setActiveTab('gov')}
                  className={cn(
                    'px-3 py-1 rounded-full text-xs font-semibold transition-all',
                    activeTab === 'gov' ? 'bg-white text-black shadow' : 'text-white/40 hover:text-white',
                  )}
                >
                  Hindi Certificate
                </button>
              </div>
            </div>

            {/* Split Preview Grid */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 text-left">
              {/* Left: Document View with Bounding Boxes */}
              <div className="md:col-span-7 bg-black/60 rounded-2xl border border-white/[0.04] p-4 relative min-h-[300px] flex flex-col justify-between overflow-hidden group">
                <div className="flex items-center justify-between text-xs text-white/40 pb-3 border-b border-white/[0.04]">
                  <span className="flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5 text-emerald-400" /> OCR Coordinate Grounding (2.0x)
                  </span>
                  <span className="font-mono text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                    99.4% Precision
                  </span>
                </div>

                {/* Document Mock Preview Text */}
                <div className="space-y-3 my-4 font-mono text-xs text-white/80">
                  {activeTab === 'resume' && (
                    <>
                      <div className="p-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 inline-block">
                        <span className="text-white font-bold">KESHAV AGRAWAL</span> — Software Engineering Intern
                      </div>
                      <div className="p-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5">
                        <p className="text-white/70 text-[11px]">EDUCATION: Indian Institute of Information Technology</p>
                        <p className="text-white/50 text-[10px]">B.Tech in Information Technology · CGPA: 9.24</p>
                      </div>
                      <div className="p-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10">
                        <span className="text-white/90">EXPERIENCE: NeoCortex AI · React, TypeScript, Node.js, Kafka</span>
                      </div>
                    </>
                  )}

                  {activeTab === 'invoice' && (
                    <>
                      <div className="p-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 inline-block">
                        <span className="text-white font-bold">TAX INVOICE #INV-2026-089</span>
                      </div>
                      <div className="p-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10">
                        <span className="text-white/70">GSTIN: 07AABCU9603R1ZN · Issue Date: 18 Aug 2026</span>
                      </div>
                      <div className="p-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 flex justify-between">
                        <span>Subtotal: ₹45,000.00</span>
                        <span className="text-emerald-300">Total: ₹53,100.00 (Math Verified ✓)</span>
                      </div>
                    </>
                  )}

                  {activeTab === 'gov' && (
                    <>
                      <div className="p-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 inline-block">
                        <span className="text-white font-bold">प्रमाण पत्र / CERTIFICATE OF MERIT</span>
                      </div>
                      <div className="p-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5">
                        <span className="text-white/80">प्राप्तकर्ता: केशव अग्रवाल (Devanagari NFC Normalized)</span>
                      </div>
                      <div className="p-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10">
                        <span className="text-white/70">जारी करने की तिथि: 10 अगस्त 2026 · जारीकर्ता: भारत सरकार</span>
                      </div>
                    </>
                  )}
                </div>

                <div className="pt-2 text-[11px] text-white/30 flex items-center justify-between border-t border-white/[0.04]">
                  <span>Source: Digital PDF Layer</span>
                  <span>Interactive Pixel Bounding Boxes</span>
                </div>
              </div>

              {/* Right: Extracted Structured JSON Entities */}
              <div className="md:col-span-5 bg-black/40 rounded-2xl border border-white/[0.04] p-4 flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs text-white/40 pb-3 border-b border-white/[0.04]">
                  <span className="font-semibold text-white/70">Structured Entities</span>
                  <span className="text-[10px] font-mono text-brand-300">Zero-Shot Schema</span>
                </div>

                <div className="space-y-2.5 my-3">
                  {activeTab === 'resume' && (
                    <>
                      <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-between">
                        <div>
                          <p className="text-[10px] text-white/40 uppercase">Candidate Name</p>
                          <p className="text-xs font-semibold text-white">Keshav Agrawal</p>
                        </div>
                        <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                          98% High
                        </span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-between">
                        <div>
                          <p className="text-[10px] text-white/40 uppercase">Employer</p>
                          <p className="text-xs font-semibold text-white">NeoCortex AI</p>
                        </div>
                        <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                          96% High
                        </span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-between">
                        <div>
                          <p className="text-[10px] text-white/40 uppercase">Role</p>
                          <p className="text-xs font-semibold text-white">Software Engineering Intern</p>
                        </div>
                        <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                          96% High
                        </span>
                      </div>
                    </>
                  )}

                  {activeTab === 'invoice' && (
                    <>
                      <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-between">
                        <div>
                          <p className="text-[10px] text-white/40 uppercase">GSTIN Number</p>
                          <p className="text-xs font-semibold text-white">07AABCU9603R1ZN</p>
                        </div>
                        <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                          Valid Checksum
                        </span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-between">
                        <div>
                          <p className="text-[10px] text-white/40 uppercase">Total Amount</p>
                          <p className="text-xs font-semibold text-white">₹53,100.00</p>
                        </div>
                        <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                          Math Verified
                        </span>
                      </div>
                    </>
                  )}

                  {activeTab === 'gov' && (
                    <>
                      <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-between">
                        <div>
                          <p className="text-[10px] text-white/40 uppercase">Recipients / जारीकर्ता</p>
                          <p className="text-xs font-semibold text-white">केशव अग्रवाल</p>
                        </div>
                        <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                          NFC Verified
                        </span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-between">
                        <div>
                          <p className="text-[10px] text-white/40 uppercase">Issue Date</p>
                          <p className="text-xs font-semibold text-white">2026-08-10</p>
                        </div>
                        <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                          Parsed YYYY-MM-DD
                        </span>
                      </div>
                    </>
                  )}
                </div>

                <div className="pt-2 flex items-center justify-between">
                  <Link
                    href="/dashboard"
                    className="w-full btn-pill-glass text-center text-xs font-semibold !py-2 text-white hover:text-white"
                  >
                    Open Live in Workspace <ArrowRight className="w-3.5 h-3.5 inline ml-1" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── BENTO GRID FEATURES SECTION ──────────────────────────────── */}
      <section id="features" className="py-24 px-6 max-w-6xl mx-auto relative z-10">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <p className="text-xs font-semibold text-brand-400 uppercase tracking-widest mb-3">Enterprise Architecture</p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white mb-4">
            Crafted for <span className="font-serif italic font-normal">Complex Realities.</span>
          </h2>
          <p className="text-sm text-white/50">
            A comprehensive, self-hosted document pipeline designed to ingest, validate, and index any file format with absolute transparency.
          </p>
        </div>

        {/* Bento Grid Layout */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
          {/* Bento 1: 14-Stage Asynchronous Pipeline (Wide) */}
          <div className="md:col-span-8 glass-card p-8 rounded-3xl relative overflow-hidden flex flex-col justify-between">
            <div className="flex items-center justify-between mb-6">
              <div className="w-10 h-10 rounded-2xl bg-brand-500/20 border border-brand-500/30 flex items-center justify-center text-brand-300">
                <Cpu className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-mono uppercase text-white/40 bg-white/[0.04] px-3 py-1 rounded-full border border-white/[0.06]">
                BullMQ Distributed Worker
              </span>
            </div>
            <div>
              <h3 className="text-xl font-bold text-white mb-2">14-Stage Asynchronous Engine</h3>
              <p className="text-sm text-white/50 leading-relaxed mb-6">
                From initial PDF buffer caching and canvas rendering to Unicode text normalization, zero-shot entity extraction, and pgvector embeddings. Every stage runs idempotently with live console telemetry.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono text-white/60">
                <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">1. File Validation</div>
                <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">5. OCR Overlay</div>
                <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">9. Extraction</div>
                <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">13. pgvector</div>
              </div>
            </div>
          </div>

          {/* Bento 2: Multilingual & Devanagari (Small) */}
          <div className="md:col-span-4 glass-card p-8 rounded-3xl relative overflow-hidden flex flex-col justify-between">
            <div className="w-10 h-10 rounded-2xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-300 mb-6">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white mb-2">Hindi & Bilingual OCR</h3>
              <p className="text-xs text-white/50 leading-relaxed">
                Native Devanagari script recognition with Unicode NFC normalization, Hindi month parsing, and automated VLM vision fallback for distorted scans.
              </p>
            </div>
          </div>

          {/* Bento 3: Deterministic Math & Cross-Field Validator (Small) */}
          <div className="md:col-span-4 glass-card p-8 rounded-3xl relative overflow-hidden flex flex-col justify-between">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-300 mb-6">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white mb-2">Deterministic Validation</h3>
              <p className="text-xs text-white/50 leading-relaxed">
                Zero hallucinations. Automated invoice balance verification (<code className="text-emerald-400">Subtotal + Tax = Total</code>), 15-char GSTIN checksum verification, and chronological date checks.
              </p>
            </div>
          </div>

          {/* Bento 4: Hybrid pgvector Search (Wide) */}
          <div className="md:col-span-8 glass-card p-8 rounded-3xl relative overflow-hidden flex flex-col justify-between">
            <div className="flex items-center justify-between mb-6">
              <div className="w-10 h-10 rounded-2xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-300">
                <Search className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-mono text-purple-300 bg-purple-500/10 px-3 py-1 rounded-full border border-purple-500/20">
                Hybrid 60 / 40
              </span>
            </div>
            <div>
              <h3 className="text-xl font-bold text-white mb-2">Hybrid Vector & Keyword Search</h3>
              <p className="text-sm text-white/50 leading-relaxed">
                Combine 1536-dimensional semantic vector embeddings with PostgreSQL Full-Text Search and trigram fuzzy matching across your entire document repository.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── METRICS & TRUST STRIP ───────────────────────────────────── */}
      <section className="py-16 border-y border-white/[0.06] bg-white/[0.01]">
        <div className="max-w-5xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          <div>
            <p className="text-3xl sm:text-4xl font-extrabold text-white mb-1">99.4%</p>
            <p className="text-xs text-white/40 uppercase tracking-wider font-semibold">OCR Precision</p>
          </div>
          <div>
            <p className="text-3xl sm:text-4xl font-extrabold text-white mb-1">&lt; 2.5s</p>
            <p className="text-xs text-white/40 uppercase tracking-wider font-semibold">Async Processing</p>
          </div>
          <div>
            <p className="text-3xl sm:text-4xl font-extrabold text-white mb-1">100%</p>
            <p className="text-xs text-white/40 uppercase tracking-wider font-semibold">Private & Self-Hosted</p>
          </div>
          <div>
            <p className="text-3xl sm:text-4xl font-extrabold text-white mb-1">14 Stages</p>
            <p className="text-xs text-white/40 uppercase tracking-wider font-semibold">End-to-End Pipeline</p>
          </div>
        </div>
      </section>

      {/* ── FINAL CTA SECTION ────────────────────────────────────────── */}
      <section className="py-28 px-6 max-w-4xl mx-auto text-center relative z-10 flex flex-col items-center">
        <div className="w-14 h-14 rounded-full bg-white text-black flex items-center justify-center mb-6 shadow-2xl">
          <Sparkles className="w-6 h-6" />
        </div>
        <h2 className="text-3xl sm:text-5xl font-bold tracking-tight text-white mb-4">
          Experience <span className="font-serif italic font-normal text-white/90">Precision.</span>
        </h2>
        <p className="text-sm sm:text-base text-white/50 max-w-xl mb-8">
          Upload any document to test automated classification, OCR bounding boxes, and instant structured data extraction.
        </p>
        <Link href="/dashboard" className="btn-pill-white text-sm px-8 py-3.5 font-semibold shadow-2xl">
          Open Document Workspace <ArrowRight className="w-4 h-4" />
        </Link>
      </section>

      {/* ── MINIMALIST FOOTER ────────────────────────────────────────── */}
      <footer className="py-8 px-6 border-t border-white/[0.06] text-xs text-white/40">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-bold text-white">DocSaarthi</span>
            <span>· दस्तावेज़ सारथी</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="hover:text-white transition-colors">Workspace</Link>
            <Link href="/documents" className="hover:text-white transition-colors">Documents</Link>
            <Link href="/search" className="hover:text-white transition-colors">Search</Link>
            <Link href="/login" className="hover:text-white transition-colors">Sign In</Link>
          </div>
          <p>© {new Date().getFullYear()} DocSaarthi. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
