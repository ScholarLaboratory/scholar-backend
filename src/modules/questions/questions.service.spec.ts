import { BadRequestException, NotFoundException } from '@nestjs/common';
import { QuestionsService } from './questions.service';
import { PrismaService } from '../../database/prisma/prisma.service';

describe('QuestionsService', () => {
  const prisma = {
    subject: { findUnique: jest.fn() },
    topic: { findUnique: jest.fn() },
    question: { create: jest.fn(), findMany: jest.fn() },
  };
  const service = new QuestionsService(prisma as unknown as PrismaService);

  beforeEach(() => jest.clearAllMocks());

  it('rejects a topic that does not belong to the chosen subject', async () => {
    prisma.topic.findUnique.mockResolvedValue({ id: 'topic', subjectId: 'other' });
    await expect(service.createQuestion({
      subjectId: 'subject', topicId: 'topic', questionText: 'Question?',
      academicLevel: 'SECONDARY', difficulty: 'BEGINNER',
      options: [{ optionText: 'A', isCorrect: true }, { optionText: 'B', isCorrect: false }],
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires exactly one correct answer', async () => {
    prisma.topic.findUnique.mockResolvedValue({ id: 'topic', subjectId: 'subject' });
    await expect(service.createQuestion({
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
