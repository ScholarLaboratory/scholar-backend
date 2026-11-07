import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async searchStudents(requesterId: string, query: string) {
    const term = query.trim();
    if (term.length < 2 || term.length > 60) {
      throw new BadRequestException('Search must contain between 2 and 60 characters.');
    }
    return this.prisma.user.findMany({
      where: {
        id: { not: requesterId },
        role: 'STUDENT',
        OR: [
          { username: { contains: term, mode: 'insensitive' } },
          { fullName: { contains: term, mode: 'insensitive' } },
        ],
      },
      select: { id: true, username: true, fullName: true, school: true, level: true },
      orderBy: { username: 'asc' },
      take: 10,
    });
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async findByUsername(username: string) {
    return this.prisma.user.findUnique({
      where: { username },
    });
  }

  async create(data: CreateUserDto) {
    return this.prisma.user.create({
      data,
    });
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }

  async followUser(
  followerId: string,
  followingId: string,
) {
  return this.prisma.follow.create({
    data: {
      followerId,
      followingId,
    },
  });
}

async unfollowUser(
  followerId: string,
  followingId: string,
) {
  return this.prisma.follow.delete({
    where: {
      followerId_followingId: {
        followerId,
        followingId,
      },
    },
  });
}

  async updateProfile(
  id: string,
  data: UpdateProfileDto,
) {
  return this.prisma.user.update({
    where: { id },
    data,
  });
}

async follow(
  followerId: string,
  followingId: string,
) {
  if (followerId === followingId) {
    throw new BadRequestException(
      'You cannot follow yourself',
    );
  }

  const user = await this.prisma.user.findUnique({
    where: {
      id: followingId,
    },
  });

  if (!user) {
    throw new NotFoundException(
      'User not found',
    );
  }

  const existingFollow =
    await this.prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId,
          followingId,
        },
      },
    });

  if (existingFollow) {
    throw new ConflictException(
      'You are already following this user',
    );
  }

  return this.prisma.follow.create({
    data: {
      followerId,
      followingId,
    },
  });
}

async unfollow(
  followerId: string,
  followingId: string,
) {
  const existingFollow =
    await this.prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId,
          followingId,
        },
      },
    });

  if (!existingFollow) {
    throw new NotFoundException(
      'You are not following this user',
    );
  }

  await this.prisma.follow.delete({
    where: {
      followerId_followingId: {
        followerId,
        followingId,
      },
    },
  });

  return {
    success: true,
    message: 'User unfollowed successfully',
  };
}
async getFollowers(userId: string) {
  const user = await this.prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new NotFoundException('User not found');
  }

  const followers = await this.prisma.follow.findMany({
    where: {
      followingId: userId,
    },
    include: {
      follower: {
        select: {
          id: true,
          fullName: true,
          username: true,
          bio: true,
          school: true,
          level: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return followers.map((follow) => follow.follower);
}

async getFollowing(userId: string) {
  const user = await this.prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new NotFoundException('User not found');
  }

  const following = await this.prisma.follow.findMany({
    where: {
      followerId: userId,
    },
    include: {
      following: {
        select: {
          id: true,
          fullName: true,
          username: true,
          bio: true,
          school: true,
          level: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return following.map((follow) => follow.following);
}
}