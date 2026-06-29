"use client";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";

type ReceiptDetailToolbarProps = {
  tripId: string;
  removeBusy: boolean;
  loading: boolean;
  onRemoveReceipt: () => void;
};

export function ReceiptDetailToolbar({
  tripId,
  removeBusy,
  loading,
  onRemoveReceipt,
}: ReceiptDetailToolbarProps) {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-3">
      <Link
        href={`/trips/${tripId}/receipts`}
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "gap-1 text-muted-foreground",
        )}
      >
        <ChevronLeft className="size-4" aria-hidden />К списку чеков
      </Link>
      <div className="ml-auto flex flex-wrap gap-2">
        <Button
          variant="destructive"
          size="sm"
          type="button"
          disabled={removeBusy || loading}
          onClick={() => void onRemoveReceipt()}
        >
          Удалить чек
        </Button>
      </div>
    </div>
  );
}
