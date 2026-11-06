import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ChallengeStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { CreateChallengeDto } from './dto/create-challenge.dto';

@Injectable()
export class ChallengesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(challengerId: string, dto: CreateChallengeDto) {
    if (challengerId === dto.opponentId) {
      throw new BadRequestException('You cannot challenge yourself.');
    }
    const [opponent, topic, publishedCount] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: dto.opponentId }, select: { id: true } }),
      this.prisma.topic.findUnique({ where: { id: dto.topicId }, select: { id: true } }),
      this.prisma.question.count({ where: { topicId: dto.topicId, status: 'PUBLISHED' } }),
    ]);
    if (!opponent) throw new NotFoundException('Opponent not found.');
    if (!topic) throw new NotFoundException('Topic not found.');
    const questionCount = dto.questionCount ?? 10;
    if (publishedCount < questionCount) {
      throw new BadRequestException('Not enough published questions for this challenge.');
    }
    return this.prisma.challenge.create({
      data: { challengerId, opponentId: dto.opponentId, topicId: dto.topicId, questionCount },
      select: { id: true, challengerId: true, opponentId: true, topicId: true, questionCount: true, status: true },
    });
  }

  async myChallenges(userId: string) {
    const challenges = await this.prisma.challenge.findMany({
      where: { OR: [{ challengerId: userId }, { opponentId: userId }] },
      select: {
        id: true,
        challengerId: true,
        opponentId: true,
        topicId: true,
        questionCount: true,
        status: true,
        createdAt: true,
        acceptedAt: true,
        completedAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return challenges;
  }

  async decline(userId: string, challengeId: string) {
    const challenge = await this.prisma.challenge.findUnique({
      where: { id: challengeId },
      select: { opponentId: true, status: true },
    });
    if (!challenge) throw new NotFoundException('Challenge not found.');
    if (challenge.opponentId !== userId) {
      throw new ForbiddenException('Only the invited opponent can decline.');
    }
    if (challenge.status !== ChallengeStatus.PENDING) {
      throw new ConflictException('Challenge is no longer pending.');
    }
    const updated = await this.prisma.challenge.updateMany({
      where: { id: challengeId, status: ChallengeStatus.PENDING },
      data: { status: ChallengeStatus.DECLINED },
    });
    if (updated.count !== 1) throw new ConflictException('Challenge is no longer pending.');
    return { id: challengeId, status: ChallengeStatus.DECLINED };
  }

  async accept(userId: string, challengeId: string) {
    return this.prisma.$transaction(async (tx) => {
      const challenge = await tx.challenge.findUnique({ where: { id: challengeId } });
      if (!challenge) throw new NotFoundException('Challenge not found.');
      if (challenge.opponentId !== userId) throw new ForbiddenException('Only the opponent can accept.');
      if (challenge.status !== ChallengeStatus.PENDING) throw new ConflictException('Challenge is no longer pending.');

      // Acquire the challenge row before creating sessions; serializes competing accept requests.
      const locked = await tx.challenge.updateMany({
        where: { id: challengeId, status: ChallengeStatus.PENDING },
        data: { status: ChallengeStatus.ACTIVE, acceptedAt: new Date() },
      });
      if (locked.count !== 1) throw new ConflictException('Challenge already accepted.');

      const questions = await tx.question.findMany({
        where: { topicId: challenge.topicId, status: 'PUBLISHED' },
        select: { id: true },
        orderBy: { id: 'asc' },
      });
      if (questions.length < challenge.questionCount) {
        throw new BadRequestException('Not enough published questions remain.');
      }
      const pool = [...questions];
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      const chosen = pool.slice(0, challenge.questionCount);
      const createQuiz = (participantId: string) => tx.quizSession.create({
        data: {
          userId: participantId,
          total: chosen.length,
          questions: {
            create: chosen.map((question, position) => ({ questionId: question.id, position })),
          },
        },
        select: { id: true },
      });
      const challengerQuiz = await createQuiz(challenge.challengerId);
      const opponentQuiz = await createQuiz(challenge.opponentId);
      return tx.challenge.update({
        where: { id: challengeId },
        data: { challengerQuizId: challengerQuiz.id, opponentQuizId: opponentQuiz.id },
        select: { id: true, status: true, challengerQuizId: true, opponentQuizId: true },
      });
    });
  }

  async get(userId: string, challengeId: string) {
    const challenge = await this.prisma.challenge.findUnique({
      where: { id: challengeId },
      include: {
        challengerQuiz: { select: { status: true, score: true, completedAt: true } },
        opponentQuiz: { select: { status: true, score: true, completedAt: true } },
      },
    });
    if (!challenge) throw new NotFoundException('Challenge not found.');
    if (challenge.challengerId !== userId && challenge.opponentId !== userId) {
      throw new ForbiddenException('Not a challenge participant.');
    }
    const bothDone = challenge.challengerQuiz?.status === 'COMPLETED'
      && challenge.opponentQuiz?.status === 'COMPLETED';
    // Do not reveal the other participant's score before both have finished.
    return {
      id: challenge.id,
      status: challenge.status,
      challengerId: challenge.challengerId,
      opponentId: challenge.opponentId,
      topicId: challenge.topicId,
      questionCount: challenge.questionCount,
      myQuizId: challenge.challengerId === userId ? challenge.challengerQuizId : challenge.opponentQuizId,
      ...(bothDone ? {
        challengerScore: challenge.challengerQuiz?.score,
        opponentScore: challenge.opponentQuiz?.score,
        winnerId: challenge.winnerId,
      } : {}),
    };
  }

  async finalize(userId: string, challengeId: string) {
    return this.prisma.$transaction(async (tx) => {
      const challenge = await tx.challenge.findUnique({
        where: { id: challengeId },
        include: {
          challengerQuiz: { select: { status: true, score: true } },
          opponentQuiz: { select: { status: true, score: true } },
        },
      });
      if (!challenge) throw new NotFoundException('Challenge not found.');
      if (challenge.challengerId !== userId && challenge.opponentId !== userId) {
        throw new ForbiddenException('Not a challenge participant.');
      }
      if (challenge.status === ChallengeStatus.COMPLETED) {
        return { status: challenge.status, winnerId: challenge.winnerId };
      }
      if (challenge.status !== ChallengeStatus.ACTIVE ||
          challenge.challengerQuiz?.status !== 'COMPLETED' ||
          challenge.opponentQuiz?.status !== 'COMPLETED') {
        throw new ConflictException('Both players must complete their quizzes.');
      }
      const challengerScore = challenge.challengerQuiz.score;
      const opponentScore = challenge.opponentQuiz.score;
      const winnerId = challengerScore === opponentScore ? null :
        challengerScore > opponentScore ? challenge.challengerId : challenge.opponentId;
      await tx.challenge.updateMany({
        where: { id: challengeId, status: ChallengeStatus.ACTIVE },
        data: { status: ChallengeStatus.COMPLETED, winnerId, completedAt: new Date() },
      });
      return { status: ChallengeStatus.COMPLETED, winnerId, challengerScore, opponentScore };
    });
  }
}
