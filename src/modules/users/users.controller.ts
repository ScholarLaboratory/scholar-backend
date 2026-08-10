import {
  Controller,
  Get,
  Req,
  UseGuards,
  Body,
  Patch,
  Param,
  Post,
  Delete,
  NotFoundException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
  ) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Get current user profile',
  })
  async getMe(@Req() req: any) {
    const user = await this.usersService.findById(req.user.id);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const { password, ...safeUser } = user;

    return {
      success: true,
      message: 'Profile retrieved successfully',
      data: safeUser,
    };
  }

  @Patch('me')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT')
@ApiOperation({
  summary: 'Update current student profile',
})
async updateProfile(
  @Req() req: any,
  @Body() dto: UpdateProfileDto,
) {
  const user = await this.usersService.updateProfile(
    req.user.id,
    dto,
  );

  const { password, ...safeUser } = user;

  return {
    success: true,
    message: 'Profile updated successfully',
    data: safeUser,
  };
}

@Post(':id/follow')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT')
@ApiOperation({
  summary: 'Follow a student',
})
async followUser(
  @Req() req: any,
  @Param('id') userId: string,
) {
  const follow = await this.usersService.follow(
    req.user.id,
    userId,
  );

  return {
    success: true,
    message: 'User followed successfully',
    data: follow,
  };
}

@Delete(':id/follow')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT')
@ApiOperation({
  summary: 'Unfollow a student',
})
async unfollowUser(
  @Req() req: any,
  @Param('id') userId: string,
) {
  return this.usersService.unfollow(
    req.user.id,
    userId,
  );
}

}