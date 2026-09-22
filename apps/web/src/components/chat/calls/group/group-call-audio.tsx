"use client";

import { useEffect, useRef } from "react";

/**
 * Голоса собеседников. По одному `<audio>` на каждого: в mesh'е потоков
 * столько же, сколько людей в комнате минус один, и смешивать их в один
 * элемент нечем — микшера нет, в этом и смысл выбранной архитектуры.
 *
 * Живёт в провайдере, а не в панели звонка: панель сворачивается, а звук
 * пропадать при этом не должен. Свой микрофон сюда не попадает никогда —
 * воспроизведение собственного потока и есть то эхо, на которое жалуются
 * в первую очередь; для чужих оно снимается `echoCancellation` на захвате.
 */
export function GroupCallAudio({
  streams,
}: {
  streams: Record<string, MediaStream>;
}) {
  const entries = Object.entries(streams);
  if (entries.length === 0) return null;
  return (
    <div hidden>
      {entries.map(([userId, stream]) => (
        <PeerAudio key={userId} stream={stream} />
      ))}
    </div>
  );
}

function PeerAudio({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.srcObject = stream;
    // Автовоспроизведение браузер разрешает после действия человека, а
    // войти в звонок без нажатия нельзя — но если политика всё же не
    // пустила, молчать об этом в консоли не стоит.
    void element.play().catch((error: unknown) => {
      console.warn("[group-calls] голос собеседника не заиграл", error);
    });
    return () => {
      element.srcObject = null;
    };
  }, [stream]);

  return <audio ref={ref} autoPlay playsInline />;
}
