import {
  createTRPCProxyClient,
  httpBatchLink,
  httpLink,
  splitLink,
} from "@trpc/client";
import superjson from "superjson";
import { getAuthToken } from "./auth-token";

/** Элемент галереи карточки жилья (синхронно с accommodation-preview-images на API). */
export type AccommodationPreviewImage = { url: string; zone?: string };

/** Профиль пользователя (auth.me / после входа). */
export type AuthUserProfile = {
  id: string;
  email: string;
  name: string;
  lastName: string;
  displayName: string;
  avatarUrl: string | null;
  systemRole: "user" | "admin";
};

export type ApiClient = {
  auth: {
    register: {
      mutate(input: {
        name: string;
        email: string;
        password: string;
      }): Promise<{
        token: string;
        user: AuthUserProfile;
      }>;
    };
    login: {
      mutate(input: { email: string; password: string }): Promise<{
        token: string;
        user: AuthUserProfile;
      }>;
    };
    me: { query(): Promise<AuthUserProfile> };
    updateProfile: {
      mutate(input: {
        name: string;
        lastName?: string;
        avatarUrl?: string | null;
      }): Promise<AuthUserProfile>;
    };
    changePassword: {
      mutate(input: {
        currentPassword: string;
        newPassword: string;
      }): Promise<{ success: true }>;
    };
  };
  admin: {
    listUsers: {
      query(): Promise<{
        users: {
          id: string;
          email: string;
          name: string;
          lastName: string;
          displayName: string;
          avatarUrl: string | null;
          systemRole: "user" | "admin";
        }[];
      }>;
    };
    updateUserProfile: {
      mutate(input: {
        userId: string;
        name: string;
        lastName?: string;
        avatarUrl?: string | null;
      }): Promise<{
        id: string;
        email: string;
        name: string;
        lastName: string;
        displayName: string;
        avatarUrl: string | null;
        systemRole: "user" | "admin";
      }>;
    };
    getSignedAvatarUploadUrlForUser: {
      mutate(input: {
        userId: string;
        filename: string;
        contentType: string;
        size: number;
      }): Promise<{
        uploadUrl: string;
        objectKey: string;
        publicUrl: string;
      }>;
    };
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
          firstName: string;
          lastName: string;
          email: string;
          avatarUrl: string | null;
          displayName: string;
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
    packChecklist: {
      list: {
        query(input: { tripId: string }): Promise<{
          items: {
            id: string;
            kind: "line" | "group";
            title: string;
            done: boolean;
            sortOrder: number;
            parentItemId: string | null;
            quantity: number | null;
            quantityUnit: string | null;
          }[];
        }>;
      };
      addItem: {
        mutate(input: {
          tripId: string;
          title: string;
          kind?: "line" | "group";
          parentItemId?: string;
          quantity?: number | null;
          quantityUnit?: string | null;
        }): Promise<{
          item: {
            id: string;
            kind: "line" | "group";
            title: string;
            done: boolean;
            sortOrder: number;
            parentItemId: string | null;
            quantity: number | null;
            quantityUnit: string | null;
          };
        }>;
      };
      updateItem: {
        mutate(input: {
          tripId: string;
          itemId: string;
          title?: string;
          done?: boolean;
          quantity?: number | null;
          quantityUnit?: string | null;
        }): Promise<{
          item: {
            id: string;
            kind: "line" | "group";
            title: string;
            done: boolean;
            sortOrder: number;
            parentItemId: string | null;
            quantity: number | null;
            quantityUnit: string | null;
          };
        }>;
      };
      removeItem: {
        mutate(input: {
          tripId: string;
          itemId: string;
        }): Promise<{ success: true }>;
      };
      resetFromPreset: {
        mutate(input: { tripId: string }): Promise<{
          items: {
            id: string;
            kind: "line" | "group";
            title: string;
            done: boolean;
            sortOrder: number;
            parentItemId: string | null;
            quantity: number | null;
            quantityUnit: string | null;
          }[];
        }>;
      };
      moveItemRelative: {
        mutate(input: {
          tripId: string;
          itemId: string;
          direction: "up" | "down";
        }): Promise<{
          moved: boolean;
          items: {
            id: string;
            kind: "line" | "group";
            title: string;
            done: boolean;
            sortOrder: number;
            parentItemId: string | null;
            quantity: number | null;
            quantityUnit: string | null;
          }[];
        }>;
      };
      reorderPeers: {
        mutate(input: {
          tripId: string;
          parentSectionId?: string | null;
          orderedItemIds: string[];
        }): Promise<{
          items: {
            id: string;
            kind: "line" | "group";
            title: string;
            done: boolean;
            sortOrder: number;
            parentItemId: string | null;
            quantity: number | null;
            quantityUnit: string | null;
          }[];
        }>;
      };
      bulkSetLinesDone: {
        mutate(input: {
          tripId: string;
          done: boolean;
          scope: "all_lines" | "section_lines";
          sectionItemId?: string;
        }): Promise<{
          items: {
            id: string;
            kind: "line" | "group";
            title: string;
            done: boolean;
            sortOrder: number;
            parentItemId: string | null;
            quantity: number | null;
            quantityUnit: string | null;
          }[];
        }>;
      };
      restoreDeletedItemsBatch: {
        mutate(input: {
          tripId: string;
          ordered: (
            | {
                kind: "group";
                clientKey: string;
                title: string;
                done?: boolean;
              }
            | {
                kind: "line";
                clientKey: string;
                parentClientKey?: string;
                title: string;
                done?: boolean;
                quantity?: number | null;
                quantityUnit?: string | null;
              }
          )[];
        }): Promise<{
          items: {
            id: string;
            kind: "line" | "group";
            title: string;
            done: boolean;
            sortOrder: number;
            parentItemId: string | null;
            quantity: number | null;
            quantityUnit: string | null;
          }[];
        }>;
      };
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
          previewImages: AccommodationPreviewImage[];
          createdBy: string;
          upVotes: number;
          downVotes: number;
          votes: {
            userId: string;
            userName: string;
            value: "up" | "down";
          }[];
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
        previewImages?: AccommodationPreviewImage[];
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
        previewImages?: AccommodationPreviewImage[];
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
    enrichFromGeminiHtml: {
      mutate(input: { html: string; pageUrl?: string }): Promise<{
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
    galleryZonesFromGeminiHtml: {
      mutate(input: { html: string; pageUrl?: string }): Promise<{
        images: AccommodationPreviewImage[];
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
            authorAvatarUrl: string | null;
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
  tripReceipt: {
    list: {
      query(input: { tripId: string }): Promise<
        {
          id: string;
          tripId: string;
          title: string;
          description: string;
          paidByUserId: string;
          paidByUserName: string;
          currency: string;
          imageUrl: string | null;
          lineItemCount: number;
          totalAmount: number;
          createdAt: string | null;
        }[]
      >;
    };
    byId: {
      query(input: { receiptId: string }): Promise<{
        id: string;
        tripId: string;
        title: string;
        description: string;
        paidByUserId: string;
        paidByUserName: string;
        currency: string;
        imageUrl: string | null;
        lineItems: {
          id: string;
          name: string;
          qty: number;
          unitPrice?: number;
          lineTotal: number;
          participantUserIds: string[];
          consumptions: { userId: string; qty: number }[];
          consumedQtyTotal: number;
        }[];
        members: { userId: string; name: string }[];
        shareByMember: Record<string, number>;
        reimbursedPayerUserIds: string[];
        viewerId: string;
        totalAmount: number;
        anyLineSelections: boolean;
        hypotheticalShareAllEqual: number | null;
      }>;
    };
    create: {
      mutate(input: {
        tripId: string;
        title: string;
        description?: string;
        paidByUserId: string;
      }): Promise<{ id: string }>;
    };
    update: {
      mutate(input: {
        receiptId: string;
        title: string;
        description?: string;
        paidByUserId: string;
      }): Promise<{ success: true }>;
    };
    delete: {
      mutate(input: { receiptId: string }): Promise<{ success: true }>;
    };
    setImageUrl: {
      mutate(input: {
        receiptId: string;
        imageUrl: string;
      }): Promise<{ success: true }>;
    };
    analyzeWithGemini: {
      mutate(input: { receiptId: string }): Promise<{
        success: true;
        lineCount: number;
        currency: string;
      }>;
    };
    updateLineItems: {
      mutate(input: {
        receiptId: string;
        lineItems: {
          id: string;
          name: string;
          qty: number;
          unitPrice?: number;
          lineTotal: number;
          participantUserIds?: string[];
          consumptions?: { userId: string; qty: number }[];
        }[];
      }): Promise<{ success: true }>;
    };
    setLineConsumption: {
      mutate(input: {
        receiptId: string;
        lineItemId: string;
        qty: number;
      }): Promise<{ success: true }>;
    };
    toggleReimbursedPayer: {
      mutate(input: { receiptId: string }): Promise<{ success: true }>;
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
    getSignedAvatarUploadUrl: {
      mutate(input: {
        filename: string;
        contentType: string;
        size: number;
      }): Promise<{
        uploadUrl: string;
        objectKey: string;
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
    getSignedReceiptImageUploadUrl: {
      mutate(input: {
        tripId: string;
        filename: string;
        contentType: string;
        size: number;
      }): Promise<{
        uploadUrl: string;
        objectKey: string;
        publicUrl: string;
      }>;
    };
  };
};

function getApiUrl() {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
}

export function makeTrpcClient() {
  const shared = {
    url: `${getApiUrl()}/trpc`,
    transformer: superjson,
    headers() {
      const token = getAuthToken();
      return token ? { authorization: `Bearer ${token}` } : {};
    },
  } as const;

  const client = createTRPCProxyClient({
    links: [
      splitLink({
        condition(op) {
          return op.type === "mutation";
        },
        true: httpLink(shared),
        false: httpBatchLink(shared),
      }),
    ],
  });
  return client as unknown as ApiClient;
}
