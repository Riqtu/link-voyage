"use client";

import { Button } from "@/components/ui/button";

type Props = {
  canCollaborate: boolean;
  onAddVariant: () => void;
};

export function ManageVariantsSection({ canCollaborate, onAddVariant }: Props) {
  return (
    <section className="mb-6 rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">Управление вариантами</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {canCollaborate
              ? "Добавляйте и редактируйте карточки жилья в отдельном окне."
              : "Добавлять и редактировать могут только участники поездки (в аккаунте)."}
          </p>
        </div>
        {canCollaborate ? (
          <Button type="button" onClick={onAddVariant}>
            Добавить вариант
          </Button>
        ) : null}
      </div>
    </section>
  );
}
