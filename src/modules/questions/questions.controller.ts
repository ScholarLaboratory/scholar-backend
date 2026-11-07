import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { QuestionsService } from './questions.service';
import { CreateSubjectDto } from './dto/create-subject.dto';
import { CreateTopicDto } from './dto/create-topic.dto';
import { CreateQuestionDto } from './dto/create-question.dto';

@ApiTags('Learning & Questions')
@Controller()
export class QuestionsController {
  constructor(private readonly questionsService: QuestionsService) {}

  @Post('subjects')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Create a subject (facilitator or admin)' })
  createSubject(@Req() req: { user: { id: string } }, @Body() dto: CreateSubjectDto) {
    return this.questionsService.createSubject(req.user.id, dto);
  }

  @Get('subjects')
  getSubjects() {
    return this.questionsService.getSubjects();
  }

  @Post('topics')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Create a topic under a subject' })
  createTopic(@Req() req: { user: { id: string } }, @Body() dto: CreateTopicDto) {
    return this.questionsService.createTopic(req.user.id, dto);
  }

  @Get('subjects/:subjectId/topics')
  getTopics(@Param('subjectId', ParseUUIDPipe) subjectId: string) {
    return this.questionsService.getTopics(subjectId);
  }

  @Post('questions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Create a multiple-choice question with answer options' })
  createQuestion(@Req() req: { user: { id: string } }, @Body() dto: CreateQuestionDto) {
    return this.questionsService.createQuestion(req.user.id, dto);
  }

  @Get('topics/:topicId/questions')
  @ApiOperation({ summary: 'List published questions without revealing correct answers' })
  getQuestions(@Param('topicId', ParseUUIDPipe) topicId: string) {
    return this.questionsService.getQuestions(topicId);
  }
}
