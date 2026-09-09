# Укрепление безопасности, сентябрь 2026

Итог аудита 9 сентября 2026: AgentShield по конфигам агента дал B (88/100),
`pnpm audit --prod` — 44 уязвимости (2 critical в Next.js), на боевом хосте
`vm-vedamatch` включён вход по паролю SSH при ~14 000 попыток перебора в
сутки, у панели Dokploy выключена 2FA. Код закрывает первый блок, остальное —
руками на сервере. Шаги идут в порядке приоритета, каждый независим.

## Сделано в этом PR

- `next` 16.2.10 → 16.3.4 (RCE в Image Optimization, обход proxy, SSRF в
  Server Actions), `sharp` 0.34.5 → 0.35.4 (libvips/libheif) в api и web.
- `overrides` в `pnpm-workspace.yaml` для транзитивных `multer`, `undici`,
  `postcss`, `nanoid`, `browserslist`, `qs`, `fast-uri`, `sanitize-html`,
  `baseline-browser-mapping`. После этого `pnpm audit --prod` показывает 2
  high — `effect` и `deepmerge-ts` внутри CLI `prisma` 6.16, они не попадают
  в рантайм и уйдут с обновлением Prisma.
- API: `helmet` в `main.ts` (HSTS, nosniff, X-Frame-Options, без
  `X-Powered-By`). CSP выключена, CORP = `cross-origin`, иначе картинки API
  не встроятся на `vedamatch.ru`.
- Web: `poweredByHeader: false` и блок `headers()` в `next.config.ts`. CSP не
  добавлена намеренно: без nonce она ломает инлайн-скрипты Next, это
  отдельная задача.

Проверка после деплоя, с любой машины:

```bash
curl -sI https://vedamatch.ru/ | grep -iE "strict-transport|x-frame|x-content-type|x-powered"
```

```bash
curl -sI https://api.vedamatch.ru/health | grep -iE "strict-transport|x-frame|x-content-type|x-powered"
```

Ожидание: три защитных заголовка есть, `X-Powered-By` нет.

## Шаг 1. Панель Dokploy: 2FA и срок API-ключей

В панели `panel.crystalmanjari.ru`: Settings → Profile → Two-Factor
Authentication → включить, сохранить резервные коды. Там же Settings → API
Keys: у ключей `VedamatchIOS` и `Maxim` нет срока — пересоздать со сроком
или удалить те, что не используются.

## Шаг 2. SSH только по ключу

Сначала убедиться, что ключ уже в `authorized_keys` (у `ubuntu` их два, у
root один) и что открыта **вторая** SSH-сессия на случай ошибки.

```bash
sudo sed -i 's/^PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config.d/50-cloud-init.conf && sudo sshd -t && sudo systemctl reload ssh && sudo sshd -T | grep -i passwordauth
```

Ожидание: `passwordauthentication no`. Не закрывая старую сессию, зайти
новой. Если новая не заходит — в старой вернуть `yes` той же командой.

Почему так: `50-cloud-init.conf` по алфавиту раньше `60-cloudimg-settings.conf`,
а sshd берёт первое встреченное значение.

## Шаг 3. fail2ban

```bash
sudo apt install -y fail2ban && sudo systemctl enable --now fail2ban && sleep 5 && sudo fail2ban-client status sshd
```

Ожидание: строка `Currently banned` с растущим числом. Стандартный jail
`sshd` включён из коробки на Ubuntu 24.04.

## Шаг 4. Перезагрузка ради ядра

Ожидает `linux-image-6.8.0-139`. В окно обслуживания:

```bash
sudo apt update && sudo apt upgrade -y && sudo reboot
```

После подъёма проверить, что правило DOCKER-USER вернулось и панель не
торчит наружу:

```bash
sudo iptables -S DOCKER-USER | grep 3000 && systemctl is-active block-dokploy-port.service
```

## Шаг 5. Права на `/etc/dokploy`

Каталог 777, `.env` стека читается любым локальным пользователем.

```bash
sudo chmod 755 /etc/dokploy && sudo chmod 640 /etc/dokploy/compose/*/code/portal/.env && sudo ls -ld /etc/dokploy
```

После этого сделать тестовый Deploy в панели и убедиться, что он прошёл:
Dokploy работает от root, права ему не мешают, но проверить надо.

## Шаг 6. Traefik dashboard

В `/etc/dokploy/traefik/traefik.yml` стоит `api.insecure: true`. Порт 8080
не опубликован, снаружи не виден, так что срочности нет. При случае:

```bash
sudo sed -i 's/^  insecure: true/  insecure: false/' /etc/dokploy/traefik/traefik.yml && docker restart dokploy-traefik
```

## Потом, отдельными задачами

- CSP с nonce для web.
- Глобальный `ValidationPipe` в API (сейчас валидация ручная, помодульно).
- Обновление `prisma` CLI, чтобы ушли последние два advisory.
- Хост общий с другими стеками (`scalper-nightly`, ещё четыре compose):
  уязвимость соседа бьёт по VedaMatch. Разнести при росте нагрузки.
