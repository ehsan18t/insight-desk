# Testing Patterns Guide

> Best practices for writing effective unit tests in InsightDesk

This guide documents common testing patterns and anti-patterns to help maintain high-quality test coverage that actually verifies business logic.

---

## 🚫 Anti-Pattern: Mock Abuse

**Mock abuse** occurs when tests only verify that a mock returns what was mocked, without testing any actual business logic.

### ❌ Bad Example: Just Testing Mock Returns

```typescript
it("should return data", async () => {
  const mockData = [{ id: "1", name: "Test" }];
  vi.mocked(db.select).mockResolvedValue(mockData);
  
  const result = await service.getData();
  
  expect(result).toEqual(mockData); // ❌ Just testing the mock returns the mock!
});
```

This test proves nothing - it only confirms that vi.mocked returns what we told it to return.

### ✅ Good Example: Verify Business Logic

```typescript
it("should calculate total from items", async () => {
  const mockItems = [{ price: 100 }, { price: 50 }, { price: 25 }];
  vi.mocked(db.select).mockResolvedValue(mockItems);
  
  const result = await service.getTotal();
  
  expect(result).toBe(175); // ✅ Tests calculation logic, not mock returns
});

it("should filter inactive items", async () => {
  const mockItems = [
    { id: "1", isActive: true },
    { id: "2", isActive: false },
    { id: "3", isActive: true },
  ];
  vi.mocked(db.select).mockResolvedValue(mockItems);
  
  const result = await service.getActiveItems();
  
  expect(result).toHaveLength(2); // ✅ Verifies filtering logic
  expect(result.every(item => item.isActive)).toBe(true);
});
```

---

## ✅ Pattern: Verify Values Passed to Database

Instead of just checking what comes back, verify that the correct values are being passed to the database.

### Implementation Pattern

```typescript
it("should create tag with lowercase name", async () => {
  const valuesMock = vi.fn().mockReturnValue({
    returning: vi.fn().mockResolvedValue([{ id: "1", name: "my-tag" }]),
  });
  
  vi.mocked(db.insert).mockReturnValue({
    values: valuesMock,
  } as unknown as ReturnType<typeof db.insert>);
  
  await tagsService.create("org-123", { name: "MY-TAG" });
  
  // ✅ Verify the name was lowercased before insert
  expect(valuesMock).toHaveBeenCalledWith(
    expect.objectContaining({
      name: "my-tag", // lowercase!
      organizationId: "org-123",
    })
  );
});
```

---

## ✅ Pattern: Verify Pagination Calculations

For list operations, verify the pagination math is correct.

```typescript
it("should calculate pagination correctly", async () => {
  // Mock returns 45 total items
  vi.mocked(db.select).mockResolvedValueOnce([{ total: 45 }]);
  vi.mocked(db.select).mockResolvedValueOnce([]);
  
  const result = await service.list({ page: 2, limit: 20 });
  
  // ✅ Verify pagination calculation: ceil(45/20) = 3 pages
  expect(result.pagination.totalPages).toBe(3);
  expect(result.pagination.page).toBe(2);
  expect(result.pagination.limit).toBe(20);
});
```

---

## ✅ Pattern: Verify Error Handling

Always test error paths, not just happy paths.

```typescript
describe("getById", () => {
  it("should return item when found", async () => {
    vi.mocked(db.query.items.findFirst).mockResolvedValue({ id: "1" });
    
    const result = await service.getById("1");
    
    expect(result).toBeDefined();
  });
  
  // ✅ Always test error cases
  it("should throw NotFoundError when item not found", async () => {
    vi.mocked(db.query.items.findFirst).mockResolvedValue(undefined);
    
    await expect(service.getById("nonexistent")).rejects.toThrow(NotFoundError);
  });
  
  it("should throw ForbiddenError when unauthorized", async () => {
    vi.mocked(db.query.items.findFirst).mockResolvedValue({ 
      id: "1", 
      ownerId: "other-user" 
    });
    
    await expect(service.getById("1", "user-123")).rejects.toThrow(ForbiddenError);
  });
});
```

---

## ✅ Pattern: Test Complex Calculations

The best unit tests verify actual computation logic.

### Example: Dashboard Metrics (Good Test Model)

```typescript
// From dashboard.service.test.ts - this is a GOOD test
it("should calculate resolution rate correctly", async () => {
  vi.mocked(db.select).mockImplementation(() => ({
    from: () => ({
      where: vi.fn().mockResolvedValue([
        { status: "resolved", count: 75 },
        { status: "closed", count: 25 },
        { status: "open", count: 50 },
      ]),
    }),
  }) as never);
  
  const result = await dashboardService.getMetrics("org-123");
  
  // ✅ Verifies calculation: (75 + 25) / 150 * 100 = 66.67%
  expect(result.resolutionRate).toBeCloseTo(66.67, 1);
});
```

### Example: CSAT Score (Good Test Model)

```typescript
// From csat.service.test.ts - this is a GOOD test
it("should calculate average CSAT score", async () => {
  vi.mocked(db.query.csatResponses.findMany).mockResolvedValue([
    { rating: 5 },
    { rating: 4 },
    { rating: 3 },
    { rating: 5 },
    { rating: 4 },
  ]);
  
  const result = await csatService.getAverageScore("org-123");
  
  // ✅ Verifies average: (5+4+3+5+4) / 5 = 4.2
  expect(result.average).toBeCloseTo(4.2, 1);
  expect(result.total).toBe(5);
});
```

---

## ✅ Pattern: Verify Context Mapping

For audit logs and similar, verify context is correctly mapped.

```typescript
it("should map request context to audit log", async () => {
  const valuesMock = vi.fn().mockReturnValue({
    returning: vi.fn().mockResolvedValue([mockLog]),
  });
  
  vi.mocked(db.insert).mockReturnValue({
    values: valuesMock,
  } as unknown as ReturnType<typeof db.insert>);
  
  const context = {
    userId: "user-123",
    organizationId: "org-456",
    ipAddress: "192.168.1.1",
    userAgent: "Mozilla/5.0",
  };
  
  await auditService.create({ action: "login" }, context);
  
  // ✅ Verify all context fields are passed correctly
  expect(valuesMock).toHaveBeenCalledWith(
    expect.objectContaining({
      userId: "user-123",
      organizationId: "org-456",
      ipAddress: "192.168.1.1",
      userAgent: "Mozilla/5.0",
    })
  );
});
```

---

## ✅ Pattern: Verify Query Construction

For list operations with filters, verify the query structure.

```typescript
it("should call database with filter query", async () => {
  const findManyMock = vi.fn().mockResolvedValue([]);
  vi.mocked(db.query.tickets.findMany).mockImplementation(findManyMock);
  
  await ticketsService.list("org-123", { status: "open", priority: "high" });
  
  // ✅ Verify findMany was called (query was executed)
  expect(findManyMock).toHaveBeenCalled();
  // Verify db.query.tickets.findMany was used
  expect(db.query.tickets.findMany).toHaveBeenCalled();
});
```

---

## 📋 Test Checklist

For every service function, ensure you have tests for:

- [ ] **Success path** - Normal operation with valid inputs
- [ ] **NotFoundError** - Entity doesn't exist
- [ ] **ForbiddenError** - User lacks permission
- [ ] **BadRequestError** - Invalid input validation
- [ ] **Edge cases** - Empty arrays, null values, boundary conditions
- [ ] **Business logic** - Calculations, transformations, filters

---

## 🏆 Good Test File Examples

These files contain well-written tests that can serve as models:

| File                        | Notable Patterns                           |
| --------------------------- | ------------------------------------------ |
| `dashboard.service.test.ts` | Metric calculations, percentage math       |
| `csat.service.test.ts`      | Average/sum calculations, distribution     |
| `messages.service.test.ts`  | Permission checks, first response tracking |
| `export.service.test.ts`    | CSV escaping, field filtering              |

---

## 📚 References

- [Vitest Documentation](https://vitest.dev/)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)
- Project testing guidelines in `.github/copilot-instructions.md`
