-- Ảnh đại diện, khung và nền hồ sơ người chơi chọn
ALTER TABLE "users" ADD COLUMN "avatar_id" VARCHAR(20),
ADD COLUMN "avatar_frame" VARCHAR(20),
ADD COLUMN "profile_cover" VARCHAR(20);
