import { ChallengeExpiryWorker } from './challenge-expiry.worker';
import { ChallengesService } from './challenges.service';
import { PrismaService } from '../../database/prisma/prisma.service';

describe('ChallengeExpiryWorker', () => {
  const prisma = { challenge: { findMany: jest.fn() } };
  const challenges = { settleExpired: jest.fn() };
  let worker: ChallengeExpiryWorker;

  beforeEach(() => {
    jest.clearAllMocks();
    worker = new ChallengeExpiryWorker(
      prisma as unknown as PrismaService,
      challenges as unknown as ChallengesService,
    );
  });

  it('settles every expired challenge in a batch', async () => {
    prisma.challenge.findMany.mockResolvedValue([{ id: 'c1' }, { id: 'c2' }]);
    challenges.settleExpired.mockResolvedValue(undefined);
    await worker.runOnce();
    expect(challenges.settleExpired).toHaveBeenCalledTimes(2);
    expect(challenges.settleExpired).toHaveBeenNthCalledWith(1, 'c1');
    expect(challenges.settleExpired).toHaveBeenNthCalledWith(2, 'c2');
    expect(prisma.challenge.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: 'ACTIVE', endsAt: { lte: expect.any(Date) } },
      take: 50,
    }));
  });

  it('continues settling after one challenge fails', async () => {
    prisma.challenge.findMany.mockResolvedValue([{ id: 'c1' }, { id: 'c2' }]);
    challenges.settleExpired
      .mockRejectedValueOnce(new Error('transient database conflict'))
      .mockResolvedValueOnce(undefined);
    await expect(worker.runOnce()).resolves.toBeUndefined();
    expect(challenges.settleExpired).toHaveBeenCalledWith('c2');
  });

  it('skips overlapping sweeps', async () => {
    let release!: () => void;
    prisma.challenge.findMany.mockImplementation(() => new Promise((resolve) => {
      release = () => resolve([]);
    }));
    const first = worker.runOnce();
    await worker.runOnce();
    expect(prisma.challenge.findMany).toHaveBeenCalledTimes(1);
    release();
    await first;
  });
});
