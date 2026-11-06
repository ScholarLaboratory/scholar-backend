import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { ChallengesService } from './challenges.service';
import { PrismaService } from '../../database/prisma/prisma.service';

describe('ChallengesService', () => {
  let prisma: any;
  let service: ChallengesService;

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn() },
      topic: { findUnique: jest.fn() },
      question: { count: jest.fn() },
      challenge: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
    };
    service = new ChallengesService(prisma as PrismaService);
  });

  it('rejects self challenges', async () => {
    await expect(service.create('u1', { opponentId: 'u1', topicId: 't1' }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects invitations with insufficient published questions', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u2' });
    prisma.topic.findUnique.mockResolvedValue({ id: 't1' });
    prisma.question.count.mockResolvedValue(3);
    await expect(service.create('u1', { opponentId: 'u2', topicId: 't1', questionCount: 5 }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('only allows the invited opponent to decline', async () => {
    prisma.challenge.findUnique.mockResolvedValue({ opponentId: 'u2', status: 'PENDING' });
    await expect(service.decline('u3', 'c1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.challenge.updateMany).not.toHaveBeenCalled();
  });

  it('declines an invitation exactly once', async () => {
    prisma.challenge.findUnique.mockResolvedValue({ opponentId: 'u2', status: 'PENDING' });
    prisma.challenge.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    await expect(service.decline('u2', 'c1')).resolves.toEqual({ id: 'c1', status: 'DECLINED' });
    await expect(service.decline('u2', 'c1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('limits challenge history to the current student', async () => {
    prisma.challenge.findMany.mockResolvedValue([]);
    await service.myChallenges('u1');
    expect(prisma.challenge.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { OR: [{ challengerId: 'u1' }, { opponentId: 'u1' }] },
      take: 50,
    }));
  });
});
