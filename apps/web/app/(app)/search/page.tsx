'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  Sparkles,
  FileText,
  Clock,
  Layers,
  ChevronRight,
  Filter,
  X,
  ExternalLink,
  Languages,
  Tag,
  Loader2,
  HelpCircle,
} from 'lucide-react';
import { searchApi, type SearchResultItem } from '../../../lib/api';
import { cn } from '../../../lib/utils';

const CATEGORIES = [
  'ALL',
  'GOVERNMENT_NOTICE',
  'INVOICE',
  'RECEIPT',
  'CERTIFICATE',
  'COLLEGE_DOCUMENT',
  'BANK_DOCUMENT',
  'LEGAL_DOCUMENT',
  'EMPLOYMENT_DOCUMENT',
  'FORM',
  'LETTER',
];

const SUGGESTED_QUERIES = [
  'scholarship application deadline',
  'अंतिम तारीख छात्रवृत्ति',
  'invoice payment due total GSTIN',
  'certificate holder name university',
  'bank account statement balance',
];

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [mode, setMode] = useState<'hybrid' | 'semantic' | 'keyword'>('hybrid');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedLang, setSelectedLang] = useState('ALL');

  // Debounce query as the user types (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const effectiveQuery = debouncedQuery;

  const { data: searchData, isFetching } = useQuery({
    queryKey: ['search', { q: effectiveQuery, mode, category: selectedCategory, lang: selectedLang }],
    queryFn: () =>
      searchApi
        .search({
          q: effectiveQuery,
          mode,
          category: selectedCategory === 'ALL' ? undefined : selectedCategory,
          lang: selectedLang === 'ALL' ? undefined : selectedLang,
          limit: 20,
        })
        .then((r) => r.data.data),
    enabled: Boolean(effectiveQuery.length >= 1),
  });

  const handleSearch = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (query.trim()) {
      setDebouncedQuery(query.trim());
    }
  };

  const results = searchData?.results ?? [];

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="p-2 rounded-xl bg-brand-600/20 border border-brand-500/30">
            <Search className="w-5 h-5 text-brand-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Hybrid Document Search</h1>
            <p className="text-white/40 text-sm">
              Search across all your multilingual documents using AI vectors and full-text keyword matching
            </p>
          </div>
        </div>
      </div>

      {/* Main Search Input Card */}
      <div className="glass p-5 rounded-2xl space-y-4 border-white/[0.08]">
        <form onSubmit={handleSearch} className="flex gap-2 items-center">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search in English, Hindi (छात्रवृत्ति), or keywords..."
              className="w-full bg-white/[0.04] border border-white/[0.08] focus:border-brand-500/50 rounded-xl pl-11 pr-10 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            type="submit"
            disabled={!query.trim() || isFetching}
            className="px-6 py-3 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white text-sm font-semibold transition-colors flex items-center gap-2 shrink-0"
          >
            {isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Search
          </button>
        </form>

        {/* Mode & Filters Row */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-white/[0.04]">
          {/* Mode Selector */}
          <div className="flex items-center gap-1.5 bg-white/[0.03] p-1 rounded-xl border border-white/[0.06]">
            {[
              { id: 'hybrid', label: 'Hybrid Search (60/40)', icon: Sparkles },
              { id: 'semantic', label: 'Semantic (Vector)', icon: Layers },
              { id: 'keyword', label: 'Keyword (FTS)', icon: FileText },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setMode(id as typeof mode)}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                  mode === id
                    ? 'bg-brand-600 text-white shadow-lg'
                    : 'text-white/50 hover:text-white hover:bg-white/[0.04]',
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-white/[0.04] border border-white/[0.08] px-3 py-1.5 rounded-xl text-xs text-white/80 focus:outline-none"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat} className="bg-surface-50">
                  {cat === 'ALL' ? 'All Categories' : cat.replace(/_/g, ' ')}
                </option>
              ))}
            </select>

            <select
              value={selectedLang}
              onChange={(e) => setSelectedLang(e.target.value)}
              className="bg-white/[0.04] border border-white/[0.08] px-3 py-1.5 rounded-xl text-xs text-white/80 focus:outline-none"
            >
              <option value="ALL" className="bg-surface-50">All Languages</option>
              <option value="hi" className="bg-surface-50">Hindi (हिंदी)</option>
              <option value="en" className="bg-surface-50">English</option>
            </select>
          </div>
        </div>
      </div>

      {/* Suggested Starters when empty */}
      {!effectiveQuery && (
        <div className="glass p-6 rounded-2xl space-y-3">
          <p className="text-xs font-semibold text-white/40 uppercase tracking-wider flex items-center gap-1.5">
            <HelpCircle className="w-3.5 h-3.5 text-brand-400" /> Suggested Searches
          </p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_QUERIES.map((sq) => (
              <button
                key={sq}
                onClick={() => {
                  setQuery(sq);
                  setDebouncedQuery(sq);
                }}
                className="px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:border-brand-500/30 hover:bg-brand-600/10 text-xs text-white/70 hover:text-brand-300 transition-all text-left"
              >
                {sq}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Results Header */}
      {effectiveQuery && (
        <div className="flex items-center justify-between text-xs text-white/40 px-1">
          <span>
            Found <strong className="text-white">{results.length}</strong> results in{' '}
            <strong className="text-white">{searchData?.searchDurationMs ?? 0}ms</strong> for &ldquo;{effectiveQuery}&rdquo;
          </span>
          <span className="capitalize">Mode: {mode}</span>
        </div>
      )}

      {/* Results List */}
      {isFetching ? (
        <div className="glass p-16 rounded-2xl text-center">
          <Loader2 className="w-8 h-8 animate-spin text-brand-400 mx-auto mb-3" />
          <p className="text-sm text-white/40">Executing hybrid vector search...</p>
        </div>
      ) : effectiveQuery && results.length === 0 ? (
        <div className="glass p-16 rounded-2xl text-center space-y-3">
          <Search className="w-10 h-10 text-white/20 mx-auto mb-1" />
          <h3 className="text-base font-semibold text-white">No Matching Results</h3>
          <p className="text-xs text-white/40 max-w-sm mx-auto">
            Try adjusting your search terms or switching between Hybrid, Semantic, and Keyword modes.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {results.map((result) => (
            <SearchResultCard key={result.chunkId} result={result} />
          ))}
        </div>
      )}
    </div>
  );
}

function SearchResultCard({ result }: { result: SearchResultItem }) {
  // Format highlighted snippet by converting **text** to styled markup
  const renderSnippet = (snippet: string) => {
    const parts = snippet.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <mark
            key={i}
            className="bg-brand-500/25 text-brand-300 px-1 py-0.5 rounded font-semibold"
          >
            {part.slice(2, -2)}
          </mark>
        );
      }
      return part;
    });
  };

  return (
    <div className="glass p-5 rounded-2xl border-white/[0.06] hover:border-white/[0.12] transition-all space-y-3 group">
      {/* Top Metadata */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <Link
            href={`/documents/${result.documentId}`}
            className="text-sm font-semibold text-white group-hover:text-brand-300 transition-colors flex items-center gap-1.5"
          >
            <FileText className="w-4 h-4 text-brand-400 shrink-0" />
            {result.documentTitle}
            <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
          </Link>
          <div className="flex items-center gap-2 mt-1 text-[11px] text-white/40">
            <span>{result.documentCategory?.replace(/_/g, ' ') ?? 'General'}</span>
            <span>·</span>
            <span>Page {result.pageNumber}</span>
            {result.sectionTitle && (
              <>
                <span>·</span>
                <span className="truncate max-w-[200px]">{result.sectionTitle}</span>
              </>
            )}
          </div>
        </div>

        {/* Score indicator */}
        <div className="flex items-center gap-2">
          <div className="text-right">
            <span className="text-xs font-bold text-brand-300">
              {Math.round(result.finalScore * 100)}% Match
            </span>
            <div className="flex items-center gap-1.5 text-[9px] text-white/30">
              <span>Sem: {Math.round(result.semanticScore * 100)}%</span>
              <span>·</span>
              <span>Key: {Math.round(result.keywordScore * 100)}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Snippet Content */}
      <div className="bg-white/[0.02] border border-white/[0.04] p-3 rounded-xl text-xs text-white/80 leading-relaxed font-sans">
        {renderSnippet(result.snippet)}
      </div>

      {/* Action Footer */}
      <div className="flex items-center justify-end pt-1">
        <Link
          href={`/documents/${result.documentId}`}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-white/40 hover:text-white transition-colors"
        >
          View in Document <ExternalLink className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
}
