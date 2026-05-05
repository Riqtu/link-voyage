import { makeTrpcClient } from "./trpc";

let client: ReturnType<typeof makeTrpcClient> | null = null;

export function getApiClient() {
  if (!client) {
    client = makeTrpcClient();
  }
  return client;
}
