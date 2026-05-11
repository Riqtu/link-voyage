/** Состав поездки для экрана деталей (данные с `trip.byId`) */
export type TripDetails = {
  id: string;
  title: string;
  description: string;
  peopleCount: number;
  startDate: string | null;
  endDate: string | null;
  timezone: string;
  housingRequirements: string[];
  viewerRole: "owner" | "member";
  members: {
    userId: string;
    role: "owner" | "member";
    firstName: string;
    lastName: string;
    email: string;
    avatarUrl: string | null;
    displayName: string;
  }[];
};
