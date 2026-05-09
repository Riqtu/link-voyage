/** Cookie на домене web: зеркало JWT доступа для proxy/SSR (тот же секрет, что и на API). */
export const LV_SESSION_COOKIE_NAME = "lv_session";

/** Согласовано с expiresIn входа/register на API (`7d`). */
export const LV_SESSION_COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 7;
