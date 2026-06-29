"use client";

type ReceiptRubNoteProps = {
  shouldShow: boolean;
  canConvert: boolean;
  currencyCode: string;
  rubQuoteDate: string | null;
};

export function ReceiptRubNote({
  shouldShow,
  canConvert,
  currencyCode,
  rubQuoteDate,
}: ReceiptRubNoteProps) {
  if (!shouldShow) return null;
  return (
    <p className="mt-2 text-xs text-muted-foreground">
      {canConvert
        ? `Суммы в RUB показаны ориентировочно по курсу ЦБ РФ${
            rubQuoteDate
              ? ` от ${new Date(rubQuoteDate).toLocaleDateString("ru-RU")}`
              : ""
          }.`
        : `Конвертация в RUB для валюты ${currencyCode} пока не поддержана.`}
    </p>
  );
}
