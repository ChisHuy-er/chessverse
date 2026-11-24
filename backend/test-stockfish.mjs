
import stockfish from 'stockfish';

let engine;
let finished = false;
let readySent = false;
let analysisStarted = false;

const timeout = setTimeout(() => {
  if (finished) return;

  console.error('ERROR: Stockfish timeout sau 30 giây.');
  finished = true;
  engine?.terminate();
  process.exit(1);
}, 30000);

engine = stockfish('lite-single', (message) => {
  const output = String(message);

  console.log('[Stockfish]', output);

  // Package có thể gửi nhiều thông báo trong cùng một chuỗi.
  if (output.includes('uciok') && !readySent) {
    readySent = true;
    console.log('UCI handshake thành công.');
    engine.processCommand('isready');
  }

  if (output.includes('readyok') && !analysisStarted) {
    analysisStarted = true;
    console.log('Engine đã sẵn sàng. Bắt đầu phân tích...');

    engine.processCommand('position startpos');
    engine.processCommand('go depth 8');
  }

  const bestMoveMatch = output.match(/bestmove\s+(\S+)/);

  if (bestMoveMatch && !finished) {
    console.log('\nSUCCESS: Stockfish đã phân tích xong!');
    console.log('Best move:', bestMoveMatch[1]);

    finished = true;
    clearTimeout(timeout);
    engine.terminate();
  }
});

console.log('Đang khởi động Stockfish 19 Lite Single...');
engine.processCommand('uci');
