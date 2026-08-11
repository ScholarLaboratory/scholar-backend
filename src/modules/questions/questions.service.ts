import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { CreateSubjectDto } from './dto/create-subject.dto';

@Injectable()
export class QuestionsService {
  constructor(private readonly prisma: PrismaService) {}

  async createSubject(dto: CreateSubjectDto) {
    const slug = dto.name
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-');

    return this.prisma.subject.create({
      data: {
        name: dto.name.trim(),
        slug,
      },
    });
  }

  async getSubjects() {
    return this.prisma.subject.findMany({
      orderBy: {
        name: 'asc',
      },
      include: {
        topics: true,
      },
    });
  }
}