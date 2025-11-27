# Knowledge Base Module

> Self-service article management, search, and analytics

---

## Table of Contents

- [Overview](#overview)
- [Directory Structure](#directory-structure)
- [Core Components](#core-components)
- [Search Implementation](#search-implementation)
- [Content Management](#content-management)
- [Analytics](#analytics)

---

## Overview

The Knowledge Base module provides:

- Article and category management
- Full-text search with relevance ranking
- Article versioning and publishing workflow
- Helpfulness tracking and feedback
- Search analytics and gap detection
- Related articles suggestions

---

## Directory Structure

```
modules/knowledge-base/
├── controllers/
│   ├── public.controller.ts     # Public article access
│   ├── articles.controller.ts   # Admin article CRUD
│   └── categories.controller.ts # Category management
├── services/
│   ├── article.service.ts       # Article operations
│   ├── category.service.ts      # Category operations
│   ├── search.service.ts        # Search functionality
│   ├── version.service.ts       # Article versioning
│   └── analytics.service.ts     # KB analytics
├── repositories/
│   ├── article.repository.ts
│   └── category.repository.ts
├── validators/
│   ├── article.validator.ts
│   └── category.validator.ts
├── search/
│   ├── indexer.ts               # Search indexing
│   └── query-builder.ts         # Search queries
├── types/
│   └── kb.types.ts
└── index.ts
```

---

## Core Components

### Article Service

```typescript
// services/article.service.ts
export class ArticleService {
  async create(data: CreateArticleInput, user: User): Promise<Article> {
    // Generate unique slug
    const slug = await this.generateUniqueSlug(data.title);

    // Render markdown to HTML
    const contentHtml = this.renderMarkdown(data.content);

    // Extract text for search
    const searchText = this.extractSearchText(contentHtml);

    // Create article
    const article = await this.articleRepo.create({
      title: data.title,
      slug,
      content: data.content,
      contentHtml,
      searchText,
      excerpt: data.excerpt || this.generateExcerpt(searchText),
      categoryId: data.categoryId,
      authorId: user.id,
      status: 'draft',
      version: 1,
      tags: data.tags || [],
      seoTitle: data.seoTitle,
      seoDescription: data.seoDescription,
      featured: data.featured || false,
    });

    // Create initial version
    await this.versionService.createVersion(article, user, 'Initial version');

    // Index for search
    await this.searchService.indexArticle(article);

    eventEmitter.emit('kb:article:created', { article, user });

    return article;
  }

  async publish(articleId: string, user: User): Promise<Article> {
    const article = await this.articleRepo.findById(articleId);

    if (article.status === 'published') {
      throw new ValidationError('Article already published');
    }

    const updated = await this.articleRepo.update(articleId, {
      status: 'published',
      publishedAt: new Date(),
      publishedById: user.id,
    });

    // Update search index
    await this.searchService.indexArticle(updated);

    eventEmitter.emit('kb:article:published', { article: updated, user });

    return updated;
  }

  async recordView(articleId: string, sessionId: string): Promise<void> {
    // Deduplicate views by session
    const viewKey = `kb:view:${articleId}:${sessionId}`;
    const alreadyViewed = await this.redis.exists(viewKey);

    if (!alreadyViewed) {
      await this.redis.setex(viewKey, 3600, '1'); // 1 hour dedup

      await this.articleRepo.incrementView(articleId);

      // Track in analytics
      await this.analyticsService.recordView(articleId);
    }
  }

  async recordFeedback(
    articleId: string,
    helpful: boolean,
    userId?: string
  ): Promise<void> {
    await this.articleRepo.incrementFeedback(articleId, helpful);

    await this.analyticsService.recordFeedback(articleId, helpful, userId);

    eventEmitter.emit('kb:article:feedback', {
      articleId,
      helpful,
      userId,
    });
  }

  private renderMarkdown(content: string): string {
    const html = marked.parse(content, {
      gfm: true,
      breaks: true,
      highlight: (code, lang) => {
        return hljs.highlightAuto(code, [lang]).value;
      },
    });

    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'hr',
        'strong', 'em', 'u', 's', 'code', 'pre',
        'ul', 'ol', 'li', 'blockquote',
        'a', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
      ],
      ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'id'],
    });
  }

  private generateExcerpt(text: string, maxLength = 200): string {
    const cleaned = text.replace(/\s+/g, ' ').trim();
    if (cleaned.length <= maxLength) return cleaned;
    return cleaned.substring(0, maxLength).replace(/\s+\S*$/, '...');
  }
}
```

---

## Search Implementation

### PostgreSQL Full-Text Search

```typescript
// search/indexer.ts
export class SearchIndexer {
  async indexArticle(article: Article): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE articles 
      SET search_vector = 
        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(excerpt, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(search_text, '')), 'C') ||
        setweight(to_tsvector('english', coalesce(array_to_string(tags, ' '), '')), 'B')
      WHERE id = ${article.id}
    `;
  }

  async reindexAll(): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE articles 
      SET search_vector = 
        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(excerpt, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(search_text, '')), 'C') ||
        setweight(to_tsvector('english', coalesce(array_to_string(tags, ' '), '')), 'B')
    `;
  }
}

// services/search.service.ts
export class SearchService {
  async search(
    query: string,
    options: SearchOptions = {}
  ): Promise<SearchResult> {
    const {
      categoryId,
      limit = 10,
      offset = 0,
    } = options;

    // Clean and prepare query
    const searchQuery = this.prepareQuery(query);

    // Build search SQL
    const results = await this.prisma.$queryRaw`
      SELECT 
        id,
        title,
        slug,
        excerpt,
        category_id,
        ts_rank(search_vector, plainto_tsquery('english', ${searchQuery})) as score,
        ts_headline(
          'english',
          search_text,
          plainto_tsquery('english', ${searchQuery}),
          'StartSel=<mark>, StopSel=</mark>, MaxWords=50, MinWords=20'
        ) as highlight
      FROM articles
      WHERE 
        status = 'published'
        AND search_vector @@ plainto_tsquery('english', ${searchQuery})
        ${categoryId ? Prisma.sql`AND category_id = ${categoryId}` : Prisma.empty}
      ORDER BY score DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    // Get total count
    const countResult = await this.prisma.$queryRaw`
      SELECT COUNT(*) as total
      FROM articles
      WHERE 
        status = 'published'
        AND search_vector @@ plainto_tsquery('english', ${searchQuery})
        ${categoryId ? Prisma.sql`AND category_id = ${categoryId}` : Prisma.empty}
    `;

    // Track search for analytics
    await this.analyticsService.recordSearch(query, results.length);

    return {
      query,
      results: results.map((r) => ({
        ...r,
        highlights: [r.highlight],
      })),
      totalCount: parseInt(countResult[0].total),
    };
  }

  async getSuggestions(partial: string): Promise<string[]> {
    if (partial.length < 2) return [];

    // Get from recent successful searches
    const cached = await this.redis.zrevrangebylex(
      'kb:suggestions',
      `[${partial}`,
      `[${partial}\xff`,
      'LIMIT',
      0,
      5
    );

    if (cached.length > 0) {
      return cached;
    }

    // Fallback to title prefix search
    const articles = await this.prisma.article.findMany({
      where: {
        status: 'published',
        title: { startsWith: partial, mode: 'insensitive' },
      },
      select: { title: true },
      take: 5,
    });

    return articles.map((a) => a.title.toLowerCase());
  }

  private prepareQuery(query: string): string {
    // Remove special characters, normalize whitespace
    return query
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }
}
```

---

## Content Management

### Version Service

```typescript
// services/version.service.ts
export class VersionService {
  async createVersion(
    article: Article,
    user: User,
    changes?: string
  ): Promise<ArticleVersion> {
    return this.prisma.articleVersion.create({
      data: {
        articleId: article.id,
        version: article.version,
        title: article.title,
        content: article.content,
        contentHtml: article.contentHtml,
        authorId: user.id,
        changes: changes || 'Updated',
      },
    });
  }

  async listVersions(articleId: string): Promise<ArticleVersion[]> {
    return this.prisma.articleVersion.findMany({
      where: { articleId },
      orderBy: { version: 'desc' },
      include: {
        author: { select: { id: true, name: true } },
      },
    });
  }

  async revertToVersion(
    articleId: string,
    targetVersion: number,
    user: User
  ): Promise<Article> {
    const version = await this.prisma.articleVersion.findFirst({
      where: { articleId, version: targetVersion },
    });

    if (!version) {
      throw new NotFoundError('Version not found');
    }

    const article = await this.prisma.article.findUnique({
      where: { id: articleId },
    });

    const newVersion = article.version + 1;

    // Update article with old content
    const updated = await this.prisma.article.update({
      where: { id: articleId },
      data: {
        title: version.title,
        content: version.content,
        contentHtml: version.contentHtml,
        version: newVersion,
        updatedAt: new Date(),
      },
    });

    // Create version record
    await this.createVersion(
      updated,
      user,
      `Reverted from v${article.version} to v${targetVersion}`
    );

    eventEmitter.emit('kb:article:reverted', {
      article: updated,
      fromVersion: article.version,
      toVersion: targetVersion,
      user,
    });

    return updated;
  }
}
```

### Category Service

```typescript
// services/category.service.ts
export class CategoryService {
  async create(data: CreateCategoryInput): Promise<Category> {
    const slug = await this.generateUniqueSlug(data.name);

    const category = await this.categoryRepo.create({
      name: data.name,
      slug,
      description: data.description,
      icon: data.icon,
      color: data.color,
      parentId: data.parentId,
      order: data.order || 0,
    });

    eventEmitter.emit('kb:category:created', { category });

    return category;
  }

  async getTree(): Promise<CategoryTree[]> {
    const categories = await this.categoryRepo.findAll();

    // Build tree structure
    const map = new Map<string, CategoryTree>();
    const roots: CategoryTree[] = [];

    for (const cat of categories) {
      map.set(cat.id, { ...cat, children: [] });
    }

    for (const cat of categories) {
      const node = map.get(cat.id)!;
      if (cat.parentId) {
        const parent = map.get(cat.parentId);
        if (parent) {
          parent.children.push(node);
        }
      } else {
        roots.push(node);
      }
    }

    // Sort by order
    const sortByOrder = (items: CategoryTree[]) => {
      items.sort((a, b) => a.order - b.order);
      for (const item of items) {
        sortByOrder(item.children);
      }
    };

    sortByOrder(roots);

    return roots;
  }

  async reorder(categoryOrders: { id: string; order: number }[]): Promise<void> {
    await this.prisma.$transaction(
      categoryOrders.map(({ id, order }) =>
        this.prisma.category.update({
          where: { id },
          data: { order },
        })
      )
    );

    eventEmitter.emit('kb:categories:reordered', { categoryOrders });
  }
}
```

---

## Analytics

### Analytics Service

```typescript
// services/analytics.service.ts
export class AnalyticsService {
  async recordView(articleId: string): Promise<void> {
    const today = new Date().toISOString().split('T')[0];

    await this.prisma.articleAnalytics.upsert({
      where: {
        articleId_date: { articleId, date: today },
      },
      create: {
        articleId,
        date: today,
        views: 1,
      },
      update: {
        views: { increment: 1 },
      },
    });
  }

  async recordSearch(query: string, resultCount: number): Promise<void> {
    const normalizedQuery = query.toLowerCase().trim();
    const today = new Date().toISOString().split('T')[0];

    await this.prisma.searchAnalytics.upsert({
      where: {
        query_date: { query: normalizedQuery, date: today },
      },
      create: {
        query: normalizedQuery,
        date: today,
        count: 1,
        hasResults: resultCount > 0,
      },
      update: {
        count: { increment: 1 },
      },
    });

    // Update suggestions index
    if (resultCount > 0) {
      await this.redis.zincrby('kb:suggestions', 1, normalizedQuery);
    }
  }

  async getOverview(startDate: Date, endDate: Date): Promise<KBOverview> {
    const [
      totalArticles,
      viewStats,
      searchStats,
      topArticles,
      failedSearches,
    ] = await Promise.all([
      this.prisma.article.count({ where: { status: 'published' } }),
      this.getViewStats(startDate, endDate),
      this.getSearchStats(startDate, endDate),
      this.getTopArticles(startDate, endDate),
      this.getFailedSearches(startDate, endDate),
    ]);

    return {
      totalArticles,
      ...viewStats,
      ...searchStats,
      topArticles,
      failedSearches,
    };
  }

  async getFailedSearches(
    startDate: Date,
    endDate: Date
  ): Promise<FailedSearch[]> {
    return this.prisma.searchAnalytics.findMany({
      where: {
        date: { gte: startDate.toISOString(), lte: endDate.toISOString() },
        hasResults: false,
      },
      orderBy: { count: 'desc' },
      take: 20,
    });
  }
}
```

---

## Related Documents

- [Knowledge Base API](../../03-api/knowledge-base.md) — API endpoints
- [Database Schema](../../02-database/schema.md) — Article data model
- [Search Optimization](../../09-performance/search.md) — Search tuning

---

*Next: [Automation Module →](../automation/overview.md)*
