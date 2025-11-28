# GitHub Copilot Instructions for InsightDesk

> **Project**: InsightDesk - Multi-tenant Customer Support Ticketing System  
> **Runtime**: Bun | **Framework**: Express 5.1 + TypeScript | **Database**: PostgreSQL + Drizzle ORM | **Auth**: better-auth

---

## 🎯 Core Principles

- This is **battle-tested production software** - write code accordingly
- Prioritize **reliability, security, and maintainability** over cleverness
- Follow **existing patterns** in the codebase - consistency is key
- When in doubt, check how similar features are implemented
- Always check for **deprecated APIs** and replace with newer alternatives

---

## ✅ After Every Task (MANDATORY)

1. **Run TypeScript check**: `bunx tsc --noEmit`
2. **Run linter**: `bun run lint`
3. **Run formatter**: `bun run format`
4. **Run tests**: `bun run test`
5. **Commit changes** with a descriptive message to maintain proper git history

**Never skip these steps. Every task must pass all checks before moving on.**

---

## 🏗️ Architecture Rules

### Project Structure
- Modules live in `src/modules/[feature]/` with routes, service, schema, and index files
- Database schema in `src/db/schema/` - tables and relations are separate files
- Shared utilities in `src/lib/`
- Middleware in `src/middleware/`
- Background jobs in `src/jobs/`

### Module Pattern
- Every module exports via `index.ts`
- Routes handle HTTP, services handle business logic
- Schemas define Zod validation
- Keep routes thin - logic belongs in services

---

## 🔐 Authentication & Authorization

- Use `authenticate` middleware for protected routes
- Use `requireRole()` for role-based access control
- Access user via `req.user`, organization via `req.organizationId`, role via `req.userRole`
- Role hierarchy: `customer < agent < admin < owner`
- Never trust client-side data - always validate server-side

---

## 🗄️ Database Rules

- Always use **UUID** for primary keys
- Always include `createdAt` and `updatedAt` timestamps with timezone
- Use `pgEnum` for enumerated values
- Add **indexes** for frequently queried columns
- Use **`returning()`** after insert/update to avoid extra queries
- Use **transactions** for multi-step operations
- Keep relations in `relations.ts` to avoid circular imports
- Never use raw SQL without parameterization

---

## ✏️ Code Style

### Naming
- Files: `kebab-case` (e.g., `ticket-activities.ts`)
- Variables/Functions: `camelCase`
- Types/Interfaces: `PascalCase`
- Constants: `SCREAMING_SNAKE_CASE`
- Database enums: `snake_case` values

### Imports (Biome-managed order)
1. External packages
2. Internal aliases (`@/`)
3. Relative imports

### Types
- **Never use `any`** - use `unknown` with type guards
- **Never use `null` in metadata objects** - use `undefined` instead
- Export types alongside schemas: `export type X = z.infer<typeof xSchema>`

---

## ⚠️ Error Handling

- Use custom error classes: `NotFoundError`, `ForbiddenError`, `BadRequestError`, `UnauthorizedError`, `ConflictError`
- Always wrap async route handlers in try-catch and call `next(error)`
- Never expose internal error details to clients
- Log errors with appropriate context for debugging

---

## 🧪 Testing Rules (CRITICAL)

- **Write both SUCCESS and FAILURE test cases** for every feature
- Test edge cases, boundary conditions, and error scenarios
- Mock database calls using `vi.mock("@/db")`
- Use `describe` blocks to group related tests
- Clear mocks in `beforeEach`
- Aim for meaningful coverage - test behavior, not implementation
- Never commit code without passing tests
- Test authorization - verify unauthorized access is denied
- Test validation - verify invalid input is rejected

---

## 📝 Validation Rules

- **Always validate** request body, query, and params with Zod schemas
- Use `z.coerce` for query parameters that need type conversion
- Provide meaningful error messages in schemas
- Use `.default()` for optional fields with defaults
- Export input types from schema files
- Validate file uploads (size, type, count)

---

## 🔄 API Response Format

- Success: `{ success: true, data: ..., pagination?: ... }`
- Created: `{ success: true, data: ... }` with status 201
- Error: `{ success: false, error: "message", details?: [...] }`
- Always use consistent response structure

---

## ⚡ Performance Rules

- Always use **pagination** for list endpoints
- Use database **indexes** for filtered/sorted columns
- **Batch operations** when processing multiple items
- Avoid N+1 queries - use proper joins or batch fetches
- Use `limit` on all queries
- Cache expensive computations when appropriate

---

## 🔒 Security Rules

- Sanitize all user input
- Use parameterized queries - never concatenate SQL
- Validate file uploads strictly
- Implement rate limiting on sensitive endpoints
- Never log sensitive data (passwords, tokens)
- Always verify organization context to prevent data leaks
- Use HTTPS in production

---

## 🚫 Things to Avoid

- Using `any` type
- Skipping validation
- Hardcoding values (use config/constants)
- Mixing route and business logic
- Using `null` where `undefined` is appropriate
- Exposing stack traces in production
- Writing tests that only cover happy paths
- Using deprecated APIs - always check for newer alternatives
- Committing without running quality checks
- Ignoring TypeScript errors

---

## 🔍 Code Quality Checks

- **Always check for deprecated code** and replace with newer APIs
- Review TypeScript errors before committing
- Ensure no linting warnings
- Verify tests pass before pushing
- Check for security vulnerabilities in dependencies
- Keep dependencies up to date

---

## 📋 New Feature Checklist

- [ ] Create Zod schema with validation
- [ ] Create service with business logic
- [ ] Create routes with proper middleware
- [ ] Create index.ts with exports
- [ ] Register route in app.ts
- [ ] Write SUCCESS test cases
- [ ] Write FAILURE/edge case tests
- [ ] Add database indexes if needed
- [ ] Add activity logging if user-facing
- [ ] Add real-time events if applicable
- [ ] Run TypeScript check: `bunx tsc --noEmit`
- [ ] Run linter: `bun run lint`
- [ ] Run formatter: `bun run format`
- [ ] Run tests: `bun run test`
- [ ] Commit with descriptive message

---

## 🛠️ Commands Reference

```bash
bun run dev           # Development server
bun run test          # Run tests
bun run lint          # Lint code
bun run format        # Format code
bunx tsc --noEmit     # TypeScript check
bun run db:generate   # Generate migrations
bun run db:migrate    # Run migrations
bun run db:studio     # Drizzle Studio
```

---

## 📚 Key Files Reference

- `src/app.ts` - Express app setup and route registration
- `src/db/schema/tables.ts` - All database table definitions
- `src/db/schema/relations.ts` - Drizzle relations
- `src/middleware/error-handler.ts` - Error classes and handler
- `src/middleware/validate.ts` - Zod validation middleware
- `src/modules/auth/auth.middleware.ts` - Authentication middleware

---

## 💡 Additional Guidelines

- Document complex business logic with comments
- Use meaningful variable and function names
- Keep functions small and focused
- Prefer composition over inheritance
- Handle promise rejections properly
- Use proper HTTP status codes
- Version control database migrations
- Write self-documenting code where possible
