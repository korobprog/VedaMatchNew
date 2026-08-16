-- AlterTable
-- Пустой список по умолчанию означает «как на самоидентификации»: прежние
-- пользователи продолжают видеть свою ленту без бэкфила.
ALTER TABLE "public"."MotivationPreference"
  ADD COLUMN "profileTypes" "public"."MotivationProfileType"[] DEFAULT ARRAY[]::"public"."MotivationProfileType"[];
