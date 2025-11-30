/**
 * Email (Mailpit) Integration Tests
 *
 * Tests real email sending functionality using Mailpit as a test SMTP server.
 * Mailpit catches all emails and provides an API to inspect them.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import nodemailer, { type Transporter } from "nodemailer";
import {
  skipIntegrationTests,
  clearMailpit,
  getMailpitMessages,
  getMailpitMessage,
  TEST_CONFIG,
  type MailpitMessage,
} from "@/test/integration";

describe.skipIf(skipIntegrationTests())("Email Integration", () => {
  let transporter: Transporter;

  beforeAll(async () => {
    // Create nodemailer transporter for Mailpit
    transporter = nodemailer.createTransport({
      host: TEST_CONFIG.mailpit.smtpHost,
      port: TEST_CONFIG.mailpit.smtpPort,
      secure: false, // Mailpit doesn't use TLS
      auth: undefined, // No authentication needed
    });
  });

  beforeEach(async () => {
    // Clear all messages before each test
    await clearMailpit();
  });

  afterAll(async () => {
    // Clean up
    await clearMailpit();
    transporter.close();
  });

  // ─────────────────────────────────────────────────────────────
  // Connection Tests
  // ─────────────────────────────────────────────────────────────

  describe("Connection", () => {
    it("should connect to Mailpit SMTP server", async () => {
      const verified = await transporter.verify();
      expect(verified).toBe(true);
    });

    it("should access Mailpit API", async () => {
      const response = await fetch(`${TEST_CONFIG.mailpit.apiUrl}/api/v1/messages`);
      expect(response.ok).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Basic Email Tests
  // ─────────────────────────────────────────────────────────────

  describe("Basic Sending", () => {
    it("should send a simple text email", async () => {
      await transporter.sendMail({
        from: "test@insightdesk.com",
        to: "user@example.com",
        subject: "Test Email",
        text: "This is a test email.",
      });

      // Wait for email to arrive
      await sleep(500);

      const messages = await getMailpitMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0].Subject).toBe("Test Email");
      expect(messages[0].From.Address).toBe("test@insightdesk.com");
      expect(messages[0].To[0].Address).toBe("user@example.com");
    });

    it("should send an HTML email", async () => {
      const htmlContent = `
        <html>
          <body>
            <h1>Welcome!</h1>
            <p>This is an <strong>HTML</strong> email.</p>
          </body>
        </html>
      `;

      await transporter.sendMail({
        from: "noreply@insightdesk.com",
        to: "customer@example.com",
        subject: "HTML Test Email",
        html: htmlContent,
      });

      await sleep(500);

      const messages = await getMailpitMessages();
      expect(messages).toHaveLength(1);

      // Get full message details
      const message = await getMailpitMessage(messages[0].ID);
      expect(message?.HTML).toContain("<h1>Welcome!</h1>");
      expect(message?.HTML).toContain("<strong>HTML</strong>");
    });

    it("should send email with both text and HTML", async () => {
      await transporter.sendMail({
        from: "test@insightdesk.com",
        to: "user@example.com",
        subject: "Multipart Email",
        text: "Plain text version",
        html: "<p>HTML version</p>",
      });

      await sleep(500);

      const messages = await getMailpitMessages();
      const message = await getMailpitMessage(messages[0].ID);

      expect(message?.Text).toContain("Plain text version");
      expect(message?.HTML).toContain("HTML version");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Recipients Tests
  // ─────────────────────────────────────────────────────────────

  describe("Recipients", () => {
    it("should send to multiple recipients", async () => {
      await transporter.sendMail({
        from: "test@insightdesk.com",
        to: ["user1@example.com", "user2@example.com"],
        subject: "Multiple Recipients",
        text: "Sent to multiple people",
      });

      await sleep(500);

      // Mailpit creates separate messages for each recipient
      const messages = await getMailpitMessages();
      expect(messages.length).toBeGreaterThanOrEqual(1);

      const recipients = messages.flatMap((m: MailpitMessage) => m.To.map((t) => t.Address));
      expect(recipients).toContain("user1@example.com");
    });

    it("should send with CC recipients", async () => {
      await transporter.sendMail({
        from: "test@insightdesk.com",
        to: "main@example.com",
        cc: "cc@example.com",
        subject: "Email with CC",
        text: "CC test",
      });

      await sleep(500);

      const messages = await getMailpitMessages();
      expect(messages.length).toBeGreaterThanOrEqual(1);
    });

    it("should send with named recipients", async () => {
      await transporter.sendMail({
        from: '"InsightDesk Support" <support@insightdesk.com>',
        to: '"John Doe" <john@example.com>',
        subject: "Named Recipients Test",
        text: "Testing named recipients",
      });

      await sleep(500);

      const messages = await getMailpitMessages();
      expect(messages[0].From.Name).toBe("InsightDesk Support");
      expect(messages[0].From.Address).toBe("support@insightdesk.com");
      expect(messages[0].To[0].Name).toBe("John Doe");
      expect(messages[0].To[0].Address).toBe("john@example.com");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Template Email Tests
  // ─────────────────────────────────────────────────────────────

  describe("Template Emails", () => {
    it("should send ticket created notification", async () => {
      const ticketData = {
        ticketId: "TKT-001",
        subject: "Login issue",
        customerName: "John Doe",
        organizationName: "Acme Corp",
      };

      await transporter.sendMail({
        from: '"Acme Corp Support" <support@acmecorp.com>',
        to: "john.doe@example.com",
        subject: `[${ticketData.ticketId}] Your support request has been received`,
        html: `
          <h1>Support Request Received</h1>
          <p>Hello ${ticketData.customerName},</p>
          <p>Your support request has been received and assigned ticket number <strong>${ticketData.ticketId}</strong>.</p>
          <p><strong>Subject:</strong> ${ticketData.subject}</p>
          <p>Our team will review your request and respond as soon as possible.</p>
          <p>Thank you for contacting ${ticketData.organizationName} Support.</p>
        `,
      });

      await sleep(500);

      const messages = await getMailpitMessages();
      const message = await getMailpitMessage(messages[0].ID);

      expect(messages[0].Subject).toContain("TKT-001");
      expect(message?.HTML).toContain("Login issue");
      expect(message?.HTML).toContain("John Doe");
    });

    it("should send ticket reply notification", async () => {
      await transporter.sendMail({
        from: '"Support Team" <support@insightdesk.com>',
        to: "customer@example.com",
        subject: "[TKT-002] New reply to your support request",
        html: `
          <h1>New Reply on Your Ticket</h1>
          <p>Agent Sarah has replied to your ticket:</p>
          <blockquote style="border-left: 3px solid #ccc; padding-left: 10px;">
            Have you tried clearing your browser cache and cookies?
          </blockquote>
          <p>You can reply directly to this email or visit your support portal.</p>
        `,
      });

      await sleep(500);

      const messages = await getMailpitMessages();
      const message = await getMailpitMessage(messages[0].ID);

      expect(messages[0].Subject).toContain("TKT-002");
      expect(message?.HTML).toContain("Agent Sarah");
      expect(message?.HTML).toContain("clearing your browser cache");
    });

    it("should send organization invitation", async () => {
      const inviteUrl = "https://app.insightdesk.com/invite/abc123";

      await transporter.sendMail({
        from: '"InsightDesk" <invites@insightdesk.com>',
        to: "newuser@example.com",
        subject: "You've been invited to join Acme Corp on InsightDesk",
        html: `
          <h1>You're Invited!</h1>
          <p>You've been invited to join <strong>Acme Corp</strong> on InsightDesk as an <strong>Agent</strong>.</p>
          <p><a href="${inviteUrl}" style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Accept Invitation</a></p>
          <p>This invitation will expire in 7 days.</p>
        `,
      });

      await sleep(500);

      const messages = await getMailpitMessages();
      const message = await getMailpitMessage(messages[0].ID);

      expect(messages[0].Subject).toContain("invited to join Acme Corp");
      expect(message?.HTML).toContain(inviteUrl);
      expect(message?.HTML).toContain("Agent");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Real-world Scenarios
  // ─────────────────────────────────────────────────────────────

  describe("Real-world Scenarios", () => {
    it("should handle multiple emails in sequence", async () => {
      // Clear any existing
      await clearMailpit();

      // Send multiple emails
      for (let i = 1; i <= 3; i++) {
        await transporter.sendMail({
          from: "test@insightdesk.com",
          to: `user${i}@example.com`,
          subject: `Email ${i}`,
          text: `Content ${i}`,
        });
      }

      await sleep(1000);

      const messages = await getMailpitMessages();
      expect(messages.length).toBe(3);
    });

    it("should send SLA breach notification", async () => {
      await transporter.sendMail({
        from: '"InsightDesk Alerts" <alerts@insightdesk.com>',
        to: "manager@acmecorp.com",
        subject: "⚠️ SLA Breach Alert: TKT-123",
        html: `
          <div style="background: #fff3cd; border: 1px solid #ffc107; padding: 15px; border-radius: 5px;">
            <h2 style="color: #856404;">⚠️ SLA Breach Alert</h2>
            <p>Ticket <strong>TKT-123</strong> has breached its SLA response time.</p>
            <table>
              <tr><td>Ticket ID:</td><td>TKT-123</td></tr>
              <tr><td>Subject:</td><td>Server down</td></tr>
              <tr><td>Priority:</td><td>High</td></tr>
              <tr><td>SLA Policy:</td><td>Premium Support</td></tr>
              <tr><td>Response Due:</td><td>2024-01-01 10:00 AM</td></tr>
              <tr><td>Current Time:</td><td>2024-01-01 11:30 AM</td></tr>
            </table>
            <p><a href="https://app.insightdesk.com/tickets/TKT-123">View Ticket</a></p>
          </div>
        `,
      });

      await sleep(500);

      const messages = await getMailpitMessages();
      const message = await getMailpitMessage(messages[0].ID);

      expect(messages[0].Subject).toContain("SLA Breach");
      expect(message?.HTML).toContain("TKT-123");
      expect(message?.HTML).toContain("Premium Support");
    });

    it("should send CSAT survey email", async () => {
      await transporter.sendMail({
        from: '"Acme Corp" <support@acmecorp.com>',
        to: "customer@example.com",
        subject: "How did we do? Rate your support experience",
        html: `
          <h1>How was your support experience?</h1>
          <p>Your ticket <strong>#TKT-456</strong> has been resolved.</p>
          <p>Please take a moment to rate your experience:</p>
          <div style="text-align: center;">
            <a href="https://app.insightdesk.com/csat/abc123?rating=1">😞</a>
            <a href="https://app.insightdesk.com/csat/abc123?rating=2">😐</a>
            <a href="https://app.insightdesk.com/csat/abc123?rating=3">🙂</a>
            <a href="https://app.insightdesk.com/csat/abc123?rating=4">😊</a>
            <a href="https://app.insightdesk.com/csat/abc123?rating=5">😍</a>
          </div>
        `,
      });

      await sleep(500);

      const messages = await getMailpitMessages();
      const message = await getMailpitMessage(messages[0].ID);

      expect(messages[0].Subject).toContain("Rate your support");
      expect(message?.HTML).toContain("TKT-456");
      expect(message?.HTML).toContain("csat/abc123?rating=5");
    });
  });
});

// Helper function
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
