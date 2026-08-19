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
    });
    this.chatModel = process.env['DEFAULT_LLM_MODEL'] ?? 'gpt-4o-mini';
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

    return conversation;
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
    const formattedContext = this.buildContext(retrievedChunks);
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

      try {
        const stream = await this.openai.chat.completions.create({
          model: this.chatModel,
          messages: messagesToSend,
          stream: true,
          temperature: 0.1,
          max_tokens: 1200,
        });

        for await (const chunk of stream) {
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

        // Link citations to message in DB
        await this.persistCitations(assistantMessage.id, retrievedChunks);

        // Update conversation timestamp & title if first message
        await this.db.conversation.update({
          where: { id: conversationId },
          data: {
            updatedAt: new Date(),
            ...(conversation.title === 'New Conversation' ? { title: query.slice(0, 40) } : {}),
          },
        });

        res.write(`data: ${JSON.stringify({ type: 'done', citations, messageId: assistantMessage.id })}\n\n`);
        res.end();
        return;
      } catch (err) {
        this.logger.error(`SSE Streaming failed: ${String(err)}`);
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

      await this.persistCitations(assistantMessage.id, retrievedChunks);

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

  private buildContext(chunks: SearchResultItem[]): string {
    if (chunks.length === 0) {
      return 'No relevant document context found.';
    }

    return chunks
      .map((c, idx) => {
        const sec = c.sectionTitle ? ` Section: ${c.sectionTitle},` : '';
        return `[Source ${idx + 1}: ${c.documentTitle}, Page ${c.pageNumber},${sec} Category: ${c.documentCategory ?? 'General'}]\n${c.snippet.replace(/\*\*/g, '')}`;
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
    const sourceMatches = answer.match(/\[Source\s*(\d+)\]/gi);

    if (sourceMatches) {
      for (const m of sourceMatches) {
        const numMatch = m.match(/\d+/);
        if (numMatch) {
          const idx = parseInt(numMatch[0]!, 10) - 1;
          const chunk = retrievedChunks[idx];
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
    }

    // If no explicit [Source N] tag in text, attach top 2 chunks as source context
    if (citations.length === 0 && retrievedChunks.length > 0) {
      return retrievedChunks.slice(0, 2).map((chunk) => ({
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

  private async persistCitations(
    messageId: string,
    retrievedChunks: SearchResultItem[],
  ): Promise<void> {
    const topChunks = retrievedChunks.slice(0, 3);

    for (const chunk of topChunks) {
      try {
        const version = await this.db.documentVersion.findFirst({
          where: { documentId: chunk.documentId },
          orderBy: { versionNumber: 'desc' },
          select: { id: true },
        });

        if (version) {
          await this.db.citation.create({
            data: {
              messageId,
              chunkId: chunk.chunkId,
              documentId: chunk.documentId,
              versionId: version.id,
              pageNumber: chunk.pageNumber,
              sectionTitle: chunk.sectionTitle,
              relevanceScore: chunk.finalScore,
            },
          });
        }
      } catch (err) {
        this.logger.warn(`Failed to persist citation: ${String(err)}`);
      }
    }
  }
}
