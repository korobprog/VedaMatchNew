import {
  DONATION_RECIPIENT_IDS,
  toDonationRecipients,
} from './donation-recipients';

describe('toDonationRecipients', () => {
  const resolve = (user: {
    avatarKey: string | null;
    avatarUrl: string | null;
  }) =>
    Promise.resolve(
      user.avatarKey ? `signed:${user.avatarKey}` : user.avatarUrl,
    );

  it('отдаёт получателей в порядке списка, а не базы', async () => {
    const result = await toDonationRecipients(
      ['a', 'b'],
      [
        { id: 'b', avatarKey: null, avatarUrl: 'https://g/b.jpg' },
        { id: 'a', avatarKey: 'avatars/a.webp', avatarUrl: null },
      ],
      resolve,
    );
    expect(result).toEqual([
      { userId: 'a', avatarUrl: 'signed:avatars/a.webp' },
      { userId: 'b', avatarUrl: 'https://g/b.jpg' },
    ]);
  });

  it('кого нет в базе — без фото, но в ответе', async () => {
    const result = await toDonationRecipients(
      ['a', 'x'],
      [{ id: 'a', avatarKey: null, avatarUrl: null }],
      resolve,
    );
    expect(result).toEqual([
      { userId: 'a', avatarUrl: null },
      { userId: 'x', avatarUrl: null },
    ]);
  });

  it('список закрытый: два получателя, Станислав первым', () => {
    expect(DONATION_RECIPIENT_IDS).toEqual([
      '33e14d6e-ebd9-46e9-99b9-fa206816895b',
      '6ef030ab-e528-49a3-b3d2-ce560d9e9683',
    ]);
  });
});
