
declare module 'stockfish' {
  interface StockfishPackage {
    findEngine(name: string): string;
  }

  const stockfishPackage: StockfishPackage;

  export default stockfishPackage;
}
