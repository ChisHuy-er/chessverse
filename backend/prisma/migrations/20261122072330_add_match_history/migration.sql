-- CreateEnum
CREATE TYPE "MatchMode" AS ENUM ('RANKED', 'CASUAL');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'ABORTED');

-- CreateEnum
CREATE TYPE "MatchResult" AS ENUM ('WHITE_WIN', 'BLACK_WIN', 'DRAW');

-- CreateEnum
CREATE TYPE "MatchReason" AS ENUM ('CHECKMATE', 'RESIGN', 'DISCONNECT', 'STALEMATE', 'INSUFFICIENT_MATERIAL', 'THREEFOLD_REPETITION', 'FIFTY_MOVE_RULE', 'SEVENTY_FIVE_MOVE_RULE', 'DRAW_AGREEMENT');

-- CreateTable
CREATE TABLE "matches" (
    "id" TEXT NOT NULL,
    "mode" "MatchMode" NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "result" "MatchResult",
    "reason" "MatchReason",
    "whiteUserId" TEXT NOT NULL,
    "blackUserId" TEXT NOT NULL,
    "pgn" TEXT,
    "final_fen" TEXT,
    "moves" JSONB NOT NULL DEFAULT '[]',
    "analysis" JSONB,
    "whiteEloBefore" INTEGER,
    "whiteEloChange" INTEGER NOT NULL DEFAULT 0,
    "whiteEloAfter" INTEGER,
    "blackEloBefore" INTEGER,
    "blackEloChange" INTEGER NOT NULL DEFAULT 0,
    "blackEloAfter" INTEGER,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "matches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "matches_whiteUserId_created_at_idx" ON "matches"("whiteUserId", "created_at");

-- CreateIndex
CREATE INDEX "matches_blackUserId_created_at_idx" ON "matches"("blackUserId", "created_at");

-- CreateIndex
CREATE INDEX "matches_mode_status_idx" ON "matches"("mode", "status");

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_whiteUserId_fkey" FOREIGN KEY ("whiteUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_blackUserId_fkey" FOREIGN KEY ("blackUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
