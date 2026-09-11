#!/bin/sh
# Коммит, из которого собран образ API. Печатает 40 hex-символов или `unknown`.
#
#   build-commit.sh <папка с HEAD/refs/packed-refs из .git> [явный хеш]
#
# Зачем так сложно. Прод собирает Dokploy (v0.30.6): он делает
# `git clone --branch main --depth 1` и `docker compose up --build`, а хеш
# коммита в сборку не передаёт — ни build-arg, ни переменной в .env
# (там только APP_NAME, COMPOSE_PROJECT_NAME и переменные из панели).
# Свой command в панели тоже не поможет: `$` и скобки в нём запрещены.
# Зато в контексте сборки лежит клон — берём хеш из него. .dockerignore
# пропускает из .git ровно HEAD, refs/heads и packed-refs, без объектов.
#
# Порядок: явный хеш (--build-arg GIT_SHA=...) → .git → unknown. Сборка из
# git worktree, где .git — файл, а не папка, не падает: коммит просто
# неизвестен.
set -eu

dir="${1:-.}"
explicit="${2:-}"

is_sha() {
  printf '%s' "$1" | grep -Eq '^[0-9a-f]{40}$'
}

if is_sha "$explicit"; then
  printf '%s\n' "$explicit"
  exit 0
fi

head=$(cat "$dir/HEAD" 2>/dev/null || true)
sha=""
case "$head" in
  "ref: "*)
    ref=${head#ref: }
    # Свежий клон держит свою ветку отдельным файлом, а после `git gc` она
    # переезжает в packed-refs — смотрим оба места.
    sha=$(cat "$dir/$ref" 2>/dev/null || true)
    if ! is_sha "$sha"; then
      sha=$(grep " $ref\$" "$dir/packed-refs" 2>/dev/null | cut -d' ' -f1 || true)
    fi
    ;;
  *)
    # Отсоединённый HEAD (так делает actions/checkout для pull request):
    # хеш лежит прямо в нём.
    sha=$head
    ;;
esac

if is_sha "$sha"; then
  printf '%s\n' "$sha"
else
  printf 'unknown\n'
fi
