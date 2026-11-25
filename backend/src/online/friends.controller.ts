import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { MatchResult, MatchStatus, Prisma } from '@prisma/client';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { OnlineGateway } from './online.gateway';
import { PresenceService } from './presence.service';

type AuthReq = { user: { sub: string } };
type Status = 'in-match' | 'online' | 'offline';

const MAX_FRIENDS = 100;

const PUBLIC_USER = {
  id: true,
  displayName: true,
  elo: true,
  avatarId: true,
  avatarFrame: true,
  profileCover: true,
  playerCode: true,
  country: true,
} satisfies Prisma.UserSelect;

type PublicUser = Prisma.UserGetPayload<{ select: typeof PUBLIC_USER }>;

@Controller('friends')
@UseGuards(JwtAuthGuard)
export class FriendsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: OnlineGateway,
    private readonly presence: PresenceService,
  ) {}

  // Thông tin công khai + trạng thái (đang trong trận / online / ngoại tuyến)
  private card(user: PublicUser) {
    const status: Status = this.gateway.isUserInMatch(user.id)
      ? 'in-match'
      : this.presence.isOnline(user.id) || this.gateway.isUserOnline(user.id)
        ? 'online'
        : 'offline';

    return {
      id: user.id,
      displayName: user.displayName,
      elo: user.elo,
      avatarId: user.avatarId,
      avatarFrame: user.avatarFrame,
      cover: user.profileCover,
      playerCode: user.playerCode,
      country: user.country,
      status,
      lastSeenAt: this.presence.lastSeenAt(user.id),
    };
  }

  private async blockedEitherWay(a: string, b: string) {
    const count = await this.prisma.userBlock.count({
      where: {
        OR: [
          { userId: a, blockedId: b },
          { userId: b, blockedId: a },
        ],
      },
    });

    return count > 0;
  }

  private async isFriend(a: string, b: string) {
    const link = await this.prisma.friendship.findUnique({
      where: { userId_friendId: { userId: a, friendId: b } },
    });

    return Boolean(link);
  }

  private async makeFriends(a: string, b: string, tx: Prisma.TransactionClient) {
    await tx.friendRequest.deleteMany({
      where: {
        OR: [
          { fromId: a, toId: b },
          { fromId: b, toId: a },
        ],
      },
    });
    await tx.friendship.createMany({
      data: [
        { userId: a, friendId: b },
        { userId: b, friendId: a },
      ],
      skipDuplicates: true,
    });
  }

  // ---------------------------------------------------------
  // Danh sách
  // ---------------------------------------------------------
  @Get()
  async list(@Req() req: AuthReq) {
    const me = req.user.sub;

    this.presence.touch(me);

    const [links, incoming] = await Promise.all([
      this.prisma.friendship.findMany({
        where: { userId: me },
        include: { friend: { select: PUBLIC_USER } },
      }),
      this.prisma.friendRequest.count({ where: { toId: me } }),
    ]);

    const rank = { 'in-match': 0, online: 1, offline: 2 } as const;

    const friends = links
      .map((link) => ({
        ...this.card(link.friend),
        favorite: link.favorite,
        since: link.createdAt.toISOString(),
      }))
      .sort(
        (a, b) =>
          Number(b.favorite) - Number(a.favorite) ||
          rank[a.status] - rank[b.status] ||
          b.elo - a.elo,
      );

    return { friends, max: MAX_FRIENDS, incoming };
  }

  @Get('requests')
  async requests(@Req() req: AuthReq) {
    const rows = await this.prisma.friendRequest.findMany({
      where: { toId: req.user.sub },
      orderBy: { createdAt: 'desc' },
      include: { from: { select: PUBLIC_USER } },
    });

    return {
      requests: rows.map((r) => ({ id: r.id, at: r.createdAt.toISOString(), user: this.card(r.from) })),
    };
  }

  @Get('sent')
  async sent(@Req() req: AuthReq) {
    const rows = await this.prisma.friendRequest.findMany({
      where: { fromId: req.user.sub },
      orderBy: { createdAt: 'desc' },
      include: { to: { select: PUBLIC_USER } },
    });

    return {
      requests: rows.map((r) => ({ id: r.id, at: r.createdAt.toISOString(), user: this.card(r.to) })),
    };
  }

  @Get('blocked')
  async blocked(@Req() req: AuthReq) {
    const rows = await this.prisma.userBlock.findMany({
      where: { userId: req.user.sub },
      orderBy: { createdAt: 'desc' },
      include: { blocked: { select: PUBLIC_USER } },
    });

    return { users: rows.map((r) => ({ at: r.createdAt.toISOString(), user: this.card(r.blocked) })) };
  }

  // Những người không phải bạn, chưa chặn, chưa gửi lời mời — ưu tiên cùng CLB rồi Elo gần mình.
  @Get('suggest')
  async suggest(@Req() req: AuthReq) {
    const me = req.user.sub;

    const [self, links, reqs, blocks] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: me },
        select: { elo: true, clubMember: { select: { clubId: true } } },
      }),
      this.prisma.friendship.findMany({ where: { userId: me }, select: { friendId: true } }),
      this.prisma.friendRequest.findMany({
        where: { OR: [{ fromId: me }, { toId: me }] },
        select: { fromId: true, toId: true },
      }),
      this.prisma.userBlock.findMany({
        where: { OR: [{ userId: me }, { blockedId: me }] },
        select: { userId: true, blockedId: true },
      }),
    ]);

    const exclude = new Set<string>([me]);

    links.forEach((l) => exclude.add(l.friendId));
    reqs.forEach((r) => {
      exclude.add(r.fromId);
      exclude.add(r.toId);
    });
    blocks.forEach((b) => {
      exclude.add(b.userId);
      exclude.add(b.blockedId);
    });

    const elo = self?.elo ?? 500;
    const clubId = self?.clubMember?.clubId;

    const pool = await this.prisma.user.findMany({
      where: { id: { notIn: [...exclude] } },
      select: { ...PUBLIC_USER, clubMember: { select: { clubId: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });

    const users = pool
      .map((u) => ({
        user: u,
        sameClub: Boolean(clubId && u.clubMember?.clubId === clubId),
        gap: Math.abs(u.elo - elo),
      }))
      .sort((a, b) => Number(b.sameClub) - Number(a.sameClub) || a.gap - b.gap)
      .slice(0, 20)
      .map(({ user, sameClub }) => ({ ...this.card(user), sameClub }));

    return { users };
  }

  // Tìm theo ID (#12345678) hoặc tên hiển thị
  @Get('search')
  async search(@Req() req: AuthReq, @Query('q') q?: string) {
    const query = (q ?? '').trim();

    if (query.length < 2) return { users: [] };

    const code = query.replace(/^#/, '');
    const where: Prisma.UserWhereInput = /^\d{8}$/.test(code)
      ? { playerCode: code }
      : { displayName: { contains: query, mode: 'insensitive' } };

    const users = await this.prisma.user.findMany({
      where: {
        ...where,
        id: { not: req.user.sub },
        blocks: { none: { blockedId: req.user.sub } },
      },
      select: PUBLIC_USER,
      take: 20,
    });

    const friendIds = new Set(
      (
        await this.prisma.friendship.findMany({
          where: { userId: req.user.sub, friendId: { in: users.map((u) => u.id) } },
          select: { friendId: true },
        })
      ).map((f) => f.friendId),
    );

    return { users: users.map((u) => ({ ...this.card(u), isFriend: friendIds.has(u.id) })) };
  }

  // Hồ sơ rút gọn để hiện ở khung bên phải
  @Get('profile/:id')
  async profile(@Req() req: AuthReq, @Param('id') id: string) {
    if (await this.blockedEitherWay(req.user.sub, id)) {
      throw new ForbiddenException('Không thể xem người chơi này');
    }

    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        ...PUBLIC_USER,
        createdAt: true,
        clubMember: { select: { club: { select: { name: true, banner: true } } } },
      },
    });

    if (!user) throw new NotFoundException('Không tìm thấy người chơi');

    const done: Prisma.MatchWhereInput = {
      status: MatchStatus.COMPLETED,
      OR: [{ whiteUserId: id }, { blackUserId: id }],
    };

    const [total, wins, link] = await Promise.all([
      this.prisma.match.count({ where: done }),
      this.prisma.match.count({
        where: {
          status: MatchStatus.COMPLETED,
          OR: [
            { whiteUserId: id, result: MatchResult.WHITE_WIN },
            { blackUserId: id, result: MatchResult.BLACK_WIN },
          ],
        },
      }),
      this.prisma.friendship.findUnique({
        where: { userId_friendId: { userId: req.user.sub, friendId: id } },
      }),
    ]);

    return {
      ...this.card(user),
      joinedAt: user.createdAt.toISOString(),
      club: user.clubMember?.club ?? null,
      stats: {
        total,
        wins,
        winRate: total > 0 ? Math.round((wins / total) * 1000) / 10 : 0,
      },
      friendSince: link?.createdAt.toISOString() ?? null,
      favorite: link?.favorite ?? false,
    };
  }

  // ---------------------------------------------------------
  // Hành động
  // ---------------------------------------------------------
  @Post('request')
  async request(@Req() req: AuthReq, @Body() body: { userId?: unknown }) {
    const me = req.user.sub;
    const to = typeof body?.userId === 'string' ? body.userId : '';

    if (!to || to === me) throw new BadRequestException('Người chơi không hợp lệ');

    const target = await this.prisma.user.findUnique({ where: { id: to }, select: { id: true } });

    if (!target) throw new NotFoundException('Không tìm thấy người chơi');
    if (await this.blockedEitherWay(me, to)) throw new ForbiddenException('Không thể kết bạn với người chơi này');
    if (await this.isFriend(me, to)) throw new ConflictException('Hai bạn đã là bạn bè');

    const count = await this.prisma.friendship.count({ where: { userId: me } });

    if (count >= MAX_FRIENDS) throw new ConflictException(`Bạn đã đạt tối đa ${MAX_FRIENDS} bạn bè`);

    // Người kia đã mời mình trước → đồng ý luôn
    const reverse = await this.prisma.friendRequest.findUnique({
      where: { fromId_toId: { fromId: to, toId: me } },
    });

    if (reverse) {
      await this.prisma.$transaction((tx) => this.makeFriends(me, to, tx));

      return { status: 'friends' };
    }

    try {
      await this.prisma.friendRequest.create({ data: { fromId: me, toId: to } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return { status: 'sent' };
      }

      throw error;
    }

    return { status: 'sent' };
  }

  @Post('requests/:id/accept')
  async accept(@Req() req: AuthReq, @Param('id') id: string) {
    const request = await this.prisma.friendRequest.findUnique({ where: { id } });

    if (!request || request.toId !== req.user.sub) throw new NotFoundException('Lời mời không còn tồn tại');

    const count = await this.prisma.friendship.count({ where: { userId: req.user.sub } });

    if (count >= MAX_FRIENDS) throw new ConflictException(`Bạn đã đạt tối đa ${MAX_FRIENDS} bạn bè`);

    await this.prisma.$transaction((tx) => this.makeFriends(request.fromId, request.toId, tx));

    return { ok: true };
  }

  @Post('requests/:id/decline')
  async decline(@Req() req: AuthReq, @Param('id') id: string) {
    await this.prisma.friendRequest.deleteMany({
      where: { id, OR: [{ toId: req.user.sub }, { fromId: req.user.sub }] },
    });

    return { ok: true };
  }

  @Post(':id/remove')
  async remove(@Req() req: AuthReq, @Param('id') id: string) {
    await this.prisma.friendship.deleteMany({
      where: {
        OR: [
          { userId: req.user.sub, friendId: id },
          { userId: id, friendId: req.user.sub },
        ],
      },
    });

    return { ok: true };
  }

  @Post(':id/favorite')
  async favorite(@Req() req: AuthReq, @Param('id') id: string) {
    const link = await this.prisma.friendship.findUnique({
      where: { userId_friendId: { userId: req.user.sub, friendId: id } },
    });

    if (!link) throw new NotFoundException('Người này chưa là bạn của bạn');

    await this.prisma.friendship.update({
      where: { userId_friendId: { userId: req.user.sub, friendId: id } },
      data: { favorite: !link.favorite },
    });

    return { favorite: !link.favorite };
  }

  @Post(':id/block')
  async block(@Req() req: AuthReq, @Param('id') id: string) {
    const me = req.user.sub;

    if (id === me) throw new BadRequestException('Không thể tự chặn mình');

    await this.prisma.$transaction(async (tx) => {
      await tx.friendship.deleteMany({
        where: {
          OR: [
            { userId: me, friendId: id },
            { userId: id, friendId: me },
          ],
        },
      });
      await tx.friendRequest.deleteMany({
        where: {
          OR: [
            { fromId: me, toId: id },
            { fromId: id, toId: me },
          ],
        },
      });
      await tx.userBlock.upsert({
        where: { userId_blockedId: { userId: me, blockedId: id } },
        create: { userId: me, blockedId: id },
        update: {},
      });
    });

    return { ok: true };
  }

  @Post(':id/unblock')
  async unblock(@Req() req: AuthReq, @Param('id') id: string) {
    await this.prisma.userBlock.deleteMany({ where: { userId: req.user.sub, blockedId: id } });

    return { ok: true };
  }
}
