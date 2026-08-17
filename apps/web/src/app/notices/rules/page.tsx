import Link from "next/link";
import { redirect } from "next/navigation";
import { Header } from "@/components/header";
import { NoticesNav } from "@/components/notices/notices-nav";
import { getProfile } from "@/lib/api";
import { NOTICES_PER_DAY } from "@vedamatch/shared";

export const metadata = {
  title: "Правила доски объявлений",
  robots: { index: false, follow: false },
};

export default async function NoticesRulesPage() {
  const user = await getProfile();
  if (!user) redirect("/login");

  return (
    <div className="relative min-h-screen bg-bg-0">
      <Header user={user} />
      <main className="mx-auto max-w-2xl px-4 py-8 pb-28">
        <h1 className="mb-6 font-display text-2xl font-bold text-text-0">
          Правила доски
        </h1>
        <NoticesNav />

        <div className="glass space-y-5 rounded-2xl border border-glass-brd p-6 text-sm text-text-1">
          <Rule title="Здесь не продают">
            Доска некоммерческая. Как только за вещь или услугу нужны деньги,
            объявление переезжает в{" "}
            <Link href="/market" className="text-text-0 underline">
              Рынок
            </Link>
            . Поля цены здесь нет намеренно.
          </Rule>

          <Rule title="Жильё: сосед — да, аренда — нет">
            «Ищу соседа», «пущу пожить на время фестиваля», «нужен ночлег на
            Гаура-пурниму» — это доска. Сдача внаём и съём за деньги — Рынок,
            даже если сумму не указывать: за арендой стоит сделка, а не
            взаимопомощь. Разделить коммуналку или бензин пополам можно и
            здесь — это не плата, а общий расход.
          </Rule>

          <Rule title="Объявления живут не вечно">
            Обычное — 30 дней, информационное — 60, событие — до своей даты. За
            неделю до конца появится кнопка «Продлить». Продление не поднимает
            объявление в ленте: это не способ быть первым.
          </Rule>

          <Rule title="Место — город, а не адрес">
            На карте объявление встаёт в центр города. Точная точка бывает
            только у общин, храмов и площадок событий. Ваш домашний адрес
            портал не показывает никогда.
          </Rule>

          <Rule title="Одно объявление — один раз">
            Повторная публикация того же текста отклоняется. Не больше{" "}
            {NOTICES_PER_DAY} объявлений в сутки.
          </Rule>

          <Rule title="От имени общины — только её администраторы">
            Писать от лица ятры или храма могут владелец и администраторы
            общины. Отвечает за текст всё равно человек, который его написал.
          </Rule>

          <Rule title="Закрывайте решённое">
            Нашли то, что искали, — нажмите «Вопрос решён». Доска, где половина
            просьб протухла молча, перестаёт работать для всех.
          </Rule>

          <Rule title="Встречайтесь безопасно">
            Договариваясь о встрече с незнакомым человеком, выбирайте людное
            место и предупредите кого-то из близких. Не переводите деньги
            вперёд — на этой доске их вообще быть не должно.
          </Rule>
        </div>
      </main>
    </div>
  );
}

function Rule({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-1 font-medium text-text-0">{title}</h2>
      <p>{children}</p>
    </section>
  );
}
