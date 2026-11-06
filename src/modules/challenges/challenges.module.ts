import { Module } from '@nestjs/common';
import { ChallengesController } from './challenges.controller';
import { ChallengesService } from './challenges.service';
import { ChallengeExpiryWorker } from './challenge-expiry.worker';
import { ChallengeExpiryWorker } from './challenge-expiry.worker';

@Module({
  controllers: [ChallengesController],
  providers: [ChallengesService, ChallengeExpiryWorker],
})
export class ChallengesModule {}
