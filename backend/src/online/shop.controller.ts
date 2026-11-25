import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { BOARD_THEMES, PIECE_SETS, findItem, hasItem } from './shop.catalog';

type AuthReq = { user: { sub: string } };

@Controller('shop')
@UseGuards(JwtAuthGuard)
export class ShopController {
  constructor(private readonly prisma: PrismaService) {}

  private async wallet(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        coins: true,
        gems: true,
        boardTheme: true,
        pieceSet: true,
        items: { select: { itemId: true } },
      },
    });

    if (!user) throw new NotFoundException('Không tìm thấy tài khoản');

    return {
      coins: user.coins,
      gems: user.gems,
      boardTheme: user.boardTheme,
      pieceSet: user.pieceSet,
      owned: user.items.map((i) => i.itemId),
    };
  }

  @Get('me')
  me(@Req() req: AuthReq) {
    return this.wallet(req.user.sub);
  }

  @Post('buy')
  async buy(@Req() req: AuthReq, @Body() body: { itemId?: unknown }) {
    const itemId = typeof body?.itemId === 'string' ? body.itemId : '';
    const item = findItem(itemId);

    if (!item) throw new BadRequestException('Vật phẩm không tồn tại');
    if (!item.available) throw new BadRequestException('Vật phẩm này chưa mở bán');

    try {
      await this.prisma.$transaction(async (tx) => {
        const owned = await tx.userItem.findUnique({
          where: { userId_itemId: { userId: req.user.sub, itemId } },
        });

        if (owned) throw new ConflictException('Bạn đã sở hữu vật phẩm này');

        // Trừ tiền có điều kiện để không bao giờ âm (an toàn khi bấm mua 2 lần liên tiếp)
        const paid =
          item.currency === 'gems'
            ? await tx.user.updateMany({
                where: { id: req.user.sub, gems: { gte: item.price } },
                data: { gems: { decrement: item.price } },
              })
            : await tx.user.updateMany({
                where: { id: req.user.sub, coins: { gte: item.price } },
                data: { coins: { decrement: item.price } },
              });

        if (paid.count !== 1) {
          throw new BadRequestException(
            item.currency === 'gems' ? 'Bạn không đủ kim cương' : 'Bạn không đủ xu',
          );
        }

        await tx.userItem.create({ data: { userId: req.user.sub, itemId } });

        // Ghi sổ cái khi trả bằng kim cương
        if (item.currency === 'gems' && item.price > 0) {
          const after = await tx.user.findUnique({ where: { id: req.user.sub }, select: { gems: true } });

          await tx.gemTransaction.create({
            data: {
              userId: req.user.sub,
              delta: -item.price,
              balance: after?.gems ?? 0,
              reason: 'PURCHASE',
              refId: itemId,
            },
          });
        }
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Bạn đã sở hữu vật phẩm này');
      }

      throw error;
    }

    return this.wallet(req.user.sub);
  }

  // Chọn bàn cờ đang dùng
  @Post('board')
  async useBoard(@Req() req: AuthReq, @Body() body: { theme?: unknown }) {
    const theme = typeof body?.theme === 'string' ? body.theme : '';

    if (!BOARD_THEMES.includes(theme)) throw new BadRequestException('Bàn cờ không hợp lệ');

    const { owned } = await this.wallet(req.user.sub);

    if (!hasItem(`board:${theme}`, new Set(owned))) {
      throw new BadRequestException('Bạn chưa sở hữu bàn cờ này');
    }

    await this.prisma.user.update({
      where: { id: req.user.sub },
      data: { boardTheme: theme },
    });

    return this.wallet(req.user.sub);
  }

  // Chọn bộ quân cờ đang dùng
  @Post('pieces')
  async usePieces(@Req() req: AuthReq, @Body() body: { set?: unknown }) {
    const set = typeof body?.set === 'string' ? body.set : '';

    if (!PIECE_SETS.includes(set)) throw new BadRequestException('Bộ quân cờ không hợp lệ');

    const { owned } = await this.wallet(req.user.sub);

    if (!hasItem(`piece:${set}`, new Set(owned))) {
      throw new BadRequestException('Bạn chưa sở hữu bộ quân cờ này');
    }

    // Chỉ đổi bộ quân; bàn cờ chọn riêng ở tab Skin Bàn Cờ
    await this.prisma.user.update({
      where: { id: req.user.sub },
      data: { pieceSet: set },
    });

    return this.wallet(req.user.sub);
  }
}
