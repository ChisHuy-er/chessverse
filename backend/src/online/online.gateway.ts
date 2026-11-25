import { Prisma, MatchMode, MatchResult, MatchReason } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { COIN_REWARD } from './shop.catalog';
import { StockfishService } from './stockfish.service';
import { OnModuleInit } from '@nestjs/common';

import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';

import { JwtService } from '@nestjs/jwt';
import { Chess } from 'chess.js';
import { randomUUID } from 'node:crypto';
import { Server, Socket } from 'socket.io';

interface OnlineJwtPayload {
  sub: string;
  purpose: string;
}

type OnlineMode = 'ranked' | 'casual';
type OnlineResult = 'win' | 'draw';

interface MovePayload {
  from: string;
  to: string;
  promotion?: 'q' | 'r' | 'b' | 'n';
}

interface StoredMove {
  ply: number;
  color: 'w' | 'b';
  from: string;
  to: string;
  san: string;
  uci: string;
  beforeFen: string;
  afterFen: string;
}

interface MoveAnalysis {
    ply: number;
    color: 'w' | 'b';

    // SAN dùng để hiển thị và dựng lại ván cờ.
    move: string;

    // UCI dùng để so sánh với nước tốt nhất của Stockfish.
    uci: string;
    bestMove: string;

    beforeFen: string;
    afterFen: string;

    scoreType: 'cp' | 'mate' | null;
    score: number | null;
    depth: number;
    pv: string[];

    centipawnLoss: number | null;
    label: string;
  }

// Kết quả phân tích "sau nước đi" của nước trước chính là
// "trước nước đi" của nước kế tiếp (cùng một vị trí), nên lưu lại để dùng lại.
type EngineResult = Awaited<ReturnType<StockfishService['analyzeFen']>>;

const lastAfterAnalysis = new WeakMap<
  object,
  { fen: string; result: EngineResult }
>();

interface EloChange {
  before: number;
  change: number;
  after: number;
}

interface PlayerProfile {
  id: string;
  username: string;
  displayName: string;
  elo: number;
  avatarId?: string | null;
  avatarFrame?: string | null;
  profileCover?: string | null;
  country?: string | null;
}

// Biểu cảm nhanh trong trận (chỉ cho phép các mã này)
const MATCH_EMOTES = new Set(['smile', 'like', 'clap', 'target']);

interface OnlineMatch {
  id: string;
  roomId: string;
  mode: OnlineMode;
  game: Chess;
  white: string;
  black: string;

  finished: boolean;

  moves: StoredMove[];
  analysis: MoveAnalysis[];

  analysisChain: Promise<void>;
  lastEvalWhiteCp: number | null;
  whiteTimeMs: number;
  blackTimeMs: number;
  turnStartedAt: number;
  clockInterval?: ReturnType<typeof setInterval>;
  drawOfferBy: string | null;

  // Thông tin hai người chơi, dùng để gửi lại khi nối lại trận.
  whiteProfile: PlayerProfile;
  blackProfile: PlayerProfile;

  // userId -> bộ đếm giờ xử thua khi người đó mất kết nối.
  disconnectTimers: Map<string, ReturnType<typeof setTimeout>>;
}

interface FinishResult {
  result: OnlineResult;
  winner: string | null;
  reason: string;
}

  // Ván xếp hạng ngắn hơn số nước này (tính cả hai bên) thì không đổi Elo.
const MIN_RANKED_PLIES = 10;

// Thời gian chờ người chơi kết nối lại trước khi bị xử thua.
const RECONNECT_GRACE_MS = 30 * 1000;

function getClockSnapshot(match: OnlineMatch) {
  const elapsed = Date.now() - match.turnStartedAt;

  const whiteMs = Math.max(
    0,
    match.whiteTimeMs - (match.game.turn() === 'w' ? elapsed : 0),
  );

  const blackMs = Math.max(
    0,
    match.blackTimeMs - (match.game.turn() === 'b' ? elapsed : 0),
  );

  return {
    whiteMs,
    blackMs,
    activeColor: match.game.turn() === 'w' ? 'white' : 'black',
  };
}

  @WebSocketGateway({
    cors: {
      // Địa chỉ trang web được phép kết nối (khi đưa lên mạng đặt FRONTEND_URL, có thể nhiều địa chỉ cách nhau bằng dấu phẩy)
      origin: (process.env.FRONTEND_URL || 'http://localhost:3001').split(',').map((s) => s.trim().replace(/\/$/, '')),
      credentials: true,
    },
  })
  export class OnlineGateway

  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit
{
  @WebSocketServer()
  server: Server;

  private readonly waitingPlayers: Record<OnlineMode, Socket[]> = {
    ranked: [],
    casual: [],
  };

  private readonly matches = new Map<string, OnlineMatch>();
  private readonly socketMatches = new Map<string, string>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly stockfish: StockfishService,
  ) {}

    // Dọn các trận bị kẹt "đang chơi" do server tắt đột ngột.
  async onModuleInit() {
    const result = await this.prisma.match.updateMany({
      where: { status: 'IN_PROGRESS' },
      data: { status: 'ABORTED', finishedAt: new Date() },
    });
    if (result.count > 0) {
      console.log(`Aborted ${result.count} stale match(es)`);
    }
  }

  private hasActiveMatch(userId: string): boolean {
    for (const match of this.matches.values()) {
      if (
        !match.finished &&
        (match.white === userId || match.black === userId)
      ) {
        return true;
      }
    }
    return false;
  }

  // =========================================================
  // 1. XÁC THỰC SOCKET
  // =========================================================

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token;

      if (!token || typeof token !== 'string') {
        client.disconnect(true);
        return;
      }

      const payload =
        await this.jwtService.verifyAsync<OnlineJwtPayload>(token);

      if (!payload.sub || payload.purpose !== 'online_socket') {
        client.disconnect(true);
        return;
      }

      client.data.userId = payload.sub;

      // Nếu tài khoản đang có trận dở thì nối lại vào trận đó.
      await this.resumeActiveMatch(client, payload.sub);

      console.log(`Online connected: ${payload.sub}`);
    } catch {
      client.disconnect(true);
    }
  }

  // =========================================================
  // 2. NGƯỜI CHƠI MẤT KẾT NỐI
  // =========================================================

  handleDisconnect(client: Socket) {
    const userId = client.data.userId as string | undefined;

    for (const mode of ['ranked', 'casual'] as const) {
      const index = this.waitingPlayers[mode].findIndex(
        (player) => player.id === client.id,
      );

      if (index !== -1) {
        this.waitingPlayers[mode].splice(index, 1);
      }
    }

    const matchId = this.socketMatches.get(client.id);

    if (matchId) {
      this.socketMatches.delete(client.id);

      const match = this.matches.get(matchId);

      // Không xử thua ngay: cho người chơi thời gian để kết nối lại.
      if (match && !match.finished && userId) {
        this.startDisconnectGrace(match, userId);
      }
    }

    if (userId) {
      console.log(`Online disconnected: ${userId}`);
    }
  }

  // =========================================================
  // 2b. KẾT NỐI LẠI TRẬN ĐANG CHƠI
  // =========================================================

  // Bắt đầu đếm ngược: hết giờ chờ mà chưa quay lại thì xử thua.
  private startDisconnectGrace(match: OnlineMatch, userId: string) {
    if (match.disconnectTimers.has(userId)) {
      return;
    }

    const timer = setTimeout(() => {
      match.disconnectTimers.delete(userId);

      if (match.finished) {
        return;
      }

      const winner =
        userId === match.white ? match.black : match.white;

      void this.finishMatch(match, {
        result: 'win',
        winner,
        reason: 'disconnect',
      });
    }, RECONNECT_GRACE_MS);

    match.disconnectTimers.set(userId, timer);

    // Báo cho đối thủ còn lại trong phòng.
    this.server.to(match.roomId).emit('match:opponent-disconnected', {
      message: `Đối thủ mất kết nối. Nếu không quay lại sau ${
        RECONNECT_GRACE_MS / 1000
      } giây, bạn sẽ thắng.`,
      graceMs: RECONNECT_GRACE_MS,
    });
  }

  // Gắn socket mới vào trận đang chơi của tài khoản và gửi lại trạng thái ván.
  private async resumeActiveMatch(client: Socket, userId: string) {
    let match: OnlineMatch | undefined;

    for (const item of this.matches.values()) {
      if (
        !item.finished &&
        (item.white === userId || item.black === userId)
      ) {
        match = item;
        break;
      }
    }

    if (!match) {
      return;
    }

    // Chỉ một thiết bị/tab được điều khiển trận: đóng kết nối cũ của cùng tài khoản.
    for (const [socketId, matchId] of this.socketMatches) {
      if (matchId !== match.id || socketId === client.id) {
        continue;
      }

      const oldSocket = this.server.sockets.sockets.get(socketId);

      if (oldSocket?.data.userId === userId) {
        this.socketMatches.delete(socketId);

        oldSocket.emit('match:replaced', {
          message: 'Trận đấu đã được mở ở một tab hoặc thiết bị khác.',
        });
        oldSocket.disconnect(true);
      }
    }

    // Quay lại kịp: hủy đếm ngược xử thua.
    const timer = match.disconnectTimers.get(userId);

    if (timer) {
      clearTimeout(timer);
      match.disconnectTimers.delete(userId);
    }

    this.socketMatches.set(client.id, match.id);
    await client.join(match.roomId);

    const opponentId =
      userId === match.white ? match.black : match.white;

    const lastMove = match.moves[match.moves.length - 1];

    client.emit('match:resume', {
      matchId: match.id,
      mode: match.mode,
      fen: match.game.fen(),
      clock: getClockSnapshot(match),
      color: userId === match.white ? 'white' : 'black',
      players: {
        white: match.white,
        black: match.black,
        whiteProfile: match.whiteProfile,
        blackProfile: match.blackProfile,
      },
      lastMove: lastMove
        ? { from: lastMove.from, to: lastMove.to }
        : null,
      moves: match.moves.map((item) => ({
        from: item.from,
        to: item.to,
        beforeFen: item.beforeFen,
      })),
      drawOffer:
        match.drawOfferBy && match.drawOfferBy !== userId
          ? {
              from: match.drawOfferBy,
              fromColor:
                match.drawOfferBy === match.white ? 'white' : 'black',
            }
          : null,
      drawOfferSent: match.drawOfferBy === userId,
      opponentDisconnected: match.disconnectTimers.has(opponentId),
    });

    client.to(match.roomId).emit('match:opponent-reconnected', {
      message: 'Đối thủ đã kết nối lại.',
    });

    console.log(`Match resumed: ${match.id} | User: ${userId}`);
  }

  // =========================================================
  // 3. TÌM TRẬN
  // =========================================================

  @SubscribeMessage('match:find')
  async findMatch(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { mode?: OnlineMode },
  ) {
    const userId = client.data.userId as string | undefined;
    const mode = payload?.mode;

    if (!userId) {
      client.emit('match:error', {
        message: 'Bạn chưa xác thực tài khoản.',
      });
      return;
    }

    if (mode !== 'ranked' && mode !== 'casual') {
      client.emit('match:error', {
        message: 'Chế độ chơi không hợp lệ.',
      });
      return;
    }

    // Socket này đã được nối lại vào trận đang chơi (match:resume) thì bỏ qua.
    if (this.socketMatches.has(client.id)) {
      return;
    }

        if (this.hasActiveMatch(userId)) {
      client.emit('match:error', {
        message: 'Tài khoản của bạn đang ở trong một trận đấu khác.',
      });
      return;
    }

    const alreadyWaiting = (
      ['ranked', 'casual'] as const
    ).some((queueMode) =>
      this.waitingPlayers[queueMode].some(
        (player) => player.data.userId === userId,
      ),
    );

    if (alreadyWaiting) {
      client.emit('match:waiting', {
        message: 'Bạn đang ở trong hàng chờ tìm trận.',
      });
      return;
    }

    const queue = this.waitingPlayers[mode];

    const opponentIndex = queue.findIndex(
      (player) => player.data.userId !== userId,
    );

    if (opponentIndex === -1) {
      queue.push(client);

      client.emit('match:waiting', {
        mode,
        message:
          mode === 'ranked'
            ? 'Đang tìm đối thủ đấu hạng...'
            : 'Đang tìm đối thủ đấu thường...',
      });

      return;
    }

    const opponent = queue.splice(opponentIndex, 1)[0];

    if (!opponent.connected) {
      queue.push(client);

      client.emit('match:waiting', {
        mode,
        message: 'Đang tìm đối thủ...',
      });

      return;
    }

    const matchId = randomUUID();
    const roomId = `match_${matchId}`;

    const white = opponent.data.userId as string;
    const black = userId;

    try {
      const [whiteUser, blackUser] = await Promise.all([
        this.prisma.user.findUnique({
          where: { id: white },
          select: {
            id: true,
            username: true,
            displayName: true,
            elo: true,
            avatarId: true,
            avatarFrame: true,
            profileCover: true,
            country: true,
          },
        }),

        this.prisma.user.findUnique({
          where: { id: black },
          select: {
            id: true,
            username: true,
            displayName: true,
            elo: true,
            avatarId: true,
            avatarFrame: true,
            profileCover: true,
            country: true,
          },
        }),
      ]);

      if (!whiteUser || !blackUser) {
        client.emit('match:error', {
          message: 'Không tìm thấy thông tin tài khoản.',
        });

        opponent.emit('match:error', {
          message: 'Không tìm thấy thông tin tài khoản.',
        });

        return;
      }

      // Tạo bản ghi trận đấu trong database.
      await this.prisma.match.create({
        data: {
          id: matchId,
          mode:
            mode === 'ranked'
              ? MatchMode.RANKED
              : MatchMode.CASUAL,
          status: 'IN_PROGRESS',
          whiteUserId: white,
          blackUserId: black,
          moves: [],
        },
      });

      const match: OnlineMatch = {
        id: matchId,
        roomId,
        mode,
        game: new Chess(),
        white,
        black,
        finished: false,
        moves: [],
        analysis: [],
        analysisChain: Promise.resolve(),
        lastEvalWhiteCp: null,

        // Mỗi bên có 10 phút.
        whiteTimeMs: 10 * 60 * 1000,
        blackTimeMs: 10 * 60 * 1000,

        // Trắng đi trước.
        turnStartedAt: Date.now(),

        // Chưa có ai đề nghị hòa.
        drawOfferBy: null,

        whiteProfile: whiteUser,
        blackProfile: blackUser,
        disconnectTimers: new Map(),
      };

      this.matches.set(matchId, match);

      this.socketMatches.set(opponent.id, matchId);
      this.socketMatches.set(client.id, matchId);


// Đồng hồ chạy và được kiểm tra mỗi 250ms.
      match.clockInterval = setInterval(() => {
        if (match.finished) {
          if (match.clockInterval) {
            clearInterval(match.clockInterval);
            match.clockInterval = undefined;
          }
          return;
        }

        const clock = getClockSnapshot(match);

// Hết giờ thì kết thúc trận.
        if (clock.whiteMs <= 0 || clock.blackMs <= 0) {
          if (match.clockInterval) {
            clearInterval(match.clockInterval);
            match.clockInterval = undefined;
          }
          void this.handleTimeout(match, clock);

          return;
        }

        this.server.to(match.roomId).emit('match:clock', clock);
      }, 250);

      await opponent.join(roomId);
      await client.join(roomId);

      this.server.to(roomId).emit('match:found', {
        matchId,
        mode,
        fen: match.game.fen(),

        clock: getClockSnapshot(match),

        players: {
          white,
          black,
          whiteProfile: whiteUser,
          blackProfile: blackUser,
        },
      });

      opponent.emit('match:your-color', {
        color: 'white',
      });

      client.emit('match:your-color', {
        color: 'black',
      });

      console.log(
        `Match created: ${matchId} | Mode: ${mode}`,
      );
    } catch (error) {
      console.error('Create match error:', error);

      if (opponent.connected) {
        this.waitingPlayers[mode].push(opponent);
      }

      if (client.connected) {
        this.waitingPlayers[mode].push(client);
      }

      client.emit('match:error', {
        message: 'Không thể tạo trận đấu. Vui lòng thử lại.',
      });

      opponent.emit('match:error', {
        message: 'Không thể tạo trận đấu. Vui lòng thử lại.',
      });
    }
  }

  // =========================================================
  // 3b. THỐNG KÊ SẢNH CHỜ (màn hình tìm trận hiển thị)
  // =========================================================

  // Người chơi đang ở trong một ván (dùng cho trang Bạn bè).
  isUserInMatch(userId: string) {
    return this.hasActiveMatch(userId);
  }

  // Người chơi đang kết nối khu thi đấu online (dùng cho trang Câu lạc bộ).
  isUserOnline(userId: string) {
    if (!this.server) return false;

    for (const socket of this.server.sockets.sockets.values()) {
      if (socket.data.userId === userId) return true;
    }

    return false;
  }

  @SubscribeMessage('lobby:stats')
  lobbyStats() {
    const online = new Set<string>();

    for (const socket of this.server.sockets.sockets.values()) {
      const userId = socket.data.userId as string | undefined;

      if (userId) online.add(userId);
    }

    return {
      online: online.size,
      searching:
        this.waitingPlayers.ranked.length + this.waitingPlayers.casual.length,
    };
  }

  // =========================================================
  // 4. HỦY TÌM TRẬN
  // =========================================================

  @SubscribeMessage('match:cancel')
  cancelMatch(@ConnectedSocket() client: Socket) {
    for (const mode of ['ranked', 'casual'] as const) {
      const index = this.waitingPlayers[mode].findIndex(
        (player) => player.id === client.id,
      );

      if (index !== -1) {
        this.waitingPlayers[mode].splice(index, 1);
      }
    }

    client.emit('match:cancelled', {
      message: 'Đã hủy tìm trận.',
    });
  }

  // =========================================================
  // 5. PHÂN TÍCH STOCKFISH
  // =========================================================

  private scoreToCp(
    scoreType: 'cp' | 'mate' | null,
    score: number | null,
  ): number | null {
    if (score === null || scoreType === null) {
      return null;
    }

    if (scoreType === 'cp') {
      return score;
    }

    if (score > 0) {
      return 10000 - score;
    }

    return -10000 - score;
  }

  private getMoveLabel(cpl: number | null): string {
    if (cpl === null) return 'Unclassified';

    if (cpl <= 10) return 'Excellent';
    if (cpl <= 25) return 'Good';
    if (cpl <= 50) return 'Inaccuracy';
    if (cpl <= 100) return 'Mistake';

    return 'Blunder';
  }

  private analyzeMove(
      match: OnlineMatch,
      move: StoredMove,
      terminalAfterMove: boolean,
    ) {
      match.analysisChain = match.analysisChain
        .then(async () => {
          try {
            // Phân tích vị trí trước khi người chơi đi.
            const cached = lastAfterAnalysis.get(match);

            const before: EngineResult =
              cached && cached.fen === move.beforeFen
                ? cached.result
                : await this.stockfish.analyzeFen(move.beforeFen, 10);

            const beforeCp = this.scoreToCp(
              before.scoreType,
              before.score,
            );

            let afterCp: number | null = null;

            // Nếu nước đi chưa kết thúc ván,
            // phân tích tiếp vị trí sau nước đi.
            if (!terminalAfterMove) {
              const after = await this.stockfish.analyzeFen(
                move.afterFen,
                10,
              );

              lastAfterAnalysis.set(match, {
                fen: move.afterFen,
                result: after,
              });

              const rawAfterCp = this.scoreToCp(
                after.scoreType,
                after.score,
              );

              // Điểm sau nước đi được đổi về góc nhìn
              // của người vừa thực hiện nước đi.
              afterCp =
                rawAfterCp === null
                  ? null
                  : -rawAfterCp;

              // Lưu đánh giá theo góc nhìn quân trắng.
              const nextTurn = move.afterFen.split(' ')[1];

              if (rawAfterCp !== null) {
                match.lastEvalWhiteCp =
                  nextTurn === 'w'
                    ? rawAfterCp
                    : -rawAfterCp;
              }
            }

            let cpl: number | null =
              beforeCp === null || afterCp === null
                ? null
                : Math.max(0, beforeCp - afterCp);

            let label = this.getMoveLabel(cpl);

            // Nước chiếu hết là nước kết thúc chiến thắng.
            // Không cần đánh giá vị trí sau bằng Stockfish.
            if (terminalAfterMove && match.game.isCheckmate()) {
              cpl = 0;
              label = 'Best';
            } else if (move.uci === before.bestMove) {
              label = 'Best';
              cpl = 0;
            }

            match.analysis.push({
              ply: move.ply,
              color: move.color,

              // Frontend dùng SAN để dựng lại bàn cờ.
              move: move.san,

              // Giữ UCI để đối chiếu với Stockfish.
              uci: move.uci,
              bestMove: before.bestMove,

              beforeFen: move.beforeFen,
              afterFen: move.afterFen,

              scoreType: before.scoreType,
              score: before.score,
              depth: before.depth,
              pv: before.pv,

              centipawnLoss: cpl,
              label,
            });
          } catch (error) {
            console.error(
              `Stockfish analysis error at ply ${move.ply}:`,
              error,
            );

            // Không bỏ mất nước đi khi Stockfish gặp lỗi.
            // Frontend vẫn có thể hiển thị và xem lại bàn cờ.
            match.analysis.push({
              ply: move.ply,
              color: move.color,
              move: move.san,
              uci: move.uci,
              bestMove: '',
              beforeFen: move.beforeFen,
              afterFen: move.afterFen,
              scoreType: null,
              score: null,
              depth: 0,
              pv: [],
              centipawnLoss: null,
              label: 'Unclassified',
            });
          }
        })
        .catch((error) => {
          console.error('Analysis queue error:', error);
        });
    }

// =========================================================
// 6. XỬ LÝ NƯỚC ĐI
// =========================================================

  // =========================================================
// XỬ LÝ NGƯỜI CHƠI HẾT GIỜ
// =========================================================

    private async handleTimeout(
      match: OnlineMatch,
      clock: ReturnType<typeof getClockSnapshot>,
    ) {
      if (match.finished) return;

      const loser =
        clock.whiteMs <= 0
          ? match.white
          : match.black;

      // Nếu không bên nào còn khả năng chiếu hết,
      // kết quả là hòa theo luật cờ vua.
      if (match.game.isInsufficientMaterial()) {
        await this.finishMatch(match, {
          result: 'draw',
          winner: null,
          reason: 'timeout',
        });

        return;
      }

      const winner =
        loser === match.white
          ? match.black
          : match.white;

      await this.finishMatch(match, {
        result: 'win',
        winner,
        reason: 'timeout',
      });
    }

  @SubscribeMessage('match:move')
  async makeMove(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: MovePayload,
  ) {
    const userId = client.data.userId as string | undefined;
    const matchId = this.socketMatches.get(client.id);
    const match = matchId
      ? this.matches.get(matchId)
      : undefined;

    if (!userId || !match || match.finished) {
      client.emit('match:error', {
        message: 'Không tìm thấy trận đấu hợp lệ.',
      });
      return;
    }

    if (
      typeof payload?.from !== 'string' ||
      typeof payload?.to !== 'string' ||
      !/^[a-h][1-8]$/.test(payload.from) ||
      !/^[a-h][1-8]$/.test(payload.to)
    ) {
      client.emit('match:error', {
        message: 'Dữ liệu nước đi không hợp lệ.',
      });
      return;
    }

    const color =
      userId === match.white
        ? 'w'
        : userId === match.black
          ? 'b'
          : null;

    if (!color || match.game.turn() !== color) {
      client.emit('match:error', {
        message: 'Chưa đến lượt bạn đi.',
      });
      return;
    }

// Kiểm tra hết giờ trước khi chấp nhận nước đi.
    const clockBeforeMove = getClockSnapshot(match);

    if (
      clockBeforeMove.whiteMs <= 0 ||
      clockBeforeMove.blackMs <= 0
    ) {
    await this.handleTimeout(match, clockBeforeMove);

      return;
    }

    try {
      const beforeFen = match.game.fen();

      const move = match.game.move({
        from: payload.from,
        to: payload.to,
        promotion: payload.promotion,
      });

      // Chỉ cập nhật đồng hồ sau khi nước đi hợp lệ.
      match.whiteTimeMs = clockBeforeMove.whiteMs;
      match.blackTimeMs = clockBeforeMove.blackMs;

      // Bắt đầu tính giờ cho người tiếp theo.
      match.turnStartedAt = Date.now();
      const afterFen = match.game.fen();


      const storedMove: StoredMove = {
        ply: match.moves.length + 1,
        color,
        from: move.from,
        to: move.to,
        san: move.san,
        uci:
          move.from +
          move.to +
          (move.promotion ?? ''),
        beforeFen,
        afterFen,
      };

      match.moves.push(storedMove);

      // Nước đi mới làm đề nghị hòa trước đó hết hiệu lực.
      if (match.drawOfferBy) {
        const offerer = match.drawOfferBy;

        match.drawOfferBy = null;

        this.server.to(match.roomId).emit('match:draw-cancelled', {
          by: userId,
          offerer,
        });
      }

      const terminalReason = this.getTerminalReason(match);

      this.analyzeMove(
        match,
        storedMove,
        terminalReason !== null,
      );

      this.server.to(match.roomId).emit('match:move-made', {
        move: {
          from: move.from,
          to: move.to,
          san: move.san,
          promotion: move.promotion,
        },
        fen: afterFen,
        turn: match.game.turn(),
      });

     this.server.to(match.roomId).emit(
      'match:clock',
      getClockSnapshot(match),
    );

      if (terminalReason) {
        if (terminalReason === 'checkmate') {
          const winner =
            color === 'w' ? match.white : match.black;

          void this.finishMatch(match, {
            result: 'win',
            winner,
            reason: 'checkmate',
          });
        } else {
          void this.finishMatch(match, {
            result: 'draw',
            winner: null,
            reason: terminalReason,
          });
        }
      }
    } catch {
      client.emit('match:error', {
        message: 'Nước đi không hợp lệ.',
      });
    }
  }

  // =========================================================
  // 7. KIỂM TRA KẾT THÚC VÁN CỜ
  // =========================================================

  private getHalfmoveClock(game: Chess): number {
    const parts = game.fen().split(' ');
    return Number(parts[4] ?? 0);
  }

  private getTerminalReason(
    match: OnlineMatch,
  ): string | null {
    const game = match.game;

    if (game.isCheckmate()) {
      return 'checkmate';
    }

    if (game.isStalemate()) {
      return 'stalemate';
    }

    if (game.isInsufficientMaterial()) {
      return 'insufficient_material';
    }

    // 75 nước liên tiếp mỗi bên không đi tốt hoặc ăn quân.
    // Đây là trường hợp hòa tự động.
    if (this.getHalfmoveClock(game) >= 150) {
      return 'seventy_five_move_rule';
    }

    // Không tự động kết thúc ở 50 nước.
    // Người chơi phải chủ động yêu cầu hòa.
    return null;
  }

  // =========================================================
  // 8. YÊU CẦU HÒA
  // =========================================================

  @SubscribeMessage('match:claim-draw')
  async claimDraw(@ConnectedSocket() client: Socket) {
    const userId = client.data.userId as string | undefined;
    const matchId = this.socketMatches.get(client.id);
    const match = matchId
      ? this.matches.get(matchId)
      : undefined;

    if (!userId || !match || match.finished) {
      return;
    }

    if (userId !== match.white && userId !== match.black) {
      return;
    }

    const fiftyMoveAvailable =
      this.getHalfmoveClock(match.game) >= 100;

    const repetitionAvailable =
      match.game.isThreefoldRepetition();

    if (!fiftyMoveAvailable && !repetitionAvailable) {
      client.emit('match:error', {
        message: 'Chưa đủ điều kiện yêu cầu hòa.',
      });
      return;
    }

    const reason = fiftyMoveAvailable
      ? 'fifty_move_rule'
      : 'threefold_repetition';

    await this.finishMatch(match, {
      result: 'draw',
      winner: null,
      reason,
    });
  }

  // =========================================================
// 9. ĐỀ NGHỊ HÒA VÀ PHẢN HỒI ĐỀ NGHỊ HÒA
// =========================================================

  // Biểu cảm / tin nhắn ngắn gửi cho đối thủ trong cùng trận
  @SubscribeMessage('match:chat')
  matchChat(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { kind?: string; text?: string },
  ) {
    const userId = client.data.userId as string | undefined;
    const matchId = this.socketMatches.get(client.id);
    const match = matchId ? this.matches.get(matchId) : undefined;

    if (!userId || !match || (userId !== match.white && userId !== match.black)) {
      return;
    }

    // Chống spam: tối đa 1 tin mỗi 1,2 giây
    const now = Date.now();
    if (now - ((client.data.lastChatAt as number) ?? 0) < 1200) return;
    client.data.lastChatAt = now;

    if (data?.kind === 'emote') {
      if (!data.text || !MATCH_EMOTES.has(data.text)) return;
      client.to(match.roomId).emit('match:chat', { kind: 'emote', text: data.text });
      return;
    }

    const text = String(data?.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!text) return;

    client.to(match.roomId).emit('match:chat', { kind: 'text', text });
  }

  @SubscribeMessage('match:offer-draw')
  offerDraw(@ConnectedSocket() client: Socket) {
    const userId = client.data.userId as string | undefined;
    const matchId = this.socketMatches.get(client.id);
    const match = matchId
      ? this.matches.get(matchId)
      : undefined;

    if (!userId || !match || match.finished) {
      return;
    }

    if (userId !== match.white && userId !== match.black) {
      return;
    }

    if (match.drawOfferBy) {
      client.emit('match:error', {
        message: 'Đã có một đề nghị hòa đang chờ phản hồi.',
      });
      return;
    }

    // Xác định tài khoản đối thủ.
    const opponentId =
      userId === match.white ? match.black : match.white;

    // Tìm đúng Socket của đối thủ trong trận đấu này.
    const opponentSocket = [
      ...this.server.sockets.sockets.values(),
    ].find(
      (socket) =>
        socket.data.userId === opponentId &&
        this.socketMatches.get(socket.id) === match.id,
    );

    if (!opponentSocket) {
      client.emit('match:error', {
        message: 'Không tìm thấy kết nối của đối thủ.',
      });
      return;
    }

    // Lưu người gửi đề nghị hòa.
    match.drawOfferBy = userId;

    // Gửi trực tiếp đến đối thủ.
    opponentSocket.emit('match:draw-offered', {
      from: userId,
      fromColor: userId === match.white ? 'white' : 'black',
    });

    console.log(
      `Draw offer: ${userId} -> ${opponentId} | Match: ${match.id}`,
    );
  }

  @SubscribeMessage('match:respond-draw')
  async respondDraw(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { accepted?: boolean },
  ) {
    const userId = client.data.userId as string | undefined;
    const matchId = this.socketMatches.get(client.id);
    const match = matchId
      ? this.matches.get(matchId)
      : undefined;

    if (!userId || !match || match.finished) {
      return;
    }

    if (userId !== match.white && userId !== match.black) {
      return;
    }

    if (typeof payload?.accepted !== 'boolean') {
      return;
    }

    if (!match.drawOfferBy) {
      client.emit('match:error', {
        message: 'Không có đề nghị hòa nào đang chờ.',
      });
      return;
    }

    // Người gửi đề nghị không được tự phản hồi đề nghị của mình.
    if (match.drawOfferBy === userId) {
      client.emit('match:error', {
        message: 'Bạn không thể tự phản hồi đề nghị hòa của mình.',
      });
      return;
    }

    if (payload.accepted) {
      await this.finishMatch(match, {
        result: 'draw',
        winner: null,
        reason: 'draw_agreement',
      });

      return;
    }

    match.drawOfferBy = null;

    this.server.to(match.roomId).emit('match:draw-declined', {
      by: userId,
    });
  }

    private getWinnerEloGain(
    match: OnlineMatch,
    winner: string,
  ): number {
    const winnerColor = winner === match.white ? 'w' : 'b';

    const winnerMoves = match.analysis.filter(
      (item) =>
        item.color === winnerColor && item.centipawnLoss !== null,
    );

    if (winnerMoves.length === 0) {
      return 10;
    }

    const totalCpl = winnerMoves.reduce(
      (sum, item) => sum + (item.centipawnLoss ?? 0),
      0,
    );

    const averageCpl = totalCpl / winnerMoves.length;

    if (averageCpl <= 20) return 11;
    if (averageCpl <= 60) return 10;

    return 9;
  }
  
  // =========================================================
  // 12. ÁNH XẠ LÝ DO VÀ KẾT QUẢ DATABASE
  // =========================================================

  private mapMatchResult(
    result: OnlineResult,
    winner: string | null,
    match: OnlineMatch,
  ): MatchResult {
    if (result === 'draw') {
      return MatchResult.DRAW;
    }

    return winner === match.white
      ? MatchResult.WHITE_WIN
      : MatchResult.BLACK_WIN;
  }

  private mapMatchReason(reason: string): MatchReason {
    const map: Record<string, MatchReason> = {
      checkmate: MatchReason.CHECKMATE,
      resign: MatchReason.RESIGN,
      disconnect: MatchReason.DISCONNECT,
      stalemate: MatchReason.STALEMATE,
      insufficient_material:
        MatchReason.INSUFFICIENT_MATERIAL,
      threefold_repetition:
        MatchReason.THREEFOLD_REPETITION,
      fifty_move_rule:
        MatchReason.FIFTY_MOVE_RULE,
      seventy_five_move_rule:
        MatchReason.SEVENTY_FIVE_MOVE_RULE,
      draw_agreement:
        MatchReason.DRAW_AGREEMENT,
        timeout: MatchReason.TIMEOUT,
    };

    return map[reason] ?? MatchReason.DRAW_AGREEMENT;
  }

  // =========================================================
  // 13. KẾT THÚC TRẬN VÀ CẬP NHẬT DATABASE
  // =========================================================

  private async finishMatch(
    match: OnlineMatch,
    outcome: FinishResult,
  ) {
    if (match.finished) {
      return;
    }

    // Chụp lại thời gian chính xác tại thời điểm kết thúc trận.
    const finalClock = getClockSnapshot(match);

    // Đóng băng thời gian của cả hai bên.
    match.whiteTimeMs = finalClock.whiteMs;
    match.blackTimeMs = finalClock.blackMs;
    match.turnStartedAt = Date.now();

    // Đánh dấu trận đã kết thúc.
    match.finished = true;

    // Hủy mọi bộ đếm chờ kết nối lại.
    for (const timer of match.disconnectTimers.values()) {
      clearTimeout(timer);
    }
    match.disconnectTimers.clear();

    // Dừng bộ đếm thời gian ở backend.
    if (match.clockInterval) {
      clearInterval(match.clockInterval);
      match.clockInterval = undefined;
    }

    // Đợi tất cả yêu cầu Stockfish đã xếp hàng hoàn tất.
    await match.analysisChain;

    const finalFen = match.game.fen();
    const pgn = match.game.pgn();

    let eloChanges: {
      white: EloChange;
      black: EloChange;
    } | null = null;

    try {
      const dbResult = await this.prisma.$transaction(
        async (tx) => {
          const currentMatch = await tx.match.findUnique({
            where: { id: match.id },
            select: { status: true },
          });

          if (
            !currentMatch ||
            currentMatch.status !== 'IN_PROGRESS'
          ) {
            return null;
          }

          const [whiteUser, blackUser] = await Promise.all([
            tx.user.findUnique({
              where: { id: match.white },
              select: { elo: true },
            }),

            tx.user.findUnique({
              where: { id: match.black },
              select: { elo: true },
            }),
          ]);

          if (!whiteUser || !blackUser) {
            throw new Error('Không tìm thấy người chơi trong database.');
          }

          // Chỉ transaction đầu tiên được phép hoàn tất trận.
          const locked = await tx.match.updateMany({
            where: {
              id: match.id,
              status: 'IN_PROGRESS',
            },
            data: {
              status: 'COMPLETED',
              result: this.mapMatchResult(
                outcome.result,
                outcome.winner,
                match,
              ),
              reason: this.mapMatchReason(outcome.reason),
              pgn,
              finalFen,
              moves:
                match.moves as unknown as Prisma.InputJsonValue,
              analysis:
                match.analysis as unknown as Prisma.InputJsonValue,
              finishedAt: new Date(),
            },
          });

          if (locked.count !== 1) {
            return null;
          }

           let whiteDelta = 0;
          let blackDelta = 0;

            // Chỉ tính Elo cho ván xếp hạng đủ dài (chống cày Elo).
            // Thắng/thua: đổi 9-11 điểm. Hòa: không đổi.
            if (
              match.mode === 'ranked' &&
              match.moves.length >= MIN_RANKED_PLIES &&
              outcome.result === 'win' &&
              outcome.winner
            ) {
              const gain = this.getWinnerEloGain(match, outcome.winner);

              if (outcome.winner === match.white) {
                whiteDelta = gain;
                blackDelta = -gain;
              } else {
                whiteDelta = -gain;
                blackDelta = gain;
              }
            }

            // Elo không được xuống dưới 0.
            const whiteAfter = Math.max(0, whiteUser.elo + whiteDelta);
            const blackAfter = Math.max(0, blackUser.elo + blackDelta);
            whiteDelta = whiteAfter - whiteUser.elo;
            blackDelta = blackAfter - blackUser.elo;

            if (whiteDelta !== 0) {
              await tx.user.update({
                where: { id: match.white },
                data: { elo: { increment: whiteDelta } },
              });
            }
            if (blackDelta !== 0) {
              await tx.user.update({
                where: { id: match.black },
                data: { elo: { increment: blackDelta } },
              });
            }

            // Thưởng xu (dùng ở Cửa hàng) cho mỗi ván đủ dài, cả xếp hạng lẫn đấu thường.
            if (match.moves.length >= MIN_RANKED_PLIES) {
              const coinsFor = (userId: string) =>
                outcome.result === 'win' && outcome.winner
                  ? outcome.winner === userId
                    ? COIN_REWARD.win
                    : COIN_REWARD.loss
                  : COIN_REWARD.draw;

              await tx.user.update({
                where: { id: match.white },
                data: { coins: { increment: coinsFor(match.white) } },
              });
              await tx.user.update({
                where: { id: match.black },
                data: { coins: { increment: coinsFor(match.black) } },
              });
            }

          await tx.match.update({
            where: { id: match.id },
            data: {
              whiteEloBefore: whiteUser.elo,
              whiteEloChange: whiteDelta,
              whiteEloAfter: whiteAfter,

              blackEloBefore: blackUser.elo,
              blackEloChange: blackDelta,
              blackEloAfter: blackAfter,
            },
          });

          return {
            white: {
              before: whiteUser.elo,
              change: whiteDelta,
              after: whiteAfter,
            },
            black: {
              before: blackUser.elo,
              change: blackDelta,
              after: blackAfter,
            },
          };
        },
      );

      eloChanges = dbResult;
    } catch (error) {
      console.error(
        `Finish match database error ${match.id}:`,
        error,
      );
    }

    const averageCpl = (
      color: 'w' | 'b',
    ): number | null => {
      const items = match.analysis.filter(
        (item) =>
          item.color === color &&
          item.centipawnLoss !== null,
      );

      if (items.length === 0) return null;

      return (
        items.reduce(
          (sum, item) =>
            sum + (item.centipawnLoss ?? 0),
          0,
        ) / items.length
      );
    };

    this.server.to(match.roomId).emit('match:finished', {
      result: outcome.result,
      winner: outcome.winner,
      fen: finalFen,
      reason: outcome.reason,

      // Thời gian cuối cùng của hai người chơi.
      clock: finalClock,

      eloChanges,

      analysisSummary: {
        whiteAverageCpl: averageCpl('w'),
        blackAverageCpl: averageCpl('b'),

        // Đảm bảo danh sách được gửi theo đúng thứ tự ván cờ.
        moves: [...match.analysis].sort(
          (a, b) => a.ply - b.ply,
        ),
      },
    });

    for (const [socketId, currentMatchId] of this.socketMatches) {
      if (currentMatchId === match.id) {
        this.socketMatches.delete(socketId);
      }
    }

    console.log(
      `Match finished: ${match.id} | Result: ${outcome.result} | Reason: ${outcome.reason}`,
    );

    this.matches.delete(match.id);
  }

  // =========================================================
  // 14. ĐẦU HÀNG
  // =========================================================

  @SubscribeMessage('match:resign')
  async resign(@ConnectedSocket() client: Socket) {
    const userId = client.data.userId as string | undefined;
    const matchId = this.socketMatches.get(client.id);
    const match = matchId
      ? this.matches.get(matchId)
      : undefined;

    if (!userId || !match || match.finished) {
      return;
    }

    if (userId !== match.white && userId !== match.black) {
      return;
    }

    const winner =
      userId === match.white ? match.black : match.white;

    await this.finishMatch(match, {
      result: 'win',
      winner,
      reason: 'resign',
    });
  }
}