CREATE TYPE "QuizSessionStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED');

CREATE TABLE "QuizSession" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" "QuizSessionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
  "score" INTEGER NOT NULL DEFAULT 0,
  "total" INTEGER NOT NULL,
  "xpEarned" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "QuizSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QuizSessionQuestion" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  CONSTRAINT "QuizSessionQuestion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QuizAnswer" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "selectedOptionId" TEXT NOT NULL,
  "isCorrect" BOOLEAN NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QuizAnswer_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "QuizSession_userId_startedAt_idx" ON "QuizSession"("userId", "startedAt");
CREATE UNIQUE INDEX "QuizSessionQuestion_sessionId_questionId_key" ON "QuizSessionQuestion"("sessionId", "questionId");
CREATE UNIQUE INDEX "QuizSessionQuestion_sessionId_position_key" ON "QuizSessionQuestion"("sessionId", "position");
CREATE UNIQUE INDEX "QuizAnswer_sessionId_questionId_key" ON "QuizAnswer"("sessionId", "questionId");
CREATE INDEX "QuizAnswer_questionId_idx" ON "QuizAnswer"("questionId");

ALTER TABLE "QuizSession" ADD CONSTRAINT "QuizSession_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuizSessionQuestion" ADD CONSTRAINT "QuizSessionQuestion_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "QuizSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuizSessionQuestion" ADD CONSTRAINT "QuizSessionQuestion_questionId_fkey"
  FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuizAnswer" ADD CONSTRAINT "QuizAnswer_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "QuizSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuizAnswer" ADD CONSTRAINT "QuizAnswer_questionId_fkey"
  FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuizAnswer" ADD CONSTRAINT "QuizAnswer_selectedOptionId_fkey"
  FOREIGN KEY ("selectedOptionId") REFERENCES "QuestionOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
