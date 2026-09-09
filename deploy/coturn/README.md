# coturn для звонков

Этап 0 плана [docs/chat-calls-plan.md](../../docs/chat-calls-plan.md):
поднять TURN на проде и измерить, какой доле клиентов из России и Европы
он доступен по UDP, TCP и TLS. Код звонков от этого измерения зависит,
поэтому оно первое.

## Что понадобится

- DNS: `turn.vedamatch.ru` → публичный IP амстердамского сервера.
- Сертификат на это имя в `certs/fullchain.pem` и `certs/privkey.pem`.
  Проще всего `certbot certonly --standalone -d turn.vedamatch.ru` с
  временно освобождённым 80/tcp либо DNS-челлендж; обновление — cron с
  `docker restart vedamatch-coturn` в deploy-hook.
- `.env` рядом с compose (образец — `.env.example`): `TURN_SECRET` (32+
  случайных байта, `openssl rand -hex 32`), `TURN_REALM=vedamatch.ru`,
  `TURN_EXTERNAL_IP`, `TURN_TLS_PORT`.
- Тот же `TURN_SECRET` и `TURN_HOST=turn.vedamatch.ru` — в env сервиса API
  в Dokploy (амстердамская панель, см. память о двух панелях).

## Порты и фаервол

Published-порты Docker обходят ufw, но coturn в `network_mode: host` — нет:
его порты ufw режет честно. Открыть:

```bash
ufw allow 3478/udp && ufw allow 3478/tcp && ufw allow 5349/tcp && ufw allow 49160:49400/udp
```

Если TLS-порт выбран 443 (второй IP), вместо 5349 открыть 443/tcp на этом
адресе.

## Запуск

```bash
cd /opt/vedamatch/coturn && docker compose up -d && docker logs -f vedamatch-coturn
```

Проверка с ноутбука: страница `/chat/calls/probe` на портале (нужен вход).
Она запрашивает учётку у API, собирает ICE-кандидаты по каждому транспорту
и прогоняет данные через релей в петле. Итог — таблица «транспорт →
доступен / нет», её и собираем с разных сетей.

## Что записать по итогам этапа 0

| Сеть | srflx (STUN) | relay UDP | relay TCP | relay TLS | loopback через relay |
|---|---|---|---|---|---|
| Дом, провайдер в РФ | | | | | |
| МТС LTE | | | | | |
| Билайн LTE | | | | | |
| Европа, дом | | | | | |

Если relay TCP/TLS из РФ доступен реже, чем в 9 случаях из 10, следующий
шаг — второй coturn в московском контуре, а не клиентский код.

## Открытый вопрос: 443

Порт 443/tcp на сервере занят Traefik'ом. `turns:` на 443 — самый живучий
вариант в сетях с жёстким фаерволом, но требует отдельного IP. Пока
измеряем на 5349; если TLS на нестандартном порту из РФ проходит так же,
как на 443, второй адрес не нужен.
