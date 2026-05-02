/**
 * Interpret bookingDate (calendar day) + time as wall-clock in Vietnam (UTC+7).
 * Avoids deploy servers in UTC interpreting "YYYY-MM-DDTHH:mm:ss" as UTC,
 * which skews slot end / attendance deadline by ~7 hours vs local dev (VN).
 */

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

const parseIsoDateParts = (isoDate) => {
  const m = String(isoDate || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
};

const parseTimeParts = (value) => {
  const m = String(value || "").match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  return { hour: Number(m[1]), minute: Number(m[2]), second: Number(m[3] || 0) };
};

function toVnDateTimeMs(isoDate, time = "00:00:00") {
  const dateParts = parseIsoDateParts(isoDate);
  const timeParts = parseTimeParts(time);
  if (!dateParts || !timeParts) return NaN;
  return (
    Date.UTC(
      dateParts.year,
      dateParts.month - 1,
      dateParts.day,
      timeParts.hour,
      timeParts.minute,
      timeParts.second
    ) - VN_OFFSET_MS
  );
}

function vnWallClockPartsFromUtcMs(ms = Date.now()) {
  const shifted = new Date(Number(ms) + VN_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
  };
}

function vnTodayYmd() {
  const p = vnWallClockPartsFromUtcMs(Date.now());
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

function vnYmdFromUtcMs(ms) {
  const p = vnWallClockPartsFromUtcMs(ms);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

function bookingDateToYmd(raw) {
  if (raw == null || raw === "") return "";
  if (typeof raw === "string") {
    const m = String(raw).trim().match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : "";
  }
  if (raw instanceof Date && Number.isFinite(raw.getTime())) {
    return `${raw.getUTCFullYear()}-${String(raw.getUTCMonth() + 1).padStart(2, "0")}-${String(raw.getUTCDate()).padStart(2, "0")}`;
  }
  return "";
}

function bookingSlotEndDate(booking) {
  const dateStr = bookingDateToYmd(booking?.bookingDate);
  if (!dateStr) return null;
  let end = String(booking?.endTime || "23:59:59");
  if (end.length === 5) end = `${end}:00`;
  const ms = toVnDateTimeMs(dateStr, end);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms);
}

module.exports = {
  toVnDateTimeMs,
  vnWallClockPartsFromUtcMs,
  vnTodayYmd,
  vnYmdFromUtcMs,
  bookingDateToYmd,
  bookingSlotEndDate,
};
