/**
 * 篇首摘錄：首頁原文樣張同示意圖用。只截取、唔改字；返回正文下標，粵拼注音照常對表。
 */

import { splitParagraphSpans, type ParagraphSpan } from "./reader.ts";

/** 成段只係括號署名，例如「（亞拙）」。 */
const BYLINE = /^（[^）]*）$/u;

/**
 * 篇首第一段正文（跳過署名段），截到第 minChars 字（碼點計）之後嘅第一個句末標點；
 * 段落唔夠長或者冇句末標點就成段返回。冇正文返回 null。
 */
export function leadExcerpt(text: string, minChars: number): ParagraphSpan | null {
  const span = splitParagraphSpans(text).find((candidate) => !BYLINE.test(candidate.text));
  if (span === undefined) return null;
  const cut = new RegExp(`^[\\s\\S]{${minChars},}?[。！？]`, "u").exec(span.text);
  return { text: cut?.[0] ?? span.text, start: span.start };
}
