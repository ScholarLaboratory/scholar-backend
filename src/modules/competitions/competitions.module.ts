import { Module } from '@nestjs/common';
import { CompetitionsController } from './competitions.controller';
import { CompetitionsService } from './competitions.service';
import { CompetitionExpiryWorker } from './competition-expiry.worker';

@Module({
  controllers: [CompetitionsController],
  providers: [CompetitionsService, CompetitionExpiryWorker],
})
export class CompetitionsModule {}
