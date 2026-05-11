import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

type Props = {
  open: boolean;
  imageUrl?: string | null;
  onClose: () => void;
};

export function ReceiptImageModal({ open, imageUrl, onClose }: Props) {
  if (!open || !imageUrl) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Фото чека"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overscroll-y-contain bg-black/85 px-4 pt-[max(1rem,env(safe-area-inset-top)+0.75rem)] pb-[max(1rem,env(safe-area-inset-bottom)+0.75rem)]"
      onClick={onClose}
    >
      <Button
        type="button"
        variant="secondary"
        size="icon"
        className="fixed top-[max(1rem,calc(env(safe-area-inset-top)+1rem))] right-[max(1rem,env(safe-area-inset-right))] z-[1] shadow-md"
        aria-label="Закрыть"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        <X className="size-4" aria-hidden />
      </Button>
      {/* eslint-disable-next-line @next/next/no-img-element -- полноэкранный просмотр чека */}
      <img
        src={imageUrl}
        alt="Чек крупно"
        className="mx-auto mt-14 max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-5rem)] max-w-full object-contain pb-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
