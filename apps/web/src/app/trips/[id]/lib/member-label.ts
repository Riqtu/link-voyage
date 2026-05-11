import type { TripDetails } from "./types";

export function tripMemberRoleLabel(
  role: TripDetails["members"][number]["role"],
) {
  return role === "owner" ? "Организатор" : "Участник";
}
