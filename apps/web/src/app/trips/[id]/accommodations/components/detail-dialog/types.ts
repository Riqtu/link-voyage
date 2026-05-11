import type { AccommodationPreviewImage } from "@/lib/trpc";
import type { AccommodationCommentRow, Option } from "../../lib/types";

export type AccommodationDetailSharedProps = {
  galleryIndex: number;
  onGalleryIndexChange: (index: number) => void;
  nights: number;
  peopleCount: number;
  rubPerUsd: number | null;
  tripRequirements: string[];
  comments: AccommodationCommentRow[];
  canCollaborate: boolean;
  selectedIds: string[];
  onToggleCompare: (optionId: string) => void;
  onOpenGallery: (
    images: AccommodationPreviewImage[],
    startIndex: number,
  ) => void;
  onCloseDetail: () => void;
  onRevealOnMainMap: (option: Option) => void;
  onOpenCommentModal: (optionId: string) => void;
  onDeleteComment: (commentId: string) => void;
  onPrint: (option: Option) => void;
  onToggleNoLongerAvailable: (option: Option) => void | Promise<void>;
  onVote: (optionId: string, value: "up" | "down") => void | Promise<void>;
  onOpenVoteModal: (optionId: string) => void;
  onEdit: (option: Option) => void;
};

export type AccommodationDetailDialogProps = AccommodationDetailSharedProps & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  option: Option | null;
};
