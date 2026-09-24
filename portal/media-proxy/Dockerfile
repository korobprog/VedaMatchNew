# Прокси файлов портала: media.vedamatch.ru → хранилище FirstVDS.
# Зачем он нужен — в default.conf.template. Шаблоны из /etc/nginx/templates
# entrypoint образа прогоняет через envsubst при старте.
FROM nginx:1.29-alpine
COPY portal/media-proxy/default.conf.template /etc/nginx/templates/default.conf.template
