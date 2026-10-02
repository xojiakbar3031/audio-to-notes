export const LANGUAGES = {
  uz: {
    label: "O'zbekcha",
    name: 'Uzbek',
    headings: ['Qisqacha xulosa', 'Asosiy fikrlar', 'Topshiriqlar / Amaliy qadamlar'],
    noTasks: 'Aniq topshiriq qayd etilmadi',
  },
  ru: {
    label: 'Русский',
    name: 'Russian',
    headings: ['Краткое резюме', 'Основные мысли', 'Задачи / Следующие шаги'],
    noTasks: 'Конкретных задач не зафиксировано',
  },
  en: {
    label: 'English',
    name: 'English',
    headings: ['Summary', 'Key points', 'Action items'],
    noTasks: 'No explicit action items',
  },
} as const;

export type Lang = keyof typeof LANGUAGES;

export function isLang(v: unknown): v is Lang {
  return typeof v === 'string' && v in LANGUAGES;
}
