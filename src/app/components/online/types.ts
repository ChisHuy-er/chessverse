export type OnlineMode = "ranked" | "casual";
export type CapturedPiece = {
  color: "w" | "b";
  type: "p" | "n" | "b" | "r" | "q";
};

export type ClockSnapshot = {
  whiteMs: number;
  blackMs: number;
  activeColor: "white" | "black";
};

export type DrawOfferedData = {
  from: string;
  fromColor: "white" | "black";
};
export interface PlayerProfile {
  id: string;
  username: string;
  displayName: string;
  elo: number;
}

export interface MatchFoundData {
  matchId: string;
  fen: string;
  mode: OnlineMode;
  clock?: ClockSnapshot;
  players: {
    white: string;
    black: string;
    whiteProfile: PlayerProfile;
    blackProfile: PlayerProfile;
  };
}
export interface MoveMadeData {
  move: {
    from: string;
    to: string;
    san: string;
    promotion?: string;
  };
  fen: string;
  turn: "w" | "b";
}

export interface EloChange {
  before: number;
  change: number;
  after: number;
}

export interface AnalysisMove {
  ply: number;
  color: "w" | "b";

  // SAN để hiển thị nước đi.
  move: string;

  // UCI và FEN do Backend gửi.
  uci?: string;
  bestMove: string;
  beforeFen?: string;
  afterFen?: string;

  scoreType: "cp" | "mate" | null;
  score: number | null;
  depth: number;
  pv: string[];
  centipawnLoss: number | null;
  label: string;
}

export interface FinishedData {
  result: "win" | "draw";
  winner: string | null;
  reason: string;
  fen: string;
  clock?: ClockSnapshot;
  eloChanges: {
    white: EloChange;
    black: EloChange;
  } | null;
  analysisSummary?: {
    whiteAverageCpl: number | null;
    blackAverageCpl: number | null;
    moves: AnalysisMove[];
  };
}

export interface ResumeData {
  matchId: string;
  mode: OnlineMode;
  fen: string;
  clock: ClockSnapshot;
  color: "white" | "black";
  players: MatchFoundData["players"];
  lastMove: { from: string; to: string } | null;
  moves: { from: string; to: string; beforeFen: string }[];
  drawOffer: DrawOfferedData | null;
  drawOfferSent: boolean;
  opponentDisconnected: boolean;
}
