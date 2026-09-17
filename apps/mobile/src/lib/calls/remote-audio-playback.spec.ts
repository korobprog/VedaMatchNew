import { needsSeparateRemoteAudioElement } from './remote-audio-playback';

describe('needsSeparateRemoteAudioElement', () => {
  it('аудиозвонок, разговор идёт, поток есть — нужен', () => {
    expect(needsSeparateRemoteAudioElement('audio', 'active', true)).toBe(true);
  });

  it('видеозвонок — не нужен, звук уже играет вместе с видео в RTCView', () => {
    expect(needsSeparateRemoteAudioElement('video', 'active', true)).toBe(false);
  });

  it('поток ещё не пришёл — нечего проигрывать', () => {
    expect(needsSeparateRemoteAudioElement('audio', 'active', false)).toBe(false);
  });

  it('разговор ещё не начался/уже закончился — не нужен', () => {
    expect(needsSeparateRemoteAudioElement('audio', 'connecting', true)).toBe(false);
    expect(needsSeparateRemoteAudioElement('audio', 'ended', true)).toBe(false);
  });
});
