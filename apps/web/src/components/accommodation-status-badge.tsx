"use client";

import { Ban, Bookmark, CheckCircle2, type LucideIcon } from "lucide-react";

export type AccommodationStatus = "shortlisted" | "rejected" | "booked";

const STATUS_META: Record<
  AccommodationStatus,
  { label: string; Icon: LucideIcon }
> = {
  shortlisted: { label: "В списке кандидатов", Icon: Bookmark },
  rejected: { label: "Отклонён", Icon: Ban },
  booked: { label: "Забронировано", Icon: CheckCircle2 },
};

export function isAccommodationStatus(
  value: string | undefined,
): value is AccommodationStatus {
  return value === "shortlisted" || value === "rejected" || value === "booked";
}

export function accommodationStatusBadgeClass(status: AccommodationStatus) {
  if (status === "shortlisted") {
    return "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }
  if (status === "rejected") {
    return "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-300";
  }
  return "border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-300";
}

export function AccommodationStatusBadge({
  status,
  className = "",
}: {
  status: AccommodationStatus;
  /** Дополнительные классы на обёртку */
  className?: string;
}) {
  const { label, Icon } = STATUS_META[status];
  return (
    <span
      title={label}
      className={[
        "inline-flex size-7 shrink-0 items-center justify-center rounded-full border",
        accommodationStatusBadgeClass(status),
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      role="img"
      aria-label={label}
    >
      <Icon aria-hidden className="size-3.5 shrink-0" strokeWidth={2.25} />
    </span>
  );
}

/** Для строковых статусов с бэкенда / карты (если когда-нибудь придёт другое значение — не рендерим). */
export function AccommodationStatusBadgeFromUnknown(props: {
  status: string | undefined;
  className?: string;
}) {
  if (!isAccommodationStatus(props.status)) return null;
  return (
    <AccommodationStatusBadge
      status={props.status}
      className={props.className}
    />
  );
}
