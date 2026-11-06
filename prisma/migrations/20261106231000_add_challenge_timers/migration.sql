ALTER TABLE "Challenge"
  ADD COLUMN "durationSeconds" INTEGER NOT NULL DEFAULT 300,
  ADD COLUMN "challengerReadyAt" TIMESTAMP(3),
  ADD COLUMN "opponentReadyAt" TIMESTAMP(3),
  ADD COLUMN "startsAt" TIMESTAMP(3),
  ADD COLUMN "endsAt" TIMESTAMP(3);

ALTER TABLE "Challenge"
  ADD CONSTRAINT "Challenge_durationSeconds_check"
  CHECK ("durationSeconds" BETWEEN 30 AND 7200);
