import { Controller, Get, Query } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

// Bảng xếp hạng công khai: chỉ trả tên hiển thị, Elo và ảnh đại diện/khung,
// không lộ email, tên đăng nhập hay thông tin riêng tư.
@Controller('online')
export class OnlineLeaderboardController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('leaderboard')
  async getLeaderboard(@Query('limit') limitParam?: string) {
    const parsed = Number.parseInt(limitParam ?? '', 10);
    const limit = Number.isFinite(parsed)
      ? Math.min(50, Math.max(1, parsed))
      : 10;

    const users = await this.prisma.user.findMany({
      orderBy: [{ elo: 'desc' }, { createdAt: 'asc' }],
      take: limit,
      select: {
        id: true,
        displayName: true,
        elo: true,
        avatarId: true,
        avatarFrame: true,
        profileCover: true,
        country: true,
      },
    });

    return {
      leaders: users.map((user, index) => ({
        rank: index + 1,
        id: user.id,
        name: user.displayName,
        elo: user.elo,
        avatarId: user.avatarId,
        avatarFrame: user.avatarFrame,
        cover: user.profileCover,
        country: user.country,
      })),
    };
  }
}
