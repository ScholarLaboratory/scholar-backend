import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StartQuizDto } from './dto/start-quiz.dto';
import { SubmitAnswerDto } from './dto/submit-answer.dto';
import { QuizService } from './quiz.service';

@ApiTags('Quiz')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('quizzes')
export class QuizController {
  constructor(private readonly quizService: QuizService) {}

  @Post()
  @ApiOperation({ summary: 'Start a quiz with a fixed question set' })
  start(@Req() req: { user: { id: string } }, @Body() dto: StartQuizDto) {
    return this.quizService.start(req.user.id, dto);
  }

  @Get('leaderboard')
  @ApiOperation({ summary: 'Top students by earned quiz XP' })
  leaderboard() {
    return this.quizService.leaderboard();
  }

  @Get('results/me')
  @ApiOperation({ summary: 'List my completed quiz results' })
  myResults(@Req() req: { user: { id: string } }) {
    return this.quizService.myResults(req.user.id);
  }

  @Get(':sessionId')
  @ApiOperation({ summary: 'Resume quiz without exposing correct answers' })
  getSession(@Req() req: { user: { id: string } }, @Param('sessionId', ParseUUIDPipe) sessionId: string) {
    return this.quizService.getSession(req.user.id, sessionId);
  }

  @Post(':sessionId/answers')
  @ApiOperation({ summary: 'Submit one answer; duplicate answers are rejected' })
  submitAnswer(
    @Req() req: { user: { id: string } },
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() dto: SubmitAnswerDto,
  ) {
    return this.quizService.submitAnswer(req.user.id, sessionId, dto);
  }

  @Post(':sessionId/complete')
  @ApiOperation({ summary: 'Complete quiz and calculate score and XP' })
  complete(@Req() req: { user: { id: string } }, @Param('sessionId', ParseUUIDPipe) sessionId: string) {
    return this.quizService.complete(req.user.id, sessionId);
  }
}
