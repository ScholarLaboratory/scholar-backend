CREATE TYPE "CompetitionStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED');

CREATE TABLE "Competition" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "facilitatorId" TEXT NOT NULL,
  "topicId" TEXT NOT NULL,
  "questionCount" INTEGER NOT NULL DEFAULT 10,
  "durationSeconds" INTEGER NOT NULL DEFAULT 300,
  "status" "CompetitionStatus" NOT NULL DEFAULT 'DRAFT',
  "scheduledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Competition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompetitionParticipant" (
  "competitionId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompetitionParticipant_pkey" PRIMARY KEY ("competitionId", "userId")
);

CREATE INDEX "Competition_facilitatorId_createdAt_idx" ON "Competition"("facilitatorId", "createdAt");
ALTER TABLE "Competition" ADD CONSTRAINT "Competition_facilitatorId_fkey" FOREIGN KEY ("facilitatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Competition" ADD CONSTRAINT "Competition_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CompetitionParticipant" ADD CONSTRAINT "CompetitionParticipant_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompetitionParticipant" ADD CONSTRAINT "CompetitionParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Competition" ADD CONSTRAINT "Competition_durationSeconds_check" CHECK ("durationSeconds" BETWEEN 30 AND 7200);
ALTER TABLE "Competition" ADD CONSTRAINT "Competition_questionCount_check" CHECK ("questionCount" BETWEEN 1 AND 20);
