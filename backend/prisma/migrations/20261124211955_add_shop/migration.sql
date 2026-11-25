-- AlterTable
ALTER TABLE "users" ADD COLUMN     "board_theme" VARCHAR(20) NOT NULL DEFAULT 'classic',
ADD COLUMN     "coins" INTEGER NOT NULL DEFAULT 500,
ADD COLUMN     "gems" INTEGER NOT NULL DEFAULT 30;

-- CreateTable
CREATE TABLE "user_items" (
    "user_id" TEXT NOT NULL,
    "item_id" VARCHAR(40) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_items_pkey" PRIMARY KEY ("user_id","item_id")
);

-- AddForeignKey
ALTER TABLE "user_items" ADD CONSTRAINT "user_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
