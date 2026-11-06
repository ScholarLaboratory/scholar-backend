import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, QuizSessionStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { StartQuizDto } from './dto/start-quiz.dto';
import { SubmitAnswerDto } from './dto/submit-answer.dto';

const XP_PER_CORRECT_ANSWER = 10;

@Injectable()
export class QuizService {
  constructor(private readonly prisma: PrismaService) {}

  async start(userId: string, dto: StartQuizDto) {
    const topic = await this.prisma.topic.findUnique({ where: { id: dto.topicId } });
    if (!topic) throw new NotFoundException('Topic not found.');

    const available = await this.prisma.question.findMany({
      where: { topicId: dto.topicId, status: 'PUBLISHED' },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    const count = dto.questionCount ?? 10;
    if (available.length < count) {
      throw new BadRequestException(
        `Not enough published questions: requested ${count}, available ${available.length}.`,
      );
    }

    // Randomize the question set once, then persist its membership and order.
    const selected = [...available];
    for (let i = selected.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [selected[i], selected[j]] = [selected[j], selected[i]];
    }
    const session = await this.prisma.quizSession.create({
      data: {
        userId,
        total: count,
        questions: {
          create: selected.slice(0, count).map((question, position) => ({
            questionId: question.id,
            position,
          })),
        },
      },
      select: { id: true },
    });
    return this.getSession(userId, session.id);
  }

  async getSession(userId: string, sessionId: string) {
    const session = await this.prisma.quizSession.findUnique({
      where: { id: sessionId },
      include: {
        questions: {
          orderBy: { position: 'asc' },
          select: {
            position: true,
            question: {
              select: {
                id: true,
                questionText: true,
                difficulty: true,
                options: { select: { id: true, optionText: true } },
              },
            },
          },
        },
        answers: { select: { questionId: true, selectedOptionId: true } },
      },
    });
    if (!session) throw new NotFoundException('Quiz session not found.');
    if (session.userId !== userId) throw new ForbiddenException('Not your quiz session.');
    return {
      id: session.id,
      status: session.status,
      total: session.total,
      answered: session.answers.length,
      questions: session.questions.map(({ position, question }) => ({
        position,
        ...question,
        selectedOptionId: session.answers.find((answer) => answer.questionId === question.id)?.selectedOptionId ?? null,
      })),
      ...(session.status === QuizSessionStatus.COMPLETED
        ? { score: session.score, xpEarned: session.xpEarned, completedAt: session.completedAt }
        : {}),
    };
  }

  async submitAnswer(userId: string, sessionId: string, dto: SubmitAnswerDto) {
    return this.prisma.$transaction(async (tx) => {
      const session = await tx.quizSession.findUnique({
        where: { id: sessionId },
        select: { userId: true, status: true },
      });
      if (!session) throw new NotFoundException('Quiz session not found.');
      if (session.userId !== userId) throw new ForbiddenException('Not your quiz session.');
      if (session.status !== QuizSessionStatus.IN_PROGRESS) {
        throw new ConflictException('Quiz already completed.');
      }
      const membership = await tx.quizSessionQuestion.findUnique({
        where: { sessionId_questionId: { sessionId, questionId: dto.questionId } },
      });
      if (!membership) throw new BadRequestException('Question is not part of this quiz.');

      const option = await tx.questionOption.findFirst({
        where: { id: dto.selectedOptionId, questionId: dto.questionId },
        select: { isCorrect: true },
      });
      if (!option) throw new BadRequestException('Invalid option for this question.');

      try {
        await tx.quizAnswer.create({
          data: {
            sessionId,
            questionId: dto.questionId,
            selectedOptionId: dto.selectedOptionId,
            isCorrect: option.isCorrect,
          },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ConflictException('Question already answered.');
        }
        throw error;
      }
      return { accepted: true, questionId: dto.questionId };
    });
  }

  async complete(userId: string, sessionId: string) {
    return this.prisma.$transaction(async (tx) => {
      // Conditional update provides a single successful completion even if requests race.
      const session = await tx.quizSession.findUnique({
        where: { id: sessionId },
        select: { userId: true, status: true, total: true },
      });
      if (!session) throw new NotFoundException('Quiz session not found.');
      if (session.userId !== userId) throw new ForbiddenException('Not your quiz session.');
      if (session.status !== QuizSessionStatus.IN_PROGRESS) {
        throw new ConflictException('Quiz already completed.');
      }

      const answers = await tx.quizAnswer.findMany({
        where: { sessionId },
        select: { isCorrect: true },
      });
      if (answers.length !== session.total) {
        throw new BadRequestException(
          `Answer all questions before completing (${answers.length}/${session.total}).`,
        );
      }
      const score = answers.filter((answer) => answer.isCorrect).length;
      const xpEarned = score * XP_PER_CORRECT_ANSWER;
      const updated = await tx.quizSession.updateMany({
        where: { id: sessionId, status: QuizSessionStatus.IN_PROGRESS },
        data: {
          status: QuizSessionStatus.COMPLETED,
          score,
          xpEarned,
          completedAt: new Date(),
        },
      });
      if (updated.count !== 1) throw new ConflictException('Quiz already completed.');

      // When this quiz belongs to a 1v1 challenge, settle the challenge
      // atomically once the other player's quiz is also complete.
      const challenge = await tx.challenge.findFirst({
        where: {
          status: 'ACTIVE',
          OR: [{ challengerQuizId: sessionId }, { opponentQuizId: sessionId }],
        },
        include: {
          challengerQuiz: { select: { status: true, score: true } },
          opponentQuiz: { select: { status: true, score: true } },
        },
      });
      let challengeResult: { challengeId: string; winnerId: string | null } | null = null;
      if (
        challenge &&
        challenge.challengerQuiz?.status === QuizSessionStatus.COMPLETED &&
        challenge.opponentQuiz?.status === QuizSessionStatus.COMPLETED
      ) {
        const winnerId =
          challenge.challengerQuiz.score === challenge.opponentQuiz.score
            ? null
            : challenge.challengerQuiz.score > challenge.opponentQuiz.score
              ? challenge.challengerId
              : challenge.opponentId;
        const settled = await tx.challenge.updateMany({
          where: { id: challenge.id, status: 'ACTIVE' },
          data: { status: 'COMPLETED', winnerId, completedAt: new Date() },
        });
        if (settled.count === 1) {
          challengeResult = { challengeId: challenge.id, winnerId };
        }
      }
      return {
        sessionId,
        score,
        total: session.total,
        percentage: Math.round((score / session.total) * 100),
        xpEarned,
        ...(challengeResult ? { challengeResult } : {}),
      };
    });
  }


  async leaderboard(limit = 20) {
    const totals = await this.prisma.quizSession.groupBy({
      by: ['userId'],
      where: { status: QuizSessionStatus.COMPLETED },
      _sum: { xpEarned: true, score: true },
      _count: { id: true },
      orderBy: [{ _sum: { xpEarned: 'desc' } }, { userId: 'asc' }],
      take: limit,
    });
    const users = await this.prisma.user.findMany({
      where: { id: { in: totals.map((entry) => entry.userId) } },
      select: { id: true, username: true, fullName: true, school: true },
    });
    const byId = new Map(users.map((user) => [user.id, user]));
    return totals.map((entry, index) => ({
      rank: index + 1,
      user: byId.get(entry.userId) ?? { id: entry.userId },
      totalXp: entry._sum.xpEarned ?? 0,
      correctAnswers: entry._sum.score ?? 0,
      completedQuizzes: entry._count.id,
    }));
  }

  async myResults(userId: string) {
    return this.prisma.quizSession.findMany({
      where: { userId, status: QuizSessionStatus.COMPLETED },
      select: {
        id: true,
        score: true,
        total: true,
        xpEarned: true,
        completedAt: true,
      },
      orderBy: { completedAt: 'desc' },
    });
  }
}
