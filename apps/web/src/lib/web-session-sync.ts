/** Регистрирует httpOnly cookie сессии на домене Next (после валидного JWT). */
export async function registerWebSession(token: string): Promise<boolean> {
  try {
    const response = await fetch("/api/session", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
