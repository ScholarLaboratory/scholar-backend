import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { CompetitionsService } from './competitions.service';

@Injectable()
export class CompetitionExpiryWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CompetitionExpiryWorker.name);
  private interval?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(private readonly prisma: PrismaService, private readonly competitions: CompetitionsService) {}

  onModuleInit() {
    this.interval = setInterval(() => {
      void this.runOnce().catch((error: unknown) => this.logger.error('Competition expiry sweep failed', error));
    }, 15000);
    this.interval.unref?.();
  }

  onModuleDestroy() {
    if (this.interval) clearInterval(this.interval);
  }

  async runOnce() {
    if (this.running) return;
    this.running = true;
    try {
      const expired = await this.prisma.competition.findMany({
        where: {
          endsAt: { lte: new Date() },
          participants: { some: { quizSession: { is: { status: 'IN_PROGRESS' } } } },
        },
        select: { id: true },
        orderBy: { endsAt: 'desc' },
        take: 50,
      });
      for (const competition of expired) {
        try {
          await this.competitions.settleExpired(competition.id);
        } catch (error) {
          this.logger.warn(`Could not settle competition ${competition.id}: ${String(error)}`);
        }
      }
    } finally {
      this.running = false;
    }
  }
}
