import { localPreviewView, shouldSendVideo, stageView } from './video-track-state';

const sending = {
  kind: 'video' as const,
  phase: 'active' as const,
  cameraOff: false,
  appState: 'active' as const,
  pipActive: false,
};

describe('shouldSendVideo', () => {
  it('идёт видеоразговор при включённой камере — картинку отправляем', () => {
    expect(shouldSendVideo(sending)).toBe(true);
    expect(shouldSendVideo({ ...sending, phase: 'connecting' })).toBe(true);
  });

  it('аудиозвонок картинку не отправляет никогда', () => {
    expect(shouldSendVideo({ ...sending, kind: 'audio' })).toBe(false);
    expect(shouldSendVideo({ ...sending, kind: 'audio', cameraOff: false })).toBe(false);
  });

  it('до соединения и после конца — не отправляем', () => {
    for (const phase of ['idle', 'outgoing', 'incoming', 'ended'] as const)
      expect(shouldSendVideo({ ...sending, phase })).toBe(false);
  });

  it('кнопка «камера» выключает отправку', () => {
    expect(shouldSendVideo({ ...sending, cameraOff: true })).toBe(false);
  });

  it('свернули приложение — камеру гасим, чтобы не жечь батарею', () => {
    expect(shouldSendVideo({ ...sending, appState: 'background' })).toBe(false);
  });

  it('но в «картинке в картинке» разговор продолжается с камерой', () => {
    expect(shouldSendVideo({ ...sending, appState: 'background', pipActive: true })).toBe(true);
  });

  it('переходное `inactive` (шторка, переключатель приложений) камеру не гасит', () => {
    expect(shouldSendVideo({ ...sending, appState: 'inactive' })).toBe(true);
  });

  it('выключенная кнопкой камера остаётся выключенной и в PiP', () => {
    expect(
      shouldSendVideo({ ...sending, cameraOff: true, appState: 'background', pipActive: true }),
    ).toBe(false);
  });
});

const stage = {
  kind: 'video' as const,
  phase: 'active' as const,
  hasRemoteStream: true,
  remoteVideoOn: true,
};

describe('stageView', () => {
  it('разговор идёт, поток есть, камера собеседника включена — его видео', () => {
    expect(stageView(stage)).toBe('remote-video');
  });

  it('собеседник выключил камеру — карточка с аватаром, а не чёрный экран', () => {
    expect(stageView({ ...stage, remoteVideoOn: false })).toBe('companion');
  });

  it('потока ещё нет — карточка', () => {
    expect(stageView({ ...stage, hasRemoteStream: false })).toBe('companion');
  });

  it('аудиозвонок — всегда карточка', () => {
    expect(stageView({ ...stage, kind: 'audio' })).toBe('companion');
  });

  it('пока дозваниваемся и после конца — карточка', () => {
    for (const phase of ['outgoing', 'incoming', 'connecting', 'ended'] as const)
      expect(stageView({ ...stage, phase })).toBe('companion');
  });
});

const preview = {
  kind: 'video' as const,
  phase: 'active' as const,
  hasLocalStream: true,
  sendingVideo: true,
  pipActive: false,
};

describe('localPreviewView', () => {
  it('своя камера работает — показываем своё видео', () => {
    expect(localPreviewView(preview)).toBe('video');
    expect(localPreviewView({ ...preview, phase: 'outgoing' })).toBe('video');
  });

  it('своя камера выключена — заглушка, а не прозрачное окно поверх чужого видео', () => {
    expect(localPreviewView({ ...preview, sendingVideo: false })).toBe('placeholder');
  });

  it('аудиозвонок, конец разговора, отсутствие потока и PiP — окна нет вовсе', () => {
    expect(localPreviewView({ ...preview, kind: 'audio' })).toBe('none');
    expect(localPreviewView({ ...preview, phase: 'ended' })).toBe('none');
    expect(localPreviewView({ ...preview, phase: 'idle' })).toBe('none');
    expect(localPreviewView({ ...preview, hasLocalStream: false })).toBe('none');
    expect(localPreviewView({ ...preview, pipActive: true })).toBe('none');
  });
});
