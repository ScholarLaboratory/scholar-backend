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
      competition: { create: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
      competitionParticipant: { findUnique: jest.fn(), create: jest.fn() },
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

  it('rejects registration after the facilitator closes it', async () => {
    prisma.competition.findUnique.mockResolvedValue({ status: 'CLOSED' });
    await expect(service.join('student', 'competition')).rejects.toBeInstanceOf(ConflictException);
  });
});
