"use client";

import {
  LV_DIALOG_BACKDROP_MOTION_CLASS,
  LV_DIALOG_POPUP_MOTION_CLASS,
} from "@/lib/lv-motion";
import { cn } from "@/lib/utils";
import { Dialog } from "@base-ui/react/dialog";
import { DetailComments } from "./comments";
import { DetailFooter } from "./footer";
import { DetailHeader } from "./header";
import { DetailMain } from "./main";
import type { AccommodationDetailDialogProps } from "./types";

export type {
  AccommodationDetailDialogProps,
  AccommodationDetailSharedProps,
} from "./types";

export function AccommodationDetailDialog(
  props: AccommodationDetailDialogProps,
) {
  const { open, onOpenChange, option, ...shared } = props;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <div className="fixed inset-0 z-[2140] flex items-center justify-center overflow-y-auto overscroll-y-contain px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Dialog.Backdrop
            className={cn(
              "absolute inset-0 z-0 bg-black/60 backdrop-blur-[1px]",
              LV_DIALOG_BACKDROP_MOTION_CLASS,
            )}
          />
          <Dialog.Popup
            className={cn(
              "relative z-10 my-6 flex max-h-[min(92dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-2rem))] w-[min(100vw-2rem,56rem)] flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl outline-none",
              LV_DIALOG_POPUP_MOTION_CLASS,
            )}
          >
            {option ? (
              <>
                <DetailHeader option={option} />
                <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 pb-5 sm:px-5">
                  <DetailMain option={option} {...shared} />
                  <DetailComments
                    option={option}
                    comments={shared.comments}
                    canCollaborate={shared.canCollaborate}
                    onOpenCommentModal={shared.onOpenCommentModal}
                    onDeleteComment={shared.onDeleteComment}
                  />
                  <DetailFooter
                    option={option}
                    selectedIds={shared.selectedIds}
                    canCollaborate={shared.canCollaborate}
                    onCloseDetail={shared.onCloseDetail}
                    onRevealOnMainMap={shared.onRevealOnMainMap}
                    onToggleCompare={shared.onToggleCompare}
                    onPrint={shared.onPrint}
                    onToggleNoLongerAvailable={shared.onToggleNoLongerAvailable}
                    onVote={shared.onVote}
                    onOpenVoteModal={shared.onOpenVoteModal}
                    onEdit={shared.onEdit}
                  />
                </div>
              </>
            ) : null}
          </Dialog.Popup>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
