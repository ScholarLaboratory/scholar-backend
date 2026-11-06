import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { ChallengesService } from './challenges.service';

const POLL_INTERVAL_MS = 15_000;
const BATCH_SIZE = 50;

/**
 * Polls the database for expired challenges. This works without a separate
 * queue dependency. In a multi-instance deployment, database transactions
 * and conditional updates must protect against concurrent settlement.
 */
@Injectable()
export class ChallengeExpiryWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChallengeExpiryWorker.name);
  private interval?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly challenges: ChallengesService,
  ) {}

  onModuleInit() {
    this.interval = setInterval(() => {
      void this.runOnce().catch((error: unknown) => {
        this.logger.error('Challenge expiry sweep failed', error);
      });
    }, POLL_INTERVAL_MS);
    this.interval.unref?.();
  }

  onModuleDestroy() {
    if (this.interval) clearInterval(this.interval);
  }

  async runOnce(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const expired = await this.prisma.challenge.findMany({
        where: { status: 'ACTIVE', endsAt: { lte: new Date() } },
        select: { id: true },
        orderBy: { endsAt: 'asc' },
        take: BATCH_SIZE,
      });
      for (const challenge of expired) {
        try {
          await this.challenges.settleExpired(challenge.id);
        } catch (error) {
          this.logger.warn(`Could not settle challenge ${challenge.id}: ${String(error)}`);
        }
      }
    } finally {
      this.running = false;
    }
  }
}
