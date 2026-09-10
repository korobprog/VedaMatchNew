import Link from "next/link";
import { WellnessNav } from "@/components/wellness/wellness-nav";

export const metadata = {
  title: "Здоровье — состав продуктов без разглядывания мелкого шрифта",
  description:
    "Сканер состава: за секунду видно, есть ли в продукте мясо, желатин, лук или чеснок.",
  robots: { index: false, follow: false },
};

/** Разделы сервиса. Все живые: заделов больше не осталось. */
const SECTIONS = [
  {
    href: "/wellness/scan",
    title: "Проверить продукт",
    text: "Штрихкод камерой, снимок состава или цифры руками.",
    ready: true,
  },
  {
    href: "/wellness/diet",
    title: "Мои ограничения",
    text: "Что вы не едите. Без этого сканер показывает состав, но не судит.",
    ready: true,
  },
  {
    href: "/wellness/history",
    title: "История",
    text: "Что вы уже проверяли и что мы тогда ответили.",
    ready: true,
  },
  {
    href: "/wellness/basket",
    title: "Корзина",
    text: "Отобранное к покупке и что из этого вам подходит.",
    ready: true,
  },
  {
    href: "/wellness/recipes",
    title: "Рецепты",
    text: "Вайшнавская кухня и подбор блюд из того, что уже в корзине.",
    ready: true,
  },
];

export default function WellnessPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8 pb-28">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-text-0 sm:text-3xl">
          Здоровье
        </h1>
        <p className="mt-1 text-sm text-text-1">
          Стоять у полки и разбирать мелкий шрифт не нужно. Наведите камеру на
          штрихкод или снимите состав — и увидите, есть ли там то, чего вы не
          едите.
        </p>
      </div>

      <WellnessNav />

      <ul className="grid gap-3 sm:grid-cols-2">
        {SECTIONS.map((section) => (
          <li key={section.title}>
            {section.ready ? (
              <Link
                href={section.href}
                className="block h-full rounded-2xl border border-glass-brd bg-glass p-4"
              >
                <span className="block font-display text-lg font-bold text-text-0">
                  {section.title}
                </span>
                <span className="mt-1 block text-sm text-text-1">
                  {section.text}
                </span>
              </Link>
            ) : (
              <div className="h-full rounded-2xl border border-dashed border-glass-brd p-4">
                <span className="block font-display text-lg font-bold text-text-1">
                  {section.title}
                </span>
                <span className="mt-1 block text-sm text-text-2">
                  {section.text}
                </span>
              </div>
            )}
          </li>
        ))}
      </ul>

      <p className="mt-8 rounded-xl border border-glass-brd px-4 py-3 text-xs text-text-2">
        Сервис помогает прочитать состав и сверить его с вашими ограничениями.
        Это не медицинская рекомендация и не замена совету врача. Состав на
        упаковке производитель меняет без предупреждения — если ответ важен,
        сверьтесь с этикеткой.
      </p>
    </main>
  );
}
