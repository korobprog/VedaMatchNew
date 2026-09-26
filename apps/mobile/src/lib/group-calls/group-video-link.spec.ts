import {
  formatVideoDiagnostics,
  mergeRemoteTrack,
  pickVideoTransceiver,
  videoStatsDigest,
  type PeerVideoDiagnostics,
} from './group-video-link';

const audio = { kind: 'audio', id: 'a1' };
const video = { kind: 'video', id: 'v1' };

describe('картинка собеседника собирается из дорожки', () => {
  it('видеодорожка без потока доходит до плитки — ровно то, что терялось', () => {
    // `ontrack` видеосекции из `addTransceiver` приходит с пустым
    // `event.streams`; решение смотрит только на саму дорожку.
    expect(mergeRemoteTrack([], video, ['video'])).toEqual([video]);
  });

  it('телефон звук в картинку не берёт — его играет WebRTC сам', () => {
    expect(mergeRemoteTrack([], audio, ['video'])).toBeNull();
  });

  it('сайт собирает и звук, и картинку в один поток', () => {
    const withAudio = mergeRemoteTrack([], audio, ['audio', 'video']);
    expect(withAudio).toEqual([audio]);
    expect(mergeRemoteTrack(withAudio!, video, ['audio', 'video'])).toEqual([audio, video]);
  });

  it('повтор той же дорожки (перезапуск ICE) поток не пересобирает', () => {
    expect(mergeRemoteTrack([video], { ...video }, ['video'])).toBeNull();
  });

  it('новая дорожка того же вида заменяет прежнюю, а не встаёт второй', () => {
    const next = { kind: 'video', id: 'v2' };
    expect(mergeRemoteTrack([audio, video], next, ['audio', 'video'])).toEqual([audio, next]);
  });

  it('событие без дорожки ничего не меняет', () => {
    expect(mergeRemoteTrack([video], null, ['video'])).toBeNull();
    expect(mergeRemoteTrack([video], undefined, ['video'])).toBeNull();
  });
});

describe('видеосекция отвечающего', () => {
  const own = { kind: 'video', mid: null, stopped: false, direction: 'sendrecv' };
  const fromOffer = { kind: 'video', mid: '1', stopped: false, direction: 'recvonly' };
  const mic = { kind: 'audio', mid: '0', stopped: false, direction: 'sendrecv' };

  it('берёт созданную offer`ом и открывает ей отдачу — иначе answer уйдёт recvonly', () => {
    expect(pickVideoTransceiver([mic, fromOffer])).toEqual({
      index: 1,
      setDirection: 'sendrecv',
    });
  });

  it('несогласованный трансивер не берёт, даже если он стоит первым', () => {
    // Так и было до починки: свой `addTransceiver` отвечающего к offer'у не
    // присоединялся, а камера уходила в его отправитель.
    expect(pickVideoTransceiver([mic, own, fromOffer])?.index).toBe(2);
  });

  it('уже открытой на отдачу секции направление не трогает', () => {
    expect(
      pickVideoTransceiver([mic, { ...fromOffer, direction: 'sendrecv' }]),
    ).toEqual({ index: 1, setDirection: null });
  });

  it('остановленный и звуковой не подходят', () => {
    expect(pickVideoTransceiver([mic, { ...fromOffer, stopped: true }])).toBeNull();
    expect(pickVideoTransceiver([mic])).toBeNull();
  });

  it('в offer`е без видеосекции (старый клиент) выбирать нечего', () => {
    expect(pickVideoTransceiver([mic, own])).toBeNull();
  });

  it('вид дорожки может ещё не доехать — такой не берём', () => {
    expect(pickVideoTransceiver([{ ...fromOffer, kind: null }])).toBeNull();
  });
});

describe('сводка видео по статистике', () => {
  it('разводит «кадры уходят» и «кадры приходят» и называет кодек', () => {
    const digest = videoStatsDigest([
      { type: 'codec', id: 'c1', mimeType: 'video/VP8' },
      { type: 'outbound-rtp', kind: 'video', framesEncoded: 120, frameWidth: 640, frameHeight: 480, codecId: 'c1' },
      { type: 'inbound-rtp', kind: 'video', framesDecoded: 90, frameWidth: 320, frameHeight: 240, codecId: 'c1' },
      { type: 'inbound-rtp', kind: 'audio' },
    ]);
    expect(digest).toEqual({
      outbound: { frames: 120, size: '640x480', codec: 'VP8' },
      inbound: { frames: 90, size: '320x240', codec: 'VP8' },
    });
  });

  it('секции нет вовсе — записей видео нет, обе стороны пусты', () => {
    expect(videoStatsDigest([{ type: 'inbound-rtp', kind: 'audio' }])).toEqual({
      outbound: null,
      inbound: null,
    });
  });

  it('старое поле mediaType и кадры без размера', () => {
    expect(
      videoStatsDigest([{ type: 'inbound-rtp', mediaType: 'video', framesReceived: 3 }]),
    ).toEqual({ outbound: null, inbound: { frames: 3, size: null, codec: null } });
  });
});

describe('сводка словами', () => {
  const peer: PeerVideoDiagnostics = {
    initiator: false,
    connectionState: 'connected',
    transceiver: { mid: '1', direction: 'sendrecv', current: 'sendrecv' },
    sendingTrack: true,
    remoteTrack: true,
    stats: {
      outbound: { frames: 10, size: '640x480', codec: 'VP8' },
      inbound: null,
    },
  };

  it('называет собеседников номерами, без имён и id', () => {
    const text = formatVideoDiagnostics([peer, { ...peer, initiator: true, transceiver: null }]);
    expect(text).toContain('Собеседник 1 (offer его), связь connected');
    expect(text).toContain('видеосекция: mid 1, sendrecv / sendrecv');
    expect(text).toContain('отдаём: камера в отправителе; кадров 10, 640x480, VP8');
    expect(text).toContain('принимаем: дорожка пришла; статистики нет');
    expect(text).toContain('Собеседник 2 (offer наш)');
    expect(text).toContain('видеосекция: не согласована');
  });

  it('без соединений говорит об этом прямо', () => {
    expect(formatVideoDiagnostics([])).toBe('Соединений с собеседниками нет.');
  });
});
