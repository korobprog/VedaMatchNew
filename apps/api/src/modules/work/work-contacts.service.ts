import { Injectable } from '@nestjs/common';
import { resolveDisplayName, type WorkContactDto } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { PortalAccessService } from '../access/access.service';
import { inviteScope } from './invite-scope';
import { assertWorkAccess } from './work-roles';
import { WorkSpacesService } from './work-spaces.service';

/**
 * Кого можно позвать в рабочую среду.
 *
 * Источник — портальный граф доступа (`PortalAccessService`), а не справочник
 * людей «Общения»: чужие таблицы сервису читать нельзя, а граф — портальная
 * инфраструктура, ради этого и заведённая. Берутся обе стороны: и те, кому
 * человек открылся, и те, кто открылся ему. Одностороннего знакомства
 * достаточно, чтобы позвать в проект — приглашение всё равно нужно принять.
 *
 * Наружу едут только имя и аватар, и только для тех, кого спрашивающий и так
 * видит. Обычный владелец среды перебирать портал не может: «Работа» не место,
 * где ищут незнакомых.
 *
 * Исключение — портальный администратор: он собирает команду и зовёт тех, кто
 * ему лично не открывался. Новых сведений он при этом не получает, список
 * участников ему и так виден в админке, — меняется только место, где искать.
 * И только по осмысленному запросу, см. `invite-scope.ts`.
 */
@Injectable()
export class WorkContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PortalAccessService,
    private readonly spaces: WorkSpacesService,
  ) {}

  /**
   * Сколько человек показываем. Для знакомых это весь список, для поиска
   * администратора по порталу — потолок выдачи: остальное отсекает запрос.
   */
  private static readonly LIMIT = 50;

  async listFor(
    spaceId: string,
    userId: string,
    query?: string,
  ): Promise<WorkContactDto[]> {
    assertWorkAccess(
      await this.spaces.roleOf(spaceId, userId),
      'manageMembers',
    );

    /* Портальный администратор собирает команду и зовёт тех, кто ему лично
       не открывался. Новых сведений он при этом не получает: список участников
       ему и так виден в админке — меняется только место, где искать. */
    const viewer = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    const search = query?.trim() || undefined;
    const scope = inviteScope(viewer?.role === 'admin', search);

    let known: Set<string> | null = null;
    if (scope === 'known') {
      const [granters, grantees] = await Promise.all([
        this.access.grantersFor(userId),
        this.access.granteesOf(userId),
      ]);
      known = new Set([
        ...granters.map((row) => row.granterId),
        ...grantees.map((row) => row.granteeId),
      ]);
      known.delete(userId);
      if (known.size === 0) return [];
    }

    // Уже состоящих в среде не предлагаем: позвать их второй раз нельзя, а
    // строка «уже здесь» в списке приглашения — просто шум.
    const members = await this.prisma.workSpaceMember.findMany({
      where: {
        spaceId,
        ...(known ? { userId: { in: [...known] } } : {}),
      },
      select: { userId: true },
    });
    const memberIds = new Set(members.map((member) => member.userId));
    if (known) {
      for (const id of memberIds) known.delete(id);
      if (known.size === 0) return [];
    }

    // Уже позванных показываем, но помечаем: иначе человек шлёт второе
    // приглашение и не понимает, почему ничего не изменилось.
    const invited = await this.prisma.workInvite.findMany({
      where: {
        spaceId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        ...(known ? { inviteeId: { in: [...known] } } : {}),
      },
      select: { inviteeId: true },
    });
    const invitedIds = new Set(
      invited
        .map((row) => row.inviteeId)
        .filter((id): id is string => Boolean(id)),
    );

    const people = await this.prisma.user.findMany({
      where: {
        /* При поиске по порталу отбор идёт по имени, а состоящих в среде и
           самого спрашивающего вычитаем здесь: списка знакомых, из которого
           их убирали раньше, в этой ветке нет. */
        ...(known
          ? { id: { in: [...known] } }
          : { id: { notIn: [userId, ...memberIds] } }),
        accountStatus: 'active',
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' as const } },
                {
                  spiritualName: {
                    contains: search,
                    mode: 'insensitive' as const,
                  },
                },
              ],
            }
          : {}),
      },
      select: { id: true, name: true, spiritualName: true, avatarUrl: true },
      take: WorkContactsService.LIMIT,
    });

    return people
      .map((person) => ({
        userId: person.id,
        name: resolveDisplayName(person),
        avatarUrl: person.avatarUrl,
        alreadyInvited: invitedIds.has(person.id),
      }))
      .sort((left, right) => left.name.localeCompare(right.name, 'ru'));
  }
}
