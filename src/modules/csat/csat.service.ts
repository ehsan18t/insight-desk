import crypto from "node:crypto";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { type CsatSurvey, csatSurveys, tickets } from "@/db/schema";
import { createLogger } from "@/lib/logger";
import { ForbiddenError, NotFoundError } from "@/middleware/error-handler";
import type { StatsQuery, SubmitSurveyInput, SurveyQuery } from "./csat.schema";

const logger = createLogger("csat");

// Survey expiration time (7 days)
const SURVEY_EXPIRATION_DAYS = 7;

// ─────────────────────────────────────────────────────────────
// Generate unique survey token
// ─────────────────────────────────────────────────────────────
function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

// ─────────────────────────────────────────────────────────────
// CSAT Service
// ─────────────────────────────────────────────────────────────
export const csatService = {
  // Send survey for a closed/resolved ticket
  async sendSurvey(
    ticketId: string,
    organizationId: string,
  ): Promise<CsatSurvey> {
    const ticket = await db.query.tickets.findFirst({
      where: and(
        eq(tickets.id, ticketId),
        eq(tickets.organizationId, organizationId),
      ),
    });

    if (!ticket) {
      throw new NotFoundError("Ticket not found");
    }

    if (!["resolved", "closed"].includes(ticket.status)) {
      throw new ForbiddenError("Survey can only be sent for resolved or closed tickets");
    }

    // Check if survey already exists
    const existing = await db.query.csatSurveys.findFirst({
      where: eq(csatSurveys.ticketId, ticketId),
    });

    if (existing) {
      throw new ForbiddenError("Survey already sent for this ticket");
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + SURVEY_EXPIRATION_DAYS);

    const [survey] = await db
      .insert(csatSurveys)
      .values({
        organizationId,
        ticketId,
        customerId: ticket.customerId,
        agentId: ticket.assigneeId,
        token: generateToken(),
        expiresAt,
      })
      .returning();

    logger.info({ surveyId: survey.id, ticketId }, "CSAT survey sent");

    return survey;
  },

  // Get survey by token (for anonymous access)
  async getByToken(token: string): Promise<CsatSurvey & { ticket: { ticketNumber: number; title: string } }> {
    const survey = await db.query.csatSurveys.findFirst({
      where: eq(csatSurveys.token, token),
      with: {
        ticket: {
          columns: { ticketNumber: true, title: true },
        },
      },
    });

    if (!survey) {
      throw new NotFoundError("Survey not found");
    }

    if (new Date() > survey.expiresAt) {
      throw new ForbiddenError("Survey has expired");
    }

    if (survey.respondedAt) {
      throw new ForbiddenError("Survey has already been submitted");
    }

    return survey as CsatSurvey & { ticket: { ticketNumber: number; title: string } };
  },

  // Submit survey response
  async submitResponse(
    token: string,
    input: SubmitSurveyInput,
  ): Promise<CsatSurvey> {
    const survey = await db.query.csatSurveys.findFirst({
      where: eq(csatSurveys.token, token),
    });

    if (!survey) {
      throw new NotFoundError("Survey not found");
    }

    if (new Date() > survey.expiresAt) {
      throw new ForbiddenError("Survey has expired");
    }

    if (survey.respondedAt) {
      throw new ForbiddenError("Survey has already been submitted");
    }

    const [updated] = await db
      .update(csatSurveys)
      .set({
        rating: input.rating,
        feedback: input.feedback,
        respondedAt: new Date(),
      })
      .where(eq(csatSurveys.id, survey.id))
      .returning();

    logger.info({ surveyId: survey.id, rating: input.rating }, "CSAT survey response submitted");

    return updated;
  },

  // List surveys for organization
  async list(
    organizationId: string,
    query: SurveyQuery,
  ): Promise<{ data: CsatSurvey[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
    const conditions = [eq(csatSurveys.organizationId, organizationId)];

    if (query.agentId) {
      conditions.push(eq(csatSurveys.agentId, query.agentId));
    }

    if (query.rating) {
      conditions.push(eq(csatSurveys.rating, query.rating));
    }

    if (query.dateFrom) {
      conditions.push(gte(csatSurveys.sentAt, new Date(query.dateFrom)));
    }

    if (query.dateTo) {
      conditions.push(lte(csatSurveys.sentAt, new Date(query.dateTo)));
    }

    if (query.responded !== undefined) {
      if (query.responded) {
        conditions.push(sql`${csatSurveys.respondedAt} IS NOT NULL`);
      } else {
        conditions.push(sql`${csatSurveys.respondedAt} IS NULL`);
      }
    }

    const offset = (query.page - 1) * query.limit;

    const [data, totalResult] = await Promise.all([
      db.query.csatSurveys.findMany({
        where: and(...conditions),
        orderBy: desc(csatSurveys.sentAt),
        limit: query.limit,
        offset,
        with: {
          customer: {
            columns: { id: true, name: true, email: true },
          },
          agent: {
            columns: { id: true, name: true },
          },
          ticket: {
            columns: { id: true, ticketNumber: true, title: true },
          },
        },
      }),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(csatSurveys)
        .where(and(...conditions)),
    ]);

    const total = totalResult[0]?.count || 0;

    return {
      data,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  },

  // Get survey by ID
  async getById(
    surveyId: string,
    organizationId: string,
  ): Promise<CsatSurvey | null> {
    const survey = await db.query.csatSurveys.findFirst({
      where: and(
        eq(csatSurveys.id, surveyId),
        eq(csatSurveys.organizationId, organizationId),
      ),
      with: {
        customer: {
          columns: { id: true, name: true, email: true },
        },
        agent: {
          columns: { id: true, name: true },
        },
        ticket: {
          columns: { id: true, ticketNumber: true, title: true },
        },
      },
    });

    return survey || null;
  },

  // Get CSAT statistics
  async getStats(
    organizationId: string,
    query: StatsQuery,
  ): Promise<{
    totalSurveys: number;
    respondedCount: number;
    responseRate: number;
    averageRating: number;
    ratingDistribution: { rating: number; count: number }[];
    npsScore: number;
  }> {
    const conditions = [eq(csatSurveys.organizationId, organizationId)];

    if (query.agentId) {
      conditions.push(eq(csatSurveys.agentId, query.agentId));
    }

    if (query.dateFrom) {
      conditions.push(gte(csatSurveys.sentAt, new Date(query.dateFrom)));
    }

    if (query.dateTo) {
      conditions.push(lte(csatSurveys.sentAt, new Date(query.dateTo)));
    }

    // Get basic stats
    const [statsResult] = await db
      .select({
        totalSurveys: sql<number>`count(*)::int`,
        respondedCount: sql<number>`count(${csatSurveys.rating})::int`,
        averageRating: sql<number>`coalesce(avg(${csatSurveys.rating})::numeric(10,2), 0)`,
      })
      .from(csatSurveys)
      .where(and(...conditions));

    // Get rating distribution
    const ratingDist = await db
      .select({
        rating: csatSurveys.rating,
        count: sql<number>`count(*)::int`,
      })
      .from(csatSurveys)
      .where(and(...conditions, sql`${csatSurveys.rating} IS NOT NULL`))
      .groupBy(csatSurveys.rating)
      .orderBy(csatSurveys.rating);

    // Calculate NPS-like score (promoters 4-5, detractors 1-2, passives 3)
    const promoters = ratingDist
      .filter((r) => r.rating !== null && r.rating >= 4)
      .reduce((sum, r) => sum + r.count, 0);
    const detractors = ratingDist
      .filter((r) => r.rating !== null && r.rating <= 2)
      .reduce((sum, r) => sum + r.count, 0);
    const totalResponded = statsResult?.respondedCount || 0;

    const npsScore =
      totalResponded > 0
        ? Math.round(((promoters - detractors) / totalResponded) * 100)
        : 0;

    return {
      totalSurveys: statsResult?.totalSurveys || 0,
      respondedCount: statsResult?.respondedCount || 0,
      responseRate:
        statsResult && statsResult.totalSurveys > 0
          ? Math.round((statsResult.respondedCount / statsResult.totalSurveys) * 100)
          : 0,
      averageRating: Number(statsResult?.averageRating || 0),
      ratingDistribution: ratingDist.map((r) => ({
        rating: r.rating || 0,
        count: r.count,
      })),
      npsScore,
    };
  },

  // Get agent performance stats
  async getAgentStats(
    organizationId: string,
    query: StatsQuery,
  ): Promise<
    {
      agentId: string;
      agentName: string;
      surveyCount: number;
      responseCount: number;
      averageRating: number;
    }[]
  > {
    const conditions = [
      eq(csatSurveys.organizationId, organizationId),
      sql`${csatSurveys.agentId} IS NOT NULL`,
    ];

    if (query.dateFrom) {
      conditions.push(gte(csatSurveys.sentAt, new Date(query.dateFrom)));
    }

    if (query.dateTo) {
      conditions.push(lte(csatSurveys.sentAt, new Date(query.dateTo)));
    }

    const results = await db.query.csatSurveys.findMany({
      where: and(...conditions),
      with: {
        agent: {
          columns: { id: true, name: true },
        },
      },
    });

    // Group by agent
    const agentMap = new Map<
      string,
      { name: string; ratings: number[]; total: number }
    >();

    for (const survey of results) {
      if (!survey.agentId || !survey.agent) continue;

      const existing = agentMap.get(survey.agentId);
      if (existing) {
        existing.total++;
        if (survey.rating) {
          existing.ratings.push(survey.rating);
        }
      } else {
        agentMap.set(survey.agentId, {
          name: survey.agent.name,
          total: 1,
          ratings: survey.rating ? [survey.rating] : [],
        });
      }
    }

    return Array.from(agentMap.entries())
      .map(([agentId, data]) => ({
        agentId,
        agentName: data.name,
        surveyCount: data.total,
        responseCount: data.ratings.length,
        averageRating:
          data.ratings.length > 0
            ? Number(
                (
                  data.ratings.reduce((sum, r) => sum + r, 0) / data.ratings.length
                ).toFixed(2),
              )
            : 0,
      }))
      .sort((a, b) => b.averageRating - a.averageRating);
  },
};
