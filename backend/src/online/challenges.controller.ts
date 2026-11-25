import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { MatchMode, MatchResult, MatchStatus, Prisma } from '@prisma/client';
import { Chess } from 'chess.js';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import {
  CHAPTERS,
  CHEST_STEPS,
  EVENT,
  PASS,
  QUESTS,
  STREAK_REWARD,
  passReward,
  type QuestDef,
} from './challenges.catalog';

type AuthReq = { user: { sub: string } };

// Các bài học đang có nội dung (khớp với src/app/lib/lessons.ts)
const KNOWN_LESSONS: Record<string, string[]> = {
  intro: ['l1', 'l2', 'l3', 'l4', 'l5', 'l6', 'l7'],
};
type Tx = Prisma.TransactionClient;

// ---------- Thời gian theo giờ Việt Nam ----------

const VN = 7 * 3600_000;

function vnDay(d = new Date()): string {
  return new Date(d.getTime() + VN).toISOString().slice(0, 10);
}

function dayStart(day: string): Date {
  return new Date(`${day}T00:00:00+07:00`);
}

function addDays(day: string, n: number): string {
  return vnDay(new Date(dayStart(day).getTime() + n * 86400_000 + 12 * 3600_000));
}

// Thứ Hai đầu tuần
function weekStart(day: string): string {
  const dow = new Date(`${day}T12:00:00+07:00`).getUTCDay(); // 0 = CN
  return addDays(day, -((dow + 6) % 7));
}

function periodOf(q: QuestDef, today: string): string {
  if (q.scope === 'daily') return `d:${today}`;
  if (q.scope === 'weekly') return `w:${weekStart(today)}`;
  if (q.scope === 'event') return `ev:${EVENT.id}`;
  return 'all';
}

function eventState(today: string): 'upcoming' | 'active' | 'ended' {
  if (today < EVENT.start) return 'upcoming';
  if (today > EVENT.end) return 'ended';
  return 'active';
}

@Controller('challenges')
@UseGuards(JwtAuthGuard)
export class ChallengesController {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- Đo tiến độ ----------

  private mine(userId: string): Prisma.MatchWhereInput {
    return { status: MatchStatus.COMPLETED, OR: [{ whiteUserId: userId }, { blackUserId: userId }] };
  }

  private won(userId: string): Prisma.MatchWhereInput {
    return {
      status: MatchStatus.COMPLETED,
      OR: [
        { whiteUserId: userId, result: MatchResult.WHITE_WIN },
        { blackUserId: userId, result: MatchResult.BLACK_WIN },
      ],
    };
  }

  private async progress(userId: string, q: QuestDef, today: string): Promise<number> {
    let from: Date | undefined;
    let to: Date | undefined;

    if (q.scope === 'daily') from = dayStart(today);
    if (q.scope === 'weekly') from = dayStart(weekStart(today));
    if (q.scope === 'event') {
      if (eventState(today) === 'upcoming') return 0;
      from = dayStart(EVENT.start);
      to = dayStart(addDays(EVENT.end, 1));
    }

    const time = from ? { gte: from, ...(to ? { lt: to } : {}) } : undefined;

    switch (q.metric) {
      case 'games':
        return this.prisma.match.count({ where: { ...this.mine(userId), finishedAt: time } });
      case 'wins':
        return this.prisma.match.count({ where: { ...this.won(userId), finishedAt: time } });
      case 'rankedWins':
        return this.prisma.match.count({ where: { ...this.won(userId), mode: MatchMode.RANKED, finishedAt: time } });
      case 'puzzles':
        return this.prisma.puzzleSolve.count({ where: { userId, solvedAt: time ?? { not: null } } });
      case 'lessons':
        return this.prisma.lessonProgress.count({ where: { userId, doneAt: time } });
      case 'totalGames':
        return this.prisma.match.count({ where: this.mine(userId) });
      case 'totalWins':
        return this.prisma.match.count({ where: this.won(userId) });
      case 'elo':
        return (await this.prisma.user.findUnique({ where: { id: userId }, select: { elo: true } }))?.elo ?? 0;
      case 'totalLessons':
        return this.prisma.lessonProgress.count({ where: { userId, courseId: 'intro' } });
      case 'totalPuzzles':
        return this.prisma.puzzleSolve.count({ where: { userId, solvedAt: { not: null } } });
      case 'eventDays':
        return this.prisma.loginDay.count({ where: { userId, day: { gte: EVENT.start, lte: EVENT.end } } });
    }
  }

  private async streak(userId: string, today: string) {
    const days = await this.prisma.loginDay.findMany({
      where: { userId, day: { gte: addDays(today, -60) } },
      select: { day: true },
    });
    const set = new Set(days.map((d) => d.day));
    let count = 0;

    while (set.has(addDays(today, -count))) count++;

    return count;
  }

  // ---------- Cộng thưởng ----------

  private async grant(tx: Tx, userId: string, coins: number, gems: number, refId: string) {
    const user = await tx.user.update({
      where: { id: userId },
      data: { coins: { increment: coins }, gems: { increment: gems } },
      select: { coins: true, gems: true },
    });

    if (gems > 0) {
      await tx.gemTransaction.create({ data: { userId, delta: gems, balance: user.gems, reason: 'REWARD', refId } });
    }

    return user;
  }

  private async claimOnce(userId: string, questId: string, period: string, exp: number, coins: number, gems: number) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.questClaim.create({ data: { userId, questId, period, exp } });
        return this.grant(tx, userId, coins, gems, questId);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new BadRequestException('Bạn đã nhận phần thưởng này rồi');
      }
      throw error;
    }
  }

  // ---------- Tổng quan ----------

  @Get()
  async overview(@Req() req: AuthReq) {
    const userId = req.user.sub;
    const today = vnDay();

    // Ghi nhận hôm nay có vào game (cho chuỗi đăng nhập / sự kiện)
    await this.prisma.loginDay.upsert({
      where: { userId_day: { userId, day: today } },
      update: {},
      create: { userId, day: today },
    });

    const [claims, solves, user, streak] = await Promise.all([
      this.prisma.questClaim.findMany({ where: { userId }, select: { questId: true, period: true, exp: true, createdAt: true } }),
      this.prisma.puzzleSolve.findMany({ where: { userId }, select: { puzzleId: true, stars: true, solvedAt: true, attempts: true } }),
      this.prisma.user.findUnique({ where: { id: userId }, select: { coins: true, gems: true } }),
      this.streak(userId, today),
    ]);

    const claimed = new Set(claims.map((c) => `${c.questId}|${c.period}`));
    const ev = eventState(today);

    const quests = await Promise.all(
      QUESTS.map(async (q) => {
        const progress = Math.min(q.target, await this.progress(userId, q, today));

        return {
          id: q.id,
          scope: q.scope,
          title: q.title,
          icon: q.icon,
          link: q.link,
          target: q.target,
          progress,
          reward: { coins: q.coins, gems: q.gems, exp: q.exp },
          claimed: claimed.has(`${q.id}|${periodOf(q, today)}`),
          locked: q.scope === 'event' && ev !== 'active',
        };
      }),
    );

    // Thẻ thử thách
    const exp = claims.filter((c) => c.createdAt >= dayStart(PASS.start)).reduce((n, c) => n + c.exp, 0);
    const level = Math.min(PASS.maxLevel, Math.floor(exp / PASS.expPerLevel) + 1);
    const passLevels = Array.from({ length: PASS.maxLevel }, (_, i) => {
      const lv = i + 1;
      return {
        level: lv,
        free: passReward(lv),
        reached: lv <= level,
        claimed: claimed.has(`pass:${PASS.season}:${lv}|all`),
      };
    });

    // Bản đồ
    const solveMap = new Map(solves.map((s) => [s.puzzleId, s]));
    let prevDone = true;
    const chapters = CHAPTERS.map((ch) => {
      const puzzles = ch.puzzles.map((p, i) => {
        const s = solveMap.get(p.id);
        return { id: p.id, index: i + 1, fen: p.fen, stars: s?.stars ?? 0, solved: !!s?.solvedAt, attempts: s?.attempts ?? 0 };
      });
      const stars = puzzles.reduce((n, p) => n + p.stars, 0);
      const unlocked = prevDone;
      prevDone = unlocked && puzzles.every((p) => p.solved);

      return {
        id: ch.id,
        title: ch.title,
        sub: ch.sub,
        unlocked,
        stars,
        maxStars: puzzles.length * 3,
        puzzles,
        chests: CHEST_STEPS.map((c) => ({ ...c, claimed: claimed.has(`chest:${ch.id}:${c.at}|all`) })),
      };
    });

    const week = weekStart(today);

    return {
      today,
      wallet: user,
      quests,
      streak: {
        days: streak,
        reward: STREAK_REWARD,
        claimable: streak >= 7 && !claimed.has(`streak7|w:${week}`),
        claimed: claimed.has(`streak7|w:${week}`),
      },
      pass: {
        season: PASS.season,
        title: PASS.title,
        exp,
        level,
        levelExp: level >= PASS.maxLevel ? PASS.expPerLevel : exp % PASS.expPerLevel,
        expPerLevel: PASS.expPerLevel,
        levels: passLevels,
        premium: false,
      },
      map: { chapters },
      event: { ...EVENT, state: ev },
    };
  }

  // ---------- Nhận thưởng ----------

  @Post('claim')
  async claim(
    @Req() req: AuthReq,
    @Body() body: { kind?: unknown; id?: unknown; level?: unknown; chapter?: unknown; at?: unknown },
  ) {
    const userId = req.user.sub;
    const today = vnDay();

    if (body?.kind === 'quest') {
      const q = QUESTS.find((x) => x.id === body.id);

      if (!q) throw new NotFoundException('Không tìm thấy nhiệm vụ');
      if (q.scope === 'event' && eventState(today) !== 'active') throw new ForbiddenException('Sự kiện chưa diễn ra hoặc đã kết thúc');
      if ((await this.progress(userId, q, today)) < q.target) throw new BadRequestException('Bạn chưa hoàn thành nhiệm vụ này');

      const wallet = await this.claimOnce(userId, q.id, periodOf(q, today), q.exp, q.coins, q.gems);
      return { ok: true, reward: { coins: q.coins, gems: q.gems, exp: q.exp }, wallet };
    }

    if (body?.kind === 'pass') {
      const level = Number(body.level);

      if (!Number.isInteger(level) || level < 1 || level > PASS.maxLevel) throw new BadRequestException('Cấp không hợp lệ');

      const claims = await this.prisma.questClaim.findMany({
        where: { userId, createdAt: { gte: dayStart(PASS.start) } },
        select: { exp: true },
      });
      const reached = Math.floor(claims.reduce((n, c) => n + c.exp, 0) / PASS.expPerLevel) + 1;

      if (level > reached) throw new BadRequestException('Bạn chưa đạt cấp này');

      const r = passReward(level);
      const wallet = await this.claimOnce(userId, `pass:${PASS.season}:${level}`, 'all', 0, r.coins, r.gems);
      return { ok: true, reward: { coins: r.coins, gems: r.gems, exp: 0 }, wallet };
    }

    if (body?.kind === 'chest') {
      const ch = CHAPTERS.find((c) => c.id === body.chapter);
      const step = CHEST_STEPS.find((c) => c.at === Number(body.at));

      if (!ch || !step) throw new NotFoundException('Không tìm thấy rương');

      const solves = await this.prisma.puzzleSolve.findMany({
        where: { userId, puzzleId: { in: ch.puzzles.map((p) => p.id) } },
        select: { stars: true },
      });

      if (solves.reduce((n, s) => n + s.stars, 0) < step.at) throw new BadRequestException('Chưa đủ sao để mở rương');

      const wallet = await this.claimOnce(userId, `chest:${ch.id}:${step.at}`, 'all', 0, step.coins, step.gems);
      return { ok: true, reward: { coins: step.coins, gems: step.gems, exp: 0 }, wallet };
    }

    if (body?.kind === 'streak') {
      if ((await this.streak(userId, today)) < 7) throw new BadRequestException('Cần vào game 7 ngày liên tiếp');

      const wallet = await this.claimOnce(userId, 'streak7', `w:${weekStart(today)}`, 0, STREAK_REWARD.coins, STREAK_REWARD.gems);
      return { ok: true, reward: { ...STREAK_REWARD, exp: 0 }, wallet };
    }

    throw new BadRequestException('Yêu cầu không hợp lệ');
  }

  // ---------- Giải bài trên Bản đồ ----------

  @Post('puzzles/:id')
  async attempt(@Req() req: AuthReq, @Param('id') id: string, @Body() body: { from?: unknown; to?: unknown }) {
    const userId = req.user.sub;
    const chIndex = CHAPTERS.findIndex((c) => c.puzzles.some((p) => p.id === id));

    if (chIndex === -1) throw new NotFoundException('Không tìm thấy bài');

    // Chương phải đã mở (giải hết chương trước)
    if (chIndex > 0) {
      const prev = CHAPTERS[chIndex - 1].puzzles.map((p) => p.id);
      const done = await this.prisma.puzzleSolve.count({ where: { userId, puzzleId: { in: prev }, solvedAt: { not: null } } });

      if (done < prev.length) throw new ForbiddenException('Chương này chưa mở');
    }

    const puzzle = CHAPTERS[chIndex].puzzles.find((p) => p.id === id)!;
    const existing = await this.prisma.puzzleSolve.findUnique({ where: { userId_puzzleId: { userId, puzzleId: id } } });

    if (existing?.solvedAt) return { correct: true, stars: existing.stars, already: true };

    const from = typeof body?.from === 'string' ? body.from : '';
    const to = typeof body?.to === 'string' ? body.to : '';
    let correct = false;

    try {
      const game = new Chess(`${puzzle.fen} w - - 0 1`);
      game.move({ from, to, promotion: 'q' });
      correct = game.isCheckmate();
    } catch {
      throw new BadRequestException('Nước đi không hợp lệ');
    }

    const attempts = (existing?.attempts ?? 0) + 1;
    const stars = correct ? (attempts === 1 ? 3 : attempts === 2 ? 2 : 1) : 0;

    await this.prisma.puzzleSolve.upsert({
      where: { userId_puzzleId: { userId, puzzleId: id } },
      update: { attempts, ...(correct ? { stars, solvedAt: new Date() } : {}) },
      create: { userId, puzzleId: id, attempts, stars, solvedAt: correct ? new Date() : null },
    });

    return { correct, stars, attempts };
  }

  // ---------- Bài học đã hoàn thành (đồng bộ từ trang Khóa học) ----------

  @Post('lessons')
  async lesson(@Req() req: AuthReq, @Body() body: { courseId?: unknown; lessonId?: unknown }) {
    const courseId = typeof body?.courseId === 'string' ? body.courseId.slice(0, 30) : '';
    const lessonId = typeof body?.lessonId === 'string' ? body.lessonId.slice(0, 30) : '';

    if (!KNOWN_LESSONS[courseId]?.includes(lessonId)) {
      throw new BadRequestException('Bài học không hợp lệ');
    }

    // Làm lại bài cũng tính là học hôm nay (cập nhật thời gian)
    await this.prisma.lessonProgress.upsert({
      where: { userId_courseId_lessonId: { userId: req.user.sub, courseId, lessonId } },
      update: { doneAt: new Date() },
      create: { userId: req.user.sub, courseId, lessonId },
    });

    return { ok: true };
  }

  @Get('lessons')
  async lessons(@Req() req: AuthReq) {
    const rows = await this.prisma.lessonProgress.findMany({
      where: { userId: req.user.sub },
      select: { courseId: true, lessonId: true },
    });

    return { done: rows };
  }
}
