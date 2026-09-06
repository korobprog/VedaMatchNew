"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_INSTANT_MEDIA,
  readInstantMedia,
  writeInstantMedia,
} from "./chat-send-settings";

/**
 * Переключатель «отправлять фото и файлы сразу». Читается эффектом: на
 * сервере `localStorage` нет, и ленивый `useState` дал бы расхождение
 * гидратации — как у панели горячих кнопок.
 */
export function ChatSendSettingsToggle() {
  const [instant, setInstant] = useState(DEFAULT_INSTANT_MEDIA);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- см. комментарий выше. */
    setInstant(readInstantMedia());
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  return (
    <section aria-labelledby="chat-send-settings" className="mt-8">
      <h2
        id="chat-send-settings"
        className="font-display text-base font-semibold text-text-0"
      >
        Отправка вложений
      </h2>
      <label className="mt-3 flex items-start gap-3 rounded-2xl border border-glass-brd bg-glass p-3">
        <input
          type="checkbox"
          className="mt-1"
          checked={instant}
          onChange={(event) => {
            setInstant(event.target.checked);
            writeInstantMedia(event.target.checked);
          }}
        />
        <span>
          <span className="block text-sm font-medium text-text-0">
            Отправлять фото и файлы сразу
          </span>
          <span className="block text-xs leading-4 text-text-2">
            Выключите, если хотите приписывать к фото текст или собирать
            несколько снимков в одно сообщение: тогда выбранное сначала
            ложится под поле ввода и ждёт «Отправить». Голосовые уходят
            сразу в любом случае. Настройка хранится на этом устройстве.
          </span>
        </span>
      </label>
    </section>
  );
}
