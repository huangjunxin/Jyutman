/**
 * 检索层归一化工具。
 *
 * 繁简归一为单向映射：把用户输入的简化字转成繁体，与语料中的繁体用字对齐。
 * 映射表目前只收录一小组常用字，后续按真实查询样本扩充（见 docs/03 第 6 节）。
 *
 * 注意：部分简化字对应多个繁体字（例如 发 对应 發 与 髮，后 对应 後 与 后，
 * 里 对应 裡 与 里，云 对应 雲 与 云）。本表按语料中的常见用法取默认值，
 * 不做上下文消歧。
 */

/** 简化字到繁体字的常见映射。 */
export const SIMPLIFIED_TO_TRADITIONAL: Readonly<Record<string, string>> = {
  发: "發",
  后: "後",
  里: "裡",
  云: "雲",
  现: "現",
  来: "來",
  对: "對",
  从: "從",
  汉: "漢",
  华: "華",
  学: "學",
  说: "說",
  读: "讀",
  语: "語",
  话: "話",
  书: "書",
  报: "報",
  东: "東",
  广: "廣",
  门: "門",
  见: "見",
  时: "時",
  万: "萬",
  与: "與",
  为: "為",
  国: "國",
  过: "過",
  这: "這",
  页: "頁",
  体: "體",
  号: "號",
  点: "點",
  长: "長",
  车: "車",
  马: "馬",
  关: "關",
  开: "開",
  会: "會",
  问: "問",
  间: "間",
  无: "無",
};

/** 把输入中的简化字逐字转成繁体；未收录的字符原样保留。 */
export function toTraditional(input: string): string {
  let output = "";
  for (const char of input) {
    output += SIMPLIFIED_TO_TRADITIONAL[char] ?? char;
  }
  return output;
}

/** 去掉输入中的全部空白字符（含换行与制表符）。 */
export function stripSpaces(input: string): string {
  return input.replace(/\s+/gu, "");
}

/**
 * 汉字串检索用的归一化入口：先繁简归一，再去空白。
 * 含罗马字（粤拼、传教士拼式）的查询不要直接用本函数，空格与调号有语义，
 * 罗马字归一后续单独实现（见 docs/02 第 6.2 节）。
 */
export function normalize(input: string): string {
  return stripSpaces(toTraditional(input));
}
