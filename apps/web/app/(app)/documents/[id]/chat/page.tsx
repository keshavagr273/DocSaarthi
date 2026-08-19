'use client';

import { use, useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  MessageSquare,
  Send,
  FileText,
  Sparkles,
  Bot,
  User as UserIcon,
  ExternalLink,
  Loader2,
  Globe,
  BookOpen,
} from 'lucide-react';
import {
  documentsApi,
  conversationsApi,
  type MessageItem,
  type CitationItem,
} from '../../../../../lib/api';
import { cn } from '../../../../../lib/utils';
import toast from 'react-hot-toast';

export default function DocumentChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: documentId } = use(params);
  const queryClient = useQueryClient();

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [streamingCitations, setStreamingCitations] = useState<CitationItem[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch Document details
  const { data: doc, isLoading: docLoading } = useQuery({
    queryKey: ['documents', documentId],
    queryFn: () => documentsApi.get(documentId).then((r) => r.data.data),
  });

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  // Suggested starters customized for this document
  const starters = [
    `What is this ${doc?.category?.replace(/_/g, ' ').toLowerCase() ?? 'document'} about?`,
    'What are the key dates and deadlines mentioned?',
    'इस दस्तावेज़ का मुख्य विवरण हिंदी में बताएं।',
    'List all names, reference IDs, and authorities involved.',
  ];

  // Send message
  const handleSendMessage = async (textToSend?: string) => {
    const text = textToSend ?? inputMessage.trim();
    if (!text || isStreaming) return;

    let convId = conversationId;

    if (!convId) {
      try {
        const newConv = await conversationsApi.create({
          documentId,
          title: `Chat: ${doc?.title || 'Document'}`,
        });
        convId = newConv.data.data.id;
        setConversationId(convId);
      } catch {
        toast.error('Failed to start chat session');
        return;
      }
    }

    setInputMessage('');
    const userMsg: MessageItem = {
      id: `temp_user_${Date.now()}`,
      role: 'USER',
      content: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsStreaming(true);
    setStreamingText('');
    setStreamingCitations([]);

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/api/v1/conversations/${convId}/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ content: text, stream: true }),
        },
      );

      if (!response.ok) {
        throw new Error('Failed to stream response');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let accumulatedText = '';
      let extractedCitations: CitationItem[] = [];

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const parsed = JSON.parse(line.slice(6)) as {
                  type: string;
                  content?: string;
                  citations?: CitationItem[];
                };

                if (parsed.type === 'token' && parsed.content) {
                  accumulatedText += parsed.content;
                  setStreamingText(accumulatedText);
                } else if (parsed.type === 'done') {
                  extractedCitations = parsed.citations ?? [];
                  setStreamingCitations(extractedCitations);
                }
              } catch {
                // ignore
              }
            }
          }
        }
      }

      const assistantMsg: MessageItem = {
        id: `assistant_${Date.now()}`,
        role: 'ASSISTANT',
        content: accumulatedText || 'Response completed.',
        citations: extractedCitations,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      toast.error(`Error: ${String(err)}`);
    } finally {
      setIsStreaming(false);
      setStreamingText('');
      setStreamingCitations([]);
    }
  };

  return (
    <div className="max-w-5xl mx-auto h-[calc(100vh-6rem)] flex flex-col glass rounded-2xl border-white/[0.06] overflow-hidden animate-fade-in">
      {/* Header */}
      <div className="p-4 border-b border-white/[0.06] flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Link
            href={`/documents/${documentId}`}
            className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-white/50 hover:text-white transition-colors"
            title="Back to Document"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-white truncate max-w-md">
                Chat with: {doc?.title || 'Document'}
              </h1>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-300 border border-brand-500/20">
                {doc?.category?.replace(/_/g, ' ') ?? 'Document'}
              </span>
            </div>
            <p className="text-[10px] text-white/40 flex items-center gap-1.5 mt-0.5">
              <Globe className="w-3 h-3 text-brand-400" /> Grounded Q&A in Hindi & English
            </p>
          </div>
        </div>

        <Link
          href={`/documents/${documentId}`}
          className="text-xs font-semibold text-brand-400 hover:text-brand-300 flex items-center gap-1"
        >
          <FileText className="w-3.5 h-3.5" /> View Document Details
        </Link>
      </div>

      {/* Messages View Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        {messages.length === 0 && !isStreaming ? (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-4 max-w-md mx-auto py-12">
            <div className="w-12 h-12 rounded-2xl bg-brand-600/20 border border-brand-500/30 flex items-center justify-center text-brand-300 shadow-xl">
              <MessageSquare className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Ask Questions About This Document</h3>
              <p className="text-xs text-white/40 mt-1">
                Answers are strictly grounded in this document&apos;s text and structured extractions.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-2 w-full pt-2">
              {starters.map((s) => (
                <button
                  key={s}
                  onClick={() => handleSendMessage(s)}
                  className="p-3 rounded-xl bg-white/[0.03] hover:bg-brand-600/10 border border-white/[0.06] hover:border-brand-500/30 text-xs text-left text-white/70 hover:text-brand-300 transition-all text-left"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn('flex items-start gap-3', {
                  'justify-end': msg.role === 'USER',
                })}
              >
                {msg.role !== 'USER' && (
                  <div className="w-8 h-8 rounded-xl bg-brand-600/30 border border-brand-500/30 flex items-center justify-center text-brand-300 shrink-0">
                    <Bot className="w-4 h-4" />
                  </div>
                )}

                <div
                  className={cn('max-w-2xl space-y-2', {
                    'items-end': msg.role === 'USER',
                  })}
                >
                  <div
                    className={cn('p-4 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap', {
                      'bg-brand-600 text-white shadow-lg': msg.role === 'USER',
                      'glass text-white/90 border-white/[0.08]': msg.role !== 'USER',
                    })}
                  >
                    {msg.content}
                  </div>

                  {msg.citations && msg.citations.length > 0 && (
                    <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] space-y-1.5">
                      <p className="text-[10px] font-bold text-brand-300 uppercase tracking-wider flex items-center gap-1.5">
                        <BookOpen className="w-3 h-3" /> Citations
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {msg.citations.map((c, i) => (
                          <Link
                            key={c.chunkId || i}
                            href={`/documents/${c.documentId}`}
                            className="px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-[11px] text-white/70 hover:text-white flex items-center gap-1.5 transition-colors"
                          >
                            <span>Page {c.pageNumber}</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {msg.role === 'USER' && (
                  <div className="w-8 h-8 rounded-xl bg-white/[0.08] border border-white/[0.1] flex items-center justify-center text-white/80 shrink-0">
                    <UserIcon className="w-4 h-4" />
                  </div>
                )}
              </div>
            ))}

            {isStreaming && (
              <div className="flex items-start gap-3 animate-fade-in">
                <div className="w-8 h-8 rounded-xl bg-brand-600/30 border border-brand-500/30 flex items-center justify-center text-brand-300 shrink-0">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="glass p-4 rounded-2xl border-white/[0.08] text-sm text-white/90 leading-relaxed whitespace-pre-wrap flex-1">
                  {streamingText || (
                    <span className="flex items-center gap-2 text-xs text-white/40">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-400" />
                      Analyzing document content...
                    </span>
                  )}
                </div>
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Bar */}
      <div className="p-4 border-t border-white/[0.06] bg-surface-50/50">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            placeholder="Ask a question about this document in Hindi or English..."
            disabled={isStreaming}
            className="flex-1 bg-white/[0.04] border border-white/[0.08] focus:border-brand-500/50 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!inputMessage.trim() || isStreaming}
            className="p-3 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white font-semibold transition-colors flex items-center justify-center"
          >
            {isStreaming ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </form>
      </div>
    </div>
  );
}
