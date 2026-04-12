/**
 * Danh sách chuyên môn PT — giữ trùng khớp với GFMS_FE `src/constants/trainerSpecializations.js`.
 * Dùng cho đơn đăng ký PT / mượn PT.
 */

export const CANONICAL_TRAINER_SPECIALIZATIONS = Object.freeze([
  "Giảm mỡ & định hình toàn thân",
  "Tăng khối cơ & phát triển toàn diện",
  "Sức mạnh & phát triển thể hình",
  "Thể lực & nâng cao thể trạng",
  "Tư thế và vận động hỗ trợ chiều cao",
]);

const UNICODE_SPACE = /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g;

/** Chuẩn hóa để so khớp whitelist (đồng bộ với FE `trainerSpecializationNormKey`) */
export const trainerSpecializationNormKey = (s) => {
  let t = String(s ?? "")
    .replace(/&amp;/gi, "&")
    .replace(/\uFF06/g, "&")
    .replace(UNICODE_SPACE, " ")
    .normalize("NFC")
    .replace(/\uFEFF/g, "")
    .replace(/[\u200B-\u200D\u2060]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return t;
};

const flattenSpecializationRaw = (input) => {
  if (input == null || input === "") return [];
  if (Array.isArray(input)) {
    return input.flatMap((item) => {
      if (item == null || item === "") return [];
      if (Array.isArray(item)) return flattenSpecializationRaw(item);
      if (typeof item === "object") return flattenSpecializationRaw(item);
      return [String(item)];
    });
  }
  if (typeof input === "object") {
    const keys = Object.keys(input).filter((k) => /^\d+$/.test(k));
    if (keys.length) {
      keys.sort((a, b) => Number(a) - Number(b));
      return keys.flatMap((k) => flattenSpecializationRaw(input[k]));
    }
    return Object.values(input).flatMap((v) => flattenSpecializationRaw(v));
  }
  return String(input)
    .split(/[\n,;|]+/)
    .map((x) => x.trim())
    .filter(Boolean);
};

/**
 * @returns {{ ok: true, value: string[] } | { ok: false, message: string }}
 */
const flattenIdRaw = (input) => {
  if (input == null || input === "") return [];
  if (Array.isArray(input)) {
    return input.flatMap((item) => {
      if (item == null || item === "") return [];
      if (Array.isArray(item)) return flattenIdRaw(item);
      if (typeof item === "object") return flattenIdRaw(item);
      return [item];
    });
  }
  if (typeof input === "object") {
    const keys = Object.keys(input).filter((k) => /^\d+$/.test(k));
    if (keys.length) {
      keys.sort((a, b) => Number(a) - Number(b));
      return keys.flatMap((k) => flattenIdRaw(input[k]));
    }
    return Object.values(input).flatMap((v) => flattenIdRaw(v));
  }
  return String(input)
    .split(/[\n,;|]+/)
    .map((x) => x.trim())
    .filter(Boolean);
};

/**
 * Chuyên môn theo chỉ số 0..4 — tránh lỗi encoding / ký tự & trên JSON.
 * @returns {{ ok: true, value: string[] } | { ok: false, message: string }}
 */
export const normalizeTrainerSpecializationIds = (input) => {
  const raw = flattenIdRaw(input);
  const max = CANONICAL_TRAINER_SPECIALIZATIONS.length;
  const seen = new Set();
  const nums = [];
  for (const x of raw) {
    const n = Number(x);
    if (!Number.isInteger(n) || n < 0 || n >= max) continue;
    if (seen.has(n)) continue;
    seen.add(n);
    nums.push(n);
  }
  if (!nums.length) return { ok: false, message: "Vui lòng chọn ít nhất 1 chuyên môn" };
  if (nums.length > 6) return { ok: false, message: "Tối đa 6 chuyên môn" };
  return { ok: true, value: nums.map((i) => CANONICAL_TRAINER_SPECIALIZATIONS[i]) };
};

export const normalizeTrainerSpecializationsInput = (input) => {
  const raw = flattenSpecializationRaw(input);
  const keys = [...new Set(raw.map((x) => trainerSpecializationNormKey(x)).filter(Boolean))];
  if (!keys.length) return { ok: false, message: "Vui lòng chọn ít nhất 1 chuyên môn" };
  if (keys.length > 6) return { ok: false, message: "Tối đa 6 chuyên môn" };

  const canonicalByKey = new Map(
    CANONICAL_TRAINER_SPECIALIZATIONS.map((opt) => [trainerSpecializationNormKey(opt), opt]),
  );
  const byCompact = new Map(
    CANONICAL_TRAINER_SPECIALIZATIONS.map((opt) => {
      const compact = trainerSpecializationNormKey(opt).replace(/\s+/g, "");
      return [compact, opt];
    }),
  );

  const value = [];
  for (const key of keys) {
    let canon = canonicalByKey.get(key);
    if (!canon) canon = byCompact.get(key.replace(/\s+/g, ""));
    if (!canon) {
      return { ok: false, message: `Chuyên môn không hợp lệ: ${key}` };
    }
    value.push(canon);
  }
  return { ok: true, value: [...new Set(value)] };
};
