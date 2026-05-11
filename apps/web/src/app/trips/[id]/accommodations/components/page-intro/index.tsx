"use client";

import { getAuthToken } from "@/lib/auth-token";
import Link from "next/link";

type Props = {
  peopleCount: number;
  nights: number;
  canCollaborate: boolean;
  viewerHintReady: boolean;
  rubPerUsd: number | null;
  cbrUsdRubQuoteDate: string | null;
};

export function AccommodationsPageIntro({
  peopleCount,
  nights,
  canCollaborate,
  viewerHintReady,
  rubPerUsd,
  cbrUsdRubQuoteDate,
}: Props) {
  return (
    <div className="mb-6">
      <div>
        <h1 className="text-3xl font-semibold">Сравнение жилья</h1>
        <p className="text-sm text-muted-foreground">
          Число человек в поездке для расчёта «за человека»:{" "}
          <strong>{peopleCount}</strong>.
          {canCollaborate ? (
            <>
              {" "}
              Изменить можно в блоке «Настройки поездки» на странице поездки.
            </>
          ) : null}{" "}
          Ночей: <strong>{nights}</strong>.
        </p>
        {!canCollaborate ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {!viewerHintReady ? (
              <>
                Просмотр по ссылке. Изменения доступны только участникам поездки
                после входа в аккаунт.
              </>
            ) : getAuthToken() ? (
              <>
                Вы вошли в аккаунт, но не участник этой поездки — доступен
                только просмотр по ссылке.
              </>
            ) : (
              <>
                Открытый по ссылке просмотр.{" "}
                <Link className="font-medium underline" href="/auth">
                  Войдите
                </Link>
                , если вы участник поездки, чтобы добавлять и редактировать
                варианты.
              </>
            )}
          </p>
        ) : null}
        {rubPerUsd !== null && cbrUsdRubQuoteDate ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Варианты в <strong>USD</strong> дополнительно показаны в рублях (
            ориентировочно по курсу ЦБ РФ от{" "}
            {new Date(cbrUsdRubQuoteDate).toLocaleString("ru-RU", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
            })}
            , 1 USD ≈ {rubPerUsd.toFixed(2)} ₽).
          </p>
        ) : null}
      </div>
    </div>
  );
}
