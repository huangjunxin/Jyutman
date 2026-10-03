/**
 * 引用格式（docs/04 S7）：純文字（APA 風格一行）、BibTeX、RIS。
 * 全部由既有 generated 資料砌成；冇作者字段就唔編造（無題用「語料 + 葉碼」）。
 */

export interface CitationInput {
  articleId: string;
  title: string | null;
  corpusTitle: string;
  issueDate: string | null;
  page: number;
  /** 永久 URL（葉級 canonical，可含篇錨點）。 */
  url: string;
}

export interface Citations {
  text: string;
  bibtex: string;
  ris: string;
}

/** 葉碼三位補零。 */
function pageLabel(page: number): string {
  return `第 ${String(page).padStart(3, "0")} 葉`;
}

/** 篇名：無題時用「語料 + 葉碼」，唔編造。 */
export function citationTitle(input: CitationInput): string {
  return input.title ?? `${input.corpusTitle} ${pageLabel(input.page)}`;
}

export function buildCitations(input: CitationInput): Citations {
  const title = citationTitle(input);
  const page = pageLabel(input.page);
  const date = input.issueDate ?? "年代待考";
  const year = input.issueDate?.match(/\d{4}/u)?.[0] ?? null;
  const license = "底本屬公有領域，文本授權 CC BY-SA 4.0";

  const text =
    input.title !== null
      ? `〈${title}〉。《${input.corpusTitle}》，${date}，${page}。粵語文叢（Jyutman）。${input.url}`
      : `《${input.corpusTitle}》，${date}，${page}。粵語文叢（Jyutman）。${input.url}`;

  const bibtex = [
    `@misc{jyutman-${input.articleId},`,
    `  title        = {${title}},`,
    `  booktitle    = {${input.corpusTitle}},`,
    ...(year !== null ? [`  year         = {${year}},`] : []),
    `  date         = {${date}},`,
    `  note         = {${page}；${license}},`,
    `  howpublished = {粵語文叢（Jyutman）},`,
    `  url          = {${input.url}}`,
    `}`,
  ].join("\n");

  const ris = [
    "TY  - GEN",
    `TI  - ${title}`,
    `T2  - ${input.corpusTitle}`,
    ...(year !== null ? [`PY  - ${year}`] : []),
    `DA  - ${date}`,
    `SP  - ${page}`,
    "PB  - 粵語文叢（Jyutman）",
    `UR  - ${input.url}`,
    `N1  - ${license}`,
    "ER  - ",
  ].join("\n");

  return { text, bibtex, ris };
}
