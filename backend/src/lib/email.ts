import nodemailer, { type Transporter } from 'nodemailer';
import { config } from '../config';
import { createLogger } from './logger';

const logger = createLogger('email');

// Initialize nodemailer transporter
let transporter: Transporter | null = null;

// Create transporter based on environment
function getTransporter(): Transporter | null {
  if (transporter) return transporter;

  // For development, use ethereal (fake SMTP) or console logging
  if (config.NODE_ENV === 'development' && !config.SMTP_HOST) {
    logger.warn('SMTP not configured - emails will be logged only');
    return null;
  }

  if (config.SMTP_HOST && config.SMTP_PORT) {
    transporter = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_SECURE,
      auth:
        config.SMTP_USER && config.SMTP_PASS
          ? {
              user: config.SMTP_USER,
              pass: config.SMTP_PASS,
            }
          : undefined,
    });
    return transporter;
  }

  return null;
}

// Email templates
export type EmailTemplate =
  | 'ticket-created'
  | 'ticket-reply'
  | 'ticket-assigned'
  | 'ticket-resolved'
  | 'welcome'
  | 'password-reset'
  | 'email-verification';

interface EmailData {
  to: string;
  subject: string;
  html: string;
}

// Send email function
export async function sendEmail(data: EmailData): Promise<boolean> {
  const transport = getTransporter();

  if (!transport) {
    logger.warn('Email not sent - SMTP not configured');
    logger.debug({ to: data.to, subject: data.subject }, 'Would send email');
    return false;
  }

  try {
    const result = await transport.sendMail({
      from: config.EMAIL_FROM,
      to: data.to,
      subject: data.subject,
      html: data.html,
    });

    logger.info(
      { to: data.to, subject: data.subject, messageId: result.messageId },
      'Email sent'
    );
    return true;
  } catch (error) {
    logger.error({ error }, 'Email send error');
    return false;
  }
}

// Template-based email sending
export async function sendTemplateEmail(
  template: EmailTemplate,
  to: string,
  data: Record<string, unknown>
): Promise<boolean> {
  const email = renderTemplate(template, data);
  return sendEmail({ to, ...email });
}

// Simple template renderer
function renderTemplate(
  template: EmailTemplate,
  data: Record<string, unknown>
): { subject: string; html: string } {
  const templates: Record<EmailTemplate, { subject: string; html: string }> = {
    'ticket-created': {
      subject: `Ticket #${data.ticketNumber} Created - ${data.title}`,
      html: `
        <h2>Your support ticket has been created</h2>
        <p><strong>Subject:</strong> ${data.title}</p>
        <p>${data.description}</p>
        <p><a href="${config.FRONTEND_URL}/tickets/${data.ticketId}">View Ticket</a></p>
      `,
    },
    'ticket-reply': {
      subject: `New reply on Ticket #${data.ticketNumber}`,
      html: `
        <h2>New message on your ticket</h2>
        <p><strong>From:</strong> ${data.senderName}</p>
        <p>${data.preview}</p>
        <p><a href="${config.FRONTEND_URL}/tickets/${data.ticketId}">View Conversation</a></p>
      `,
    },
    'ticket-assigned': {
      subject: `Ticket #${data.ticketNumber} assigned to you`,
      html: `
        <h2>A ticket has been assigned to you</h2>
        <p><strong>Subject:</strong> ${data.title}</p>
        <p><a href="${config.FRONTEND_URL}/tickets/${data.ticketId}">View Ticket</a></p>
      `,
    },
    'ticket-resolved': {
      subject: `Ticket #${data.ticketNumber} Resolved`,
      html: `
        <h2>Your ticket has been resolved</h2>
        <p>If you have any more questions, feel free to reply.</p>
        <p><a href="${config.FRONTEND_URL}/tickets/${data.ticketId}">View Ticket</a></p>
      `,
    },
    welcome: {
      subject: 'Welcome to InsightDesk!',
      html: `
        <h2>Welcome, ${data.name}!</h2>
        <p>Your account has been created successfully.</p>
        <p><a href="${config.FRONTEND_URL}">Get Started</a></p>
      `,
    },
    'password-reset': {
      subject: 'Reset Your Password',
      html: `
        <h2>Password Reset Request</h2>
        <p>Click the link below to reset your password:</p>
        <p><a href="${data.resetUrl}">Reset Password</a></p>
        <p>This link expires in 1 hour.</p>
      `,
    },
    'email-verification': {
      subject: 'Verify Your Email',
      html: `
        <h2>Verify Your Email Address</h2>
        <p>Click the link below to verify your email:</p>
        <p><a href="${data.verifyUrl}">Verify Email</a></p>
      `,
    },
  };

  return templates[template];
}
