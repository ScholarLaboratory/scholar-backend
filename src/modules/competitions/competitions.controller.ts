import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateCompetitionDto } from './dto/create-competition.dto';
import { CompetitionsService } from './competitions.service';

@ApiTags('Competitions')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('competitions')
export class CompetitionsController {
  constructor(private readonly service: CompetitionsService) {}

  @Get()
  @ApiOperation({ summary: 'List discoverable hosted competitions' })
  list(@Req() req: { user: { id: string } }) {
    return this.service.listDiscoverable(req.user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a facilitator-hosted competition draft' })
  create(@Req() req: { user: { id: string } }, @Body() dto: CreateCompetitionDto) {
    return this.service.create(req.user.id, dto);
  }

  @Get(':id')
  get(@Req() req: { user: { id: string } }, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(req.user.id, id);
  }

  @Post(':id/open')
  open(@Req() req: { user: { id: string } }, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.open(req.user.id, id);
  }

  @Post(':id/join')
  join(@Req() req: { user: { id: string } }, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.join(req.user.id, id);
  }

  @Get(':id/leaderboard')
  @ApiOperation({ summary: 'View final competition rankings and joint winners' })
  leaderboard(@Req() req: { user: { id: string } }, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.leaderboard(req.user.id, id);
  }

  @Post(':id/start')
  @ApiOperation({ summary: 'Start synchronized quizzes for registered students' })
  start(@Req() req: { user: { id: string } }, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.start(req.user.id, id);
  }

  @Get(':id/my-quiz')
  @ApiOperation({ summary: 'Get your competition quiz and shared deadline' })
  myQuiz(@Req() req: { user: { id: string } }, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.myQuiz(req.user.id, id);
  }

  @Post(':id/close')
  close(@Req() req: { user: { id: string } }, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.close(req.user.id, id);
  }
}
