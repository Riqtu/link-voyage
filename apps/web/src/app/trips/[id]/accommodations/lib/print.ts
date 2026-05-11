import {
  escapePrintHtml,
  formatAmount,
  formatRubAmount,
  isUsdCurrency,
} from "./page-helpers";
import {
  calcAccommodationPerPerson,
  calcAccommodationTotalPrice,
} from "./price-calculations";
import { getPricingModeLabel } from "./pricing-display";
import type { AccommodationCommentRow, Option } from "./types";

export type AccommodationPrintPayload = {
  item: Option;
  nights: number;
  peopleCount: number;
  rubPerUsd: number | null;
  comments: AccommodationCommentRow[];
};

export function buildAccommodationPrintHtml(
  payload: AccommodationPrintPayload,
): string {
  const { item, nights, peopleCount, rubPerUsd, comments } = payload;
  const total = calcAccommodationTotalPrice(item, nights, peopleCount);
  const perPerson = calcAccommodationPerPerson(item, nights, peopleCount);

  const statusLabel =
    item.status === "booked"
      ? "Забронировано"
      : item.status === "rejected"
        ? "Отклонено"
        : "В шорт-листе";

  const maxPrintComments = 2;
  const hiddenCommentsCount = Math.max(0, comments.length - maxPrintComments);
  const commentsHtml =
    comments.length > 0
      ? comments
          .slice(0, maxPrintComments)
          .map(
            (c) =>
              `<li class="comment"><strong>${escapePrintHtml(
                c.authorName,
              )}</strong>: ${escapePrintHtml(c.body)}</li>`,
          )
          .join("") +
        (hiddenCommentsCount > 0
          ? `<li class="comment muted">И еще ${hiddenCommentsCount} комментариев в приложении</li>`
          : "")
      : '<li class="comment">Комментариев нет</li>';

  const maxPrintAmenities = 8;
  const hiddenAmenitiesCount = Math.max(
    0,
    item.amenities.length - maxPrintAmenities,
  );
  const amenitiesHtml =
    item.amenities.length > 0
      ? item.amenities
          .slice(0, maxPrintAmenities)
          .map(
            (amenity) =>
              `<span class="chip">${escapePrintHtml(amenity)}</span>`,
          )
          .join("") +
        (hiddenAmenitiesCount > 0
          ? `<span class="chip muted">+${hiddenAmenitiesCount} еще</span>`
          : "")
      : '<span class="muted">Не указано</span>';

  const rubBlock =
    rubPerUsd !== null &&
    isUsdCurrency(item.currency) &&
    total !== null &&
    perPerson !== null
      ? `<div class="price-table">
            <div class="price-row"><span>На человека (${peopleCount})</span><strong>${escapePrintHtml(formatAmount(perPerson, item.currency))}</strong></div>
            <div class="price-row"><span>Итого (RUB)</span><strong>${escapePrintHtml(formatRubAmount(total * rubPerUsd))}</strong></div>
            <div class="price-row"><span>На человека (RUB)</span><strong>${escapePrintHtml(formatRubAmount(perPerson * rubPerUsd))}</strong></div>
          </div>`
      : "";

  const basicPriceBlock =
    total !== null && perPerson !== null
      ? `<div class="price-table">
            <div class="price-row"><span>Итого</span><strong>${escapePrintHtml(formatAmount(total, item.currency))}</strong></div>
            <div class="price-row"><span>На человека (${peopleCount})</span><strong>${escapePrintHtml(formatAmount(perPerson, item.currency))}</strong></div>
          </div>`
      : "";

  const useCompactPrintLayout =
    (item.previewDescription?.length ?? 0) > 520 ||
    (item.notes?.length ?? 0) > 360 ||
    comments.length > 5;

  const galleryThumbsHtml =
    item.previewImages.length > 1
      ? `<div class="thumbs-right">
            ${item.previewImages
              .slice(1, 5)
              .map(
                (img) =>
                  `<img class="thumb" src="${escapePrintHtml(img.url)}" alt="" />`,
              )
              .join("")}
          </div>`
      : "";

  const googleMapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  const mapImageUrl = item.coordinates
    ? googleMapsApiKey
      ? `https://maps.googleapis.com/maps/api/staticmap?center=${item.coordinates.lat.toFixed(
          6,
        )},${item.coordinates.lng.toFixed(
          6,
        )}&zoom=14&size=640x300&scale=2&maptype=roadmap&markers=color:red%7C${item.coordinates.lat.toFixed(
          6,
        )},${item.coordinates.lng.toFixed(6)}&key=${encodeURIComponent(googleMapsApiKey)}`
      : `https://static-maps.yandex.ru/1.x/?lang=ru_RU&ll=${item.coordinates.lng.toFixed(
          6,
        )},${item.coordinates.lat.toFixed(
          6,
        )}&z=14&l=map&size=650,300&pt=${item.coordinates.lng.toFixed(
          6,
        )},${item.coordinates.lat.toFixed(6)},pm2rdm`
    : "";

  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <title>${escapePrintHtml(item.title)}</title>
    <style>
      :root { --text:#111827; --muted:#6b7280; --line:#e5e7eb; --soft:#f8fafc; --chip:#f3f4f6; }
      body { font-family: Inter, Arial, sans-serif; margin: 2mm; color: var(--text); line-height: 1.35; font-size: 12px; }
      h1 { font-size: 20px; margin: 0; line-height: 1.2; }
      h2 { font-size: 13px; margin: 0 0 6px; text-transform: uppercase; letter-spacing: .03em; color: #4b5563; }
      p { margin: 4px 0; }
      .muted { color: var(--muted); font-size: 11px; }
      .sheet { border: 1px solid var(--line); border-radius: 12px; padding: 8px; }
      .row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      .chips { display: flex; flex-wrap: wrap; gap: 6px; }
      .chip { display:inline-flex; align-items:center; padding: 2px 8px; border-radius: 999px; background: var(--chip); color: #374151; font-size: 11px; }
      .chip-status { background:#dbeafe; color:#1e3a8a; }
      .grid { display: grid; grid-template-columns: 1.35fr .95fr; gap: 10px; margin-top: 8px; align-items: flex-start; }
      .box { border: 1px solid var(--line); border-radius: 10px; padding: 8px 10px; background: #fff; height: auto; }
      .kpi { font-size: 18px; font-weight: 700; letter-spacing: .01em; }
      .kpi-sub { font-size: 11px; color: var(--muted); }
      .price-lines { display: grid; gap: 2px; }
      .price-card { border-color: #dbe3ef; background: #fafcff; }
      .price-table { margin-top: 6px; display: grid; gap: 3px; }
      .price-row { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; font-size: 12px; }
      .price-row span { color: #4b5563; }
      .price-row strong { text-align: right; white-space: nowrap; }
      .gallery { margin-top: 8px; display: grid; grid-template-columns: minmax(0,1fr) 132px; gap: 12px; align-items: start; }
      .photo-frame { border: 1px solid var(--line); border-radius: 10px; background: var(--soft); height: 300px; overflow: hidden; }
      .photo { width: 100%; height: 100%; object-fit: cover; border-radius: 8px; display: block; }
      .thumbs-right { display:grid; grid-template-columns: 1fr; gap: 6px; height: 300px; grid-template-rows: repeat(4, minmax(0, 1fr)); }
      .thumb { width: 100%; height: 100%; min-height: 0; object-fit: cover; border-radius: 8px; border: 1px solid var(--line); }
      .section { margin-top: 10px; padding-top: 8px; border-top: 1px dashed var(--line); }
      .info-box { border: 1px solid var(--line); border-radius: 10px; padding: 8px 10px; background: #fff; }
      .info-box p { margin: 0; }
      .compact-stack { display: grid; gap: 6px; }
      .content-stack { display: grid; gap: 8px; }
      .content-part { margin-top: 0; padding-top: 6px; border-top: 1px dashed var(--line); }
      .content-part:first-child { border-top: 0; padding-top: 0; }
      .comment-list { margin: 0; padding: 0; list-style: none; display: grid; gap: 6px; }
      .comment { background: var(--soft); border: 1px solid var(--line); border-radius: 8px; padding: 6px 8px; }
      .map-wrap { margin-top: 6px; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
      .map { width: 100%; height: 184px; object-fit: cover; display: block; }
      a { color: inherit; text-decoration: none; }
      @media print {
        body { margin: 1.5mm; }
        .sheet { break-inside: avoid; page-break-inside: avoid; }
      }
      .sheet.compact { padding: 7px; font-size: 11.5px; line-height: 1.33; }
      .sheet.compact h1 { font-size: 18px; }
      .sheet.compact h2 { font-size: 12px; margin-bottom: 4px; }
      .sheet.compact .gallery,
      .sheet.compact .grid,
      .sheet.compact .section { margin-top: 7px; padding-top: 6px; gap: 8px; }
      .sheet.compact .photo-frame,
      .sheet.compact .thumbs-right { height: 280px; }
      .sheet.compact .map { height: 168px; }
      .sheet.compact .chip { padding: 1px 7px; font-size: 10px; }
      .sheet.compact .comment-list { gap: 4px; }
      .sheet.compact .comment { padding: 4px 6px; }
      .sheet.compact .price-table { gap: 2px; }
      .sheet.compact .price-row { font-size: 11px; }
      .sheet.compact .content-part { padding-top: 5px; }
    </style>
  </head>
  <body>
    <div class="sheet ${useCompactPrintLayout ? "compact" : ""}">
      <div class="row">
        <h1>${escapePrintHtml(item.title)}</h1>
        <span class="chip chip-status">${escapePrintHtml(statusLabel)}</span>
      </div>
      ${
        item.locationLabel
          ? `<p class="muted">${escapePrintHtml(item.locationLabel)}</p>`
          : ""
      }
      ${
        item.previewImages[0]?.url
          ? `<div class="gallery">
              <div class="photo-frame">
                <img class="photo" src="${escapePrintHtml(item.previewImages[0].url)}" alt="Фото жилья" />
              </div>
              ${galleryThumbsHtml}
            </div>`
          : ""
      }

      <div class="grid">
        <div class="box">
          <div class="content-stack">
            <div class="content-part">
              <h2>Описание</h2>
              <p>${escapePrintHtml(item.previewDescription || "Не указано")}</p>
            </div>
            <div class="content-part">
              <h2>Удобства</h2>
              <div class="chips">${amenitiesHtml}</div>
            </div>
            ${
              item.notes
                ? `<div class="content-part"><h2>Заметки</h2><p>${escapePrintHtml(item.notes)}</p></div>`
                : ""
            }
            <div class="content-part">
              <h2>Комментарии</h2>
              <ul class="comment-list">${commentsHtml}</ul>
            </div>
          </div>
        </div>
        <div class="box">
          <div class="compact-stack">
            <div>
              <h2>Оценка</h2>
              <p><strong>Голоса:</strong> ${item.upVotes - item.downVotes}</p>
              <p><strong>Рейтинг:</strong> ${item.rating ?? "—"}</p>
              <p><strong>Тип цены:</strong> ${escapePrintHtml(getPricingModeLabel(item.pricingMode))}</p>
            </div>
            ${
              mapImageUrl
                ? `<div>
                    <h2>Локация на карте</h2>
                    <div class="map-wrap">
                      <img class="map" src="${escapePrintHtml(mapImageUrl)}" alt="Карта расположения жилья" />
                    </div>
                  </div>`
                : ""
            }
            <div class="box price-card">
              <h2>Цена</h2>
              <p class="kpi">${
                total !== null
                  ? escapePrintHtml(formatAmount(total, item.currency))
                  : "не указано"
              }</p>
              <p class="kpi-sub"><strong>За весь период</strong></p>
              <div class="price-lines">
                ${rubBlock || basicPriceBlock}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </body>
</html>`;
}

/**
 * Печать через скрытый iframe (вызывать только в браузере).
 */
export function printAccommodationHtml(
  html: string,
  onPrintSetupFailed?: (message: string) => void,
): void {
  if (typeof document === "undefined") return;

  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  frame.setAttribute("aria-hidden", "true");
  frame.srcdoc = html;

  const cleanup = () => {
    window.setTimeout(() => {
      if (frame.parentNode) frame.parentNode.removeChild(frame);
    }, 1200);
  };

  frame.onload = () => {
    const w = frame.contentWindow;
    if (!w) {
      cleanup();
      onPrintSetupFailed?.("Не удалось подготовить печать.");
      return;
    }
    w.focus();
    w.print();
    cleanup();
  };

  document.body.appendChild(frame);
}
