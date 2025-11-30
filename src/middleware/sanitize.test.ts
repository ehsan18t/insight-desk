/**
 * Sanitize Middleware Tests
 * Tests for input sanitization functions and middleware
 */

import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { escapeHtml, sanitizeInput, sanitizeObject, sanitizeSlug, stripHtml } from "./sanitize";

describe("sanitize middleware", () => {
  // ─────────────────────────────────────────────────────────────
  // escapeHtml
  // ─────────────────────────────────────────────────────────────
  describe("escapeHtml", () => {
    it("should escape < and > characters", () => {
      const input = "<script>alert('xss')</script>";
      const result = escapeHtml(input);

      expect(result).toBe("&lt;script&gt;alert(&#x27;xss&#x27;)&lt;&#x2F;script&gt;");
      expect(result).not.toContain("<");
      expect(result).not.toContain(">");
    });

    it("should escape & character", () => {
      const input = "Tom & Jerry";
      const result = escapeHtml(input);

      expect(result).toBe("Tom &amp; Jerry");
    });

    it("should escape double quotes", () => {
      const input = 'Say "hello"';
      const result = escapeHtml(input);

      expect(result).toBe("Say &quot;hello&quot;");
    });

    it("should escape single quotes", () => {
      const input = "It's working";
      const result = escapeHtml(input);

      expect(result).toBe("It&#x27;s working");
    });

    it("should escape forward slashes", () => {
      const input = "path/to/file";
      const result = escapeHtml(input);

      expect(result).toBe("path&#x2F;to&#x2F;file");
    });

    it("should handle multiple special characters", () => {
      const input = "<a href=\"test\" onclick='alert(1)'>Link & More</a>";
      const result = escapeHtml(input);

      expect(result).not.toContain("<");
      expect(result).not.toContain(">");
      expect(result).toContain("&lt;");
      expect(result).toContain("&gt;");
      expect(result).toContain("&quot;");
      expect(result).toContain("&#x27;");
      expect(result).toContain("&amp;");
    });

    it("should return non-string values unchanged", () => {
      expect(escapeHtml(null as unknown as string)).toBeNull();
      expect(escapeHtml(undefined as unknown as string)).toBeUndefined();
      expect(escapeHtml(123 as unknown as string)).toBe(123);
    });

    it("should handle empty string", () => {
      expect(escapeHtml("")).toBe("");
    });

    it("should handle string with no special characters", () => {
      const input = "Hello World";
      expect(escapeHtml(input)).toBe("Hello World");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // sanitizeObject
  // ─────────────────────────────────────────────────────────────
  describe("sanitizeObject", () => {
    it("should sanitize string values in object", () => {
      const input = {
        title: "<script>alert('xss')</script>",
        count: 42,
      };

      const result = sanitizeObject(input);

      expect(result.title).toBe("&lt;script&gt;alert(&#x27;xss&#x27;)&lt;&#x2F;script&gt;");
      expect(result.count).toBe(42);
    });

    it("should sanitize nested objects", () => {
      const input = {
        user: {
          name: "<b>John</b>",
          email: "john@test.com",
        },
      };

      const result = sanitizeObject(input);

      expect(result.user.name).toBe("&lt;b&gt;John&lt;&#x2F;b&gt;");
      expect(result.user.email).toBe("john@test.com");
    });

    it("should sanitize arrays", () => {
      const input = ["<script>", "normal", "<img onerror=alert(1)>"];

      const result = sanitizeObject(input);

      expect(result[0]).toBe("&lt;script&gt;");
      expect(result[1]).toBe("normal");
      expect(result[2]).toBe("&lt;img onerror=alert(1)&gt;");
    });

    it("should sanitize objects within arrays", () => {
      const input = [{ title: "<h1>Title</h1>" }, { title: "Normal Title" }];

      const result = sanitizeObject(input);

      expect(result[0].title).toBe("&lt;h1&gt;Title&lt;&#x2F;h1&gt;");
      expect(result[1].title).toBe("Normal Title");
    });

    it("should only sanitize specified fields when provided", () => {
      const input = {
        title: "<script>xss</script>",
        description: "<div>Description</div>",
        id: "<keep-this>",
      };

      const result = sanitizeObject(input, ["title", "description"]);

      expect(result.title).toBe("&lt;script&gt;xss&lt;&#x2F;script&gt;");
      expect(result.description).toBe("&lt;div&gt;Description&lt;&#x2F;div&gt;");
      expect(result.id).toBe("<keep-this>"); // Not sanitized
    });

    it("should handle null and undefined", () => {
      expect(sanitizeObject(null)).toBeNull();
      expect(sanitizeObject(undefined)).toBeUndefined();
    });

    it("should handle plain strings", () => {
      const input = "<script>alert(1)</script>";
      const result = sanitizeObject(input);

      expect(result).toBe("&lt;script&gt;alert(1)&lt;&#x2F;script&gt;");
    });

    it("should preserve non-string primitive values", () => {
      const input = {
        count: 42,
        active: true,
        nullable: null,
      };

      const result = sanitizeObject(input);

      expect(result.count).toBe(42);
      expect(result.active).toBe(true);
      expect(result.nullable).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // sanitizeInput middleware
  // ─────────────────────────────────────────────────────────────
  describe("sanitizeInput", () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let mockNext: NextFunction;

    beforeEach(() => {
      mockReq = { body: {} };
      mockRes = {};
      mockNext = vi.fn();
    });

    it("should sanitize default fields in request body", () => {
      mockReq.body = {
        title: "<script>xss</script>",
        description: "<div onclick=alert(1)>Desc</div>",
        count: 42,
      };

      const middleware = sanitizeInput();
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.body.title).toBe("&lt;script&gt;xss&lt;&#x2F;script&gt;");
      expect(mockReq.body.description).toBe("&lt;div onclick=alert(1)&gt;Desc&lt;&#x2F;div&gt;");
      expect(mockReq.body.count).toBe(42);
      expect(mockNext).toHaveBeenCalled();
    });

    it("should sanitize custom fields when specified", () => {
      mockReq.body = {
        customField: "<script>xss</script>",
        title: "<keep-this>",
      };

      const middleware = sanitizeInput({ fields: ["customField"] });
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.body.customField).toBe("&lt;script&gt;xss&lt;&#x2F;script&gt;");
      expect(mockReq.body.title).toBe("<keep-this>"); // Not in custom fields
      expect(mockNext).toHaveBeenCalled();
    });

    it("should sanitize all string fields when sanitizeAll is true", () => {
      mockReq.body = {
        anyField: "<script>xss</script>",
        anotherField: "<div>test</div>",
        number: 123,
      };

      const middleware = sanitizeInput({ sanitizeAll: true });
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.body.anyField).toBe("&lt;script&gt;xss&lt;&#x2F;script&gt;");
      expect(mockReq.body.anotherField).toBe("&lt;div&gt;test&lt;&#x2F;div&gt;");
      expect(mockReq.body.number).toBe(123);
      expect(mockNext).toHaveBeenCalled();
    });

    it("should handle missing body", () => {
      mockReq.body = undefined;

      const middleware = sanitizeInput();
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it("should handle non-object body", () => {
      mockReq.body = "plain string";

      const middleware = sanitizeInput();
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.body).toBe("plain string");
      expect(mockNext).toHaveBeenCalled();
    });

    it("should sanitize nested objects in body", () => {
      mockReq.body = {
        ticket: {
          title: "<script>xss</script>",
          description: "<div>Desc</div>",
        },
      };

      const middleware = sanitizeInput({ sanitizeAll: true });
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.body.ticket.title).toBe("&lt;script&gt;xss&lt;&#x2F;script&gt;");
      expect(mockReq.body.ticket.description).toBe("&lt;div&gt;Desc&lt;&#x2F;div&gt;");
      expect(mockNext).toHaveBeenCalled();
    });

    it("should sanitize common user input fields by default", () => {
      mockReq.body = {
        title: "<script>xss</script>",
        description: "<div>test</div>",
        content: "<p>content</p>",
        message: "<span>msg</span>",
        name: "<b>name</b>",
        subject: "<i>subject</i>",
        body: "<html>body</html>",
        text: "<code>text</code>",
        feedback: "<ul>feedback</ul>",
        reason: "<li>reason</li>",
        comment: "<strong>comment</strong>",
        // Non-default fields should not be sanitized
        customId: "<keep-me>",
      };

      const middleware = sanitizeInput();
      middleware(mockReq as Request, mockRes as Response, mockNext);

      // Default fields should be sanitized
      expect(mockReq.body.title).not.toContain("<");
      expect(mockReq.body.description).not.toContain("<");
      expect(mockReq.body.content).not.toContain("<");
      expect(mockReq.body.message).not.toContain("<");
      expect(mockReq.body.name).not.toContain("<");
      expect(mockReq.body.subject).not.toContain("<");
      expect(mockReq.body.body).not.toContain("<");
      expect(mockReq.body.text).not.toContain("<");
      expect(mockReq.body.feedback).not.toContain("<");
      expect(mockReq.body.reason).not.toContain("<");
      expect(mockReq.body.comment).not.toContain("<");

      // Non-default field should retain HTML
      expect(mockReq.body.customId).toBe("<keep-me>");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // stripHtml
  // ─────────────────────────────────────────────────────────────
  describe("stripHtml", () => {
    it("should remove HTML tags", () => {
      const input = "<div><p>Hello <strong>World</strong></p></div>";
      const result = stripHtml(input);

      expect(result).toBe("Hello World");
    });

    it("should handle self-closing tags", () => {
      const input = "Line 1<br/>Line 2<hr>Line 3";
      const result = stripHtml(input);

      expect(result).toBe("Line 1Line 2Line 3");
    });

    it("should handle script tags with content", () => {
      const input = '<script>alert("xss")</script>Hello';
      const result = stripHtml(input);

      expect(result).toBe('alert("xss")Hello');
    });

    it("should handle tags with attributes", () => {
      const input = '<a href="http://test.com" onclick="alert(1)">Link</a>';
      const result = stripHtml(input);

      expect(result).toBe("Link");
    });

    it("should handle empty input", () => {
      expect(stripHtml("")).toBe("");
    });

    it("should handle input with no HTML", () => {
      const input = "Plain text without HTML";
      expect(stripHtml(input)).toBe("Plain text without HTML");
    });

    it("should return non-string values unchanged", () => {
      expect(stripHtml(null as unknown as string)).toBeNull();
      expect(stripHtml(undefined as unknown as string)).toBeUndefined();
      expect(stripHtml(123 as unknown as string)).toBe(123);
    });

    it("should handle malformed tags", () => {
      const input = "<div<nested>text</div>";
      const result = stripHtml(input);

      // Malformed tags might not be fully stripped
      expect(result).not.toContain("</div>");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // sanitizeSlug
  // ─────────────────────────────────────────────────────────────
  describe("sanitizeSlug", () => {
    it("should convert to lowercase", () => {
      const input = "HELLO WORLD";
      const result = sanitizeSlug(input);

      expect(result).toBe("hello-world");
    });

    it("should replace spaces with hyphens", () => {
      const input = "hello world";
      const result = sanitizeSlug(input);

      expect(result).toBe("hello-world");
    });

    it("should remove special characters", () => {
      const input = "Hello! World? @2024";
      const result = sanitizeSlug(input);

      expect(result).toBe("hello-world-2024");
    });

    it("should collapse multiple hyphens into one", () => {
      const input = "hello---world";
      const result = sanitizeSlug(input);

      expect(result).toBe("hello-world");
    });

    it("should trim leading and trailing hyphens", () => {
      const input = "---hello-world---";
      const result = sanitizeSlug(input);

      expect(result).toBe("hello-world");
    });

    it("should handle unicode characters", () => {
      const input = "Café & Restaurant";
      const result = sanitizeSlug(input);

      // Unicode é becomes - and & becomes -, then multiple hyphens collapse
      expect(result).toBe("caf-restaurant");
    });

    it("should handle empty input", () => {
      expect(sanitizeSlug("")).toBe("");
    });

    it("should trim whitespace", () => {
      const input = "  hello world  ";
      const result = sanitizeSlug(input);

      expect(result).toBe("hello-world");
    });

    it("should return non-string values unchanged", () => {
      expect(sanitizeSlug(null as unknown as string)).toBeNull();
      expect(sanitizeSlug(undefined as unknown as string)).toBeUndefined();
    });

    it("should preserve numbers", () => {
      const input = "version 2.0";
      const result = sanitizeSlug(input);

      expect(result).toBe("version-2-0");
    });
  });
});
