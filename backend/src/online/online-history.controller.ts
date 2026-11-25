import {
  Controller,
  Get,
  Req,
  UseGuards,
  Param,
  Query,
  NotFoundException,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

const HISTORY_LIMIT = 30;

@Controller('online')
@UseGuards(JwtAuthGuard)
export class OnlineHistoryController {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  @Get('history')
  async getHistory(
    @Req() req: { user: { sub: string } },
    @Query('page') pageRaw?: string,
    @Query('mode') modeRaw?: string,
    @Query('size') sizeRaw?: string,
  ) {
    const userId = req.user.sub;
    const size = Math.min(30, Math.max(1, Number(sizeRaw) || 30));
    const mode: 'RANKED' | 'CASUAL' | undefined =
      modeRaw === 'RANKED' ? 'RANKED' : modeRaw === 'CASUAL' ? 'CASUAL' : undefined;

    const where = {
      status: 'COMPLETED' as const,
      ...(mode ? { mode } : {}),
      OR: [{ whiteUserId: userId }, { blackUserId: userId }],
    };

    // Lịch sử chỉ giữ 30 ván gần nhất: có ván mới thì ván cũ nhất bị đẩy ra
    const total = Math.min(HISTORY_LIMIT, await this.prisma.match.count({ where }));
    const pages = Math.max(1, Math.ceil(total / size));
    const page = Math.min(pages, Math.max(1, Number(pageRaw) || 1));

    const userSelect = {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      avatarId: true,
      avatarFrame: true,
      elo: true,
    };

    const [matches, me] = await Promise.all([
      this.prisma.match.findMany({
        where,
        orderBy: { finishedAt: 'desc' },
        skip: (page - 1) * size,
        take: Math.max(0, Math.min(size, HISTORY_LIMIT - (page - 1) * size)),
        include: {
          whiteUser: { select: userSelect },
          blackUser: { select: userSelect },
        },
      }),
      this.prisma.user.findUnique({ where: { id: userId }, select: userSelect }),
    ]);

    return {
      message: 'Lấy lịch sử đấu thành công',
      total,
      page,
      pages,
      me,
      matches: matches.map((match) => {
        const isWhite = match.whiteUserId === userId;
        const opponent = isWhite ? match.blackUser : match.whiteUser;

        let myResult: 'WIN' | 'LOSS' | 'DRAW';

        if (match.result === 'DRAW') {
          myResult = 'DRAW';
        } else if (
          (match.result === 'WHITE_WIN' && isWhite) ||
          (match.result === 'BLACK_WIN' && !isWhite)
        ) {
          myResult = 'WIN';
        } else {
          myResult = 'LOSS';
        }

        // Thời lượng ván (giây) và số nước đi
        const durationSec =
          match.finishedAt && match.startedAt
            ? Math.max(0, Math.round((match.finishedAt.getTime() - match.startedAt.getTime()) / 1000))
            : null;
        const moveCount = Array.isArray(match.moves) ? match.moves.length : 0;

        return {
          id: match.id,
          mode: match.mode,
          result: match.result,
          myResult,
          reason: match.reason,
          myColor: isWhite ? 'WHITE' : 'BLACK',
          opponent,
          myEloBefore: isWhite ? match.whiteEloBefore : match.blackEloBefore,
          myEloChange: isWhite ? match.whiteEloChange : match.blackEloChange,
          myEloAfter: isWhite ? match.whiteEloAfter : match.blackEloAfter,
          opponentEloBefore: isWhite ? match.blackEloBefore : match.whiteEloBefore,
          opponentEloChange: isWhite ? match.blackEloChange : match.whiteEloChange,
          opponentEloAfter: isWhite ? match.blackEloAfter : match.whiteEloAfter,
          durationSec,
          moveCount,
          startedAt: match.startedAt,
          finishedAt: match.finishedAt,
        };
      }),
    };
  }

    @Get('history/:id')
  async getMatchDetail(
    @Param('id') matchId: string,
    @Req() req: { user: { sub: string } },
  ) {
    const userId = req.user.sub;

    const match = await this.prisma.match.findFirst({
      where: {
        id: matchId,
        status: 'COMPLETED',
        OR: [
          { whiteUserId: userId },
          { blackUserId: userId },
        ],
      },
      include: {
        whiteUser: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            avatarId: true,
            avatarFrame: true,
            elo: true,
          },
        },
        blackUser: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            avatarId: true,
            avatarFrame: true,
            elo: true,
          },
        },
      },
    });

    if (!match) {
      throw new NotFoundException(
        'Không tìm thấy trận đấu hoặc bạn không có quyền xem trận đấu này',
      );
    }

    const isWhite = match.whiteUserId === userId;

    const myResult =
      match.result === 'DRAW'
        ? 'DRAW'
        : (
            (match.result === 'WHITE_WIN' && isWhite) ||
            (match.result === 'BLACK_WIN' && !isWhite)
          )
          ? 'WIN'
          : 'LOSS';

    return {
      message: 'Lấy chi tiết trận đấu thành công',

      match: {
        id: match.id,
        mode: match.mode,
        status: match.status,
        result: match.result,
        myResult,
        reason: match.reason,

        myColor: isWhite ? 'WHITE' : 'BLACK',

        players: {
          white: match.whiteUser,
          black: match.blackUser,
        },

        elo: {
          white: {
            before: match.whiteEloBefore,
            change: match.whiteEloChange,
            after: match.whiteEloAfter,
          },
          black: {
            before: match.blackEloBefore,
            change: match.blackEloChange,
            after: match.blackEloAfter,
          },
        },

        pgn: match.pgn,
        finalFen: match.finalFen,
        moves: match.moves,
        analysis: match.analysis,

        startedAt: match.startedAt,
        finishedAt: match.finishedAt,
      },
    };
  }
}