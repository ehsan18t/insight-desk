# Knowledge Base API

> API endpoints for managing articles, categories, and search in the self-service knowledge base

---

## Table of Contents

- [Overview](#overview)
- [Public Endpoints](#public-endpoints)
- [Admin Endpoints](#admin-endpoints)
- [Request/Response Schemas](#requestresponse-schemas)
- [Search](#search)
- [Article Versioning](#article-versioning)

---

## Overview

The Knowledge Base API supports:

- Public-facing article browsing and search
- Admin management of articles and categories
- Article versioning and publishing workflow
- Analytics for article effectiveness

### Authorization

| Role | Permissions |
|------|-------------|
| **Public** | Read published articles, search |
| **User** | Public + rate/feedback on articles |
| **Agent** | Public + view draft articles |
| **Admin** | Full CRUD on all content |

---

## Public Endpoints

### Categories

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET` | `/kb/categories` | List categories | ❌ |
| `GET` | `/kb/categories/:slug` | Get category details | ❌ |
| `GET` | `/kb/categories/:slug/articles` | List articles in category | ❌ |

### Articles

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET` | `/kb/articles` | List published articles | ❌ |
| `GET` | `/kb/articles/:slug` | Get article by slug | ❌ |
| `POST` | `/kb/articles/:id/feedback` | Submit article feedback | ❌ |
| `POST` | `/kb/articles/:id/rate` | Rate article helpfulness | ✅ User |

### Search

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET` | `/kb/search` | Search articles | ❌ |
| `GET` | `/kb/suggestions` | Get search suggestions | ❌ |

---

## Admin Endpoints

### Category Management

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET` | `/admin/kb/categories` | List all categories | ✅ Admin |
| `POST` | `/admin/kb/categories` | Create category | ✅ Admin |
| `GET` | `/admin/kb/categories/:id` | Get category by ID | ✅ Admin |
| `PATCH` | `/admin/kb/categories/:id` | Update category | ✅ Admin |
| `DELETE` | `/admin/kb/categories/:id` | Delete category | ✅ Admin |
| `POST` | `/admin/kb/categories/reorder` | Reorder categories | ✅ Admin |

### Article Management

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET` | `/admin/kb/articles` | List all articles | ✅ Admin |
| `POST` | `/admin/kb/articles` | Create article | ✅ Admin |
| `GET` | `/admin/kb/articles/:id` | Get article by ID | ✅ Admin |
| `PATCH` | `/admin/kb/articles/:id` | Update article | ✅ Admin |
| `DELETE` | `/admin/kb/articles/:id` | Delete article | ✅ Admin |
| `POST` | `/admin/kb/articles/:id/publish` | Publish article | ✅ Admin |
| `POST` | `/admin/kb/articles/:id/unpublish` | Unpublish article | ✅ Admin |
| `GET` | `/admin/kb/articles/:id/versions` | List article versions | ✅ Admin |
| `POST` | `/admin/kb/articles/:id/revert` | Revert to version | ✅ Admin |

### Analytics

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET` | `/admin/kb/analytics` | KB analytics overview | ✅ Admin |
| `GET` | `/admin/kb/articles/:id/analytics` | Article analytics | ✅ Admin |

---

## Request/Response Schemas

### GET /kb/categories

List all public categories.

**Response (200):**

```json
{
  "success": true,
  "data": [
    {
      "id": "cat_getting_started",
      "name": "Getting Started",
      "slug": "getting-started",
      "description": "Quick guides to help you get started",
      "icon": "rocket",
      "color": "#3B82F6",
      "articleCount": 12,
      "order": 1,
      "parentId": null,
      "children": [
        {
          "id": "cat_setup",
          "name": "Initial Setup",
          "slug": "initial-setup",
          "articleCount": 5
        }
      ]
    },
    {
      "id": "cat_faq",
      "name": "FAQ",
      "slug": "faq",
      "description": "Frequently asked questions",
      "icon": "help-circle",
      "color": "#10B981",
      "articleCount": 25,
      "order": 2,
      "parentId": null,
      "children": []
    }
  ]
}
```

---

### GET /kb/articles

List published articles.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | number | Page number (default: 1) |
| `perPage` | number | Items per page (default: 20) |
| `categoryId` | string | Filter by category |
| `tags` | string | Filter by tag(s), comma-separated |
| `featured` | boolean | Only featured articles |
| `sort` | string | Sort field |

**Sort Options:**

- `createdAt` / `-createdAt`
- `updatedAt` / `-updatedAt`
- `viewCount` / `-viewCount`
- `helpfulCount` / `-helpfulCount`
- `order`

**Response (200):**

```json
{
  "success": true,
  "data": [
    {
      "id": "art_001",
      "title": "How to Reset Your Password",
      "slug": "how-to-reset-password",
      "excerpt": "Learn how to reset your password in three simple steps...",
      "category": {
        "id": "cat_getting_started",
        "name": "Getting Started",
        "slug": "getting-started"
      },
      "author": {
        "id": "admin_123",
        "name": "Support Team"
      },
      "tags": ["password", "security", "account"],
      "featured": true,
      "viewCount": 1542,
      "helpfulCount": 89,
      "notHelpfulCount": 5,
      "publishedAt": "2024-01-10T10:00:00Z",
      "updatedAt": "2024-01-12T14:30:00Z"
    }
  ],
  "meta": {
    "pagination": {
      "page": 1,
      "perPage": 20,
      "totalPages": 3,
      "totalCount": 52
    }
  }
}
```

---

### GET /kb/articles/:slug

Get single article by slug.

**Response (200):**

```json
{
  "success": true,
  "data": {
    "id": "art_001",
    "title": "How to Reset Your Password",
    "slug": "how-to-reset-password",
    "content": "# How to Reset Your Password\n\nFollow these steps to reset your password...",
    "contentHtml": "<h1>How to Reset Your Password</h1><p>Follow these steps...</p>",
    "excerpt": "Learn how to reset your password in three simple steps...",
    "category": {
      "id": "cat_getting_started",
      "name": "Getting Started",
      "slug": "getting-started"
    },
    "author": {
      "id": "admin_123",
      "name": "Support Team",
      "avatarUrl": "https://..."
    },
    "tags": ["password", "security", "account"],
    "featured": true,
    "seoTitle": "Password Reset Guide | InsightDesk Help",
    "seoDescription": "Step-by-step guide to reset your InsightDesk password",
    "viewCount": 1543,
    "helpfulCount": 89,
    "notHelpfulCount": 5,
    "relatedArticles": [
      {
        "id": "art_002",
        "title": "Two-Factor Authentication Setup",
        "slug": "two-factor-authentication"
      },
      {
        "id": "art_003",
        "title": "Account Security Best Practices",
        "slug": "account-security"
      }
    ],
    "publishedAt": "2024-01-10T10:00:00Z",
    "updatedAt": "2024-01-12T14:30:00Z"
  }
}
```

---

### POST /admin/kb/articles

Create a new article (draft by default).

**Request:**

```json
{
  "title": "Getting Started with API Integration",
  "content": "# API Integration Guide\n\nThis guide will walk you through...",
  "categoryId": "cat_developers",
  "tags": ["api", "integration", "developers"],
  "excerpt": "Complete guide to integrating with our REST API",
  "seoTitle": "API Integration Guide | InsightDesk Developers",
  "seoDescription": "Learn how to integrate your application with InsightDesk API",
  "featured": false,
  "relatedArticleIds": ["art_001", "art_002"]
}
```

**Validation Schema:**

```typescript
const CreateArticleSchema = z.object({
  title: z.string().min(5).max(200),
  content: z.string().min(50).max(100000),
  categoryId: z.string(),
  tags: z.array(z.string()).max(10).optional(),
  excerpt: z.string().max(500).optional(),
  seoTitle: z.string().max(70).optional(),
  seoDescription: z.string().max(160).optional(),
  featured: z.boolean().default(false),
  relatedArticleIds: z.array(z.string()).max(5).optional(),
});
```

**Response (201):**

```json
{
  "success": true,
  "data": {
    "id": "art_new_001",
    "title": "Getting Started with API Integration",
    "slug": "getting-started-with-api-integration",
    "status": "draft",
    "version": 1,
    "createdAt": "2024-01-15T10:00:00Z",
    "updatedAt": "2024-01-15T10:00:00Z"
  }
}
```

---

### PATCH /admin/kb/articles/:id

Update an article (creates new version).

**Request:**

```json
{
  "title": "Updated: Getting Started with API Integration",
  "content": "# API Integration Guide v2\n\nUpdated content..."
}
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "id": "art_new_001",
    "title": "Updated: Getting Started with API Integration",
    "version": 2,
    "previousVersion": 1,
    "updatedAt": "2024-01-15T12:00:00Z"
  }
}
```

---

### POST /admin/kb/articles/:id/publish

Publish a draft article.

**Response (200):**

```json
{
  "success": true,
  "data": {
    "id": "art_new_001",
    "status": "published",
    "publishedAt": "2024-01-15T14:00:00Z"
  }
}
```

---

## Search

### GET /kb/search

Full-text search across articles.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `q` | string | Search query (required) |
| `categoryId` | string | Limit to category |
| `limit` | number | Max results (default: 10) |

**Response (200):**

```json
{
  "success": true,
  "data": {
    "query": "reset password",
    "results": [
      {
        "id": "art_001",
        "title": "How to Reset Your Password",
        "slug": "how-to-reset-password",
        "excerpt": "Learn how to <mark>reset</mark> your <mark>password</mark> in three simple steps...",
        "category": {
          "name": "Getting Started",
          "slug": "getting-started"
        },
        "score": 0.95,
        "highlights": [
          "Follow these steps to <mark>reset</mark> your <mark>password</mark>",
          "Click the \"<mark>Reset Password</mark>\" button"
        ]
      }
    ],
    "totalCount": 5,
    "searchTime": 23
  }
}
```

---

### GET /kb/suggestions

Get autocomplete suggestions.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `q` | string | Partial query (min 2 chars) |
| `limit` | number | Max suggestions (default: 5) |

**Response (200):**

```json
{
  "success": true,
  "data": {
    "suggestions": [
      "reset password",
      "reset account",
      "reset two-factor"
    ]
  }
}
```

---

## Article Versioning

### GET /admin/kb/articles/:id/versions

List all versions of an article.

**Response (200):**

```json
{
  "success": true,
  "data": [
    {
      "version": 3,
      "author": {
        "id": "admin_456",
        "name": "Jane Admin"
      },
      "changes": "Updated API examples",
      "createdAt": "2024-01-15T14:00:00Z"
    },
    {
      "version": 2,
      "author": {
        "id": "admin_123",
        "name": "John Admin"
      },
      "changes": "Fixed typos",
      "createdAt": "2024-01-14T10:00:00Z"
    },
    {
      "version": 1,
      "author": {
        "id": "admin_123",
        "name": "John Admin"
      },
      "changes": "Initial version",
      "createdAt": "2024-01-10T10:00:00Z"
    }
  ]
}
```

---

### POST /admin/kb/articles/:id/revert

Revert to a previous version.

**Request:**

```json
{
  "version": 1
}
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "id": "art_001",
    "version": 4,
    "revertedFrom": 3,
    "revertedTo": 1,
    "updatedAt": "2024-01-15T16:00:00Z"
  }
}
```

---

## Article Feedback

### POST /kb/articles/:id/feedback

Submit anonymous feedback on an article.

**Request:**

```json
{
  "feedback": "The steps in section 3 are outdated.",
  "email": "user@example.com"
}
```

**Response (201):**

```json
{
  "success": true,
  "data": {
    "message": "Thank you for your feedback!"
  }
}
```

---

### POST /kb/articles/:id/rate

Rate article helpfulness (authenticated users).

**Request:**

```json
{
  "helpful": true
}
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "helpfulCount": 90,
    "notHelpfulCount": 5
  }
}
```

---

## KB Analytics

### GET /admin/kb/analytics

Get knowledge base overview analytics.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `startDate` | ISO date | Period start |
| `endDate` | ISO date | Period end |

**Response (200):**

```json
{
  "success": true,
  "data": {
    "period": {
      "start": "2024-01-01",
      "end": "2024-01-31"
    },
    "overview": {
      "totalArticles": 52,
      "publishedArticles": 48,
      "draftArticles": 4,
      "totalViews": 15420,
      "uniqueVisitors": 8932,
      "avgTimeOnPage": 145,
      "helpfulnessRate": 0.92
    },
    "topArticles": [
      {
        "id": "art_001",
        "title": "How to Reset Your Password",
        "views": 1542,
        "helpfulRate": 0.95
      }
    ],
    "popularSearches": [
      { "query": "reset password", "count": 234 },
      { "query": "billing", "count": 189 },
      { "query": "api key", "count": 156 }
    ],
    "failedSearches": [
      { "query": "refund policy", "count": 45 },
      { "query": "mobile app", "count": 32 }
    ]
  }
}
```

---

## Related Documents

- [API Overview](./overview.md) — API design principles
- [Knowledge Base Module](../04-modules/knowledge-base/overview.md) — Implementation details

---

*Next: [Automation API →](./automation.md)*
