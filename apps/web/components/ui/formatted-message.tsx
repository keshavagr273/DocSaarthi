'use client';

import React from 'react';
import { BookOpen } from 'lucide-react';
import type { CitationItem } from '../../lib/api';

interface FormattedMessageProps {
  content: string;
  citations?: CitationItem[];
  isUser?: boolean;
}

export function FormattedMessage({ content, citations, isUser }: FormattedMessageProps) {
  if (isUser) {
    return <span>{content}</span>;
  }

  // Split by line breaks
  const lines = content.split('\n');

  const renderInline = (text: string) => {
    // Regex for bold (**text**), inline code (`code`), citations ([Source N...] or 【Source N...】), and italics (*text*)
    const parts: React.ReactNode[] = [];
    let remaining = text;
    let keyIdx = 0;

    const tokenRegex = /(\*\*[^*]+\*\*|`[^`]+`|(?:\[|【)Source\s*\d+[^\]】\n]*(?:\]|】)|\*[^*]+\*)/;

    while (remaining) {
      const match = tokenRegex.exec(remaining);
      if (!match) {
        parts.push(remaining);
        break;
      }

      const matchIndex = match.index;
      if (matchIndex > 0) {
        parts.push(remaining.slice(0, matchIndex));
      }

      const matchedText = match[0];

      if (matchedText.startsWith('**') && matchedText.endsWith('**')) {
        // Bold
        parts.push(
          <strong key={`b-${keyIdx++}`} className="font-semibold text-white">
            {matchedText.slice(2, -2)}
          </strong>,
        );
      } else if (matchedText.startsWith('`') && matchedText.endsWith('`')) {
        // Inline code
        parts.push(
          <code
            key={`c-${keyIdx++}`}
            className="px-1.5 py-0.5 rounded bg-white/10 text-brand-300 font-mono text-xs"
          >
            {matchedText.slice(1, -1)}
          </code>,
        );
      } else if (
        (matchedText.startsWith('[') && matchedText.endsWith(']')) ||
        (matchedText.startsWith('【') && matchedText.endsWith('】'))
      ) {
        // Citation badge
        const cleanCitation = matchedText.slice(1, -1);
        parts.push(
          <span
            key={`cite-${keyIdx++}`}
            className="inline-flex items-center gap-1 px-2 py-0.5 mx-1 rounded-md bg-brand-500/15 border border-brand-500/30 text-brand-300 text-[11px] font-medium align-middle"
          >
            <BookOpen className="w-3 h-3 shrink-0" />
            {cleanCitation}
          </span>,
        );
      } else if (matchedText.startsWith('*') && matchedText.endsWith('*')) {
        // Italic
        parts.push(
          <em key={`i-${keyIdx++}`} className="italic text-white/90">
            {matchedText.slice(1, -1)}
          </em>,
        );
      } else {
        parts.push(matchedText);
      }

      remaining = remaining.slice(matchIndex + matchedText.length);
    }

    return parts;
  };

  return (
    <div className="space-y-2 leading-relaxed">
      {lines.map((line, idx) => {
        const trimmed = line.trim();

        if (!trimmed) {
          return <div key={idx} className="h-1.5" />;
        }

        // Header ###
        if (trimmed.startsWith('### ')) {
          return (
            <h4 key={idx} className="text-sm font-bold text-white mt-3 mb-1">
              {renderInline(trimmed.slice(4))}
            </h4>
          );
        }

        // Header ##
        if (trimmed.startsWith('## ')) {
          return (
            <h3 key={idx} className="text-base font-bold text-white mt-3 mb-1">
              {renderInline(trimmed.slice(3))}
            </h3>
          );
        }

        // Header #
        if (trimmed.startsWith('# ')) {
          return (
            <h2 key={idx} className="text-lg font-bold text-white mt-3 mb-1">
              {renderInline(trimmed.slice(2))}
            </h2>
          );
        }

        // Bullet item (- or *)
        if (/^[-*]\s+/.test(trimmed)) {
          const bulletText = trimmed.replace(/^[-*]\s+/, '');
          return (
            <div key={idx} className="flex items-start gap-2 pl-2">
              <span className="text-brand-400 mt-1 select-none">•</span>
              <div className="flex-1">{renderInline(bulletText)}</div>
            </div>
          );
        }

        // Numbered item (1. 2. etc.)
        const numMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
        if (numMatch) {
          const num = numMatch[1];
          const text = numMatch[2] ?? '';
          return (
            <div key={idx} className="flex items-start gap-2 pl-2">
              <span className="text-brand-400 font-semibold text-xs mt-0.5 select-none">{num}.</span>
              <div className="flex-1">{renderInline(text)}</div>
            </div>
          );
        }

        return <div key={idx}>{renderInline(line)}</div>;
      })}
    </div>
  );
}
