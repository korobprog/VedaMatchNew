import { hashPassword, verifyPassword } from './password';

describe('password', () => {
  it('accepts the original password and rejects a wrong one', async () => {
    const stored = await hashPassword('vedamatch');

    await expect(verifyPassword('vedamatch', stored)).resolves.toBe(true);
    await expect(verifyPassword('vedamatch1', stored)).resolves.toBe(false);
  });

  it('salts every hash so equal passwords never collide', async () => {
    const [first, second] = await Promise.all([
      hashPassword('same'),
      hashPassword('same'),
    ]);

    expect(first).not.toBe(second);
  });

  it.each([
    '',
    'plain-text',
    'bcrypt$salt$key',
    'scrypt$salt',
    'scrypt$salt$zz',
  ])(
    'rejects malformed stored value %p instead of throwing',
    async (stored) => {
      await expect(verifyPassword('vedamatch', stored)).resolves.toBe(false);
    },
  );
});
