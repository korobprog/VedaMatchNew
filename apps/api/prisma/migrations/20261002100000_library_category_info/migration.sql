-- «Информация» об авторе-рубрике Образования (VED-553): контакты, биография,
-- ресурсы и расписание простым текстом. Необязательные — у большинства
-- рубрик их не будет.
ALTER TABLE "LibraryCategory" ADD COLUMN "infoContacts" TEXT;
ALTER TABLE "LibraryCategory" ADD COLUMN "infoBio" TEXT;
ALTER TABLE "LibraryCategory" ADD COLUMN "infoResources" TEXT;
ALTER TABLE "LibraryCategory" ADD COLUMN "infoSchedule" TEXT;
