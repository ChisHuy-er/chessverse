import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { MatchMode, MatchResult, MatchStatus, Prisma } from '@prisma/client';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { parseAppearance } from './appearance';
import { hasItem } from './shop.catalog';
import { detectCountry } from '../auth/geo';
import type { AppearanceInput } from './appearance';

type MyResult = 'WIN' | 'LOSS' | 'DRAW';

@Controller('online')
export class OnlineProfileController {
  constructor(private readonly prisma: PrismaService) {}

  // Hồ sơ của chính người dùng đang đăng nhập: thống kê, hạng, trận gần đây.
  @Get('profile')
  @UseGuards(JwtAuthGuard)
  async getProfile(@Req() req: { user: { sub: string } }) {
    const userId = req.user.sub;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        displayName: true,
        username: true,
        elo: true,
        createdAt: true,
        avatarId: true,
        avatarFrame: true,
        profileCover: true,
        country: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }

    const mine: Prisma.MatchWhereInput = {
      status: MatchStatus.COMPLETED,
      OR: [{ whiteUserId: userId }, { blackUserId: userId }],
    };

    const [wins, losses, draws, higher, totalPlayers, recentRaw] =
      await Promise.all([
        this.prisma.match.count({
          where: {
            status: MatchStatus.COMPLETED,
            OR: [
              { whiteUserId: userId, result: MatchResult.WHITE_WIN },
              { blackUserId: userId, result: MatchResult.BLACK_WIN },
            ],
          },
        }),
        this.prisma.match.count({
          where: {
            status: MatchStatus.COMPLETED,
            OR: [
              { whiteUserId: userId, result: MatchResult.BLACK_WIN },
              { blackUserId: userId, result: MatchResult.WHITE_WIN },
            ],
          },
        }),
        this.prisma.match.count({
          where: { ...mine, result: MatchResult.DRAW },
        }),
        this.prisma.user.count({ where: { elo: { gt: user.elo } } }),
        this.prisma.user.count(),
        this.prisma.match.findMany({
          where: mine,
          orderBy: [{ finishedAt: 'desc' }, { createdAt: 'desc' }],
          take: 10,
          select: {
            id: true,
            mode: true,
            result: true,
            whiteUserId: true,
            whiteEloChange: true,
            blackEloChange: true,
            finishedAt: true,
            createdAt: true,
            whiteEloAfter: true,
            blackEloAfter: true,
            whiteUser: { select: { displayName: true, elo: true, avatarId: true, avatarFrame: true, country: true } },
            blackUser: { select: { displayName: true, elo: true, avatarId: true, avatarFrame: true, country: true } },
          },
        }),
      ]);

    const recent = recentRaw.map((match) => {
      const isWhite = match.whiteUserId === userId;

      let result: MyResult = 'DRAW';

      if (match.result === MatchResult.WHITE_WIN) {
        result = isWhite ? 'WIN' : 'LOSS';
      } else if (match.result === MatchResult.BLACK_WIN) {
        result = isWhite ? 'LOSS' : 'WIN';
      }

      return {
        id: match.id,
        mode: match.mode,
        result,
        opponent: isWhite
          ? match.blackUser.displayName
          : match.whiteUser.displayName,
        opponentElo: (isWhite ? match.blackEloAfter : match.whiteEloAfter) ?? (isWhite ? match.blackUser.elo : match.whiteUser.elo),
        opponentAvatar: isWhite ? match.blackUser.avatarId : match.whiteUser.avatarId,
        opponentFrame: isWhite ? match.blackUser.avatarFrame : match.whiteUser.avatarFrame,
        opponentCountry: isWhite ? match.blackUser.country : match.whiteUser.country,
        eloChange: isWhite ? match.whiteEloChange : match.blackEloChange,
        playedAt: (match.finishedAt ?? match.createdAt).toISOString(),
      };
    });

    const lastRanked = recent.find((match) => match.mode === MatchMode.RANKED);
    const total = wins + losses + draws;

    return {
      user: {
        id: user.id,
        displayName: user.displayName,
        username: user.username,
        elo: user.elo,
        country: user.country,
        createdAt: user.createdAt.toISOString(),
      },
      stats: {
        total,
        wins,
        losses,
        draws,
        winRate: total > 0 ? Math.round((wins / total) * 1000) / 10 : 0,
      },
      rank: { position: higher + 1, totalPlayers },
      appearance: {
        avatar: user.avatarId,
        frame: user.avatarFrame,
        cover: user.profileCover,
      },
      eloDelta: lastRanked?.eloChange ?? 0,
      recent: recent.slice(0, 5),
    };
  }

  // Lưu ảnh đại diện, khung và nền hồ sơ.
  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  async updateAppearance(
    @Req() req: { user: { sub: string } },
    @Body() body: AppearanceInput,
  ) {
    const data = parseAppearance(body);

    if (!data) {
      throw new BadRequestException('Lựa chọn giao diện không hợp lệ');
    }

    // Khung / ảnh nền trả phí phải mua ở Cửa hàng trước (giữ nguyên lựa chọn cũ thì không kiểm tra).
    const current = await this.prisma.user.findUnique({
      where: { id: req.user.sub },
      select: {
        avatarFrame: true,
        profileCover: true,
        items: { select: { itemId: true } },
      },
    });
    const owned = new Set(current?.items.map((i) => i.itemId) ?? []);

    if (
      (data.avatarFrame !== current?.avatarFrame && !hasItem(`frame:${data.avatarFrame}`, owned)) ||
      (data.profileCover !== current?.profileCover && !hasItem(`cover:${data.profileCover}`, owned))
    ) {
      throw new BadRequestException('Bạn chưa sở hữu khung hoặc ảnh nền này. Hãy mua ở Cửa hàng.');
    }

    await this.prisma.user.update({
      where: { id: req.user.sub },
      data,
    });

    return {
      appearance: {
        avatar: data.avatarId,
        frame: data.avatarFrame,
        cover: data.profileCover,
      },
    };
  }

  // Tự điền quốc gia cho tài khoản chưa có (dựa vào múi giờ / ngôn ngữ trình duyệt)
  @Patch('profile/country')
  @UseGuards(JwtAuthGuard)
  async fillCountry(
    @Req() req: { user: { sub: string }; headers: Record<string, string | string[] | undefined> },
    @Body() body: { timeZone?: unknown; locale?: unknown },
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: req.user.sub }, select: { country: true } });

    if (user?.country) return { country: user.country };

    const geo = req.headers['x-geo-country'];
    const country = detectCountry({
      geoHeader: Array.isArray(geo) ? geo[0] : geo,
      timeZone: typeof body?.timeZone === 'string' ? body.timeZone : undefined,
      locale: typeof body?.locale === 'string' ? body.locale : undefined,
    });

    if (country) {
      await this.prisma.user.update({ where: { id: req.user.sub }, data: { country } });
    }

    return { country };
  }

  // Đổi tên hiển thị (2–50 ký tự).
  @Patch('profile/name')
  @UseGuards(JwtAuthGuard)
  async updateDisplayName(
    @Req() req: { user: { sub: string } },
    @Body() body: { displayName?: unknown },
  ) {
    const displayName =
      typeof body?.displayName === 'string'
        ? body.displayName.trim().replace(/\s+/g, ' ')
        : '';

    if (displayName.length < 2 || displayName.length > 50) {
      throw new BadRequestException('Tên hiển thị phải có từ 2 đến 50 ký tự');
    }

    await this.prisma.user.update({
      where: { id: req.user.sub },
      data: { displayName },
    });

    return { displayName };
  }
}
