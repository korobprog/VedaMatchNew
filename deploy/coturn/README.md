# coturn для звонков

Этап 0 плана [docs/chat-calls-plan.md](../../docs/chat-calls-plan.md):
поднять TURN на проде и измерить, какой доле клиентов из России и Европы
он доступен по UDP, TCP и TLS. Код звонков от этого измерения зависит,
поэтому оно первое.

## Что известно о хосте (vm-vedamatch, 2026-09-09)

- Ubuntu, пользователь `ubuntu` с `sudo` без пароля, Docker Compose v5,
  `python3` есть, `certbot` и `jq` — нет.
- Хост за 1:1 NAT: внутри `192.168.195.2`, снаружи `64.130.62.129`.
  coturn должен знать оба адреса (`--external-ip=внешний/внутренний`),
  иначе в relay-кандидатах окажется внутренний.
- 80 и 443 держит `dokploy-traefik`; сертификаты он складывает в
  `/etc/dokploy/traefik/dynamic/acme.json`, резолвер `letsencrypt`,
  HTTP-челлендж. Traefik следит за папкой `dynamic/` — файл, положенный
  туда, подхватывается без перезапуска.
- ufw активен: 22, 80, 443. coturn в `network_mode: host` под ufw
  попадает, порты надо открыть.
- Заголовка `Permissions-Policy` прод не отдаёт: Caddy не используется,
  камере и микрофону ничто не мешает.
- DNS `turn.vedamatch.ru` → `64.130.62.129` уже есть.

## Установка (руками, на хосте)

Всё ниже — с правами root на боевом сервере, поэтому выполняется
пользователем, а не агентом. Шаги идемпотентны.

**1. Файлы и секрет**

```bash
sudo mkdir -p /opt/vedamatch/coturn/certs && cd /opt/vedamatch/coturn && sudo curl -fsSLo docker-compose.yml https://raw.githubusercontent.com/korobprog/VedaMatchNew/feat/chat-calls-plan/deploy/coturn/docker-compose.yml && sudo curl -fsSLo turnserver.conf https://raw.githubusercontent.com/korobprog/VedaMatchNew/feat/chat-calls-plan/deploy/coturn/turnserver.conf && sudo curl -fsSLo extract-cert.py https://raw.githubusercontent.com/korobprog/VedaMatchNew/feat/chat-calls-plan/deploy/coturn/extract-cert.py
```

(до пуша ветки файлы можно скопировать через `scp` из
`deploy/coturn/` этой ветки.)

```bash
printf 'TURN_SECRET=%s\nTURN_REALM=vedamatch.ru\nTURN_EXTERNAL_IP=64.130.62.129/192.168.195.2\nTURN_TLS_PORT=5349\nTURN_CERT_DIR=/opt/vedamatch/coturn/certs\n' "$(openssl rand -hex 32)" | sudo tee /opt/vedamatch/coturn/.env >/dev/null && sudo chmod 600 /opt/vedamatch/coturn/.env
```

**2. Сертификат через Traefik.** Фиктивный маршрут заставляет ACME
выпустить сертификат на `turn.vedamatch.ru`; сервис ведёт на web портала,
чтобы по https на этом имени не отвечал 404 самого Traefik'а. TURN-трафик
идёт мимо Traefik'а, на порты coturn.

```bash
sudo tee /etc/dokploy/traefik/dynamic/turn-cert.yml >/dev/null <<'EOF'
http:
  routers:
    turn-cert-router:
      rule: Host(`turn.vedamatch.ru`)
      service: turn-cert-service
      entryPoints:
        - websecure
      tls:
        certResolver: letsencrypt
  services:
    turn-cert-service:
      loadBalancer:
        servers:
          - url: http://compose-back-up-bluetooth-array-uc9s81-web-1:3000
EOF
```

Через 10–60 секунд достать PEM (код возврата 1 — сертификата ещё нет,
повторить):

```bash
sudo python3 /opt/vedamatch/coturn/extract-cert.py /etc/dokploy/traefik/dynamic/acme.json turn.vedamatch.ru /opt/vedamatch/coturn/certs && sudo ls -la /opt/vedamatch/coturn/certs
```

Ежедневное обновление PEM из acme.json с перезапуском только при смене:

```bash
echo '17 4 * * * root python3 /opt/vedamatch/coturn/extract-cert.py /etc/dokploy/traefik/dynamic/acme.json turn.vedamatch.ru /opt/vedamatch/coturn/certs && docker restart vedamatch-coturn >/dev/null 2>&1' | sudo tee /etc/cron.d/vedamatch-coturn-cert >/dev/null
```

**3. Фаервол**

```bash
sudo ufw allow 3478/udp && sudo ufw allow 3478/tcp && sudo ufw allow 5349/tcp && sudo ufw allow 49160:49400/udp
```

**4. Запуск**

```bash
cd /opt/vedamatch/coturn && sudo docker compose up -d && sudo docker compose ps && sudo docker logs --tail 30 vedamatch-coturn
```

В логе должны быть строки про прослушивание 3478 и TLS 5349 и ни одной
про сертификат. Если TLS-порт не слушается, а в логе «cannot find
certificate file» — дело в правах: coturn в контейнере работает от
`nobody` (uid 65534), файлы должны принадлежать ему (`extract-cert.py`
делает это сам).

Состояние на 2026-09-09: coturn на проде поднят по этим шагам, TLS на 5349
снаружи отвечает сертификатом `turn.vedamatch.ru`, TCP 3478 открыт.
UDP снаружи не проверялся — это работа зонда.

**5. Переменные API в Dokploy** (амстердамская панель, compose
`vedamatch-portal`, сервис api), после чего Redeploy:

```
TURN_HOST=turn.vedamatch.ru
TURN_TLS_PORT=5349
TURN_SECRET=<значение из /opt/vedamatch/coturn/.env>
```

Показать секрет: `sudo grep TURN_SECRET /opt/vedamatch/coturn/.env`.

## Проверка

Страница `/chat/calls/probe` на портале (нужен вход, ветка должна быть
задеплоена). Она запрашивает учётку у API, собирает ICE-кандидаты по
каждому транспорту и прогоняет данные через релей в петле. Итог — строка
для таблицы ниже; собрать с разных сетей.

Проверка снаружи без портала, что порт вообще виден через NAT:

```bash
nc -vzu 64.130.62.129 3478; nc -vz 64.130.62.129 3478; openssl s_client -connect turn.vedamatch.ru:5349 -servername turn.vedamatch.ru </dev/null 2>/dev/null | grep -E "subject|Verify"
```

## Результаты этапа 0

| Сеть | STUN | relay UDP | relay TCP | relay TLS | петля |
|---|---|---|---|---|---|
| Дом, провайдер в РФ | | | | | |
| МТС LTE | | | | | |
| Билайн LTE | | | | | |
| Европа | | | | | |

Если relay TCP/TLS из РФ доступен реже, чем в 9 случаях из 10, следующий
шаг — второй coturn в московском контуре, а не клиентский код.

## Открытые вопросы

- **NAT провайдера и UDP-диапазон.** 1:1 NAT обычно пробрасывает все
  порты, но подтвердить это можно только зондом: relay UDP «нет» при
  живом relay TCP укажет именно сюда.
- **443.** Занят Traefik'ом. `turns:` на 443 — самый живучий вариант в
  сетях с жёстким фаерволом, но требует отдельного IP. Измеряем на 5349;
  если TLS на нестандартном порту из РФ проходит так же, второй адрес не
  нужен.
