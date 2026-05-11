"use client";

import type { ComponentProps } from "react";
import type { PackItemView } from "../../lib/pack-layout";
import { ChecklistDndList, type ChecklistDndActions } from "../dnd-list";
import { ChecklistFilteredList } from "../filtered-list";

type Props = {
  itemCount: number;
  filtering: boolean;
  visibleRowsLength: number;
  items: PackItemView[];
  collapsedSectionIds: Set<string>;
  checklistDndActions: ChecklistDndActions;
  onReorderPeers: (
    parentSectionId: string | null,
    orderedItemIds: string[],
  ) => Promise<void> | void;
  filteredListProps: ComponentProps<typeof ChecklistFilteredList>;
};

export function ChecklistListSwitch({
  itemCount,
  filtering,
  visibleRowsLength,
  items,
  collapsedSectionIds,
  checklistDndActions,
  onReorderPeers,
  filteredListProps,
}: Props) {
  if (itemCount === 0) {
    return (
      <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/50">
        <li className="py-14 text-center text-[13px] text-muted-foreground">
          Введите первый пункт в панели внизу или выберите «Шаблон».
        </li>
      </ul>
    );
  }
  if (filtering && visibleRowsLength === 0) {
    return (
      <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/50">
        <li className="py-14 text-center text-[13px] text-muted-foreground">
          Ничего не нашлось. Очистите поиск или проверьте написание.
        </li>
      </ul>
    );
  }
  if (filtering) {
    return <ChecklistFilteredList {...filteredListProps} />;
  }
  return (
    <ChecklistDndList
      items={items}
      collapsedSectionIds={collapsedSectionIds}
      actions={checklistDndActions}
      onReorderPeers={onReorderPeers}
    />
  );
}
