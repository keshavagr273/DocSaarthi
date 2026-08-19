import { Controller, Get, Post, Query, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { SearchService } from './search.service';
import { SearchQueryDto, SemanticSearchDto, KeywordSearchDto } from './dto/search.dto';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@ApiTags('search')
@ApiBearerAuth('JWT')
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @ApiOperation({ summary: 'Search documents across semantic, keyword, or hybrid modes' })
  @ApiResponse({ status: 200, description: 'Search results returned' })
  async search(
    @Query() query: SearchQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.searchService.search(user.sub, query);
  }

  @Post('semantic')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Pure vector similarity search on document embeddings' })
  async semanticSearch(
    @Body() dto: SemanticSearchDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const results = await this.searchService.executeSemanticSearch(
      user.sub,
      dto.query,
      { documentId: dto.documentId, category: dto.category },
      dto.limit,
    );
    return { query: dto.query, mode: 'semantic', results, totalResults: results.length };
  }

  @Post('keyword')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Full-text and trigram keyword search' })
  async keywordSearch(
    @Body() dto: KeywordSearchDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const results = await this.searchService.executeKeywordSearch(
      user.sub,
      dto.query,
      { documentId: dto.documentId, category: dto.category },
      dto.limit,
    );
    return { query: dto.query, mode: 'keyword', results, totalResults: results.length };
  }
}
