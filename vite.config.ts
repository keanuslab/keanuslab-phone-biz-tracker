import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
// Shared with the deployed Firebase function so local development uses the same parser.
// @ts-expect-error The server module is plain JavaScript.
import { fetchWillhabenListing } from "./functions/willhaben.mjs";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "willhaben-dev-api",
      configureServer(server) {
        server.middlewares.use("/api/willhaben", async (request, response) => {
          try {
            const url = new URL(request.url ?? "", "http://localhost").searchParams.get("url") ?? "";
            const listing = await fetchWillhabenListing(url);
            response.setHeader("Content-Type", "application/json");
            response.end(JSON.stringify(listing));
          } catch (error) {
            response.statusCode = 502;
            response.setHeader("Content-Type", "application/json");
            response.end(JSON.stringify({ error: error instanceof Error ? error.message : "The listing could not be loaded." }));
          }
        });
      },
    },
  ],
});
