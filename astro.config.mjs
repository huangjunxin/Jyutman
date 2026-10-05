// @ts-check
import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://jyutman.com",
  integrations: [sitemap({ filter: (page) => !page.includes("/proofread") })],
});
