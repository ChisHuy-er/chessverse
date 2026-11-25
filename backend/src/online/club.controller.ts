import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ClubRole, MatchResult, MatchStatus, Prisma } from '@prisma/client';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { OnlineGateway } from './online.gateway';
import { PresenceService } from './presence.service';

type AuthReq = { user: { sub: string } };

const MAX_MEMBERS = 30;
const EXP_PER_MATCH = 100;
const EXP_PER_LEVEL = 5000;

// Mẫu cờ CLB (khớp ảnh trong public/images/academy/club/flags)
const BANNERS = [
  'b0', 'b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8',
  'e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8', 'e9', 'e10',
];

// Đầu tuần (thứ Hai 00:00 giờ Việt Nam, UTC+7) — nhiệm vụ CLB làm mới theo tuần.
function weekStart(now = new Date()) {
  const vn = new Date(now.getTime() + 7 * 3600_000);
  const day = (vn.getUTCDay() + 6) % 7; // 0 = thứ Hai
  const monday = Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate() - day);

  return new Date(monday - 7 * 3600_000);
}

// Khu vực CLB: mã quốc gia 2 chữ cái (VN, US, JP...)
function cleanRegion(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;

  const code = value.trim().toUpperCase();

  if (!/^[A-Z]{2}$/.test(code)) throw new BadRequestException('Khu vực không hợp lệ');

  return code;
}

function cleanText(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : undefined;
}

@Controller('club')
@UseGuards(JwtAuthGuard)
export class ClubController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: OnlineGateway,
    private readonly presence: PresenceService,
  ) {}

  // Điểm CLB = tổng Elo thành viên. Trả về bảng xếp hạng toàn bộ CLB.
  private async rankAll() {
    const clubs = await this.prisma.club.findMany({
      select: {
        id: true,
        name: true,
        description: true,
        banner: true,
        region: true,
        members: { select: { user: { select: { elo: true } } } },
      },
    });

    return clubs
      .map((club) => ({
        id: club.id,
        name: club.name,
        description: club.description,
        banner: club.banner,
        region: club.region,
        memberCount: club.members.length,
        score: club.members.reduce((sum, m) => sum + m.user.elo, 0),
      }))
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
      .map((club, index) => ({ ...club, rank: index + 1 }));
  }

  private async membership(userId: string) {
    return this.prisma.clubMember.findUnique({ where: { userId } });
  }

  // ---------------------------------------------------------
  // Tổng quan CLB của tôi
  // ---------------------------------------------------------
  @Get('me')
  async getMine(@Req() req: AuthReq) {
    this.presence.touch(req.user.sub);

    const mine = await this.membership(req.user.sub);

    if (!mine) return { club: null };

    const club = await this.prisma.club.findUnique({
      where: { id: mine.clubId },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                displayName: true,
                elo: true,
                avatarId: true,
                avatarFrame: true,
              },
            },
          },
        },
      },
    });

    if (!club) return { club: null };

    const memberIds = club.members.map((m) => m.userId);
    const completed: Prisma.MatchWhereInput = { status: MatchStatus.COMPLETED };

    // EXP: mỗi ván thành viên chơi xong sau khi vào CLB = 100 EXP.
    const perMember = await Promise.all(
      club.members.map((m) =>
        this.prisma.match.count({
          where: {
            ...completed,
            finishedAt: { gte: m.joinedAt },
            OR: [{ whiteUserId: m.userId }, { blackUserId: m.userId }],
          },
        }),
      ),
    );
    const exp = perMember.reduce((a, b) => a + b, 0) * EXP_PER_MATCH;

    // Nhiệm vụ tuần
    const since = weekStart();
    const weekMatches = await this.prisma.match.findMany({
      where: {
        ...completed,
        finishedAt: { gte: since },
        OR: [{ whiteUserId: { in: memberIds } }, { blackUserId: { in: memberIds } }],
      },
      select: { whiteUserId: true, blackUserId: true, result: true },
    });

    const inClub = new Set(memberIds);
    const played = new Set<string>();
    let wins = 0;

    for (const match of weekMatches) {
      if (inClub.has(match.whiteUserId)) played.add(match.whiteUserId);
      if (inClub.has(match.blackUserId)) played.add(match.blackUserId);
      if (match.result === MatchResult.WHITE_WIN && inClub.has(match.whiteUserId)) wins++;
      if (match.result === MatchResult.BLACK_WIN && inClub.has(match.blackUserId)) wins++;
    }

    const ranking = await this.rankAll();
    const myRank = ranking.find((r) => r.id === club.id);
    const order: Record<ClubRole, number> = { LEADER: 0, OFFICER: 1, MEMBER: 2 };
    const leader = club.members.find((m) => m.role === ClubRole.LEADER);

    return {
      club: {
        id: club.id,
        name: club.name,
        description: club.description,
        announcement: club.announcement,
        banner: club.banner,
        region: club.region,
        createdAt: club.createdAt.toISOString(),
        level: Math.floor(exp / EXP_PER_LEVEL) + 1,
        exp,
        expInLevel: exp % EXP_PER_LEVEL,
        expPerLevel: EXP_PER_LEVEL,
        memberCount: club.members.length,
        maxMembers: MAX_MEMBERS,
        leader: leader?.user.displayName ?? '—',
        rank: myRank?.rank ?? 0,
        totalClubs: ranking.length,
        score: myRank?.score ?? 0,
      },
      me: { userId: req.user.sub, role: mine.role },
      members: club.members
        .map((m) => ({
          id: m.userId,
          displayName: m.user.displayName,
          elo: m.user.elo,
          avatarId: m.user.avatarId,
          avatarFrame: m.user.avatarFrame,
          role: m.role,
          joinedAt: m.joinedAt.toISOString(),
          online: this.presence.isOnline(m.userId) || this.gateway.isUserOnline(m.userId),
          lastSeenAt: this.presence.lastSeenAt(m.userId),
        }))
        .sort((a, b) => order[a.role] - order[b.role] || b.elo - a.elo),
      ranking: ranking.slice(0, 5).map(({ id, name, banner, score, rank, memberCount }) => ({
        id,
        name,
        banner,
        score,
        rank,
        memberCount,
      })),
      tasks: [
        { id: 'matches', title: 'Cả CLB chơi 20 ván trong tuần', progress: weekMatches.length, target: 20 },
        { id: 'wins', title: 'Thành viên thắng 10 ván trong tuần', progress: wins, target: 10 },
        {
          id: 'active',
          title: `${Math.min(5, club.members.length)} thành viên cùng thi đấu trong tuần`,
          progress: played.size,
          target: Math.min(5, club.members.length),
        },
      ],
      resetAt: new Date(since.getTime() + 7 * 24 * 3600_000).toISOString(),
    };
  }

  // ---------------------------------------------------------
  // Tìm CLB
  // ---------------------------------------------------------
  @Get('list')
  async list(@Query('q') q?: string) {
    const query = (q ?? '').trim().toLowerCase();
    const ranking = await this.rankAll();

    return {
      clubs: ranking
        .filter((c) => !query || c.name.toLowerCase().includes(query))
        .slice(0, 30)
        .map((c) => ({ ...c, maxMembers: MAX_MEMBERS })),
    };
  }

  // ---------------------------------------------------------
  // Tạo / tham gia / rời CLB
  // ---------------------------------------------------------
  @Post()
  async create(@Req() req: AuthReq, @Body() body: { name?: unknown; description?: unknown; region?: unknown }) {
    const name = cleanText(body?.name, 40)?.replace(/\s+/g, ' ') ?? '';
    const description = cleanText(body?.description, 200) ?? '';

    if (name.length < 3 || name.length > 30) {
      throw new BadRequestException('Tên câu lạc bộ phải có từ 3 đến 30 ký tự');
    }

    if (await this.membership(req.user.sub)) {
      throw new ConflictException('Bạn đang ở trong một câu lạc bộ khác');
    }

    try {
      const club = await this.prisma.club.create({
        data: {
          name,
          description,
          region: cleanRegion(body?.region) ?? 'VN',
          members: { create: { userId: req.user.sub, role: ClubRole.LEADER } },
        },
      });

      return { id: club.id };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Tên câu lạc bộ đã có người dùng');
      }

      throw error;
    }
  }

  @Post(':id/join')
  async join(@Req() req: AuthReq, @Param('id') id: string) {
    if (await this.membership(req.user.sub)) {
      throw new ConflictException('Bạn đang ở trong một câu lạc bộ khác');
    }

    const club = await this.prisma.club.findUnique({
      where: { id },
      select: { _count: { select: { members: true } } },
    });

    if (!club) throw new NotFoundException('Không tìm thấy câu lạc bộ');

    if (club._count.members >= MAX_MEMBERS) {
      throw new ConflictException('Câu lạc bộ đã đủ thành viên');
    }

    await this.prisma.clubMember.create({ data: { userId: req.user.sub, clubId: id } });

    return { ok: true };
  }

  @Post('leave')
  async leave(@Req() req: AuthReq) {
    const mine = await this.membership(req.user.sub);

    if (!mine) return { ok: true };

    await this.prisma.$transaction(async (tx) => {
      await tx.clubMember.delete({ where: { userId: req.user.sub } });

      const rest = await tx.clubMember.findMany({
        where: { clubId: mine.clubId },
        include: { user: { select: { elo: true } } },
      });

      // Không còn ai → xóa CLB
      if (rest.length === 0) {
        await tx.club.delete({ where: { id: mine.clubId } });
        return;
      }

      // Thủ lĩnh rời đi → nhường cho phó thủ lĩnh (hoặc người Elo cao nhất)
      if (mine.role === ClubRole.LEADER) {
        const next = [...rest].sort(
          (a, b) =>
            Number(b.role === ClubRole.OFFICER) - Number(a.role === ClubRole.OFFICER) ||
            b.user.elo - a.user.elo,
        )[0];

        await tx.clubMember.update({ where: { userId: next.userId }, data: { role: ClubRole.LEADER } });
      }
    });

    return { ok: true };
  }

  // ---------------------------------------------------------
  // Quản lý (thủ lĩnh / phó thủ lĩnh)
  // ---------------------------------------------------------
  @Patch()
  async update(
    @Req() req: AuthReq,
    @Body() body: { name?: unknown; region?: unknown; description?: unknown; announcement?: unknown; banner?: unknown },
  ) {
    const mine = await this.membership(req.user.sub);

    if (!mine || mine.role === ClubRole.MEMBER) {
      throw new ForbiddenException('Chỉ thủ lĩnh hoặc phó thủ lĩnh được sửa');
    }

    const data: { name?: string; region?: string; description?: string; announcement?: string; banner?: string } = {};

    // Đổi tên CLB (3–30 ký tự, không trùng)
    if (body?.name !== undefined) {
      const name = cleanText(body.name, 40)?.replace(/\s+/g, ' ') ?? '';

      if (name.length < 3 || name.length > 30) {
        throw new BadRequestException('Tên câu lạc bộ phải có từ 3 đến 30 ký tự');
      }

      data.name = name;
    }

    const region = cleanRegion(body?.region);
    if (region) data.region = region;
    const description = cleanText(body?.description, 200);
    const announcement = cleanText(body?.announcement, 300);

    if (description !== undefined) data.description = description;
    if (announcement !== undefined) data.announcement = announcement;

    if (body?.banner !== undefined) {
      if (typeof body.banner !== 'string' || !BANNERS.includes(body.banner)) {
        throw new BadRequestException('Mẫu cờ không hợp lệ');
      }

      data.banner = body.banner;
    }

    try {
      await this.prisma.club.update({ where: { id: mine.clubId }, data });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Tên câu lạc bộ đã có người dùng');
      }

      throw error;
    }

    return { ok: true, ...data };
  }

  @Post('members/:userId/kick')
  async kick(@Req() req: AuthReq, @Param('userId') userId: string) {
    const mine = await this.membership(req.user.sub);
    const target = await this.membership(userId);

    if (!mine || !target || target.clubId !== mine.clubId || userId === req.user.sub) {
      throw new BadRequestException('Không thể thực hiện');
    }

    const canKick =
      mine.role === ClubRole.LEADER ||
      (mine.role === ClubRole.OFFICER && target.role === ClubRole.MEMBER);

    if (!canKick) throw new ForbiddenException('Bạn không có quyền mời thành viên này rời CLB');

    await this.prisma.clubMember.delete({ where: { userId } });

    return { ok: true };
  }

  @Post('members/:userId/promote')
  async promote(@Req() req: AuthReq, @Param('userId') userId: string) {
    const mine = await this.membership(req.user.sub);
    const target = await this.membership(userId);

    if (!mine || mine.role !== ClubRole.LEADER) {
      throw new ForbiddenException('Chỉ thủ lĩnh được bổ nhiệm');
    }

    if (!target || target.clubId !== mine.clubId || userId === req.user.sub) {
      throw new BadRequestException('Không thể thực hiện');
    }

    const role = target.role === ClubRole.OFFICER ? ClubRole.MEMBER : ClubRole.OFFICER;

    await this.prisma.clubMember.update({ where: { userId }, data: { role } });

    return { ok: true, role };
  }
}
