# Объекты БД, созданные сырым SQL

Часть объектов схемы создаётся вручную в `migration.sql` и **не описана** в
`schema.prisma`, потому что Prisma не умеет их выражать. Diff-движок про них не
знает и при каждом `prisma migrate dev` считает их лишними — то есть дописывает
в новую миграцию их удаление.

## Что именно под угрозой

| Объект | Где создан | Что генерирует Prisma |
|---|---|---|
| `LibraryEntry."searchVector"` — generated-колонка `tsvector` | `library_core` | `ALTER COLUMN "searchVector" DROP DEFAULT` |
| `LibraryEntry_searchVector_idx` — GIN по `searchVector` | `library_core` | `DROP INDEX` |
| `LibraryCategory_normalizedRu_trgm_idx` — GIN `gin_trgm_ops` | `library_core` | `DROP INDEX` |
| `LibraryCategory_normalizedEn_trgm_idx` — GIN `gin_trgm_ops` | `library_core` | `DROP INDEX` |

Удаление любого из них ломает полнотекстовый поиск по библиотеке и подсказку
похожих категорий при создании. Причём тихо: тесты на моках этого не увидят,
поиск просто станет медленным или пустым.

## Правило

**После каждого `prisma migrate dev` открывайте сгенерированный `migration.sql`
и удаляйте оттуда любые `DROP INDEX` и `ALTER COLUMN "searchVector"` из таблиц
`LibraryEntry` и `LibraryCategory`, если вы не меняли поиск осознанно.**

Пример такой правки — миграция `20260729131836_user_gender`: в ней осталась
только работа с `Gender`, а четыре лишних оператора удалены вручную.

Если миграция уже упала на этом (`P3018`, ошибка
`column "searchVector" ... is a generated column`), Postgres откатывает её
целиком — данные и индексы не страдают. Порядок восстановления:

```bash
pnpm --filter @vedamatch/api exec prisma migrate resolve --rolled-back <имя_миграции>
```

Затем поправьте `migration.sql` и примените заново через `migrate deploy`.

## Как убрать проблему совсем

Постоянное решение — перевести `searchVector` с generated-колонки на обычную
колонку, которую наполняет триггер, и объявить GIN-индексы прямо в
`schema.prisma` через `@@index([...], type: Gin)` с `ops: raw("gin_trgm_ops")`.
Тогда diff-движок будет видеть все четыре объекта и перестанет их удалять.
Работа не сделана — это отдельная задача, требующая миграции с пересозданием
колонки и прогона поиска на реальных данных.
