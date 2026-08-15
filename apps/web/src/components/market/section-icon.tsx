import {
  BookOpen,
  Briefcase,
  Flame,
  GraduationCap,
  Hammer,
  HeartPulse,
  Home,
  Package,
  Shirt,
  Utensils,
} from "lucide-react";

/** `iconKey` в БД — имя иконки lucide. Карта нужна потому, что динамический
 *  импорт по имени утащил бы в бандл всю библиотеку. */
const ICONS = {
  "book-open": BookOpen,
  flame: Flame,
  shirt: Shirt,
  utensils: Utensils,
  "heart-pulse": HeartPulse,
  hammer: Hammer,
  briefcase: Briefcase,
  "graduation-cap": GraduationCap,
  home: Home,
  package: Package,
} as const;

export function SectionIcon({
  iconKey,
  className = "h-5 w-5",
}: {
  iconKey: string | null;
  className?: string;
}) {
  // Неизвестный ключ — не повод рисовать дыру: коробка подходит любому разделу.
  const Icon = (iconKey && ICONS[iconKey as keyof typeof ICONS]) || Package;
  return <Icon aria-hidden className={className} />;
}
