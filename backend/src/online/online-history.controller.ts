import {
  Controller,
  Get,
  Req,
  UseGuards,
  Param,
  NotFoundException,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

@Controller('online')
@UseGuards(JwtAuthGuard)
export class OnlineHistoryController {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  @Get('history')
  async getHistory(
    @Req() req: { user: { sub: string } },
  ) {
    const userId = req.user.sub;

    const matches = await this.prisma.match.findMany({
      where: {
        status: 'COMPLETED',
        OR: [
          { whiteUserId: userId },
          { blackUserId: userId },
        ],
      },
      orderBy: {
        finishedAt: 'desc',
      },
      take: 30,
      include: {
        whiteUser: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        blackUser: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    });

    return {
      message: 'Lấy lịch sử đấu thành công',
      total: matches.length,
      matches: matches.map((match) => {
        const isWhite = match.whiteUserId === userId;

        const opponent = isWhite
          ? match.blackUser
          : match.whiteUser;

        const myEloBefore = isWhite
          ? match.whiteEloBefore
          : match.blackEloBefore;

        const myEloChange = isWhite
          ? match.whiteEloChange
          : match.blackEloChange;

        const myEloAfter = isWhite
          ? match.whiteEloAfter
          : match.blackEloAfter;

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

        return {
          id: match.id,
          mode: match.mode,
          result: match.result,
          myResult,
          reason: match.reason,

          myColor: isWhite ? 'WHITE' : 'BLACK',

          opponent,

          myEloBefore,
          myEloChange,
          myEloAfter,

          opponentEloBefore: isWhite
            ? match.blackEloBefore
            : match.whiteEloBefore,

          opponentEloChange: isWhite
            ? match.blackEloChange
            : match.whiteEloChange,

          opponentEloAfter: isWhite
            ? match.blackEloAfter
            : match.whiteEloAfter,

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
          },
        },
        blackUser: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
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