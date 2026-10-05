// @ts-check
import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";

/**
 * @fontsource-variable/chiron-hei-hk 除咗按 unicode-range 切好嘅細片，仲多一個 4.7 MB 嘅
 * chinese-traditional 整包 face（U+4E00-9FFF 全區），宣告喺最後所以優先匹配：
 * 頁面有一隻 UI 子集冇收嘅字就會觸發整包下載。細片已覆蓋全部字形，故構建時剔走呢個 face。
 * @type {import("postcss").Plugin}
 */
const dropWholeCjkFace = {
  postcssPlugin: "drop-whole-cjk-face",
  AtRule: {
    "font-face": (rule) => {
      if (rule.toString().includes("chinese-traditional")) rule.remove();
    },
  },
};

export default defineConfig({
  site: "https://jyutman.com",
  integrations: [sitemap({ filter: (page) => !page.includes("/proofread") })],
  vite: { css: { postcss: { plugins: [dropWholeCjkFace] } } },
});
