
import { Prisma, MatchMode, MatchResult, MatchReason } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StockfishService } from './stockfish.service';

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

interface EloChange {
  before: number;
  change: number;
  after: number;
}

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
}

interface FinishResult {
  result: OnlineResult;
  winner: string | null;
  reason: string;
}

const PIECE_VALUES: Record<string, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

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
      origin: true,
      credentials: true,
    },
  })
  export class OnlineGateway

  implements OnGatewayConnection, OnGatewayDisconnect
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

      console.log(`Online connected: ${payload.sub}`);
    } catch {
      client.disconnect(true);
    }
  }

  // =========================================================
  // 2. NGƯỜI CHƠI MẤT KẾT NỐI
  // =========================================================

  async handleDisconnect(client: Socket) {
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
      const match = this.matches.get(matchId);

      if (match && !match.finished && userId) {
        const winner =
          userId === match.white ? match.black : match.white;

        await this.finishMatch(match, {
          result: 'win',
          winner,
          reason: 'disconnect',
        });
      }

      this.socketMatches.delete(client.id);
    }

    if (userId) {
      console.log(`Online disconnected: ${userId}`);
    }
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

    if (this.socketMatches.has(client.id)) {
      client.emit('match:error', {
        message: 'Bạn đang ở trong một trận đấu.',
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
          },
        }),

        this.prisma.user.findUnique({
          where: { id: black },
          select: {
            id: true,
            username: true,
            displayName: true,
            elo: true,
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
            const before = await this.stockfish.analyzeFen(
              move.beforeFen,
              10,
            );

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
  // =========================================================
  // 10. TÍNH VẬT CHẤT VÀ LỢI THẾ
  // =========================================================

  private getMaterialDifference(game: Chess): number {
    let white = 0;
    let black = 0;

    for (const row of game.board()) {
      for (const piece of row) {
        if (!piece) continue;

        const value = PIECE_VALUES[piece.type] ?? 0;

        if (piece.color === 'w') {
          white += value;
        } else {
          black += value;
        }
      }
    }

    return white - black;
  }

  private getDrawEloChanges(
    match: OnlineMatch,
    reason: string,
  ): { white: number; black: number } {
    if (reason === 'insufficient_material') {
      return { white: 0, black: 0 };
    }

    const materialDiff = this.getMaterialDifference(
      match.game,
    );

    const evaluation =
      match.lastEvalWhiteCp ?? materialDiff * 100;

    const advantage = Math.abs(evaluation);

    if (
      reason === 'fifty_move_rule' &&
      advantage >= 400
    ) {
      return evaluation > 0
        ? { white: 2, black: -2 }
        : { white: -2, black: 2 };
    }

    if (advantage >= 50) {
      return evaluation > 0
        ? { white: 1, black: -1 }
        : { white: -1, black: 1 };
    }

    return { white: 0, black: 0 };
  }

  // =========================================================
  // 11. TÍNH ELO KHI THẮNG
  // =========================================================

  private getWinnerEloGain(
    match: OnlineMatch,
    winner: string,
  ): number {
    const winnerColor =
      winner === match.white ? 'w' : 'b';

    const winnerMoves = match.analysis.filter(
      (item) =>
        item.color === winnerColor &&
        item.centipawnLoss !== null,
    );

    if (winnerMoves.length === 0) {
      return 10;
    }

    const totalCpl = winnerMoves.reduce(
      (sum, item) =>
        sum + (item.centipawnLoss ?? 0),
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

          if (match.mode === 'ranked') {
            if (outcome.result === 'win' && outcome.winner) {
              const gain = this.getWinnerEloGain(
                match,
                outcome.winner,
              );

              if (outcome.winner === match.white) {
                whiteDelta = gain;
                blackDelta = -gain;
              } else {
                whiteDelta = -gain;
                blackDelta = gain;
              }
            } else {
              const changes = this.getDrawEloChanges(
                match,
                outcome.reason,
              );

              whiteDelta = changes.white;
              blackDelta = changes.black;
            }
          }

          if (whiteDelta !== 0) {
            await tx.user.update({
              where: { id: match.white },
              data: {
                elo: { increment: whiteDelta },
              },
            });
          }

          if (blackDelta !== 0) {
            await tx.user.update({
              where: { id: match.black },
              data: {
                elo: { increment: blackDelta },
              },
            });
          }

          const whiteAfter =
            whiteUser.elo + whiteDelta;

          const blackAfter =
            blackUser.elo + blackDelta;

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

  private findSocketId(userId: string): string {
    for (const [socketId, matchId] of this.socketMatches) {
      const match = this.matches.get(matchId);

      if (
        match &&
        (match.white === userId || match.black === userId)
      ) {
        return socketId;
      }
    }

    return '';
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
