"use client";

import { Button } from "@/components/ui/button";
import { Loader2, RotateCcw } from "lucide-react";

type Props = {
  tripTitle: string | null;
  hintResolved: boolean;
  personalHintVisible: boolean;
  isLoading: boolean;
  resettingPreset: boolean;
  onResetFromPreset: () => void;
};

export function ChecklistPageHeader({
  tripTitle,
  hintResolved,
  personalHintVisible,
  isLoading,
  resettingPreset,
  onResetFromPreset,
}: Props) {
  return (
    <div className="mb-8 flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            Чеклист
          </h1>
          {tripTitle ? (
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              {tripTitle}
            </p>
          ) : null}
        </div>
        {hintResolved ? (
          personalHintVisible ? null : (
            <p className="max-w-md text-[13px] leading-relaxed text-muted-foreground">
              Личный список: видите и меняете только вы.
            </p>
          )
        ) : (
          <p className="max-w-md text-[13px] leading-relaxed text-muted-foreground">
            Личный список: видите и меняете только вы.
          </p>
        )}
      </div>
      <div className="flex shrink-0 gap-2 self-start sm:self-end">
        {!isLoading ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 font-normal shadow-none"
            disabled={resettingPreset}
            title="Заменить список на типовой шаблон с нуля"
            onClick={() => void onResetFromPreset()}
          >
            {resettingPreset ? (
              <Loader2 className="size-3.5 shrink-0 animate-spin" />
            ) : (
              <RotateCcw className="size-3.5 shrink-0" />
            )}
            Шаблон
          </Button>
        ) : null}
      </div>
    </div>
  );
}
