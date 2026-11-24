
import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  // Tính thống kê các trận đã hoàn thành
  private async getPlayerStats(userId: string) {
    const matches = await this.prisma.match.findMany({
      where: {
        status: 'COMPLETED',
        OR: [
          { whiteUserId: userId },
          { blackUserId: userId },
        ],
      },
      select: {
        whiteUserId: true,
        blackUserId: true,
        result: true,
      },
    });

    let wins = 0;
    let losses = 0;
    let draws = 0;

    for (const match of matches) {
      if (!match.result) continue;

      if (match.result === 'DRAW') {
        draws++;
        continue;
      }

      const isWhite = match.whiteUserId === userId;

      const isWinner =
        (match.result === 'WHITE_WIN' && isWhite) ||
        (match.result === 'BLACK_WIN' && !isWhite);

      if (isWinner) {
        wins++;
      } else {
        losses++;
      }
    }

    const totalMatches = wins + losses + draws;

    const winRate = totalMatches > 0
      ? Math.round((wins / totalMatches) * 100)
      : 0;

    return {
      totalMatches,
      wins,
      losses,
      draws,
      winRate,
    };
  }

  // Lấy hồ sơ người đang đăng nhập
  async getMyProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        elo: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException(
        'Không tìm thấy tài khoản',
      );
    }

    const stats = await this.getPlayerStats(userId);

    return {
      message: 'Lấy hồ sơ người chơi thành công',
      user: {
        ...user,
        stats,
      },
    };
  }

  // Xem hồ sơ người chơi khác bằng username
  async getPlayerProfile(username: string) {
    const user = await this.prisma.user.findUnique({
      where: {
        username: username.toLowerCase(),
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        elo: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException(
        'Không tìm thấy người chơi',
      );
    }

    const stats = await this.getPlayerStats(user.id);

    return {
      message: 'Lấy hồ sơ người chơi thành công',
      user: {
        ...user,
        stats,
      },
    };
  }

  // Lấy Top 100 người chơi theo Elo
  async getLeaderboard() {
    const users = await this.prisma.user.findMany({
      orderBy: [
        { elo: 'desc' },
        { createdAt: 'asc' },
      ],
      take: 100,
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        elo: true,
      },
    });

    return {
      message: 'Lấy bảng xếp hạng thành công',
      total: users.length,
      leaderboard: users.map((user, index) => ({
        rank: index + 1,
        ...user,
      })),
    };
  }
}
