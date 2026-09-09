#!/usr/bin/env python3
"""Достать сертификат домена из acme.json Traefik'а в PEM-файлы для coturn.

Traefik хранит выпущенные сертификаты одним JSON-файлом, а coturn читает
обычные PEM. certbot на сервере не нужен: сертификат для turn.vedamatch.ru
выпускает Traefik через фиктивный маршрут (см. install.sh), а этот скрипт
раз в день переписывает PEM и перезапускает coturn, если они изменились.

Использование: extract-cert.py <acme.json> <домен> <папка-назначения>
Код возврата: 0 — файлы обновлены, 3 — без изменений, 1 — домена нет.
"""
import base64
import json
import os
import sys


def main() -> int:
    acme_path, domain, out_dir = sys.argv[1:4]
    with open(acme_path, encoding="utf-8") as fh:
        acme = json.load(fh)

    for resolver in acme.values():
        for cert in resolver.get("Certificates") or []:
            names = [cert["domain"].get("main")] + (cert["domain"].get("sans") or [])
            if domain in names:
                fullchain = base64.b64decode(cert["certificate"])
                privkey = base64.b64decode(cert["key"])
                break
        else:
            continue
        break
    else:
        print(f"{domain}: сертификата в {acme_path} ещё нет", file=sys.stderr)
        return 1

    os.makedirs(out_dir, exist_ok=True)
    changed = False
    for name, data in (("fullchain.pem", fullchain), ("privkey.pem", privkey)):
        path = os.path.join(out_dir, name)
        try:
            with open(path, "rb") as fh:
                if fh.read() == data:
                    continue
        except FileNotFoundError:
            pass
        with open(path, "wb") as fh:
            fh.write(data)
        # coturn в контейнере работает от nobody (uid 65534) и файлы root:640
        # не открывает — TLS-слушатель молча не поднимается. Отдаём файлы ему,
        # миру не показываем.
        os.chmod(path, 0o640)
        os.chown(path, 65534, 65534)
        changed = True

    return 0 if changed else 3


if __name__ == "__main__":
    sys.exit(main())
