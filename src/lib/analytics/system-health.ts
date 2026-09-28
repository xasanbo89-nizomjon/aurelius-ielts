import "server-only";

import { prisma } from "@/lib/prisma";

export type DatabaseHealth = {
  status: "CONNECTED" | "ERROR";
  responseMs: number | null;
  sizeBytes: number | null;
  version: string | null;
};

/** A real, direct Postgres introspection query (pg_database_size) — not an estimate, and not a call to any external service. */
async function getDatabaseHealth(): Promise<DatabaseHealth> {
  const start = performance.now();
  try {
    const [sizeRow, versionRow] = await Promise.all([
      prisma.$queryRaw<{ size: bigint }[]>`SELECT pg_database_size(current_database()) AS size`,
      prisma.$queryRaw<{ version: string }[]>`SELECT version()`,
    ]);
    return {
      status: "CONNECTED",
      responseMs: Math.round(performance.now() - start),
      sizeBytes: Number(sizeRow[0]?.size ?? 0),
      version: versionRow[0]?.version.split(",")[0] ?? null,
    };
  } catch {
    return { status: "ERROR", responseMs: null, sizeBytes: null, version: null };
  }
}

export type SystemHealthSnapshot = {
  totalUsers: number;
  totalStudents: number;
  totalTeachers: number;
  activeSubscriptions: number;
  testsCompleted: number;
  articlesCount: number;
  aiRequestsCount: number;
  database: DatabaseHealth;
};

/**
 * Phase 31 — Part 6, Final System Health. "AI requests count" is a real,
 * durable sum across every table that already logs one real AI call each
 * (Explain More, Writing AI actions, Vocabulary AI actions, Writing
 * Analysis, AI-evaluated Speaking submissions) — not the in-memory,
 * per-process counter from Phase 29's Platform Health (that one resets on
 * restart; this one never does, since it's a real row count).
 */
export async function getSystemHealthSnapshot(): Promise<SystemHealthSnapshot> {
  const [
    studentCount,
    teacherCount,
    activeSubscriberIds,
    testsCompleted,
    articlesCount,
    explanationCount,
    writingActionCount,
    vocabAiCount,
    speakingEvalCount,
    writingAnalysisCount,
    database,
  ] = await Promise.all([
    prisma.studentProfile.count(),
    prisma.teacherProfile.count(),
    prisma.subscription.findMany({ where: { status: "ACTIVE" }, select: { studentId: true }, distinct: ["studentId"] }),
    prisma.result.count({ where: { completedAt: { not: null } } }),
    prisma.article.count(),
    prisma.aiExplanationRequest.count(),
    prisma.writingAiActionLog.count(),
    prisma.vocabularyAiActionLog.count(),
    prisma.speakingSubmission.count({ where: { status: "REVIEWED" } }),
    prisma.writingAnalysis.count(),
    getDatabaseHealth(),
  ]);

  return {
    totalUsers: studentCount + teacherCount,
    totalStudents: studentCount,
    totalTeachers: teacherCount,
    activeSubscriptions: activeSubscriberIds.length,
    testsCompleted,
    articlesCount,
    aiRequestsCount: explanationCount + writingActionCount + vocabAiCount + speakingEvalCount + writingAnalysisCount,
    database,
  };
}
