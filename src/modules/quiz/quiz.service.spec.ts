import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { QuizService } from './quiz.service';
import { PrismaService } from '../../database/prisma/prisma.service';

describe('QuizService', () => {
  let service: QuizService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      topic: { findUnique: jest.fn() },
      user: { findMany: jest.fn() },
      challenge: { findFirst: jest.fn().mockResolvedValue(null), updateMany: jest.fn() },
      competitionParticipant: { findUnique: jest.fn().mockResolvedValue(null) },
      question: { findMany: jest.fn() },
      quizSession: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), groupBy: jest.fn() },
      quizSessionQuestion: { findUnique: jest.fn() },
      questionOption: { findFirst: jest.fn() },
      quizAnswer: { create: jest.fn(), findMany: jest.fn() },
      $transaction: jest.fn(async (fn: (tx: any) => Promise<any>) => fn(prisma)),
    };
    service = new QuizService(prisma as PrismaService);
  });

  it('rejects starting a quiz without enough published questions', async () => {
    prisma.topic.findUnique.mockResolvedValue({ id: 'topic' });
    prisma.question.findMany.mockResolvedValue([{ id: 'q1' }]);
    await expect(service.start('user', { topicId: 'topic', questionCount: 2 }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not expose answer keys when resuming a quiz', async () => {
    prisma.quizSession.findUnique.mockResolvedValue({
      id: 'session',
      userId: 'user',
      status: 'IN_PROGRESS',
      total: 1,
      answers: [],
      questions: [{
        position: 0,
        question: {
          id: 'question',
          questionText: 'What is 2 + 2?',
          difficulty: 'BEGINNER',
          options: [{ id: 'option', optionText: '4' }],
        },
      }],
    });
    const response = await service.getSession('user', 'session');
    expect(JSON.stringify(response)).not.toContain('isCorrect');
    expect(JSON.stringify(response)).not.toContain('explanation');
  });

  it('rejects access to another user quiz', async () => {
    prisma.quizSession.findUnique.mockResolvedValue({
      id: 'session', userId: 'someone-else', status: 'IN_PROGRESS',
      total: 0, answers: [], questions: [],
    });
    await expect(service.getSession('user', 'session'))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('blocks answers before both students are ready', async () => {
    prisma.quizSession.findUnique.mockResolvedValue({
      userId: 'user', status: 'IN_PROGRESS',
    });
    prisma.challenge.findFirst.mockResolvedValue({
      startsAt: null, endsAt: null,
    });
    await expect(service.submitAnswer('user', 'session', {
      questionId: 'question', selectedOptionId: 'option',
    })).rejects.toBeInstanceOf(ConflictException);
  });

  it('blocks answers after the shared deadline', async () => {
    prisma.quizSession.findUnique.mockResolvedValue({
      userId: 'user', status: 'IN_PROGRESS',
    });
    prisma.challenge.findFirst.mockResolvedValue({
      startsAt: new Date(Date.now() - 120000),
      endsAt: new Date(Date.now() - 60000),
    });
    await expect(service.submitAnswer('user', 'session', {
      questionId: 'question', selectedOptionId: 'option',
    })).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects options that belong to another question', async () => {
    prisma.quizSession.findUnique.mockResolvedValue({
      userId: 'user', status: 'IN_PROGRESS',
    });
    prisma.quizSessionQuestion.findUnique.mockResolvedValue({ id: 'member' });
    prisma.questionOption.findFirst.mockResolvedValue(null);
    await expect(service.submitAnswer('user', 'session', {
      questionId: 'question', selectedOptionId: 'wrong-option',
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('ranks users by completed quiz XP without exposing private profile fields', async () => {
    prisma.quizSession.groupBy.mockResolvedValue([
      { userId: 'u1', _sum: { xpEarned: 30, score: 3 }, _count: { id: 2 } },
    ]);
    prisma.user.findMany.mockResolvedValue([
      { id: 'u1', username: 'learner', fullName: 'Test Learner', school: null },
    ]);
    await expect(service.leaderboard()).resolves.toEqual([{
      rank: 1,
      user: { id: 'u1', username: 'learner', fullName: 'Test Learner', school: null },
      totalXp: 30,
      correctAnswers: 3,
      completedQuizzes: 2,
    }]);
    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      select: { id: true, username: true, fullName: true, school: true },
    }));
  });

  it('automatically settles a 1v1 challenge when the second player finishes', async () => {
    prisma.quizSession.findUnique.mockResolvedValue({
      userId: 'u2', status: 'IN_PROGRESS', total: 1,
    });
    prisma.quizAnswer.findMany.mockResolvedValue([{ isCorrect: true }]);
    prisma.quizSession.updateMany = jest.fn().mockResolvedValue({ count: 1 });
    prisma.challenge.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
      id: 'challenge', challengerId: 'u1', opponentId: 'u2',
      challengerQuiz: { status: 'COMPLETED', score: 0 },
      opponentQuiz: { status: 'COMPLETED', score: 1 },
    });
    prisma.challenge.updateMany.mockResolvedValue({ count: 1 });
    await expect(service.complete('u2', 'session')).resolves.toMatchObject({
      score: 1, challengeResult: { challengeId: 'challenge', winnerId: 'u2' },
    });
    expect(prisma.challenge.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'challenge', status: 'ACTIVE' },
      data: expect.objectContaining({ status: 'COMPLETED', winnerId: 'u2' }),
    }));
  });

  it('scores completed quizzes and awards XP once', async () => {
    prisma.quizSession.findUnique.mockResolvedValue({
      userId: 'user', status: 'IN_PROGRESS', total: 2,
    });
    prisma.quizAnswer.findMany.mockResolvedValue([
      { isCorrect: true }, { isCorrect: false },
    ]);
    prisma.quizSession.updateMany = jest.fn().mockResolvedValue({ count: 1 });
    await expect(service.complete('user', 'session')).resolves.toEqual({
      sessionId: 'session', score: 1, total: 2, percentage: 50, xpEarned: 10,
    });
    prisma.quizSession.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.complete('user', 'session'))
      .rejects.toBeInstanceOf(ConflictException);
  });
});
