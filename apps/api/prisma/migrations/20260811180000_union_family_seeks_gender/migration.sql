-- Порог «family >= 50%» заменяется явным выбором пола. Порог перестал быть
-- осмысленным, когда цели стали отмечаться галочками: вес зависит от их
-- количества, и человек терял фильтр, просто отметив третью цель.
ALTER TABLE "UnionProfile" ADD COLUMN "familySeeksGender" "Gender";

-- Переносим тех, у кого ограничение работало прямо сейчас: пол известен,
-- цель «Создание семьи» весит не меньше 50 и тумблер отключения не включён.
UPDATE "UnionProfile" p
SET "familySeeksGender" = CASE
    WHEN u."gender" = 'male' THEN 'female'::"Gender"
    ELSE 'male'::"Gender"
  END
FROM "User" u
WHERE u."id" = p."userId"
  AND u."gender" IS NOT NULL
  AND p."disableFamilyGenderFilter" = false
  AND EXISTS (
    SELECT 1
    FROM "UnionIntention" i
    WHERE i."profileId" = p."id"
      AND i."type" = 'family'
      AND i."weight" >= 50
  );

ALTER TABLE "UnionProfile" DROP COLUMN "disableFamilyGenderFilter";
