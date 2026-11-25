-- CreateTable
CREATE TABLE "quest_claims" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "quest_id" VARCHAR(40) NOT NULL,
    "period" VARCHAR(24) NOT NULL,
    "exp" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quest_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "puzzle_solves" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "puzzle_id" VARCHAR(20) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "stars" INTEGER NOT NULL DEFAULT 0,
    "solved_at" TIMESTAMP(3),

    CONSTRAINT "puzzle_solves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_days" (
    "user_id" TEXT NOT NULL,
    "day" VARCHAR(10) NOT NULL,

    CONSTRAINT "login_days_pkey" PRIMARY KEY ("user_id","day")
);

-- CreateTable
CREATE TABLE "lesson_progress" (
    "user_id" TEXT NOT NULL,
    "course_id" VARCHAR(30) NOT NULL,
    "lesson_id" VARCHAR(30) NOT NULL,
    "done_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lesson_progress_pkey" PRIMARY KEY ("user_id","course_id","lesson_id")
);

-- CreateIndex
CREATE INDEX "quest_claims_user_id_created_at_idx" ON "quest_claims"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "quest_claims_user_id_quest_id_period_key" ON "quest_claims"("user_id", "quest_id", "period");

-- CreateIndex
CREATE INDEX "puzzle_solves_user_id_solved_at_idx" ON "puzzle_solves"("user_id", "solved_at");

-- CreateIndex
CREATE UNIQUE INDEX "puzzle_solves_user_id_puzzle_id_key" ON "puzzle_solves"("user_id", "puzzle_id");

-- CreateIndex
CREATE INDEX "lesson_progress_user_id_done_at_idx" ON "lesson_progress"("user_id", "done_at");

-- AddForeignKey
ALTER TABLE "quest_claims" ADD CONSTRAINT "quest_claims_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "puzzle_solves" ADD CONSTRAINT "puzzle_solves_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "login_days" ADD CONSTRAINT "login_days_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
