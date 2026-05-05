import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import { getAuthToken } from "./auth-token";

export type ApiClient = {
  auth: {
    register: {
      mutate(input: {
        name: string;
        email: string;
        password: string;
      }): Promise<{
        token: string;
        user: { id: string; email: string; name: string };
      }>;
    };
    login: {
      mutate(input: { email: string; password: string }): Promise<{
        token: string;
        user: { id: string; email: string; name: string };
      }>;
    };
    me: { query(): Promise<{ id: string; email: string; name: string }> };
  };
  trip: {
    list: {
      query(): Promise<
        {
          id: string;
          title: string;
          description: string;
          membersCount: number;
        }[]
      >;
    };
    create: {
      mutate(input: {
        title: string;
        description?: string;
        peopleCount?: number;
        startDate?: string;
        endDate?: string;
        timezone?: string;
        housingRequirements?: string[];
      }): Promise<{
        id: string;
        title: string;
      }>;
    };
    byId: {
      query(input: { tripId: string }): Promise<{
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
          name: string;
        }[];
      }>;
    };
    forAccommodationsPage: {
      query(input: { tripId: string }): Promise<{
        canCollaborate: boolean;
        peopleCount: number;
        startDate: string | null;
        endDate: string | null;
        housingRequirements: string[];
      }>;
    };
    updateSettings: {
      mutate(input: {
        tripId: string;
        peopleCount: number;
        startDate?: string | null;
        endDate?: string | null;
        timezone: string;
        housingRequirements: string[];
      }): Promise<{
        success: boolean;
        peopleCount: number;
        startDate: string | null;
        endDate: string | null;
        timezone: string;
        housingRequirements: string[];
      }>;
    };
    createInvite: {
      mutate(input: { tripId: string }): Promise<{
        code: string;
        inviteUrl: string;
        expiresAt: string;
      }>;
    };
    acceptInvite: {
      mutate(input: {
        code: string;
      }): Promise<{ tripId: string; title: string }>;
    };
    removeMember: {
      mutate(input: {
        tripId: string;
        userId: string;
      }): Promise<{ success: true }>;
    };
  };
  accommodation: {
    list: {
      query(input: {
        tripId: string;
        search?: string;
        minPrice?: number;
        maxPrice?: number;
        status?: "shortlisted" | "rejected" | "booked";
        freeCancellationOnly?: boolean;
      }): Promise<
        {
          id: string;
          tripId: string;
          title: string;
          provider: string;
          sourceUrl: string;
          locationLabel: string;
          coordinates: { lat: number; lng: number } | null;
          price: number | null;
          pricingMode: "total" | "perNight" | "perPerson";
          currency: string;
          rating: number | null;
          freeCancellation: boolean;
          amenities: string[];
          status: "shortlisted" | "rejected" | "booked";
          noLongerAvailable: boolean;
          notes: string;
          previewDescription: string;
          previewImages: string[];
          createdBy: string;
          upVotes: number;
          downVotes: number;
          userVote: "up" | "down" | null;
        }[]
      >;
    };
    create: {
      mutate(input: {
        tripId: string;
        title: string;
        provider?: string;
        sourceUrl?: string;
        locationLabel?: string;
        coordinates?: { lat: number; lng: number };
        price?: number;
        pricingMode?: "total" | "perNight" | "perPerson";
        currency?: string;
        rating?: number;
        freeCancellation?: boolean;
        amenities?: string[];
        notes?: string;
        previewDescription?: string;
        previewImages?: string[];
      }): Promise<{ id: string; title: string }>;
    };
    update: {
      mutate(input: {
        optionId: string;
        title: string;
        provider?: string;
        sourceUrl?: string;
        locationLabel?: string;
        coordinates?: { lat: number; lng: number };
        price?: number;
        pricingMode?: "total" | "perNight" | "perPerson";
        currency?: string;
        rating?: number;
        freeCancellation?: boolean;
        amenities?: string[];
        notes?: string;
        previewDescription?: string;
        previewImages?: string[];
      }): Promise<{ success: boolean; id: string }>;
    };
    delete: {
      mutate(input: { optionId: string }): Promise<{ success: boolean }>;
    };
    previewFromUrl: {
      mutate(input: { url: string }): Promise<{
        canonicalUrl: string;
        title: string;
        description: string;
        siteName: string;
        images: string[];
      }>;
    };
    enrichFromGeminiUrl: {
      mutate(input: { url: string }): Promise<{
        canonicalUrl: string;
        title: string;
        provider: string;
        sourceUrl?: string;
        locationLabel?: string;
        coordinates?: { lat: number; lng: number };
        price?: number;
        pricingMode: "total" | "perNight" | "perPerson";
        currency: string;
        rating?: number;
        freeCancellation: boolean;
        amenities: string[];
        notes?: string;
        previewDescription: string;
        previewImages: string[];
      }>;
    };
    geocodeByQuery: {
      mutate(input: { query: string; limit?: number }): Promise<
        {
          label: string;
          lat: number;
          lng: number;
        }[]
      >;
    };
    updateStatus: {
      mutate(input: {
        optionId: string;
        status: "shortlisted" | "rejected" | "booked";
      }): Promise<{ success: boolean }>;
    };
    setNoLongerAvailable: {
      mutate(input: {
        optionId: string;
        noLongerAvailable: boolean;
      }): Promise<{ success: true }>;
    };
    vote: {
      mutate(input: {
        optionId: string;
        value: "up" | "down";
      }): Promise<{ success: boolean }>;
    };
    commentsForTrip: {
      query(input: { tripId: string }): Promise<
        Record<
          string,
          {
            id: string;
            body: string;
            authorId: string;
            authorName: string;
            createdAt: string;
            canDelete: boolean;
          }[]
        >
      >;
    };
    addAccommodationComment: {
      mutate(input: {
        optionId: string;
        body: string;
      }): Promise<{ id: string }>;
    };
    deleteAccommodationComment: {
      mutate(input: { commentId: string }): Promise<{ success: boolean }>;
    };
  };
  forex: {
    usdRubRate: {
      query(): Promise<
        | {
            ok: true;
            rubPerUsd: number;
            quoteDate: string;
            source: "cbr_rf";
          }
        | { ok: false; message: string }
      >;
    };
  };
  tripPoint: {
    list: {
      query(input: { tripId: string }): Promise<
        {
          id: string;
          tripId: string;
          title: string;
          description: string;
          category: "stay" | "food" | "sight" | "transport" | "other";
          coordinates: { lat: number; lng: number };
          plannedAt: string | null;
          createdBy: string;
        }[]
      >;
    };
    create: {
      mutate(input: {
        tripId: string;
        title: string;
        description?: string;
        category?: "stay" | "food" | "sight" | "transport" | "other";
        coordinates: { lat: number; lng: number };
        plannedAt?: string;
      }): Promise<{ id: string; title: string }>;
    };
    update: {
      mutate(input: {
        pointId: string;
        title: string;
        description?: string;
        category: "stay" | "food" | "sight" | "transport" | "other";
        coordinates: { lat: number; lng: number };
        plannedAt?: string;
      }): Promise<{ success: true }>;
    };
    delete: {
      mutate(input: { pointId: string }): Promise<{ success: true }>;
    };
  };
  tripDoc: {
    list: {
      query(input: { tripId: string }): Promise<
        {
          id: string;
          tripId: string;
          title: string;
          description: string;
          fileUrl: string;
          filename: string;
          contentType: string;
          createdBy: string;
          createdAt: string | null;
        }[]
      >;
    };
    create: {
      mutate(input: {
        tripId: string;
        title: string;
        description?: string;
        objectKey: string;
        originalFilename: string;
        contentType: string;
      }): Promise<{ id: string; fileUrl: string }>;
    };
    update: {
      mutate(input: {
        docId: string;
        title: string;
        description?: string;
      }): Promise<{ success: true }>;
    };
    delete: {
      mutate(input: { docId: string }): Promise<{ success: true }>;
    };
  };
  s3: {
    getSignedImageUploadUrl: {
      mutate(input: {
        tripId: string;
        filename: string;
        contentType: string;
        size: number;
      }): Promise<{
        uploadUrl: string;
        publicUrl: string;
      }>;
    };
    getSignedDocumentUploadUrl: {
      mutate(input: {
        tripId: string;
        filename: string;
        contentType: string;
        size: number;
      }): Promise<{
        uploadUrl: string;
        objectKey: string;
        publicUrl: string;
        contentType: string;
      }>;
    };
  };
};

function getApiUrl() {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
}

export function makeTrpcClient() {
  const client = createTRPCProxyClient({
    links: [
      httpBatchLink({
        url: `${getApiUrl()}/trpc`,
        transformer: superjson,
        headers() {
          const token = getAuthToken();
          return token ? { authorization: `Bearer ${token}` } : {};
        },
      }),
    ],
  });
  return client as unknown as ApiClient;
}
