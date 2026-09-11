/**
 * Коммит, из которого собран запущенный образ, — для `GET /health`.
 *
 * По нему CI после деплоя понимает, что на проде уже новая сборка: старый
 * контейнер тоже отвечает `"status":"ok"`, и ждать одно здоровье значило
 * отпускать прогон, пока панель ещё собирает (или уже уронила) новый образ.
 *
 * Значение кладёт в окружение docker-entrypoint.sh из файла, который записала
 * стадия `commit` Dockerfile. Всё, что не полный хеш, — `null`: `unknown` из
 * сборки без .git или мусор в переменной не должны сойти за коммит.
 */
export function buildCommit(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const value = env.GIT_SHA?.trim().toLowerCase();
  return value && /^[0-9a-f]{40}$/.test(value) ? value : null;
}
