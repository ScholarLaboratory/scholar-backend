import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { CreateCompetitionDto } from './dto/create-competition.dto';

@Injectable()
export class CompetitionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(facilitatorId: string, dto: CreateCompetitionDto) {
    const [topic, count] = await Promise.all([
      this.prisma.topic.findUnique({ where: { id: dto.topicId }, select: { id: true } }),
      this.prisma.question.count({ where: { topicId: dto.topicId, status: 'PUBLISHED' } }),
    ]);
    if (!topic) throw new NotFoundException('Topic not found.');
    if (count < (dto.questionCount ?? 10)) throw new BadRequestException('Not enough published questions.');
    if (dto.scheduledAt && new Date(dto.scheduledAt).getTime() <= Date.now()) {
      throw new BadRequestException('Scheduled time must be in the future.');
    }
    return this.prisma.competition.create({
      data: {
        title: dto.title,
        facilitatorId,
        topicId: dto.topicId,
        questionCount: dto.questionCount ?? 10,
        durationSeconds: dto.durationSeconds ?? 300,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
      },
      select: { id: true, title: true, status: true, questionCount: true, durationSeconds: true, scheduledAt: true },
    });
  }

  async get(userId: string, id: string) {
    const competition = await this.prisma.competition.findUnique({
      where: { id },
      include: {
        participants: { select: { userId: true, joinedAt: true } },
      },
    });
    if (!competition) throw new NotFoundException('Competition not found.');
    if (competition.status === 'DRAFT' && competition.facilitatorId !== userId) {
      throw new ForbiddenException('This competition is not open yet.');
    }
    return competition;
  }

  async open(userId: string, id: string) {
    const competition = await this.prisma.competition.findUnique({ where: { id }, select: { facilitatorId: true } });
    if (!competition) throw new NotFoundException('Competition not found.');
    if (competition.facilitatorId !== userId) throw new ForbiddenException('Only the facilitator can open registration.');
    const updated = await this.prisma.competition.updateMany({ where: { id, status: 'DRAFT' }, data: { status: 'OPEN' } });
    if (updated.count !== 1) throw new ConflictException('Competition is not a draft.');
    return { id, status: 'OPEN' };
  }

  async join(userId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const competition = await tx.competition.findUnique({ where: { id }, select: { status: true } });
      if (!competition) throw new NotFoundException('Competition not found.');
      if (competition.status !== 'OPEN') throw new ConflictException('Registration is closed.');
      const participant = await tx.competitionParticipant.findUnique({
        where: { competitionId_userId: { competitionId: id, userId } },
      });
      if (participant) throw new ConflictException('Already registered.');
      await tx.competitionParticipant.create({ data: { competitionId: id, userId } });
      return { competitionId: id, userId, joined: true };
    });
  }

  async start(userId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const competition = await tx.competition.findUnique({
        where: { id },
        include: { participants: { select: { userId: true, quizSessionId: true } } },
      });
      if (!competition) throw new NotFoundException('Competition not found.');
      if (competition.facilitatorId !== userId) throw new ForbiddenException('Only the facilitator can start.');
      if (competition.status !== 'CLOSED' || competition.startsAt) {
        throw new ConflictException('Close registration before starting, and start only once.');
      }
      if (competition.scheduledAt && competition.scheduledAt.getTime() > Date.now()) {
        throw new ConflictException('The scheduled start time has not arrived.');
      }
      if (competition.participants.length < 2) {
        throw new BadRequestException('At least two participants are required.');
      }

      const questions = await tx.question.findMany({
        where: { topicId: competition.topicId, status: 'PUBLISHED' },
        select: { id: true },
      });
      if (questions.length < competition.questionCount) {
        throw new BadRequestException('Not enough published questions remain.');
      }
      const shuffled = [...questions];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      const selected = shuffled.slice(0, competition.questionCount);
      const locked = await tx.competition.updateMany({
        where: { id, status: 'CLOSED', startsAt: null },
        data: { startsAt: new Date(), endsAt: new Date(Date.now() + competition.durationSeconds * 1000) },
      });
      if (locked.count !== 1) throw new ConflictException('Competition already started.');

      for (const participant of competition.participants) {
        const quiz = await tx.quizSession.create({
          data: {
            userId: participant.userId,
            total: selected.length,
            questions: {
              create: selected.map((question, position) => ({ questionId: question.id, position })),
            },
          },
          select: { id: true },
        });
        await tx.competitionParticipant.update({
          where: { competitionId_userId: { competitionId: id, userId: participant.userId } },
          data: { quizSessionId: quiz.id },
        });
      }
      const started = await tx.competition.findUniqueOrThrow({
        where: { id },
        select: { startsAt: true, endsAt: true },
      });
      return { id, status: 'STARTED', participantCount: competition.participants.length, ...started };
    });
  }

  async myQuiz(userId: string, id: string) {
    const competition = await this.prisma.competition.findUnique({
      where: { id }, select: { startsAt: true, endsAt: true },
    });
    if (!competition) throw new NotFoundException('Competition not found.');
    const participant = await this.prisma.competitionParticipant.findUnique({
      where: { competitionId_userId: { competitionId: id, userId } },
      select: { quizSessionId: true },
    });
    if (!participant) throw new ForbiddenException('Not registered for this competition.');
    return { quizSessionId: participant.quizSessionId, startsAt: competition.startsAt, endsAt: competition.endsAt };
  }

  async close(userId: string, id: string) {
    const competition = await this.prisma.competition.findUnique({ where: { id }, select: { facilitatorId: true } });
    if (!competition) throw new NotFoundException('Competition not found.');
    if (competition.facilitatorId !== userId) throw new ForbiddenException('Only the facilitator can close registration.');
    const updated = await this.prisma.competition.updateMany({ where: { id, status: 'OPEN' }, data: { status: 'CLOSED' } });
    if (updated.count !== 1) throw new ConflictException('Competition registration is not open.');
    return { id, status: 'CLOSED' };
  }
}
