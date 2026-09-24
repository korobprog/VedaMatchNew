import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import type { MediaPlayerApi } from '@/lib/media/media-player-context';
import type { MediaTrack } from '@/lib/media/media-parse';
import { INITIAL_PLAYER_STATE, type PlayerState } from '@/lib/media/player-state';

/**
 * Помощники тестов экранов Медиатеки (VED-331). Только для `*.spec.tsx`.
 */

export function screenText(renderer: ReactTestRenderer): string {
  const found: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node === 'string') found.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object' && 'children' in node) walk((node as { children: unknown }).children);
  };
  walk(renderer.toJSON());
  return found.join(' ');
}

/** Нажимаемое по подписи для скринридера. Ровно одно — иначе тест неточен. */
export function byLabel(renderer: ReactTestRenderer, label: string | RegExp): ReactTestInstance {
  const matches = renderer.root.findAll(
    (node) =>
      typeof node.props?.onPress === 'function' &&
      typeof node.props?.accessibilityLabel === 'string' &&
      (typeof label === 'string' ? node.props.accessibilityLabel === label : label.test(node.props.accessibilityLabel)) &&
      typeof node.type !== 'string',
  );
  const outer = matches.filter((node) => !matches.some((other) => other !== node && isAncestor(other, node)));
  if (outer.length !== 1) throw new Error(`«${String(label)}»: найдено ${outer.length}`);
  return outer[0];
}

function isAncestor(candidate: ReactTestInstance, node: ReactTestInstance): boolean {
  let parent = node.parent;
  while (parent) {
    if (parent === candidate) return true;
    parent = parent.parent;
  }
  return false;
}

export function mediaTrack(id: string, over: Partial<MediaTrack> = {}): MediaTrack {
  return { id, title: `Запись ${id}`, artist: `Исполнитель ${id}`, album: null, coverUrl: null, durationSeconds: 240, ...over };
}

export function fakePlayer(state: Partial<PlayerState> = {}, over: Partial<MediaPlayerApi> = {}): MediaPlayerApi {
  return {
    state: { ...INITIAL_PLAYER_STATE, ...state },
    callBusy: false,
    playQueue: jest.fn(async () => undefined),
    toggle: jest.fn(async () => undefined),
    play: jest.fn(async () => undefined),
    pause: jest.fn(),
    seekTo: jest.fn(),
    skip: jest.fn(),
    next: jest.fn(async () => undefined),
    previous: jest.fn(async () => undefined),
    stop: jest.fn(),
    ...over,
  };
}
