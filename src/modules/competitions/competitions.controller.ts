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

  @Post(':id/close')
  close(@Req() req: { user: { id: string } }, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.close(req.user.id, id);
  }
}
