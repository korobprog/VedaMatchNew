import { createElement, useEffect, useRef } from 'react';

/**
 * react-native-webrtc для браузера: RTCPeerConnection и mediaDevices — родные.
 * Отличие одно: RN-плеер `RTCView` получает поток строкой `stream.toURL()`,
 * поэтому поток регистрируется в таблице по id и находится обратно.
 */

const streams = new Map<string, MediaStream>();

const proto = globalThis.MediaStream?.prototype as (MediaStream & { toURL?: () => string }) | undefined;
if (proto && !proto.toURL) {
  proto.toURL = function toURL(this: MediaStream) {
    streams.set(this.id, this);
    return this.id;
  };
}

export const RTCPeerConnection = globalThis.RTCPeerConnection;
export const RTCIceCandidate = globalThis.RTCIceCandidate;
export const RTCSessionDescription = globalThis.RTCSessionDescription;
export const MediaStream = globalThis.MediaStream;
export const mediaDevices = globalThis.navigator?.mediaDevices;

interface RTCViewProps {
  streamURL: string;
  objectFit?: 'contain' | 'cover';
  mirror?: boolean;
  zOrder?: number;
  style?: unknown;
}

/**
 * `muted` намеренно не самостоятельный проп: реальный `RTCView` из
 * `react-native-webrtc` (`RTCVideoViewProps` в его типах) его не знает, а
 * компилятор везде в приложении (`tsc --noEmit`, что на вебе, что на
 * Android — `web-shims` подменяет модуль только в бандле Metro, не в
 * разрешении типов) проверяет JSX против ЭТИХ типов, а не против того, что
 * реально выполняется в браузере. Добавить `muted` как обычный проп значило
 * бы либо сломать типы на обеих платформах, либо развести экран звонка на
 * `*.web.tsx`-копию ради одного атрибута. Вместо этого — тот же приём, что
 * был исходно: звук отключаем ровно тогда же, когда включаем зеркало
 * (`mirror`), потому что в этом приложении это один и тот же случай —
 * локальный предпросмотр собственной камеры (`app/call/[id].tsx`): его
 * единственного зеркалят, и только его звук не должен идти в динамик поверх
 * настоящего разговора. Удалённое видео `mirror` не передаёт — значит и
 * `muted` там всегда `false`, звук собеседника слышен.
 */
export function RTCView({ streamURL, objectFit = 'cover', mirror }: RTCViewProps) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = streams.get(streamURL) ?? null;
  }, [streamURL]);
  return createElement('video', {
    ref,
    autoPlay: true,
    playsInline: true,
    muted: Boolean(mirror),
    style: {
      width: '100%',
      height: '100%',
      objectFit,
      transform: mirror ? 'scaleX(-1)' : undefined,
    },
  });
}
