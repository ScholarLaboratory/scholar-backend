import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, QuestionStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { CreateSubjectDto } from './dto/create-subject.dto';
import { CreateTopicDto } from './dto/create-topic.dto';
import { CreateQuestionDto } from './dto/create-question.dto';

const slugify = (value: string) =>
  value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

@Injectable()
export class QuestionsService {
  constructor(private readonly prisma: PrismaService) {}

  async createSubject(dto: CreateSubjectDto) {
    const name = dto.name.trim();
    const slug = slugify(name);
    if (!slug) throw new BadRequestException('A valid subject name is required.');
    try {
      return await this.prisma.subject.create({ data: { name, slug } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Subject already exists.');
      }
      throw error;
    }
  }

  getSubjects() {
    return this.prisma.subject.findMany({
      orderBy: { name: 'asc' },
      include: { topics: true },
    });
  }

  async createTopic(dto: CreateTopicDto) {
    const subject = await this.prisma.subject.findUnique({ where: { id: dto.subjectId } });
    if (!subject) throw new NotFoundException('Subject not found.');
    const name = dto.name.trim();
    const slug = slugify(name);
    if (!slug) throw new BadRequestException('A valid topic name is required.');
    try {
      return await this.prisma.topic.create({
        data: { subjectId: dto.subjectId, name, slug },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Topic already exists in this subject.');
      }
      throw error;
    }
  }

  async getTopics(subjectId: string) {
    const subject = await this.prisma.subject.findUnique({ where: { id: subjectId } });
    if (!subject) throw new NotFoundException('Subject not found.');
    return this.prisma.topic.findMany({
      where: { subjectId },
      orderBy: { name: 'asc' },
    });
  }

  async createQuestion(dto: CreateQuestionDto) {
    const topic = await this.prisma.topic.findUnique({ where: { id: dto.topicId } });
    if (!topic) throw new NotFoundException('Topic not found.');
    if (topic.subjectId !== dto.subjectId) {
      throw new BadRequestException('Topic does not belong to the selected subject.');
    }
    const options = dto.options.map((option) => ({
      optionText: option.optionText.trim(),
      isCorrect: option.isCorrect,
    }));
    if (options.some((option) => !option.optionText)) {
      throw new BadRequestException('Answer options cannot be empty.');
    }
    if (options.filter((option) => option.isCorrect).length !== 1) {
      throw new BadRequestException('Exactly one option must be correct.');
    }
    // MVP: authenticated question authors can publish directly.
    // Introduce moderator approval before enabling public contributions.
    return this.prisma.question.create({
      data: {
        subjectId: dto.subjectId,
        topicId: dto.topicId,
        questionText: dto.questionText.trim(),
        academicLevel: dto.academicLevel,
        difficulty: dto.difficulty,
        explanation: dto.explanation?.trim(),
        source: 'PLATFORM',
        status: QuestionStatus.PUBLISHED,
        options: { create: options },
      },
      include: { options: true },
    });
  }

  async getQuestions(topicId: string) {
    const topic = await this.prisma.topic.findUnique({ where: { id: topicId } });
    if (!topic) throw new NotFoundException('Topic not found.');
    // Explicit select prevents leaking isCorrect and explanations to quiz clients.
    return this.prisma.question.findMany({
      where: { topicId, status: QuestionStatus.PUBLISHED },
      select: {
        id: true,
        questionText: true,
        academicLevel: true,
        difficulty: true,
        options: {
          select: { id: true, optionText: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }
}
