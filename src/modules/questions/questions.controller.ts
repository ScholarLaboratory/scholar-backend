import {
  Body,
  Controller,
  Get,
  Post,
} from '@nestjs/common';

import { QuestionsService } from './questions.service';
import { CreateSubjectDto } from './dto/create-subject.dto';

@Controller('subjects')
export class QuestionsController {
  constructor(
    private readonly questionsService: QuestionsService,
  ) {}

  @Post()
  async createSubject(
    @Body() dto: CreateSubjectDto,
  ) {
    return this.questionsService.createSubject(dto);
  }

  @Get()
  async getSubjects() {
    return this.questionsService.getSubjects();
  }
}