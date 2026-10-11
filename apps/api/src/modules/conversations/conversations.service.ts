import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { Response } from 'express';
import OpenAI from 'openai';
import { DatabaseService, MessageRole } from '@docsaarthi/database';
import { SearchService, SearchResultItem } from '../search/search.service';
import { CreateConversationDto, SendMessageDto } from './dto/conversations.dto';

export interface CitationItem {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  pageNumber: number;
  sectionTitle: string | null;
  snippet: string;
}

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);
  private readonly openai: OpenAI;
  private readonly chatModel: string;

  constructor(
    private readonly db: DatabaseService,
    private readonly searchService: SearchService,
  ) {
    this.openai = new OpenAI({
      apiKey: process.env['OPENAI_API_KEY'] ?? '',
      baseURL: process.env['OPENAI_BASE_URL'] || undefined,
    });
    this.chatModel = process.env['DEFAULT_LLM_MODEL'] ?? 'openai/gpt-oss-120b';
  }

  // ── Conversation Management ───────────────────────────────────────

  async createConversation(userId: string, dto: CreateConversationDto) {
    let title = dto.title;

    if (!title && dto.documentId) {
      const doc = await this.db.document.findFirst({
        where: { id: dto.documentId, userId, isDeleted: false },
        select: { title: true },
      });
      if (doc) title = `Chat: ${doc.title}`;
    }

    const conversation = await this.db.conversation.create({
      data: {
        userId,
        documentId: dto.documentId,
        title: title ?? 'New Conversation',
        language: dto.language ?? 'en',
      },
      include: {
        document: {
          select: {
            id: true,
            title: true,
            originalFileName: true,
            category: true,
          },
        },
      },
    });

    return conversation;
  }

  async listConversations(userId: string) {
    const conversations = await this.db.conversation.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: {
        document: {
          select: {
            id: true,
            title: true,
            category: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            content: true,
            role: true,
            createdAt: true,
          },
        },
      },
    });

    return conversations.map((c: (typeof conversations)[number]) => ({
      id: c.id,
      title: c.title,
      language: c.language,
      documentId: c.documentId,
      document: c.document,
      lastMessage: c.messages[0] ?? null,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
  }

  async getConversation(userId: string, conversationId: string) {
    const conversation = await this.db.conversation.findFirst({
      where: { id: conversationId, userId },
      include: {
        document: {
          select: {
            id: true,
            title: true,
            category: true,
            primaryLanguage: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
          include: {
            citations: {
              include: {
                chunk: {
                  select: {
                    content: true,
                    pageNumber: true,
                    sectionTitle: true,
                    version: {
                      select: {
                        document: {
                          select: {
                            id: true,
                            title: true,
                            originalFileName: true,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    // Collect all document IDs in citations to ensure all titles are populated
    const docIds = new Set<string>();
    for (const msg of conversation.messages) {
      for (const cite of msg.citations) {
        if (cite.documentId) docIds.add(cite.documentId);
      }
    }

    const docs = await this.db.document.findMany({
      where: { id: { in: Array.from(docIds) } },
      select: { id: true, title: true, originalFileName: true },
    });
    const docMap = new Map(docs.map((d: { id: string; title: string; originalFileName: string }) => [d.id, d.title || d.originalFileName]));

    const enrichedMessages = conversation.messages.map((m: (typeof conversation.messages)[number]) => ({
      ...m,
      citations: m.citations.map((c: (typeof m.citations)[number]) => ({
        ...c,
        documentTitle:
          docMap.get(c.documentId) ??
          c.chunk?.version?.document?.title ??
          c.chunk?.version?.document?.originalFileName ??
          'Document',
      })),
    }));

    return {
      ...conversation,
      messages: enrichedMessages,
    };
  }

  async deleteConversation(userId: string, conversationId: string) {
    const conversation = await this.db.conversation.findFirst({
      where: { id: conversationId, userId },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    await this.db.conversation.delete({ where: { id: conversationId } });
    return { message: 'Conversation deleted successfully' };
  }

  // ── Send Message & Streaming RAG ──────────────────────────────────

  async handleSendMessage(
    userId: string,
    conversationId: string,
    dto: SendMessageDto,
    res?: Response,
  ) {
    const conversation = await this.db.conversation.findFirst({
      where: { id: conversationId, userId },
      include: {
        document: { select: { id: true, title: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 6,
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const query = dto.content.trim();
    const queryLang = this.detectLanguage(query);

    // 1. Save User Message
    const userMessage = await this.db.message.create({
      data: {
        conversationId,
        role: MessageRole.USER,
        content: query,
        language: queryLang,
      },
    });

    // 2. Retrieve Relevant Context via Hybrid Search
    const searchFilter = {
      documentId: conversation.documentId ?? undefined,
    };
    const retrievedChunks = await this.searchService.executeHybridSearch(
      userId,
      query,
      searchFilter,
      8,
    );

    // 3. Build RAG Context & Prompt
    const formattedContext = await this.buildContext(retrievedChunks);
    const systemPrompt = this.buildSystemPrompt(queryLang, conversation.document?.title);

    const historyMessages = conversation.messages.reverse().map((m: (typeof conversation.messages)[number]) => ({
      role: (m.role.toLowerCase() === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.content,
    }));

    const messagesToSend: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...historyMessages,
      {
        role: 'user',
        content: `DOCUMENT CONTEXT:\n${formattedContext}\n\nUSER QUESTION:\n${query}`,
      },
    ];

    // 4. Execute Streaming or Direct Response
    if (res && dto.stream !== false) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();

      let completeAnswer = '';

      // Stop generating if the client goes away. Without this the upstream
      // completion kept streaming (and kept being billed) after the browser
      // had disconnected, and every res.write() threw on a closed socket.
      let clientGone = false;
      res.on('close', () => {
        clientGone = true;
      });

      try {
        const stream = await this.openai.chat.completions.create({
          model: this.chatModel,
          messages: messagesToSend,
          stream: true,
          temperature: 0.1,
          max_tokens: 1200,
        });

        for await (const chunk of stream) {
          if (clientGone) {
            this.logger.log(
              `Client disconnected mid-stream for conversation ${conversationId} — aborting generation`,
            );
            await stream.controller.abort();
            break;
          }
          const delta = chunk.choices[0]?.delta?.content ?? '';
          if (delta) {
            completeAnswer += delta;
            res.write(`data: ${JSON.stringify({ type: 'token', content: delta })}\n\n`);
          }
        }

        // 5. Extract Citations & Persist
        const citations = await this.extractAndSaveCitations(
          completeAnswer,
          retrievedChunks,
        );

        // Save Assistant Message
        const assistantMessage = await this.db.message.create({
          data: {
            conversationId,
            role: MessageRole.ASSISTANT,
            content: completeAnswer,
            language: queryLang,
          },
        });

        // Link the citations the answer actually used to the message
        await this.persistCitations(assistantMessage.id, citations, retrievedChunks);

        // Update conversation timestamp & title if first message
        await this.db.conversation.update({
          where: { id: conversationId },
          data: {
            updatedAt: new Date(),
            ...(conversation.title === 'New Conversation' ? { title: query.slice(0, 40) } : {}),
          },
        });

        if (!clientGone && !res.writableEnded) {
          res.write(`data: ${JSON.stringify({ type: 'done', citations, messageId: assistantMessage.id })}\n\n`);
          res.end();
        }
        return;
      } catch (err) {
        this.logger.error(`SSE Streaming failed: ${String(err)}`);
        // Writing to an already-closed socket throws, which would turn a
        // handled failure into an unhandled rejection.
        if (clientGone || res.writableEnded) return;
        res.write(`data: ${JSON.stringify({ type: 'error', message: 'Failed to generate response' })}\n\n`);
        res.end();
        return;
      }
    } else {
      // Non-streaming fallback
      const response = await this.openai.chat.completions.create({
        model: this.chatModel,
        messages: messagesToSend,
        temperature: 0.1,
        max_tokens: 1200,
      });

      const completeAnswer = response.choices[0]?.message?.content ?? 'No response generated';
      const citations = this.matchCitations(completeAnswer, retrievedChunks);

      const assistantMessage = await this.db.message.create({
        data: {
          conversationId,
          role: MessageRole.ASSISTANT,
          content: completeAnswer,
          language: queryLang,
        },
      });

      await this.persistCitations(assistantMessage.id, citations, retrievedChunks);

      return {
        userMessage,
        assistantMessage: {
          ...assistantMessage,
          citations,
        },
      };
    }
  }

  // ── Helper: Prompt & Context Builder ──────────────────────────────

  private buildSystemPrompt(language: 'hi' | 'en', documentTitle?: string): string {
    const docScope = documentTitle ? `Scoped to document: "${documentTitle}".` : 'Accessing all user documents.';

    if (language === 'hi') {
      return `आप DocSaarthi हैं — एक बुद्धिमान, अत्यधिक सटीक भारतीय दस्तावेज़ सहायक।
${docScope}

नियम:
1. केवल दिए गए DOCUMENT CONTEXT के आधार पर ही उत्तर दें। कभी भी बाहरी या काल्पनिक जानकारी का उपयोग न करें।
2. यदि जानकारी संदर्भ में नहीं है, तो स्पष्ट कहें: "यह जानकारी आपके दस्तावेज़ों में नहीं मिली।"
3. तथ्यों का उल्लेख करते समय हमेशा स्रोत का संदर्भ दें: [Source N]
4. उत्तर शुद्ध और स्पष्ट हिंदी (देवनागरी) में दें।
5. संक्षिप्त, सटीक और सीधे मुद्दे पर उत्तर दें।`;
    }

    return `You are DocSaarthi — an intelligent, high-precision document intelligence assistant.
${docScope}

CRITICAL RULES:
1. ONLY answer based on the provided DOCUMENT CONTEXT. Never hallucinate or use external assumptions.
2. If the answer is not contained in the context, explicitly say: "I could not find this information in your documents."
3. Cite every fact using the source tags: [Source N: Title, Page X].
4. Respond in the same language as the question (clear English or Hindi).
5. Be concise, structured, and factual.`;
  }

  /**
   * Build the RAG context from the FULL text of each retrieved chunk.
   *
   * This used to use `c.snippet`, which is a ~200-character highlight window
   * built for the search UI. The model therefore saw a fragment of each chunk
   * rather than the chunk, and any fact outside that window was invisible —
   * a notice whose chunk plainly contained "Last Date for Submission:
   * 15-09-2026" still produced "I could not find this information in your
   * documents", because the deadline fell outside the snippet window.
   */
  private async buildContext(chunks: SearchResultItem[]): Promise<string> {
    if (chunks.length === 0) {
      return 'No relevant document context found.';
    }

    const rows = await this.db.documentChunk.findMany({
      where: { id: { in: chunks.map((c) => c.chunkId) } },
      select: { id: true, content: true },
    });
    const contentById = new Map(rows.map((r) => [r.id, r.content]));

    return chunks
      .map((c, idx) => {
        const sec = c.sectionTitle ? ` Section: ${c.sectionTitle},` : '';
        // Fall back to the snippet only if the chunk has since been deleted.
        const body = contentById.get(c.chunkId) ?? c.snippet;
        return (
          `[Source ${idx + 1}: ${c.documentTitle}, Page ${c.pageNumber},${sec} ` +
          `Category: ${c.documentCategory ?? 'General'}]\n${body.replace(/\*\*/g, '')}`
        );
      })
      .join('\n\n');
  }

  // ── Helper: Language Detection ────────────────────────────────────

  private detectLanguage(text: string): 'hi' | 'en' {
    // Count Devanagari characters (U+0900 to U+097F)
    const devanagariMatches = text.match(/[\u0900-\u097F]/g);
    const count = devanagariMatches ? devanagariMatches.length : 0;
    return count >= 3 ? 'hi' : 'en';
  }

  // ── Helper: Citations ─────────────────────────────────────────────

  private matchCitations(
    answer: string,
    retrievedChunks: SearchResultItem[],
  ): CitationItem[] {
    const citations: CitationItem[] = [];
    // Match [Source N...], 【Source N...】, or Source N
    const sourceRegex = /(?:\[|【)?Source\s*(\d+)[^\]】\n]*(?:\]|】)?/gi;
    const matches = Array.from(answer.matchAll(sourceRegex));

    if (matches.length > 0) {
      for (const m of matches) {
        const num = parseInt(m[1]!, 10);
        const chunk = retrievedChunks[num - 1];
        if (chunk && !citations.some((c) => c.chunkId === chunk.chunkId)) {
          citations.push({
            chunkId: chunk.chunkId,
            documentId: chunk.documentId,
            documentTitle: chunk.documentTitle,
            pageNumber: chunk.pageNumber,
            sectionTitle: chunk.sectionTitle,
            snippet: chunk.snippet,
          });
        }
      }
    }

    // If no explicit tags found in answer, fallback to top retrieved chunks
    if (citations.length === 0 && retrievedChunks.length > 0) {
      return retrievedChunks.slice(0, 3).map((chunk) => ({
        chunkId: chunk.chunkId,
        documentId: chunk.documentId,
        documentTitle: chunk.documentTitle,
        pageNumber: chunk.pageNumber,
        sectionTitle: chunk.sectionTitle,
        snippet: chunk.snippet,
      }));
    }

    return citations;
  }

  private async extractAndSaveCitations(
    answer: string,
    retrievedChunks: SearchResultItem[],
  ): Promise<CitationItem[]> {
    return this.matchCitations(answer, retrievedChunks);
  }

  /**
   * Persist the citations the answer actually used.
   *
   * This previously stored the top 3 *retrieved* chunks regardless of what
   * the answer cited, so the citations saved to the DB differed from the ones
   * returned to the caller — reopening a conversation showed a different set
   * of sources than the live response had.
   */
  private async persistCitations(
    messageId: string,
    citations: CitationItem[],
    retrievedChunks: SearchResultItem[],
  ): Promise<void> {
    if (citations.length === 0) return;

    const scoreByChunk = new Map(retrievedChunks.map((c) => [c.chunkId, c.finalScore]));

    // Resolve each chunk's own version. Looking up the document's newest
    // version instead pointed the citation at a version the chunk is not
    // part of, so the page number referred to a different page once a second
    // version had been uploaded.
    const chunkIds = citations.map((c) => c.chunkId);
    const chunks = await this.db.documentChunk.findMany({
      where: { id: { in: chunkIds } },
      select: { id: true, versionId: true },
    });
    const versionByChunk = new Map(chunks.map((c) => [c.id, c.versionId]));

    const rows = citations
      .map((citation) => {
        const versionId = versionByChunk.get(citation.chunkId);
        if (!versionId) {
          this.logger.warn(
            `Skipping citation for chunk ${citation.chunkId} — chunk no longer exists`,
          );
          return null;
        }
        return {
          messageId,
          chunkId: citation.chunkId,
          documentId: citation.documentId,
          versionId,
          pageNumber: citation.pageNumber,
          sectionTitle: citation.sectionTitle,
          relevanceScore: scoreByChunk.get(citation.chunkId) ?? null,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    if (rows.length === 0) return;

    try {
      await this.db.citation.createMany({ data: rows });
    } catch (err) {
      // Citations are supplementary — a failure here must not discard the
      // assistant message that was already generated and saved.
      this.logger.warn(`Failed to persist citations for message ${messageId}: ${String(err)}`);
    }
  }
}
