'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  MessageSquare,
  Send,
  Plus,
  Trash2,
  FileText,
  Sparkles,
  Bot,
  User as UserIcon,
  ExternalLink,
  Loader2,
  Globe,
  ChevronRight,
  BookOpen,
} from 'lucide-react';
import {
  conversationsApi,
  type ConversationSummary,
  type MessageItem,
  type CitationItem,
} from '../../../lib/api';
import { cn, formatDate } from '../../../lib/utils';
import { FormattedMessage } from '../../../components/ui/formatted-message';
import toast from 'react-hot-toast';

const SUGGESTED_STARTERS = [
  'What are the most critical deadlines across all my notices?',
  'Summarize the total invoice expenses uploaded this month.',
  'इस महीने अपलोड किए गए सभी महत्वपूर्ण सरकारी आदेशों का सारांश दें।',
  'What eligibility conditions are required for the scholarship notices?',
];

export default function ConversationsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [streamingCitations, setStreamingCitations] = useState<CitationItem[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // List conversations
  const { data: conversationsData, isLoading: loadingList } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => conversationsApi.list().then((r) => r.data.data),
  });

  // Active conversation detail
  const { data: activeConvData, isLoading: loadingConv } = useQuery({
    queryKey: ['conversations', activeConversationId],
    queryFn: () =>
      activeConversationId ? conversationsApi.get(activeConversationId).then((r) => r.data.data) : null,
    enabled: Boolean(activeConversationId),
  });

  // Update messages when active conversation changes
  useEffect(() => {
    if (activeConvData?.messages) {
      setMessages(activeConvData.messages);
    } else {
      setMessages([]);
    }
  }, [activeConvData]);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  // Create new conversation mutation
  const createMutation = useMutation({
    mutationFn: (title?: string) => conversationsApi.create({ title }),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      setActiveConversationId(res.data.data.id);
    },
    onError: () => toast.error('Failed to create conversation'),
  });

  // Delete conversation mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => conversationsApi.delete(id),
    onSuccess: () => {
      toast.success('Conversation deleted');
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      setActiveConversationId(null);
      setMessages([]);
    },
    onError: () => toast.error('Failed to delete conversation'),
  });

  // Handle Send Message with SSE Streaming
  const handleSendMessage = async (textToSend?: string) => {
    const text = textToSend ?? inputMessage.trim();
    if (!text || isStreaming) return;

    let convId = activeConversationId;

    // If no active conversation, create one first
    if (!convId) {
      try {
        const newConv = await conversationsApi.create({ title: text.slice(0, 40) });
        convId = newConv.data.data.id;
        setActiveConversationId(convId);
        void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      } catch {
        toast.error('Failed to start conversation');
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
        throw new Error('Failed to connect to chat stream');
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
                  messageId?: string;
                };

                if (parsed.type === 'token' && parsed.content) {
                  accumulatedText += parsed.content;
                  setStreamingText(accumulatedText);
                } else if (parsed.type === 'done') {
                  extractedCitations = parsed.citations ?? [];
                  setStreamingCitations(extractedCitations);
                }
              } catch {
                // partial JSON chunk
              }
            }
          }
        }
      }

      // Add final assistant message
      const assistantMsg: MessageItem = {
        id: `assistant_${Date.now()}`,
        role: 'ASSISTANT',
        content: accumulatedText || 'Response received.',
        citations: extractedCitations,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    } catch (err) {
      toast.error(`Error: ${String(err)}`);
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          role: 'ASSISTANT',
          content: 'I encountered an error retrieving answers from your documents. Please try again.',
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsStreaming(false);
      setStreamingText('');
      setStreamingCitations([]);
    }
  };

  const conversations = conversationsData ?? [];

  return (
    <div className="max-w-7xl mx-auto h-[calc(100vh-6rem)] flex gap-4 animate-fade-in">
      {/* Sidebar: Conversation History */}
      <div className="w-80 glass rounded-2xl p-4 flex flex-col gap-3 border-white/[0.06] shrink-0 hidden md:flex">
        <button
          onClick={() => {
            setActiveConversationId(null);
            setMessages([]);
          }}
          className="w-full py-2.5 px-4 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-semibold text-xs transition-colors flex items-center justify-center gap-2 shadow-lg"
        >
          <Plus className="w-4 h-4" /> New Chat
        </button>

        <div className="flex-1 overflow-y-auto space-y-1 pr-1">
          <p className="text-[10px] font-bold text-white/40 uppercase tracking-wider px-2 py-1">
            Recent Chats
          </p>

          {loadingList ? (
            <div className="py-8 text-center">
              <Loader2 className="w-5 h-5 animate-spin text-brand-400 mx-auto" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="py-8 text-center text-xs text-white/30">No conversations yet</div>
          ) : (
            conversations.map((conv) => {
              const isActive = conv.id === activeConversationId;
              return (
                <div
                  key={conv.id}
                  onClick={() => setActiveConversationId(conv.id)}
                  className={cn(
                    'p-3 rounded-xl cursor-pointer transition-all group flex items-start justify-between gap-2',
                    isActive
                      ? 'bg-brand-600/20 text-white border border-brand-500/30'
                      : 'hover:bg-white/[0.04] text-white/70 border border-transparent',
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate">{conv.title || 'Untitled Chat'}</p>
                    <p className="text-[10px] text-white/30 truncate mt-0.5">
                      {conv.lastMessage?.content || formatDate(conv.updatedAt)}
                    </p>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteMutation.mutate(conv.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 text-white/30 hover:text-rose-400 transition-all rounded"
                    title="Delete Chat"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Main Chat Panel */}
      <div className="flex-1 glass rounded-2xl border-white/[0.06] flex flex-col overflow-hidden">
        {/* Chat Header */}
        <div className="p-4 border-b border-white/[0.06] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-brand-600/20 text-brand-300 border border-brand-500/30">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">
                {activeConvData?.title || 'DocSaarthi Multilingual Assistant'}
              </h2>
              <p className="text-[10px] text-white/40 flex items-center gap-1.5">
                <Globe className="w-3 h-3 text-brand-400" /> Supports Hindi (हिंदी), English & Hinglish with Grounded Citations
              </p>
            </div>
          </div>
        </div>

        {/* Messages List Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {messages.length === 0 && !isStreaming ? (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-4 max-w-lg mx-auto py-12">
              <div className="w-12 h-12 rounded-2xl bg-brand-600/20 border border-brand-500/30 flex items-center justify-center text-brand-300 shadow-xl">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Ask Anything About Your Documents</h3>
                <p className="text-xs text-white/40 mt-1">
                  DocSaarthi analyzes your uploaded PDFs, invoices, receipts, and government notices with zero hallucination.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-2 w-full pt-2">
                {SUGGESTED_STARTERS.map((starter) => (
                  <button
                    key={starter}
                    onClick={() => handleSendMessage(starter)}
                    className="p-3 rounded-xl bg-white/[0.03] hover:bg-brand-600/10 border border-white/[0.06] hover:border-brand-500/30 text-xs text-left text-white/70 hover:text-brand-300 transition-all flex items-center justify-between group"
                  >
                    <span className="truncate">{starter}</span>
                    <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 shrink-0 text-brand-400" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <ChatMessageCard key={msg.id} message={msg} />
              ))}

              {/* Live Streaming Assistant Message */}
              {isStreaming && (
                <div className="flex items-start gap-3 animate-fade-in">
                  <div className="w-8 h-8 rounded-xl bg-brand-600/30 border border-brand-500/30 flex items-center justify-center text-brand-300 shrink-0">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="glass p-4 rounded-2xl border-white/[0.08] text-sm text-white/90 leading-relaxed">
                      {streamingText ? (
                        <FormattedMessage content={streamingText} />
                      ) : (
                        <span className="flex items-center gap-2 text-xs text-white/40">
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-400" />
                          DocSaarthi is thinking & searching documents...
                        </span>
                      )}
                    </div>
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
              placeholder="Ask in Hindi or English (e.g. इस नोटिस की अंतिम तारीख क्या है?)..."
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
    </div>
  );
}

function ChatMessageCard({ message }: { message: MessageItem }) {
  const isUser = message.role === 'USER';

  return (
    <div
      className={cn('flex items-start gap-3', {
        'justify-end': isUser,
      })}
    >
      {!isUser && (
        <div className="w-8 h-8 rounded-xl bg-brand-600/30 border border-brand-500/30 flex items-center justify-center text-brand-300 shrink-0">
          <Bot className="w-4 h-4" />
        </div>
      )}

      <div
        className={cn('max-w-2xl space-y-2', {
          'items-end': isUser,
        })}
      >
        <div
          className={cn('p-4 rounded-2xl text-sm leading-relaxed', {
            'bg-brand-600 text-white shadow-lg': isUser,
            'glass text-white/90 border-white/[0.08]': !isUser,
          })}
        >
          <FormattedMessage content={message.content} citations={message.citations} isUser={isUser} />
        </div>

        {/* Citations Card (if assistant message contains citations) */}
        {!isUser && message.citations && message.citations.length > 0 && (
          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] space-y-2">
            <p className="text-[10px] font-bold text-brand-300 uppercase tracking-wider flex items-center gap-1.5">
              <BookOpen className="w-3 h-3" /> Referenced Sources ({message.citations.length})
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {message.citations.map((cite, i) => (
                <Link
                  key={cite.chunkId || i}
                  href={`/documents/${cite.documentId}`}
                  className="p-2 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.04] transition-all flex items-center justify-between text-left group"
                >
                  <div className="min-w-0 pr-2">
                    <p className="text-[11px] font-medium text-white/90 truncate">
                      {cite.documentTitle || 'Document'}
                    </p>
                    <p className="text-[9px] text-white/40">Page {cite.pageNumber}</p>
                  </div>
                  <ExternalLink className="w-3 h-3 text-white/30 group-hover:text-brand-300 shrink-0" />
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {isUser && (
        <div className="w-8 h-8 rounded-xl bg-white/[0.08] border border-white/[0.1] flex items-center justify-center text-white/80 shrink-0">
          <UserIcon className="w-4 h-4" />
        </div>
      )}
    </div>
  );
}
