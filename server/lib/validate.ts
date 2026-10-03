/**
 * 手寫欄位校驗（零依賴慣例，唔引入 Zod）：逐欄檢查，錯誤訊息用繁體粵文。
 */

export type FieldResult<T> = { ok: true; value: T } | { ok: false; error: string };

export interface TextRule {
  label: string;
  min?: number;
  max: number;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 必填文字：去首尾空白後檢查長度。 */
export function readText(value: unknown, rule: TextRule): FieldResult<string> {
  if (typeof value !== "string") return { ok: false, error: `${rule.label}唔係文字` };
  const text = value.trim();
  if (text.length < (rule.min ?? 1)) return { ok: false, error: `缺少${rule.label}` };
  if (text.length > rule.max) return { ok: false, error: `${rule.label}過長（上限 ${rule.max} 字）` };
  return { ok: true, value: text };
}

/** 選填文字：空字串或未提供一律當 null。 */
export function readOptionalText(value: unknown, rule: TextRule): FieldResult<string | null> {
  if (value === undefined || value === null || value === "") return { ok: true, value: null };
  return readText(value, rule);
}

/** 整數欄位：接受數字或數字字串。 */
export function readInteger(
  value: unknown,
  rule: { label: string; min: number; max: number },
): FieldResult<number> {
  const number = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof number !== "number" || !Number.isInteger(number)) {
    return { ok: false, error: `${rule.label}唔係整數` };
  }
  if (number < rule.min || number > rule.max) {
    return { ok: false, error: `${rule.label}超出範圍（${rule.min} 至 ${rule.max}）` };
  }
  return { ok: true, value: number };
}

/** 枚舉欄位：只接受登記值。 */
export function readEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
): FieldResult<T> {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    return { ok: false, error: `${label}唔喺允許值之內（${allowed.join(" / ")}）` };
  }
  return { ok: true, value: value as T };
}
