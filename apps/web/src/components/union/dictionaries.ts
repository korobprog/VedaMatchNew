export interface UnionTagOption {
  value: string;
  label: string;
  category?: string;
}

export interface UnionSkillCategory {
  title: string;
  options: UnionTagOption[];
}

const tag = (label: string, category?: string): UnionTagOption => ({
  value: label,
  label,
  category,
});

export const unionLanguageOptions: UnionTagOption[] = [
  tag("русский"),
  tag("английский"),
  tag("украинский"),
  tag("испанский"),
  tag("немецкий"),
  tag("французский"),
  tag("хинди"),
  tag("бенгали"),
  tag("санскрит"),
  tag("другое"),
];

export const unionSkillCategories: UnionSkillCategory[] = [
  {
    title: "IT / цифровые",
    options: [
      tag("программирование", "IT / цифровые"),
      tag("дизайн", "IT / цифровые"),
      tag("маркетинг", "IT / цифровые"),
      tag("SMM", "IT / цифровые"),
      tag("видео / монтаж", "IT / цифровые"),
      tag("копирайтинг", "IT / цифровые"),
      tag("управление проектами", "IT / цифровые"),
    ],
  },
  {
    title: "Образование",
    options: [
      tag("преподавание", "Образование"),
      tag("наставничество", "Образование"),
      tag("организация курсов", "Образование"),
      tag("переводы", "Образование"),
    ],
  },
  {
    title: "Служение / проекты",
    options: [
      tag("организация мероприятий", "Служение / проекты"),
      tag("волонтёрство", "Служение / проекты"),
      tag("кухня / прасад", "Служение / проекты"),
      tag("музыка / киртан", "Служение / проекты"),
      tag("администрирование", "Служение / проекты"),
      tag("фандрайзинг", "Служение / проекты"),
    ],
  },
  {
    title: "Быт / ремесло",
    options: [
      tag("строительство", "Быт / ремесло"),
      tag("ремонт", "Быт / ремесло"),
      tag("кулинария", "Быт / ремесло"),
      tag("сад / ферма", "Быт / ремесло"),
      tag("медицина / здоровье", "Быт / ремесло"),
    ],
  },
];

export const unionSkillOptions: UnionTagOption[] = unionSkillCategories.flatMap(
  (category) => category.options,
);

export const unionInterestOptions: UnionTagOption[] = [
  tag("философия"),
  tag("йога"),
  tag("медитация"),
  tag("киртан"),
  tag("ведическая культура"),
  tag("здоровый образ жизни"),
  tag("путешествия"),
  tag("семья"),
  tag("служение"),
  tag("бизнес"),
  tag("образование"),
  tag("психология"),
  tag("аюрведа"),
  tag("экология"),
  tag("творчество"),
  tag("музыка"),
  tag("чтение"),
  tag("паломничества"),
  tag("ретриты"),
];

export const unionValueOptions: UnionTagOption[] = [
  tag("духовное развитие"),
  tag("честность"),
  tag("служение"),
  tag("семья"),
  tag("верность"),
  tag("простота"),
  tag("ответственность"),
  tag("доброта"),
  tag("чистота"),
  tag("уважение"),
  tag("совместная практика"),
  tag("община"),
  tag("осознанность"),
  tag("забота о людях"),
  tag("развитие проектов"),
];

export const unionFamilyStatusOptions = [
  { value: "", label: "не указан" },
  { value: "свободен / свободна", label: "свободен / свободна" },
  { value: "в отношениях", label: "в отношениях" },
  { value: "женат / замужем", label: "женат / замужем" },
  { value: "разведен / разведена", label: "разведен / разведена" },
  { value: "вдовец / вдова", label: "вдовец / вдова" },
  { value: "монах / монахиня", label: "монах / монахиня" },
  {
    value: "предпочитаю не указывать",
    label: "предпочитаю не указывать",
  },
];
