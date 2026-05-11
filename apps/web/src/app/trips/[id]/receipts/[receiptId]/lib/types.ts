import { getApiClient } from "@/lib/api-client";

export type ReceiptDetail = Awaited<
  ReturnType<ReturnType<typeof getApiClient>["tripReceipt"]["byId"]["query"]>
>;
