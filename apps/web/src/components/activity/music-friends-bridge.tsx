"use client";

import { useEffect, useState } from "react";
import {
  isNowPlayingMessage,
  type ActivityStreamMessage,
} from "@vedamatch/shared";
import { subscribeToActivity } from "@/lib/activity-stream";
import {
  MusicQuickWidget,
  type MusicFriendListening,
} from "@/components/music/music-quick-widget";
import type { MusicQuickAccessData } from "@/lib/music-quick-access";

/**
 * Кто из друзей что слушает — для карточки Музыки на широком экране.
 *
 * Прослойка портальная, а не сервисная, и это принципиально: граф доступа
 * («кому открыта моя активность») принадлежит модулю `activity`, и компонент
 * Музыки не имеет права знать ни его эндпоинт, ни формат его событий. Здесь
 * портал слушает свой поток и отдаёт Музыке готовые строки пропсом.
 *
 * Подписка общая с лентой друзей: `subscribeToActivity` держит один
 * `EventSource` на вкладку и раздаёт события всем подписчикам.
 */
export function MusicFriendsBridge({ data }: { data: MusicQuickAccessData }) {
  const [friends, setFriends] = useState<MusicFriendListening[]>([]);

  useEffect(() => {
    const unsubscribe = subscribeToActivity((message: ActivityStreamMessage) => {
      if (!isNowPlayingMessage(message)) return;

      setFriends((was) => {
        const rest = was.filter((row) => row.id !== message.friend.id);
        // `null` — перестал слушать или ушёл в невидимый сеанс: строка обязана
        // погаснуть, а не залипнуть на последней записи.
        if (!message.nowPlaying) return rest;

        return [
          {
            id: message.friend.id,
            name: message.friend.name,
            avatarUrl: message.friend.avatarUrl,
            title: message.nowPlaying.title,
            link: message.nowPlaying.link,
            addLink: message.nowPlaying.addLink,
          },
          ...rest,
        ];
      });
    });

    return unsubscribe;
  }, []);

  return <MusicQuickWidget data={data} friends={friends} />;
}
