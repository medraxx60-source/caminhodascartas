import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/webhooks/abacatepay")({
  server: { handlers: {
    POST: async ({ request }) => {
      const { abacateWebhookEndpoint } = await import("@/lib/abacatepay-webhook.server");
      return abacateWebhookEndpoint(request);
    },
  } },
});