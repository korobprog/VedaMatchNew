import type { UserProfile } from '@vedamatch/shared';
import { hasCompleteUnionLocation, unionEntry } from './union-entry';

type Home = UserProfile['homeLocation'];
const home = (patch: Partial<NonNullable<Home>> = {}): Pick<UserProfile, 'homeLocation'> => ({
  homeLocation: { city: 'Казань', country: 'Россия', lat: 55.79, lon: 49.12, ...patch } as NonNullable<Home>,
});

describe('hasCompleteUnionLocation', () => {
  it('город, страна и координаты — место есть', () => {
    expect(hasCompleteUnionLocation(home())).toBe(true);
  });

  it('одного города мало: без страны или координат подбор не работает', () => {
    expect(hasCompleteUnionLocation(home({ country: '  ' }))).toBe(false);
    expect(hasCompleteUnionLocation(home({ lat: Number.NaN }))).toBe(false);
    expect(hasCompleteUnionLocation({ homeLocation: null })).toBe(false);
    expect(hasCompleteUnionLocation(null)).toBe(false);
  });
});

describe('unionEntry', () => {
  it('без места — сначала место, даже если анкета есть', () => {
    expect(unionEntry({ hasLocation: false, hasProfile: true })).toBe('location');
  });

  it('место есть, анкеты нет — анкета', () => {
    expect(unionEntry({ hasLocation: true, hasProfile: false })).toBe('profile');
  });

  it('всё есть — сразу подбор', () => {
    expect(unionEntry({ hasLocation: true, hasProfile: true })).toBe('recommendations');
  });
});
