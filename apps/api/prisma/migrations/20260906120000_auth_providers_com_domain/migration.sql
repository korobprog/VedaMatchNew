-- Портал переезжает на vedamatch.com. Список хостов в AuthProviderSetting
-- сверяется с хостом запроса (portalHost() в auth-providers.service.ts), и
-- на незнакомом домене список способов входа оказывается пустым — войти
-- нельзя вообще, при полностью исправном OAuth.
--
-- Домен дописывается, а не заменяет старый: пока .ru отдаёт приложение,
-- а не редирект, вход там обязан продолжать работать.
--
-- Условие NOT ... = ANY делает миграцию безопасной, если домен уже
-- добавили руками в базе до накатки.
UPDATE "AuthProviderSetting"
   SET "domains" = array_append("domains", 'vedamatch.com'),
       "updatedAt" = now()
 WHERE 'vedamatch.ru' = ANY ("domains")
   AND NOT ('vedamatch.com' = ANY ("domains"));
