ALTER TABLE "Competition"
  ADD COLUMN "startsAt" TIMESTAMP(3),
  ADD COLUMN "endsAt" TIMESTAMP(3);

ALTER TABLE "CompetitionParticipant"
  ADD COLUMN "quizSessionId" TEXT;

CREATE UNIQUE INDEX "CompetitionParticipant_quizSessionId_key"
  ON "CompetitionParticipant"("quizSessionId");

ALTER TABLE "CompetitionParticipant"
  ADD CONSTRAINT "CompetitionParticipant_quizSessionId_fkey"
  FOREIGN KEY ("quizSessionId") REFERENCES "QuizSession"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
