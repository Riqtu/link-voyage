"use client";

import { getApiClient } from "@/lib/api-client";
import type { AccommodationPreviewImage } from "@/lib/trpc";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccommodationCommentModal } from "./components/comment-modal";
import { AccommodationCompareTableSection } from "./components/compare-table-section";
import { AccommodationDetailDialog } from "./components/detail-dialog";
import { AccommodationsErrorBanner } from "./components/error-banner";
import { AccommodationFormModal } from "./components/form-modal";
import { AccommodationGalleryOverlay } from "./components/gallery-overlay";
import { ManageVariantsSection } from "./components/manage-variants-section";
import { AccommodationsMapSection } from "./components/map-section";
import { AccommodationsOptionsListSection } from "./components/options-list/options-list-section";
import { AccommodationsPageIntro } from "./components/page-intro";
import { AccommodationVoteModal } from "./components/vote-modal";
import { useAccommodationForm } from "./hooks/use-accommodation-form";
import { useAccommodationsPageData } from "./hooks/use-page-data";
import {
  computeVoteBalanceExtremes,
  sortOptionsBookedFirst,
} from "./lib/list-derivations";
import { tripNightsFromIsoRange } from "./lib/page-helpers";
import { groupPreviewImagesByZone } from "./lib/preview-helpers";
import {
  buildAccommodationPrintHtml,
  printAccommodationHtml,
} from "./lib/print";
import type { Option } from "./lib/types";

export default function AccommodationsPage() {
  const { id } = useParams<{ id: string }>();
  const [error, setError] = useState<string | null>(null);
  const {
    options,
    isLoading,
    peopleCount,
    tripStartDate,
    tripEndDate,
    tripRequirements,
    rubPerUsd,
    cbrUsdRubQuoteDate,
    commentsByOption,
    canCollaborate,
    loadOptions,
    reloadAccommodationComments,
  } = useAccommodationsPageData({ tripId: id, setError });

  const nights = useMemo(
    () => tripNightsFromIsoRange(tripStartDate, tripEndDate),
    [tripStartDate, tripEndDate],
  );

  const form = useAccommodationForm({
    tripId: id,
    options,
    nights,
    peopleCount,
    rubPerUsd,
    canCollaborate,
    setError,
    loadOptions,
  });

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [galleryImages, setGalleryImages] = useState<
    AccommodationPreviewImage[]
  >([]);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [commentModalOptionId, setCommentModalOptionId] = useState<
    string | null
  >(null);
  const [voteModalOptionId, setVoteModalOptionId] = useState<string | null>(
    null,
  );
  const [detailOptionId, setDetailOptionId] = useState<string | null>(null);
  const [detailGalleryIndex, setDetailGalleryIndex] = useState(0);
  const [commentModalDraft, setCommentModalDraft] = useState("");
  const [commentModalBusy, setCommentModalBusy] = useState(false);
  const mapSectionRef = useRef<HTMLElement | null>(null);
  const mapFocusNonceRef = useRef(0);
  const [mapFocusRequest, setMapFocusRequest] = useState<{
    id: string;
    nonce: number;
  } | null>(null);
  const [highlightedCardId, setHighlightedCardId] = useState<string | null>(
    null,
  );
  /** Чтобы текст не зависел от localStorage до гидратации и не ломал SSR */
  const [viewerHintReady, setViewerHintReady] = useState(false);

  useEffect(() => {
    setViewerHintReady(true);
  }, []);

  const clearMapFocusRequest = useCallback(() => {
    setMapFocusRequest(null);
  }, []);

  const revealAccommodationOnMap = useCallback((item: Option) => {
    if (!item.coordinates) {
      setError("У этого варианта нет координат для карты.");
      return;
    }
    setError(null);
    mapFocusNonceRef.current += 1;
    setMapFocusRequest({ id: item.id, nonce: mapFocusNonceRef.current });
    requestAnimationFrame(() => {
      mapSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, []);

  function openGallery(images: AccommodationPreviewImage[], startIndex = 0) {
    if (images.length === 0) return;
    setGalleryImages(images);
    const safeIndex = Math.min(Math.max(startIndex, 0), images.length - 1);
    setGalleryIndex(safeIndex);
  }

  function closeGallery() {
    setGalleryImages([]);
    setGalleryIndex(0);
  }

  const gallerySections = useMemo(
    () => groupPreviewImagesByZone(galleryImages),
    [galleryImages],
  );

  useEffect(() => {
    if (galleryImages.length === 0) return;
    const len = galleryImages.length;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setGalleryImages([]);
        setGalleryIndex(0);
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setGalleryIndex((idx) => Math.max(0, idx - 1));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setGalleryIndex((idx) => Math.min(len - 1, idx + 1));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [galleryImages]);

  function openVoteModal(optionId: string) {
    setVoteModalOptionId(optionId);
  }

  function closeVoteModal() {
    setVoteModalOptionId(null);
  }

  useEffect(() => {
    if (!highlightedCardId) return;
    const t = window.setTimeout(() => setHighlightedCardId(null), 3200);
    return () => window.clearTimeout(t);
  }, [highlightedCardId]);

  useEffect(() => {
    if (!error) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setError(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [error]);

  const scrollToAccommodationCard = useCallback((optionId: string) => {
    const el = document.getElementById(`lv-accommodation-card-${optionId}`);
    if (!(el instanceof HTMLElement)) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    requestAnimationFrame(() => {
      setHighlightedCardId(optionId);
    });
  }, []);

  async function onDelete(optionId: string) {
    const confirmed = window.confirm("Удалить карточку жилья?");
    if (!confirmed) return;
    try {
      const api = getApiClient();
      await api.accommodation.delete.mutate({ optionId });
      if (form.editingId === optionId) {
        form.resetForm();
      }
      setSelectedIds((prev) => prev.filter((idItem) => idItem !== optionId));
      await loadOptions();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Не удалось удалить карточку",
      );
    }
  }

  function openCommentModal(optionId: string) {
    if (!canCollaborate) return;
    setCommentModalOptionId(optionId);
    setCommentModalDraft("");
    setError(null);
  }

  function closeCommentModal() {
    setCommentModalOptionId(null);
    setCommentModalDraft("");
  }

  async function submitCommentFromModal() {
    if (!canCollaborate) return;
    const optionId = commentModalOptionId;
    if (!optionId) return;
    const body = commentModalDraft.trim();
    if (!body) {
      setError("Введите текст комментария");
      return;
    }
    setCommentModalBusy(true);
    setError(null);
    try {
      const api = getApiClient();
      await api.accommodation.addAccommodationComment.mutate({
        optionId,
        body,
      });
      await reloadAccommodationComments();
      closeCommentModal();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Не удалось отправить комментарий",
      );
    } finally {
      setCommentModalBusy(false);
    }
  }

  async function handleDeleteAccommodationComment(commentId: string) {
    const confirmed = window.confirm("Удалить этот комментарий?");
    if (!confirmed) return;
    setError(null);
    try {
      const api = getApiClient();
      await api.accommodation.deleteAccommodationComment.mutate({ commentId });
      await reloadAccommodationComments();
    } catch (delError) {
      setError(
        delError instanceof Error
          ? delError.message
          : "Не удалось удалить комментарий",
      );
    }
  }

  async function onVote(optionId: string, value: "up" | "down") {
    const api = getApiClient();
    await api.accommodation.vote.mutate({ optionId, value });
    await loadOptions();
  }

  async function onStatus(
    optionId: string,
    status: "shortlisted" | "rejected" | "booked",
  ) {
    const api = getApiClient();
    await api.accommodation.updateStatus.mutate({ optionId, status });
    await loadOptions();
  }

  async function toggleBooked(item: Option) {
    const nextStatus = item.status === "booked" ? "shortlisted" : "booked";
    await onStatus(item.id, nextStatus);
  }

  async function toggleNoLongerAvailable(item: Option) {
    const api = getApiClient();
    await api.accommodation.setNoLongerAvailable.mutate({
      optionId: item.id,
      noLongerAvailable: !item.noLongerAvailable,
    });
    await loadOptions();
  }

  const compareOptions = useMemo(
    () => options.filter((item) => selectedIds.includes(item.id)),
    [options, selectedIds],
  );

  const optionsForList = useMemo(
    () => sortOptionsBookedFirst(options),
    [options],
  );

  const voteExtremes = useMemo(
    () => computeVoteBalanceExtremes(options),
    [options],
  );

  function toggleCompare(optionId: string) {
    setSelectedIds((prev) =>
      prev.includes(optionId)
        ? prev.filter((idItem) => idItem !== optionId)
        : prev.length >= 5
          ? prev
          : [...prev, optionId],
    );
  }

  const detailOption = useMemo(
    () => options.find((o) => o.id === detailOptionId) ?? null,
    [options, detailOptionId],
  );

  function openAccommodationDetail(item: Option) {
    setDetailGalleryIndex(0);
    setDetailOptionId(item.id);
  }

  function closeAccommodationDetail() {
    setDetailOptionId(null);
  }

  function printAccommodationDetail(item: Option) {
    const html = buildAccommodationPrintHtml({
      item,
      nights,
      peopleCount,
      rubPerUsd,
      comments: commentsByOption[item.id] ?? [],
    });
    printAccommodationHtml(html, (msg) => setError(msg));
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-6 py-10">
      <AccommodationsPageIntro
        peopleCount={peopleCount}
        nights={nights}
        canCollaborate={canCollaborate}
        viewerHintReady={viewerHintReady}
        rubPerUsd={rubPerUsd}
        cbrUsdRubQuoteDate={cbrUsdRubQuoteDate}
      />
      <ManageVariantsSection
        canCollaborate={canCollaborate}
        onAddVariant={form.openNewVariant}
      />
      <AccommodationsMapSection
        ref={mapSectionRef}
        mapCenter={form.mapCenter}
        rubPerUsd={rubPerUsd}
        focusRequest={mapFocusRequest}
        onFocusRequestHandled={clearMapFocusRequest}
        onJumpToList={scrollToAccommodationCard}
        options={options}
      />
      <AccommodationsErrorBanner
        message={error}
        onDismiss={() => setError(null)}
      />
      <AccommodationsOptionsListSection
        isLoading={isLoading}
        optionsForList={optionsForList}
        voteExtremes={voteExtremes}
        highlightedCardId={highlightedCardId}
        nights={nights}
        peopleCount={peopleCount}
        rubPerUsd={rubPerUsd}
        tripRequirements={tripRequirements}
        commentsByOption={commentsByOption}
        canCollaborate={canCollaborate}
        selectedIds={selectedIds}
        openGallery={openGallery}
        openAccommodationDetail={openAccommodationDetail}
        openVoteModal={openVoteModal}
        revealAccommodationOnMap={revealAccommodationOnMap}
        toggleCompare={toggleCompare}
        onVote={onVote}
        toggleBooked={toggleBooked}
        toggleNoLongerAvailable={toggleNoLongerAvailable}
        onStartEditing={form.startEditing}
        onDelete={onDelete}
        openCommentModal={openCommentModal}
      />

      <AccommodationDetailDialog
        open={detailOptionId !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) closeAccommodationDetail();
        }}
        option={detailOption}
        galleryIndex={detailGalleryIndex}
        onGalleryIndexChange={setDetailGalleryIndex}
        nights={nights}
        peopleCount={peopleCount}
        rubPerUsd={rubPerUsd}
        tripRequirements={tripRequirements}
        comments={detailOption ? (commentsByOption[detailOption.id] ?? []) : []}
        canCollaborate={canCollaborate}
        selectedIds={selectedIds}
        onToggleCompare={toggleCompare}
        onOpenGallery={openGallery}
        onCloseDetail={closeAccommodationDetail}
        onRevealOnMainMap={revealAccommodationOnMap}
        onOpenCommentModal={openCommentModal}
        onDeleteComment={(commentId) =>
          void handleDeleteAccommodationComment(commentId)
        }
        onPrint={printAccommodationDetail}
        onToggleNoLongerAvailable={(opt) => void toggleNoLongerAvailable(opt)}
        onVote={(optionId, value) => void onVote(optionId, value)}
        onOpenVoteModal={openVoteModal}
        onEdit={form.startEditing}
      />

      <AccommodationCompareTableSection
        compareOptions={compareOptions}
        nights={nights}
        peopleCount={peopleCount}
        rubPerUsd={rubPerUsd}
      />

      <AccommodationGalleryOverlay
        images={galleryImages}
        index={galleryIndex}
        sections={gallerySections}
        onClose={closeGallery}
        onIndexChange={setGalleryIndex}
      />

      <AccommodationVoteModal
        open={voteModalOptionId !== null}
        option={options.find((o) => o.id === voteModalOptionId)}
        onClose={closeVoteModal}
      />

      {canCollaborate ? (
        <AccommodationCommentModal
          open={commentModalOptionId !== null}
          optionTitle={
            options.find((o) => o.id === commentModalOptionId)?.title ??
            "Вариант жилья"
          }
          draft={commentModalDraft}
          onDraftChange={setCommentModalDraft}
          busy={commentModalBusy}
          onClose={closeCommentModal}
          onSubmit={submitCommentFromModal}
        />
      ) : null}

      <AccommodationFormModal
        open={form.isModalOpen && canCollaborate}
        {...form.modalProps}
      />
    </main>
  );
}
