
import {
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';

import {
  spawn,
  type ChildProcessWithoutNullStreams,
} from 'node:child_process';

import {
  createInterface,
  type Interface,
} from 'node:readline';

import stockfishPackage from 'stockfish';

interface StockfishPackage {
  findEngine(name: string): string;
}

export interface AnalysisResult {
  bestMove: string;
  scoreType: 'cp' | 'mate' | null;
  score: number | null;
  depth: number;
  pv: string[];
}

interface PendingAnalysis {
  resolve: (result: AnalysisResult) => void;
  reject: (error: Error) => void;

  scoreType: 'cp' | 'mate' | null;
  score: number | null;
  depth: number;
  pv: string[];

  timer: NodeJS.Timeout;
}

const enginePackage =
  stockfishPackage as unknown as StockfishPackage;

@Injectable()
export class StockfishService implements OnModuleDestroy {
  private readonly logger = new Logger(StockfishService.name);

  private engine: ChildProcessWithoutNullStreams | null = null;
  private output: Interface | null = null;

  private initPromise: Promise<void> | null = null;
  private pendingAnalysis: PendingAnalysis | null = null;

  private initResolve: (() => void) | null = null;
  private initReject: ((error: Error) => void) | null = null;

  private initTimer: NodeJS.Timeout | null = null;

  private initialized = false;

  // Đảm bảo chỉ có một yêu cầu phân tích chạy tại một thời điểm.
  private queue: Promise<void> = Promise.resolve();

  /**
   * Phân tích một vị trí FEN bằng Stockfish.
   *
   * Score được tính theo góc nhìn của bên đang tới lượt
   * đi trong FEN đầu vào.
   */
  async analyzeFen(
    fen: string,
    depth = 10,
  ): Promise<AnalysisResult> {
    if (!fen || typeof fen !== 'string') {
      throw new Error('FEN không hợp lệ.');
    }

    if (!Number.isInteger(depth) || depth < 1 || depth > 30) {
      throw new Error('Depth phải nằm trong khoảng từ 1 đến 30.');
    }

    const task = this.queue.then(() =>
      this.runAnalysis(fen, depth),
    );

    this.queue = task.then(
      () => undefined,
      () => undefined,
    );

    return task;
  }

  private async runAnalysis(
    fen: string,
    depth: number,
  ): Promise<AnalysisResult> {
    await this.ensureEngine();

    const engine = this.engine;

    if (!engine || !this.initialized) {
      throw new Error('Stockfish chưa sẵn sàng.');
    }

    return new Promise<AnalysisResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.engine === engine) {
          this.resetEngine(
            new Error('Stockfish phân tích quá thời gian cho phép.'),
          );
        }
      }, 30000);

      this.pendingAnalysis = {
        resolve,
        reject,
        scoreType: null,
        score: null,
        depth: 0,
        pv: [],
        timer,
      };

      try {
        engine.stdin.write('ucinewgame\n');
        engine.stdin.write(`position fen ${fen}\n`);
        engine.stdin.write(`go depth ${depth}\n`);
      } catch (error) {
        this.finishPending(
          error instanceof Error
            ? error
            : new Error('Không thể gửi lệnh cho Stockfish.'),
        );
      }
    });
  }

  /**
   * Khởi động Stockfish và thực hiện UCI handshake.
   */
  private ensureEngine(): Promise<void> {
    if (this.initialized && this.engine) {
      return Promise.resolve();
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    const enginePath = enginePackage.findEngine('lite-single');

    const engine = spawn(process.execPath, [enginePath], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.engine = engine;
    this.initialized = false;

    this.output = createInterface({
      input: engine.stdout,
    });

    this.output.on('line', (line) => {
      if (this.engine !== engine) {
        return;
      }

      this.handleEngineOutput(line);
    });

    engine.stderr.on('data', (data: Buffer) => {
      this.logger.debug(data.toString().trim());
    });

    engine.on('error', (error) => {
      if (this.engine !== engine) {
        return;
      }

      this.logger.error(`Stockfish error: ${error.message}`);

      this.resetEngine(error);
    });

    engine.on('close', (code) => {
      if (this.engine !== engine) {
        return;
      }

      this.resetEngine(
        new Error(`Stockfish đã dừng. Exit code: ${code}`),
        false,
      );
    });

    this.initPromise = new Promise<void>((resolve, reject) => {
      this.initResolve = resolve;
      this.initReject = reject;

      this.initTimer = setTimeout(() => {
        this.resetEngine(
          new Error('Stockfish khởi động quá thời gian cho phép.'),
        );
      }, 15000);

      try {
        engine.stdin.write('uci\n');
      } catch (error) {
        this.resetEngine(
          error instanceof Error
            ? error
            : new Error('Không thể khởi động Stockfish.'),
        );
      }
    });

    return this.initPromise;
  }

  /**
   * Đọc dữ liệu trả về từ Stockfish.
   */
  private handleEngineOutput(line: string): void {
    const message = line.trim();

    if (!message) {
      return;
    }

    // Stockfish đã nhận lệnh UCI.
    if (message === 'uciok') {
      this.engine?.stdin.write('isready\n');
      return;
    }

    // Stockfish đã sẵn sàng.
    if (message === 'readyok') {
      if (this.initTimer) {
        clearTimeout(this.initTimer);
        this.initTimer = null;
      }

      this.initialized = true;

      const resolve = this.initResolve;

      this.initResolve = null;
      this.initReject = null;
      this.initPromise = null;

      this.logger.log('Stockfish đã sẵn sàng.');

      resolve?.();
      return;
    }

    const pending = this.pendingAnalysis;

    if (!pending) {
      return;
    }

    // Đọc thông tin phân tích.
    if (message.startsWith('info ')) {
      const depthMatch = message.match(/\bdepth (\d+)/);
      const scoreMatch = message.match(
        /\bscore (cp|mate) (-?\d+)/,
      );

      if (!depthMatch || !scoreMatch) {
        return;
      }

      const currentDepth = Number(depthMatch[1]);

      // Chỉ giữ kết quả ở depth cao nhất.
      if (currentDepth < pending.depth) {
        return;
      }

      pending.depth = currentDepth;
      pending.scoreType = scoreMatch[1] as 'cp' | 'mate';
      pending.score = Number(scoreMatch[2]);

      const pvMatch = message.match(/\bpv (.+)$/);

      pending.pv = pvMatch
        ? pvMatch[1].trim().split(/\s+/)
        : [];

      return;
    }

    // Stockfish đã hoàn thành phân tích.
    if (message.startsWith('bestmove ')) {
      const bestMove = message.split(/\s+/)[1];

      if (
        !bestMove ||
        bestMove === '(none)' ||
        bestMove === '0000'
      ) {
        this.finishPending(
          new Error('Stockfish không tìm thấy nước đi hợp lệ.'),
        );
        return;
      }

      clearTimeout(pending.timer);

      this.pendingAnalysis = null;

      pending.resolve({
        bestMove,
        scoreType: pending.scoreType,
        score: pending.score,
        depth: pending.depth,
        pv: pending.pv,
      });
    }
  }

  /**
   * Hoàn tất yêu cầu phân tích với lỗi.
   */
  private finishPending(error: Error): void {
    const pending = this.pendingAnalysis;

    if (!pending) {
      return;
    }

    clearTimeout(pending.timer);

    this.pendingAnalysis = null;

    pending.reject(error);
  }

  /**
   * Dọn dẹp và khởi động lại engine khi xảy ra lỗi.
   */
  private resetEngine(
    error: Error,
    killProcess = true,
  ): void {
    if (this.initTimer) {
      clearTimeout(this.initTimer);
      this.initTimer = null;
    }

    this.finishPending(error);

    const rejectInit = this.initReject;

    this.initResolve = null;
    this.initReject = null;
    this.initPromise = null;

    this.initialized = false;

    const oldOutput = this.output;
    const oldEngine = this.engine;

    this.output = null;
    this.engine = null;

    oldOutput?.close();

    if (killProcess) {
      oldEngine?.kill();
    }

    rejectInit?.(error);
  }

  /**
   * Đóng Stockfish khi NestJS tắt.
   */
  onModuleDestroy(): void {
    this.resetEngine(
      new Error('NestJS đang đóng StockfishService.'),
    );

    this.logger.log('Stockfish đã được đóng.');
  }
}
