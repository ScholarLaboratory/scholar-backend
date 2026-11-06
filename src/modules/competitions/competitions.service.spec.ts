import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { CompetitionsService } from './competitions.service';
import { PrismaService } from '../../database/prisma/prisma.service';

describe('CompetitionsService', () => {
  let prisma: any;
  let service: CompetitionsService;

  beforeEach(() => {
    prisma = {
      topic: { findUnique: jest.fn() },
      question: { count: jest.fn() },
      competition: { create: jest.fn(), findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), updateMany: jest.fn() },
      competitionParticipant: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      quizSession: { create: jest.fn() },
    };
    prisma.$transaction = jest.fn(async (fn: (tx: any) => Promise<any>) => fn(prisma));
    service = new CompetitionsService(prisma as PrismaService);
  });

  it('rejects competitions without enough published questions', async () => {
    prisma.topic.findUnique.mockResolvedValue({ id: 'topic' });
    prisma.question.count.mockResolvedValue(2);
    await expect(service.create('facilitator', {
      title: 'Science Cup', topicId: 'topic', questionCount: 10,
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('only allows the organizer to open registration', async () => {
    prisma.competition.findUnique.mockResolvedValue({ facilitatorId: 'host' });
    await expect(service.open('stranger', 'competition')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows registered students to join an open competition', async () => {
    prisma.competition.findUnique.mockResolvedValue({ status: 'OPEN' });
    prisma.competitionParticipant.findUnique.mockResolvedValue(null);
    prisma.competitionParticipant.create.mockResolvedValue({});
    await expect(service.join('student', 'competition')).resolves.toEqual({
      competitionId: 'competition', userId: 'student', joined: true,
    });
  });

  it('rejects duplicate registrations', async () => {
    prisma.competition.findUnique.mockResolvedValue({ status: 'OPEN' });
    prisma.competitionParticipant.findUnique.mockResolvedValue({ userId: 'student' });
    await expect(service.join('student', 'competition')).rejects.toBeInstanceOf(ConflictException);
  });

  it('starts a synchronized quiz for each participant with matching question IDs', async () => {
    prisma.competition.findUnique.mockResolvedValue({
      facilitatorId: 'host', status: 'CLOSED', startsAt: null,
      topicId: 'topic', questionCount: 2, durationSeconds: 300, scheduledAt: null,
      participants: [{ userId: 'u1' }, { userId: 'u2' }],
    });
    prisma.question.findMany = jest.fn().mockResolvedValue([{ id: 'q1' }, { id: 'q2' }]);
    prisma.competition.updateMany.mockResolvedValue({ count: 1 });
    prisma.quizSession.create
      .mockResolvedValueOnce({ id: 's1' })
      .mockResolvedValueOnce({ id: 's2' });
    prisma.competitionParticipant.update.mockResolvedValue({});
    prisma.competition.findUniqueOrThrow.mockResolvedValue({
      startsAt: new Date(), endsAt: new Date(Date.now() + 300000),
    });
    await expect(service.start('host', 'competition')).resolves.toMatchObject({
      status: 'STARTED', participantCount: 2,
    });
    const first = prisma.quizSession.create.mock.calls[0][0].data.questions.create;
    const second = prisma.quizSession.create.mock.calls[1][0].data.questions.create;
    expect(first).toEqual(second);
  });

  it('rejects registration after the facilitator closes it', async () => {
    prisma.competition.findUnique.mockResolvedValue({ status: 'CLOSED' });
    await expect(service.join('student', 'competition')).rejects.toBeInstanceOf(ConflictException);
  });
});
