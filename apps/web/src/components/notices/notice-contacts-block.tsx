import type { ProfileMessengers, ProfileSocialLinks } from "@vedamatch/shared";

const MESSENGER_LABELS: Record<keyof ProfileMessengers, string> = {
  telegram: "Telegram",
  whatsapp: "WhatsApp",
  mx: "MAX",
  phone: "Телефон",
};

const SOCIAL_LABELS: Partial<Record<keyof ProfileSocialLinks, string>> = {
  telegram: "Telegram",
  vk: "VK",
  instagram: "Instagram",
  website: "Сайт",
};

/**
 * Раскрытые способы связи. Показывается только там, где отклик уже принят —
 * компонент сам ничего не решает, а просто рисует то, что отдал сервер.
 */
export function ContactsBlock({
  contacts,
  label,
}: {
  contacts: {
    socialLinks: ProfileSocialLinks;
    messengers: ProfileMessengers;
  };
  label: string;
}) {
  const rows: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(contacts.messengers)) {
    const title = MESSENGER_LABELS[key as keyof ProfileMessengers];
    if (title && value) rows.push([title, value]);
  }
  for (const [key, value] of Object.entries(contacts.socialLinks)) {
    const title = SOCIAL_LABELS[key as keyof ProfileSocialLinks];
    if (title && value) rows.push([title, value]);
  }

  return (
    <div className="mt-3 rounded-xl border border-emerald-400/30 bg-emerald-400/5 p-3">
      <p className="mb-2 text-xs font-medium text-emerald-300">{label}</p>
      {rows.length === 0 ? (
        // Контакты открыты, но человек их не заполнил — честнее сказать прямо,
        // чем показать пустой блок.
        <p className="text-sm text-text-2">
          Способы связи не указаны в профиле. Напишите здесь, в отклике.
        </p>
      ) : (
        <dl className="space-y-1 text-sm">
          {rows.map(([title, value]) => (
            <div key={title} className="flex gap-2">
              <dt className="text-text-2">{title}</dt>
              <dd className="text-text-0">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
