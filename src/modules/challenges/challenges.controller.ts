import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateChallengeDto } from './dto/create-challenge.dto';
import { ChallengesService } from './challenges.service';

@ApiTags('Challenges')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('challenges')
export class ChallengesController {
  constructor(private readonly challengesService: ChallengesService) {}

  @Post()
  @ApiOperation({ summary: 'Invite another student to a 1v1 challenge' })
  create(@Req() req: { user: { id: string } }, @Body() dto: CreateChallengeDto) {
    return this.challengesService.create(req.user.id, dto);
  }

  @Get('mine')
  @ApiOperation({ summary: 'List challenges sent to or received by me' })
  mine(@Req() req: { user: { id: string } }) {
    return this.challengesService.myChallenges(req.user.id);
  }

  @Post(':id/decline')
  @ApiOperation({ summary: 'Decline a pending challenge invitation' })
  decline(@Req() req: { user: { id: string } }, @Param('id', ParseUUIDPipe) id: string) {
    return this.challengesService.decline(req.user.id, id);
  }

  @Post(':id/accept')
  @ApiOperation({ summary: 'Accept a challenge and create matching quizzes' })
  accept(@Req() req: { user: { id: string } }, @Param('id', ParseUUIDPipe) id: string) {
    return this.challengesService.accept(req.user.id, id);
  }

  @Post(':id/ready')
  @ApiOperation({ summary: 'Signal ready; shared countdown starts when both players are ready' })
  ready(@Req() req: { user: { id: string } }, @Param('id', ParseUUIDPipe) id: string) {
    return this.challengesService.ready(req.user.id, id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'View your challenge and its result' })
  get(@Req() req: { user: { id: string } }, @Param('id', ParseUUIDPipe) id: string) {
    return this.challengesService.get(req.user.id, id);
  }

  @Post(':id/finalize')
  @ApiOperation({ summary: 'Determine winner after both quizzes are completed' })
  finalize(@Req() req: { user: { id: string } }, @Param('id', ParseUUIDPipe) id: string) {
    return this.challengesService.finalize(req.user.id, id);
  }
}
