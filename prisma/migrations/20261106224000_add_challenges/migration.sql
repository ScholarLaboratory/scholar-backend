CREATE TYPE "ChallengeStatus" AS ENUM ('PENDING', 'ACTIVE', 'COMPLETED', 'DECLINED');

CREATE TABLE "Challenge" (
  "id" TEXT NOT NULL,
  "challengerId" TEXT NOT NULL,
  "opponentId" TEXT NOT NULL,
  "topicId" TEXT NOT NULL,
  "questionCount" INTEGER NOT NULL DEFAULT 10,
  "status" "ChallengeStatus" NOT NULL DEFAULT 'PENDING',
  "challengerQuizId" TEXT,
  "opponentQuizId" TEXT,
  "winnerId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acceptedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "Challenge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Challenge_challengerQuizId_key" ON "Challenge"("challengerQuizId");
CREATE UNIQUE INDEX "Challenge_opponentQuizId_key" ON "Challenge"("opponentQuizId");
CREATE INDEX "Challenge_challengerId_createdAt_idx" ON "Challenge"("challengerId", "createdAt");
CREATE INDEX "Challenge_opponentId_status_idx" ON "Challenge"("opponentId", "status");

ALTER TABLE "Challenge" ADD CONSTRAINT "Challenge_challengerId_fkey"
  FOREIGN KEY ("challengerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Challenge" ADD CONSTRAINT "Challenge_opponentId_fkey"
  FOREIGN KEY ("opponentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Challenge" ADD CONSTRAINT "Challenge_topicId_fkey"
  FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Challenge" ADD CONSTRAINT "Challenge_challengerQuizId_fkey"
  FOREIGN KEY ("challengerQuizId") REFERENCES "QuizSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Challenge" ADD CONSTRAINT "Challenge_opponentQuizId_fkey"
  FOREIGN KEY ("opponentQuizId") REFERENCES "QuizSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
