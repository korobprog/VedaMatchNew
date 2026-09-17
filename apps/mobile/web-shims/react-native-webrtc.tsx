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

export function RTCView({ streamURL, objectFit = 'cover', mirror }: RTCViewProps) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = streams.get(streamURL) ?? null;
  }, [streamURL]);
  return createElement('video', {
    ref,
    autoPlay: true,
    playsInline: true,
    muted: mirror,
    style: {
      width: '100%',
      height: '100%',
      objectFit,
      transform: mirror ? 'scaleX(-1)' : undefined,
    },
  });
}
