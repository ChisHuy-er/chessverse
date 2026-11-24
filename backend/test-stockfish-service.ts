
import { StockfishService } from './src/online/stockfish.service';

const TEST_FEN =
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

async function main() {
  const stockfish = new StockfishService();

  try {
    console.log('===== TEST 1 =====');

    const result1 = await stockfish.analyzeFen(TEST_FEN, 8);

    console.log('Best move:', result1.bestMove);
    console.log('Score type:', result1.scoreType);
    console.log('Score:', result1.score);
    console.log('Depth:', result1.depth);
    console.log('PV:', result1.pv.join(' '));

    console.log('\n===== TEST 2 =====');

    const result2 = await stockfish.analyzeFen(TEST_FEN, 10);

    console.log('Best move:', result2.bestMove);
    console.log('Score type:', result2.scoreType);
    console.log('Score:', result2.score);
    console.log('Depth:', result2.depth);
    console.log('PV:', result2.pv.join(' '));

    console.log('\nSUCCESS: Hai yêu cầu phân tích đều hoàn thành!');
  } catch (error) {
    console.error('ERROR:', error);
    process.exitCode = 1;
  } finally {
    stockfish.onModuleDestroy();
  }
}

main();
