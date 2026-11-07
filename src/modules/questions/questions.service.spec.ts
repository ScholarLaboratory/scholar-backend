import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { QuestionsService } from './questions.service';
import { PrismaService } from '../../database/prisma/prisma.service';

describe('QuestionsService', () => {
  const prisma = {
    user: { findUnique: jest.fn() },
    subject: { findUnique: jest.fn() },
    topic: { findUnique: jest.fn() },
    question: { create: jest.fn(), findMany: jest.fn() },
  };
  const service = new QuestionsService(prisma as unknown as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue({ role: 'FACILITATOR' });
  });

  it('rejects students trying to publish questions', async () => {
    prisma.user.findUnique.mockResolvedValue({ role: 'STUDENT' });
    await expect(service.createQuestion('student', {
      subjectId: 'subject', topicId: 'topic', questionText: 'Question?',
      academicLevel: 'SECONDARY', difficulty: 'BEGINNER',
      options: [{ optionText: 'A', isCorrect: true }, { optionText: 'B', isCorrect: false }],
    })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.question.create).not.toHaveBeenCalled();
  });

  it('rejects a topic that does not belong to the chosen subject', async () => {
    prisma.topic.findUnique.mockResolvedValue({ id: 'topic', subjectId: 'other' });
    await expect(service.createQuestion('facilitator', {
      subjectId: 'subject', topicId: 'topic', questionText: 'Question?',
      academicLevel: 'SECONDARY', difficulty: 'BEGINNER',
      options: [{ optionText: 'A', isCorrect: true }, { optionText: 'B', isCorrect: false }],
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires exactly one correct answer', async () => {
    prisma.topic.findUnique.mockResolvedValue({ id: 'topic', subjectId: 'subject' });
    await expect(service.createQuestion('facilitator', {
      subjectId: 'subject', topicId: 'topic', questionText: 'Question?',
      academicLevel: 'SECONDARY', difficulty: 'BEGINNER',
      options: [{ optionText: 'A', isCorrect: true }, { optionText: 'B', isCorrect: true }],
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects missing topics when listing questions', async () => {
    prisma.topic.findUnique.mockResolvedValue(null);
    await expect(service.getQuestions('missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});
