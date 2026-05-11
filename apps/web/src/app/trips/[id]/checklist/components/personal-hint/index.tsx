"use client";

import { Button } from "@/components/ui/button";

type Props = {
  onDismiss: () => void;
};

export function ChecklistPersonalHintBanner({ onDismiss }: Props) {
  return (
    <div
      className="mb-5 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5 text-[13px] leading-relaxed text-foreground shadow-sm dark:border-primary/28 dark:bg-primary/12"
      role="status"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-muted-foreground">
          <span className="text-foreground">Только вы</span> видите эти отметки
          и пункты. Новое вводите в{" "}
          <span className="text-foreground">панели внизу</span>; иконка с
          ползунками — секция или пункт, число и шт/пар и т.п. Кнопка «Строка» у
          секции открывает то же поле; подсветится рамкой. В одной строке можно
          набрать{" "}
          <span className="tabular-nums text-foreground">Носки — 5 шт</span>{" "}
          (поле числа внизу тогда оставьте пустым). «Шаблон» — заново ваш
          типовой список, не затрагивая других.{" "}
          <span className="text-foreground">Enter</span> в нижнем поле —{" "}
          добавить; <span className="text-foreground">Esc</span> — свернуть
          настройки панели. Порядок строк и секций — перетаскивание за ручку
          слева (при поиске перестановка отключена).
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-me-1 h-8 shrink-0 font-normal text-muted-foreground"
          onClick={onDismiss}
        >
          Понятно
        </Button>
      </div>
    </div>
  );
}
