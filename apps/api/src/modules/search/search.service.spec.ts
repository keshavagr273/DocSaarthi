import { Test, TestingModule } from '@nestjs/testing';
import { SearchService } from './search.service';
import { DatabaseService } from '@docsaarthi/database';

describe('SearchService', () => {
  let service: SearchService;
  let db: {
    $queryRaw: jest.Mock;
  };

  beforeEach(async () => {
    db = {
      $queryRaw: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        { provide: DatabaseService, useValue: db },
      ],
    }).compile();

    service = module.get<SearchService>(SearchService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('executeSemanticSearch', () => {
    it('should query vector table and map rows correctly', async () => {
      db.$queryRaw.mockResolvedValue([
        {
          chunk_id: 'c1',
          document_id: 'd1',
          document_title: 'Internship Certificate.pdf',
          document_category: 'CERTIFICATE',
          page_number: 1,
          section_title: 'Main',
          content: 'This certifies that Keshav completed his internship at Neocortex.',
          semantic_score: 0.8521,
        },
      ]);

      const results = await service.executeSemanticSearch('u1', 'internship certificate', {}, 5);
      expect(results.length).toBe(1);
      expect(results[0].chunkId).toBe('c1');
      expect(results[0].documentTitle).toBe('Internship Certificate.pdf');
      expect(results[0].semanticScore).toBe(0.8521);
      expect(results[0].finalScore).toBe(0.8521);
      expect(results[0].snippet).toContain('internship');
    });
  });

  describe('executeKeywordSearch', () => {
    it('should return empty array on blank query', async () => {
      const results = await service.executeKeywordSearch('u1', '   ', {}, 5);
      expect(results).toEqual([]);
    });

    it('should query full-text search with term fallbacks and map scores', async () => {
      db.$queryRaw.mockResolvedValue([
        {
          chunk_id: 'c2',
          document_id: 'd2',
          document_title: 'Resume.pdf',
          document_category: 'EMPLOYMENT_DOCUMENT',
          page_number: 1,
          section_title: 'Skills',
          content: 'Full-stack software developer with expertise in TypeScript and Node.',
          keyword_score: 0.75,
        },
      ]);

      const results = await service.executeKeywordSearch('u1', 'TypeScript developer', {}, 5);
      expect(results.length).toBe(1);
      expect(results[0].documentTitle).toBe('Resume.pdf');
      expect(results[0].keywordScore).toBe(0.75);
      expect(results[0].snippet).toContain('TypeScript');
    });
  });

  describe('executeHybridSearch', () => {
    it('should fuse semantic and keyword scores with 60/40 weighting', async () => {
      // Mock semantic call
      jest.spyOn(service, 'executeSemanticSearch').mockResolvedValue([
        {
          chunkId: 'c1',
          documentId: 'd1',
          documentTitle: 'Doc1',
          documentCategory: 'CERTIFICATE',
          pageNumber: 1,
          sectionTitle: null,
          snippet: 'Snippet 1',
          semanticScore: 0.8,
          keywordScore: 0,
          finalScore: 0.8,
        },
      ]);

      // Mock keyword call
      jest.spyOn(service, 'executeKeywordSearch').mockResolvedValue([
        {
          chunkId: 'c1',
          documentId: 'd1',
          documentTitle: 'Doc1',
          documentCategory: 'CERTIFICATE',
          pageNumber: 1,
          sectionTitle: null,
          snippet: 'Snippet 1',
          semanticScore: 0,
          keywordScore: 0.5,
          finalScore: 0.5,
        },
      ]);

      const results = await service.executeHybridSearch('u1', 'search term', {}, 10);
      expect(results.length).toBe(1);
      // Both match chunk c1: normalized semantic = 1.0 (weight 0.6), normalized keyword = 1.0 (weight 0.4)
      // 1.0 * 0.6 + 1.0 * 0.4 = 1.0
      expect(results[0].finalScore).toBe(1);
      expect(results[0].semanticScore).toBe(1);
      expect(results[0].keywordScore).toBe(1);
    });
  });

  describe('search entry point', () => {
    it('should return valid search response with duration and totalResults', async () => {
      jest.spyOn(service, 'executeHybridSearch').mockResolvedValue([]);

      const response = await service.search('u1', { q: 'test query', mode: 'hybrid' });
      expect(response.query).toBe('test query');
      expect(response.mode).toBe('hybrid');
      expect(response.results).toEqual([]);
      expect(typeof response.searchDurationMs).toBe('number');
    });
  });
});
