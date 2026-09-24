-- FirstVDS перевёл объектное хранилище с s3.firstvds.ru на firsts3.ru и
-- 24.09.2026 удалил старую DNS-запись: все сохранённые ссылки на картинки,
-- аватары и аудио перестали открываться. Бакет и пути те же, меняется только
-- домен. Ссылки лежат полными URL в колонках разных сервисов, поэтому обходим
-- все текстовые, массивные и JSON-колонки текущей схемы, а не перечисляем
-- их руками. Повторный прогон ничего не найдёт, миграция идемпотентна.
DO $$
DECLARE
  col record;
  n bigint;
  total bigint := 0;
  old_host constant text := 'https://s3.firstvds.ru/';
  new_host constant text := 'https://firsts3.ru/';
BEGIN
  FOR col IN
    SELECT c.table_name, c.column_name, c.data_type, c.udt_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = current_schema()
      AND t.table_type = 'BASE TABLE'
      AND c.table_name <> '_prisma_migrations'
      AND (
        c.data_type IN ('text', 'character varying', 'json', 'jsonb')
        OR (c.data_type = 'ARRAY' AND c.udt_name IN ('_text', '_varchar'))
      )
  LOOP
    IF col.data_type IN ('text', 'character varying') THEN
      EXECUTE format(
        'UPDATE %I SET %I = replace(%I, $1, $2) WHERE %I LIKE $3',
        col.table_name, col.column_name, col.column_name, col.column_name
      ) USING old_host, new_host, '%' || old_host || '%';
    ELSIF col.data_type IN ('json', 'jsonb') THEN
      -- В домене нет символов, которые JSON экранирует, так что замена по
      -- тексту документа не ломает его структуру.
      EXECUTE format(
        'UPDATE %I SET %I = replace(%I::text, $1, $2)::%s WHERE %I::text LIKE $3',
        col.table_name, col.column_name, col.column_name, col.udt_name, col.column_name
      ) USING old_host, new_host, '%' || old_host || '%';
    ELSE
      EXECUTE format(
        'UPDATE %I SET %I = ARRAY(SELECT replace(e, $1, $2) FROM unnest(%I) WITH ORDINALITY AS u(e, i) ORDER BY i)::%s '
        'WHERE array_to_string(%I, chr(1)) LIKE $3',
        col.table_name, col.column_name, col.column_name,
        CASE col.udt_name WHEN '_varchar' THEN 'varchar[]' ELSE 'text[]' END,
        col.column_name
      ) USING old_host, new_host, '%' || old_host || '%';
    END IF;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN
      RAISE NOTICE 's3 domain: %.% — % rows', col.table_name, col.column_name, n;
      total := total + n;
    END IF;
  END LOOP;
  RAISE NOTICE 's3 domain: total % rows', total;
END $$;
