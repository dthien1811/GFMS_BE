import marketplaceService from "../marketplace/marketplace.service";
import bookingService from "../member/booking.service";
import memberMyPackageService from "../member/myPackages.service";
import memberProfileService from "../member/profile.service";
import { GFMS_CHAT_FALLBACK_PROMPT, GFMS_INTENT_PROMPT, GFMS_SYSTEM_PROMPT } from "./ai.prompts";
import { classifyIntentWithOpenRouter, generateReplyWithOpenRouter, rewriteReplyWithOpenRouter } from "./openrouter.service";

const DAY_MS = 24 * 60 * 60 * 1000;

const safeText = (v) => String(v || "").trim();
const safeArray = (v) => (Array.isArray(v) ? v : []);
const safeLower = (v) => safeText(v).toLowerCase();

const safeNumber = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const unwrapListResult = (value) => {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.rows)) return value.rows;
  if (Array.isArray(value?.DT?.items)) return value.DT.items;
  if (Array.isArray(value?.DT)) return value.DT;
  return [];
};

const normalize = (v) =>
  safeLower(v)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9:/.\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const isSameNormalizedText = (a, b) => {
  const na = normalize(a);
  const nb = normalize(b);
  return !!na && !!nb && na === nb;
};

const getTrainerDisplayName = (trainer) =>
  trainer?.User?.username || trainer?.name || trainer?.username || `PT #${trainer?.id || "?"}`;

const findTrainerInCollection = (rows = [], matcher = {}) => {
  const trainerId = Number(matcher?.trainerId || 0) || null;
  const trainerName = safeText(matcher?.trainerName);

  if (trainerId) {
    const byId = safeArray(rows).find((row) => Number(row?.id) === trainerId);
    if (byId) return byId;
  }

  if (trainerName) {
    const byName = safeArray(rows).find((row) => isSameNormalizedText(getTrainerDisplayName(row), trainerName));
    if (byName) return byName;
  }

  return null;
};

const findPackageInCollection = (rows = [], matcher = {}) => {
  const packageId = Number(matcher?.packageId || 0) || null;
  const packageName = safeText(matcher?.packageName);

  if (packageId) {
    const byId = safeArray(rows).find((row) => Number(row?.id) === packageId);
    if (byId) return byId;
  }

  if (packageName) {
    const byName = safeArray(rows).find((row) => isSameNormalizedText(row?.name, packageName));
    if (byName) return byName;
  }

  return null;
};

const buildUserHabitSummary = (userPreferences = null) => {
  if (!userPreferences || typeof userPreferences !== "object") return null;

  return {
    favoriteIntent: userPreferences?.favoriteIntent || null,
    favoritePath: userPreferences?.favoritePath || null,
    favoriteTrainerName: userPreferences?.favoriteTrainerName || null,
    favoritePackageName: userPreferences?.favoritePackageName || null,
    lastTrainerName: userPreferences?.lastTrainerName || null,
    lastPackageName: userPreferences?.lastPackageName || null,
    lastVisitedPath: userPreferences?.lastVisitedPath || null,
  };
};

const getRecentHistoryText = (history = [], limit = 6) =>
  safeArray(history)
    .slice(-limit)
    .map((item) => normalize(item?.content))
    .filter(Boolean)
    .join(" ");

const buildNavigateAction = (path, label) => ({
  type: "NAVIGATE_TO_PAGE",
  label,
  payload: { path },
});

const buildSelectTrainerAction = (trainer, extra = {}) => ({
  type: "AI_SELECT_TRAINER",
  label: "Chọn PT này",
  payload: {
    trainerId: trainer?.id || null,
    trainerName: trainer?.name || null,
    gymId: trainer?.gymId || extra?.gymId || null,
    gymName: trainer?.gymName || extra?.gymName || null,
    packageId: extra?.packageId || null,
    packageName: extra?.packageName || null,
    activationId: extra?.activationId || null,
  },
});

const buildSelectPackageAction = (pkg, trainer = null, date = null, activationId = null) => ({
  type: "AI_SELECT_PACKAGE",
  label: "Chọn gói này",
  payload: {
    packageId: pkg?.id || null,
    packageName: pkg?.name || null,
    gymId: pkg?.gymId || null,
    gymName: pkg?.gymName || null,
    trainerId: trainer?.id || null,
    trainerName: trainer?.name || null,
    selectedDate: date || null,
    activationId: activationId || null,
  },
});

const pad2 = (v) => String(v).padStart(2, "0");

const getLocalDateParts = (date = new Date()) => ({
  year: date.getFullYear(),
  month: date.getMonth() + 1,
  day: date.getDate(),
});

const toISODateLocal = (date = new Date()) => {
  const { year, month, day } = getLocalDateParts(date);
  return `${year}-${pad2(month)}-${pad2(day)}`;
};

const addDaysLocal = (date = new Date(), days = 0) => {
  const d = new Date(date);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
};

const formatMoney = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `${n.toLocaleString("vi-VN")} đ`;
};

const formatDateVN = (raw) => {
  if (!raw) return "—";
  const s = String(raw).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-");
    return `${d}/${m}/${y}`;
  }

  const match = s.match(/^(\d{4})-(\d{2})-(\d{2})[T\s]/);
  if (match) {
    return `${match[3]}/${match[2]}/${match[1]}`;
  }

  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
};

const formatTimeHHMM = (raw) => {
  if (!raw) return "00:00";
  const s = String(raw).trim();

  const full = s.match(/^(\d{2}):(\d{2})(?::\d{2})?$/);
  if (full) return `${full[1]}:${full[2]}`;

  const short = s.match(/^(\d{1,2})[:h](\d{2})$/i);
  if (short) return `${pad2(short[1])}:${short[2]}`;

  const hourOnly = s.match(/^(\d{1,2})h$/i);
  if (hourOnly) return `${pad2(hourOnly[1])}:00`;

  return s.slice(0, 5);
};

const toDateTime = (bookingDate, startTime = "00:00") => {
  if (!bookingDate) return null;
  const time = formatTimeHHMM(startTime) || "00:00";
  const value = new Date(`${bookingDate}T${time}:00`);
  return Number.isNaN(value.getTime()) ? null : value;
};

const getStartOfDay = (date = new Date()) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const getCurrentWeekRange = (date = new Date()) => {
  const start = getStartOfDay(date);
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diff);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

const isActiveBookingStatus = (status) => !["cancelled", "rejected"].includes(safeLower(status));

const filterBookingsInRange = (bookings = [], start, end) =>
  safeArray(bookings).filter((booking) => {
    const dt = toDateTime(booking.bookingDate, booking.startTime);
    if (!dt || !isActiveBookingStatus(booking.status)) return false;
    return (!start || dt >= start) && (!end || dt <= end);
  });

const getUpcomingBookings = (bookings = [], { limit = 5 } = {}) => {
  const now = new Date();
  return filterBookingsInRange(bookings, now, null).slice(0, limit);
};

const getBookingsThisWeek = (bookings = [], date = new Date()) => {
  const { start, end } = getCurrentWeekRange(date);
  return filterBookingsInRange(bookings, start, end);
};

const formatBookingLine = (booking) =>
  `- ${formatDateVN(booking.bookingDate)} lúc ${formatTimeHHMM(booking.startTime)} với ${booking.trainerName}${
    booking.gymName ? ` tại ${booking.gymName}` : ""
  }`;

const pickImageUrl = (...values) => {
  for (const value of values) {
    if (!value) continue;

    if (typeof value === "string" && value.trim()) return value.trim();

    if (Array.isArray(value)) {
      const first = value.find((item) => {
        if (!item) return false;
        if (typeof item === "string") return item.trim();
        return item.url || item.imageUrl || item.secure_url;
      });

      if (typeof first === "string" && first.trim()) return first.trim();
      if (first?.url) return first.url;
      if (first?.imageUrl) return first.imageUrl;
      if (first?.secure_url) return first.secure_url;
    }

    if (typeof value === "object") {
      if (value.url) return value.url;
      if (value.imageUrl) return value.imageUrl;
      if (value.secure_url) return value.secure_url;
    }
  }
  return null;
};

const classifyBmi = (bmi) => {
  if (!Number.isFinite(bmi)) return { code: "unknown", label: "chưa xác định" };
  if (bmi < 18.5) return { code: "underweight", label: "thiếu cân" };
  if (bmi < 25) return { code: "normal", label: "bình thường" };
  if (bmi < 30) return { code: "overweight", label: "thừa cân" };
  return { code: "obese", label: "béo phì" };
};

const computeBmi = ({ heightCm, weightKg }) => {
  if (!heightCm || !weightKg) return null;
  const h = Number(heightCm) / 100;
  const w = Number(weightKg);
  if (!Number.isFinite(h) || !Number.isFinite(w) || h <= 0 || w <= 0) return null;

  const bmi = Number((w / (h * h)).toFixed(1));
  return {
    heightCm: Number(heightCm),
    weightKg: Number(weightKg),
    bmi,
    classification: classifyBmi(bmi),
  };
};

const parseHeightCm = (text) => {
  const source = safeLower(text).replace(/,/g, ".");
  const cm = source.match(/(?:cao|height)?\s*(\d{3})\s*cm\b/);
  if (cm) return Number(cm[1]);

  const meterCompact = source.match(/\b1m(\d{2})\b/);
  if (meterCompact) return 100 + Number(meterCompact[1]);

  const meter = source.match(/(?:cao|height)?\s*(1(?:\.\d{1,2})?)\s*m\b/);
  if (meter) return Math.round(Number(meter[1]) * 100);

  return null;
};

const parseWeightKg = (text) => {
  const source = safeLower(text).replace(/,/g, ".");
  const kg = source.match(/(?:nang|can nang|cannang|weight)?\s*(\d{2,3}(?:\.\d+)?)\s*kg\b/);
  if (kg) return Number(kg[1]);
  return null;
};

const parseGoal = (text) => {
  const lower = normalize(text);

  if (["giam can", "giam mo", "dot mo", "lean", "xuong mo", "siet"].some((w) => lower.includes(w))) {
    return "Giảm mỡ";
  }

  if (["tang can", "len can"].some((w) => lower.includes(w))) return "Tăng cân";
  if (["tang co", "muscle", "suc manh", "co bap"].some((w) => lower.includes(w))) return "Tăng cơ";

  if (["suc khoe", "khoe", "fit", "nguoi moi", "bat dau", "cai thien suc khoe"].some((w) => lower.includes(w))) {
    return "Cải thiện sức khỏe";
  }

  return null;
};

const extractBmiContext = ({ message, history = [], privateContext }) => {
  const candidateTexts = [...safeArray(history).map((x) => x?.content), message].filter(Boolean);
  let heightCm = null;
  let weightKg = null;
  let goal = null;

  for (let i = candidateTexts.length - 1; i >= 0; i -= 1) {
    const text = candidateTexts[i];
    if (!heightCm) heightCm = parseHeightCm(text);
    if (!weightKg) weightKg = parseWeightKg(text);
    if (!goal) goal = parseGoal(text);
    if (heightCm && weightKg && goal) break;
  }

  const latestMetric = privateContext?.profile?.latestMetric || null;

  if (!heightCm && latestMetric?.heightCm) heightCm = Number(latestMetric.heightCm);
  if (!weightKg && latestMetric?.weightKg) weightKg = Number(latestMetric.weightKg);

  if (heightCm && weightKg) {
    return {
      ...computeBmi({ heightCm, weightKg }),
      goal: goal || null,
      source: "message_or_history",
    };
  }

  if (latestMetric?.bmi) {
    return {
      heightCm: latestMetric?.heightCm ? Number(latestMetric.heightCm) : null,
      weightKg: latestMetric?.weightKg ? Number(latestMetric.weightKg) : null,
      bmi: Number(Number(latestMetric.bmi).toFixed(1)),
      classification: classifyBmi(Number(latestMetric.bmi)),
      goal: goal || null,
      source: "member_metric",
    };
  }

  return null;
};

const buildBmiSummaryLine = (bmiContext) => {
  if (!bmiContext?.bmi) return null;

  const parts = [
    `BMI hiện tại của bạn là ${bmiContext.bmi}`,
    `thuộc nhóm ${bmiContext.classification?.label || "chưa xác định"}`,
  ];

  if (bmiContext.weightKg) parts.push(`cân nặng ${bmiContext.weightKg} kg`);
  if (bmiContext.heightCm) parts.push(`chiều cao ${bmiContext.heightCm} cm`);

  return `${parts.join(", ")}.`;
};

const nutritionAdvice = (bmiContext) => {
  if (!bmiContext?.bmi) {
    return "Bạn nên ưu tiên ăn đủ đạm, rau xanh, tinh bột tốt và uống đủ nước. Nếu có chiều cao, cân nặng hoặc BMI, mình sẽ gợi ý sát hơn.";
  }

  const goal = bmiContext.goal;
  const code = bmiContext.classification?.code;

  if (goal === "Tăng cân" || code === "underweight") {
    return `${buildBmiSummaryLine(
      bmiContext
    )} Bạn nên tăng cân sạch: 3 bữa chính + 2 bữa phụ, ưu tiên cơm, yến mạch, khoai, trứng, sữa, thịt nạc, cá, đậu và trái cây.`;
  }

  if (goal === "Giảm mỡ" || code === "overweight" || code === "obese") {
    return `${buildBmiSummaryLine(
      bmiContext
    )} Bạn nên kiểm soát calo hơn: giữ đạm cao, rau xanh nhiều, tinh bột vừa phải, hạn chế nước ngọt, đồ chiên và ăn khuya.`;
  }

  if (goal === "Tăng cơ") {
    return `${buildBmiSummaryLine(
      bmiContext
    )} Để tăng cơ, bạn nên giữ đạm ổn định mỗi ngày, thêm tinh bột tốt quanh buổi tập và ngủ đủ.`;
  }

  return `${buildBmiSummaryLine(
    bmiContext
  )} Với thể trạng hiện tại, bạn nên ăn cân bằng: đủ protein, rau xanh, tinh bột tốt và nước.`;
};

const workoutAdvice = (bmiContext) => {
  if (!bmiContext?.bmi) {
    return "Nếu mới bắt đầu, bạn có thể tập 3 buổi mỗi tuần với bài toàn thân, thêm 1-2 buổi đi bộ nhanh hoặc cardio nhẹ.";
  }

  const goal = bmiContext.goal;
  const code = bmiContext.classification?.code;

  if (goal === "Tăng cân" || code === "underweight") {
    return `${buildBmiSummaryLine(
      bmiContext
    )} Bạn nên ưu tiên tập tạ toàn thân 3-4 buổi mỗi tuần, tập trung squat, press, row và hạn chế cardio quá nhiều.`;
  }

  if (goal === "Giảm mỡ" || code === "overweight" || code === "obese") {
    return `${buildBmiSummaryLine(
      bmiContext
    )} Bạn nên kết hợp 3 buổi strength + 2 buổi cardio nhẹ mỗi tuần.`;
  }

  if (goal === "Tăng cơ") {
    return `${buildBmiSummaryLine(
      bmiContext
    )} Bạn có thể bắt đầu 4 buổi mỗi tuần theo upper/lower hoặc ngực-lưng-chân-vai tay.`;
  }

  return `${buildBmiSummaryLine(
    bmiContext
  )} Bạn có thể bắt đầu 3 buổi mỗi tuần với full-body hoặc upper/lower nhẹ.`;
};

const gymReason = (bmiContext) => {
  const code = bmiContext?.classification?.code;

  if (bmiContext?.goal === "Giảm mỡ" || code === "overweight" || code === "obese") {
    return "hợp cho mục tiêu giảm mỡ và xây nền thể lực";
  }

  if (bmiContext?.goal === "Tăng cân" || code === "underweight") {
    return "hợp để tăng cân và phát triển sức mạnh cơ bản";
  }

  if (bmiContext?.goal === "Tăng cơ") return "hợp để tăng cơ và tập tạ đều";

  return "phù hợp để bắt đầu với thể trạng hiện tại";
};

const JUNK_NAME_RE = /(test|demo|sample|request|fake|tmp|123|abc|vjp|zzz|nhap|thu nghiem)/i;
const JUNK_ADDRESS_RE = /^(dn|f|x|test|demo)$/i;

const isLikelyValidGym = (gym) => {
  const name = safeText(gym?.name);
  const address = safeText(gym?.address);

  if (name.length < 4) return false;
  if (/^\d+$/.test(name)) return false;
  if (JUNK_NAME_RE.test(name)) return false;
  if (!address || address.length < 4) return false;
  if (JUNK_ADDRESS_RE.test(address)) return false;

  return true;
};

const isLikelyValidPackage = (pkg) => {
  const name = safeText(pkg?.name);

  if (name.length < 4) return false;
  if (JUNK_NAME_RE.test(name)) return false;

  if (!isLikelyValidGym({ name: pkg?.gymName || "Gym", address: pkg?.gymAddress || pkg?.gymName || "address" })) {
    return false;
  }

  return true;
};

const isLikelyValidTrainer = (trainer) => {
  const name = safeText(trainer?.name);
  if (name.length < 2) return false;
  if (JUNK_NAME_RE.test(name)) return false;
  return true;
};

const summarizeGyms = (rows) =>
  safeArray(rows)
    .map((x) => ({
      id: x.id,
      name: x.name,
      address: x.address,
      status: x.status,
      images: x.images || [],
      imageUrl: pickImageUrl(x.imageUrl, x.thumbnail, x.coverImage, x.images),
    }))
    .filter(isLikelyValidGym)
    .slice(0, 18);

const summarizeTrainers = (rows) =>
  safeArray(rows)
    .map((x) => ({
      id: x.id,
      name: x?.User?.username || x?.username || `PT #${x.id}`,
      specialization: Array.isArray(x.specialization) ? x.specialization.join(", ") : safeText(x.specialization),
      rating: x.rating,
      gymId: x.gymId,
      imageUrl: pickImageUrl(x.imageUrl, x.avatar, x.photo, x?.User?.image, x?.User?.avatar),
    }))
    .filter(isLikelyValidTrainer)
    .slice(0, 24);

const summarizePackages = (rows) =>
  safeArray(rows)
    .map((x) => ({
      id: x.id,
      name: x.name,
      type: x.type,
      sessions: x.sessions,
      price: x.price,
      gymId: x.gymId,
      gymName: x?.Gym?.name || null,
      gymAddress: x?.Gym?.address || null,
      trainerId: x?.trainerId || null,
      description: x?.description || "",
      durationDays: x?.durationDays || null,
      imageUrl: pickImageUrl(x.imageUrl, x.thumbnail, x.coverImage, x?.Gym?.imageUrl, x?.Gym?.images),
    }))
    .filter(isLikelyValidPackage)
    .slice(0, 40);

const summarizeMyPackages = (rows) =>
  safeArray(rows)
    .slice(0, 12)
    .map((x) => ({
      activationId: Number(x?.id) || null,
      packageId: Number(x?.packageId || x?.Package?.id || 0) || null,
      packageName: x?.Package?.name || x?.name || "Gói tập",
      packageType: x?.Package?.type || "",
      gymId: Number(x?.gymId || x?.Gym?.id || 0) || null,
      gymName: x?.Gym?.name || "",
      status: x?.status || "",
      totalSessions: Number(x?.totalSessions || x?.Package?.sessions || 0),
      sessionsUsed: Number(x?.sessionsUsed || 0),
      sessionsRemaining:
        x?.sessionsRemaining != null
          ? Number(x.sessionsRemaining)
          : Math.max(0, Number(x?.totalSessions || x?.Package?.sessions || 0) - Number(x?.sessionsUsed || 0)),
      expiryDate: x?.expiryDate || null,
      trainerId: Number(x?.Package?.trainerId || 0) || null,
    }));

const summarizeBookings = (rows) =>
  safeArray(rows)
    .map((x) => ({
      id: x.id,
      bookingDate: x.bookingDate,
      startTime: x.startTime,
      endTime: x.endTime,
      status: x.status,
      trainerId: x?.trainerId || x?.Trainer?.id || null,
      trainerName: x?.Trainer?.User?.username || `PT #${x?.trainerId || "?"}`,
      packageName: x?.Package?.name || "",
      gymName: x?.Gym?.name || "",
    }))
    .sort((a, b) => {
      const da = toDateTime(a.bookingDate, a.startTime)?.getTime() || 0;
      const db = toDateTime(b.bookingDate, b.startTime)?.getTime() || 0;
      return da - db;
    });

const buildGymCards = (gyms, bmiContext) => ({
  type: "gym_list",
  title: "Gym phù hợp",
  items: safeArray(gyms)
    .slice(0, 8)
    .map((gym) => ({
      id: gym.id,
      title: gym.name,
      subtitle: gym.address || "",
      meta: gymReason(bmiContext),
      tags: [gym.address].filter(Boolean),
      imageUrl: gym.imageUrl || null,
      badge: gym.status === "active" ? "Đang hoạt động" : safeText(gym.status),
      actionLabel: "Xem gym",
      action: buildNavigateAction(`/marketplace/gyms/${gym.id}`, "Xem gym"),
    })),
});

const buildPackageCards = (packages, bmiContext, preferredTrainer = null, selectedDate = null) => ({
  type: "package_list",
  title: "Gói tập phù hợp",
  items: safeArray(packages)
    .slice(0, 8)
    .map((pkg) => ({
      id: pkg.id,
      title: pkg.name,
      subtitle: pkg.gymName || "Gói tập",
      meta: [
        pkg.sessions ? `${pkg.sessions} buổi` : null,
        formatMoney(pkg.price),
        pkg.durationDays ? `${pkg.durationDays} ngày` : null,
      ]
        .filter(Boolean)
        .join(" • "),
      tags: [pkg.type || "Gói PT", bmiContext?.goal ? `Hợp ${bmiContext.goal.toLowerCase()}` : null].filter(Boolean),
      imageUrl: pkg.imageUrl || null,
      badge: pkg.type || "PT package",
      actionLabel: preferredTrainer ? "Chọn gói này" : "Xem gói",
      action: preferredTrainer
        ? buildSelectPackageAction(pkg, preferredTrainer, selectedDate, pkg?.activationId || null)
        : buildNavigateAction(`/marketplace/packages/${pkg.id}`, "Xem gói"),
    })),
});

const buildTrainerCards = (rows) => ({
  type: "trainer_list",
  title: "PT phù hợp",
  items: safeArray(rows)
    .slice(0, 8)
    .map((row) => ({
      id: row.id,
      title: row.name,
      subtitle: row.packageName || row.gymName || "PT cá nhân",
      meta: [row.specialization, row.helperText, row.rating ? `★ ${row.rating}` : null].filter(Boolean).join(" • "),
      tags: [row.gymName, row.packageName].filter(Boolean),
      imageUrl: row.imageUrl || null,
      badge: row.gymName || null,
      actionLabel: row.activationId ? "Chọn PT này" : "Xem PT",
      action: row.activationId
        ? buildSelectTrainerAction(
            {
              id: row.id,
              name: row.name,
              gymId: row.gymId || null,
              gymName: row.gymName || null,
            },
            {
              packageId: row.packageId || null,
              packageName: row.packageName || null,
              gymId: row.gymId || null,
              gymName: row.gymName || null,
              activationId: row.activationId || null,
            }
          )
        : buildNavigateAction(`/marketplace/trainers/${row.id}`, "Xem PT"),
    })),
});

const parseDateFromMessage = (message) => {
  const source = safeText(message);
  const lower = normalize(message);

  const today = addDaysLocal(new Date(), 0);
  const tomorrow = addDaysLocal(new Date(), 1);
  const dayAfterTomorrow = addDaysLocal(new Date(), 2);

  if (lower.includes("hom nay")) return toISODateLocal(today);
  if (lower.includes("ngay mai") || lower === "mai" || lower.includes(" mai ")) return toISODateLocal(tomorrow);
  if (lower.includes("ngay kia") || lower.includes("mot")) return toISODateLocal(dayAfterTomorrow);

  const iso = source.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) {
    const [, y, m, d] = iso;
    return `${y}-${pad2(m)}-${pad2(d)}`;
  }

  const fullSlash = source.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (fullSlash) {
    const [, d, m, y] = fullSlash;
    return `${y}-${pad2(m)}-${pad2(d)}`;
  }

  const fullDash = source.match(/\b(\d{1,2})-(\d{1,2})-(\d{4})\b/);
  if (fullDash) {
    const [, d, m, y] = fullDash;
    return `${y}-${pad2(m)}-${pad2(d)}`;
  }

  const shortSlash = source.match(/\b(?:ngày|ngay)?\s*(\d{1,2})\/(\d{1,2})\b/i);
  if (shortSlash) {
    const [, d, m] = shortSlash;
    let year = today.getFullYear();
    const candidate = new Date(year, Number(m) - 1, Number(d), 12, 0, 0, 0);
    if (candidate < today) year += 1;
    return `${year}-${pad2(m)}-${pad2(d)}`;
  }

  const shortDash = source.match(/\b(?:ngày|ngay)?\s*(\d{1,2})-(\d{1,2})\b/i);
  if (shortDash) {
    const [, d, m] = shortDash;
    let year = today.getFullYear();
    const candidate = new Date(year, Number(m) - 1, Number(d), 12, 0, 0, 0);
    if (candidate < today) year += 1;
    return `${year}-${pad2(m)}-${pad2(d)}`;
  }

  const textMonth = lower.match(/\b(\d{1,2})\s*thang\s*(\d{1,2})\b/);
  if (textMonth) {
    const [, d, m] = textMonth;
    let year = today.getFullYear();
    const candidate = new Date(year, Number(m) - 1, Number(d), 12, 0, 0, 0);
    if (candidate < today) year += 1;
    return `${year}-${pad2(m)}-${pad2(d)}`;
  }

  return null;
};

const parseTimeFromMessage = (message) => {
  const source = safeText(message);

  const hhmm = source.match(/\b(\d{1,2}:\d{2})\b/);
  if (hhmm) return hhmm[1].padStart(5, "0");

  const hh = source.match(/\b(\d{1,2})h\b/i);
  if (hh) return `${String(hh[1]).padStart(2, "0")}:00`;

  return null;
};

const scoreIntent = (lower, patterns) => patterns.reduce((acc, p) => acc + (p.test(lower) ? 1 : 0), 0);

const INTENT_PATTERNS = {
  member_package: [/\bgoi cua toi\b/, /\bgoi hien tai\b/, /\bcon bao nhieu buoi\b/, /\bcon bao nhieu session\b/, /\bpackage cua toi\b/],
  member_schedule: [/\blich sap toi\b/, /\blich cua toi\b/, /\bmai co lich\b/, /\bbuoi tiep theo\b/, /\bnhac lich\b/, /\btuan nay.*lich\b/],
  booking: [/\bdat lich\b/, /\bbooking\b/, /\bbook\b/, /\bslot\b/, /\bxac nhan dat lich\b/],
  bmi: [/\bbmi\b/, /\bchi so\b/, /\b\d{3}\s*cm\b/, /\b\d{2,3}\s*kg\b/, /\b1m\d{2}\b/],
  nutrition: [/\ban gi\b/, /\bnen an\b/, /\bco the an\b/, /\bdinh duong\b/, /\bthuc don\b/, /\bbo sung\b/, /\bkieng\b/],
  workout: [/\btap gi\b/, /\blich tap\b/, /\bcardio\b/, /\bbai tap\b/, /\btap sao\b/],
  gym: [/\bgym nao\b/, /\bgoi y gym\b/, /\bgym phu hop\b/, /\bphong gym\b/, /\bcho tap\b/, /\bco so nao\b/, /\bgym\b/],
  package: [/\bgoi nao\b/, /\bgoi tap\b/, /\bmua goi\b/, /\bgoi phu hop\b/, /\bpackage\b/, /\bcombo\b/, /\bplan\b/],
  trainer: [/\bpt nao\b/, /\btrainer nao\b/, /\bhuan luyen vien\b/, /\bai kem toi\b/, /\bpt hop\b/, /\bhlv\b/],
};

const inferIntent = (message, isAuthed = false) => {
  const lower = normalize(message);
  if (!lower) return "general";

  const scored = Object.entries(INTENT_PATTERNS)
    .map(([intent, patterns]) => ({ intent, score: scoreIntent(lower, patterns) }))
    .sort((a, b) => b.score - a.score);

  const top = scored[0];
  if (!top || top.score <= 0) return "general";

  if (!isAuthed && ["member_package", "member_schedule", "booking"].includes(top.intent)) {
    return top.intent === "booking" ? "booking" : "general";
  }

  return top.intent;
};

const inferIntentFromFollowUp = ({ message, history = [], isAuthed, bookingContextFromClient = null }) => {
  const normalizedMessage = normalize(message);
  const recentText = getRecentHistoryText(history);

  if (!normalizedMessage) return null;

  const hasBookingMemory =
    !!bookingContextFromClient?.trainerId ||
    !!bookingContextFromClient?.trainerName ||
    !!bookingContextFromClient?.packageId ||
    !!bookingContextFromClient?.packageName ||
    recentText.includes("dat lich") ||
    recentText.includes("slot") ||
    recentText.includes("goi phu hop") ||
    recentText.includes("pt");

  if (
    isAuthed &&
    hasBookingMemory &&
    (parseDateFromMessage(message) ||
      parseTimeFromMessage(message) ||
      /(gio|luc|khung gio|mai|ngay mai|hom nay|doi gio|doi ngay|gói này|goi nay|pt nay|pt kia|\d{1,2}\/\d{1,2}|\d{1,2}-\d{1,2})/.test(
        normalizedMessage
      ))
  ) {
    return "booking";
  }

  if (
    isAuthed &&
    /(tat ca|ca tuan|full tuan|trong tuan|liet ke|het lich|all ngay|tat ca cac ngay|ca ngay)/.test(normalizedMessage) &&
    recentText.includes("lich")
  ) {
    return "member_schedule";
  }

  if (isAuthed && /(goi hien tai|goi do|goi nay|goi cua toi)/.test(normalizedMessage) && recentText.includes("goi")) {
    return "member_package";
  }

  if (/(an gi|nen an gi|thuc don|bo sung gi)/.test(normalizedMessage) && recentText.includes("bmi")) {
    return "nutrition";
  }

  return null;
};

const detectNavigationIntent = (message, isAuthed) => {
  const lower = normalize(message);

  if (isAuthed && ["mo goi cua toi", "vao goi cua toi", "mo trang goi"].some((w) => lower.includes(w))) {
    return buildNavigateAction("/member/my-packages", "Mở gói của tôi");
  }

  if (isAuthed && ["mo lich cua toi", "vao lich cua toi", "mo trang lich", "mo lich", "xem lich"].some((w) => lower.includes(w))) {
    return buildNavigateAction("/member/bookings", "Mở lịch của tôi");
  }

  if (isAuthed && ["mo tien do", "vao tien do", "trang tien do"].some((w) => lower.includes(w))) {
    return buildNavigateAction("/member/progress", "Mở tiến độ");
  }

  if (["dang ky", "tao tai khoan", "register", "sign up"].some((w) => lower.includes(w))) {
    return buildNavigateAction("/register", "Đăng ký");
  }

  if (["dang nhap", "login", "log in", "vao he thong", "vo he thong"].some((w) => lower.includes(w))) {
    return buildNavigateAction("/login", "Đăng nhập");
  }

  if (["vao website gfms", "trang chu", "trang web gfms", "website gfms", "ve trang chu"].some((w) => lower.includes(w))) {
    return buildNavigateAction("/", "Về trang chủ");
  }

  return null;
};

const extractLocationHints = (text) => {
  const source = normalize(text);
  if (!source) return [];

  const hints = new Set();

  const cityAliases = {
    "da nang": ["da nang", "danang", "dn"],
    "ho chi minh": ["ho chi minh", "hcm", "tp hcm", "tphcm", "sai gon", "saigon"],
    "ha noi": ["ha noi", "hn"],
    "can tho": ["can tho"],
    "hai phong": ["hai phong"],
    "nha trang": ["nha trang"],
    "quy nhon": ["quy nhon"],
    hue: ["hue"],
  };

  Object.entries(cityAliases).forEach(([canonical, aliases]) => {
    if (aliases.some((alias) => source.includes(alias))) hints.add(canonical);
  });

  const areaRegex = /(?:quan|huyen|phuong|xa)\s+[a-z0-9]+(?:\s+[a-z0-9]+){0,2}/g;
  for (const match of source.match(areaRegex) || []) hints.add(match.trim());

  return [...hints];
};

const buildGymSearchNeedle = (gym) =>
  normalize([gym?.name, gym?.address, gym?.city, gym?.district, gym?.ward, gym?.description].filter(Boolean).join(" "));

const buildPublicContext = async () => {
  const [gymsRes, trainersRes, packagesRes] = await Promise.allSettled([
    marketplaceService.listGyms({ limit: 24 }),
    marketplaceService.listTrainers({ limit: 24 }),
    marketplaceService.listPackages({ limit: 24 }),
  ]);

  return {
    gyms: gymsRes.status === "fulfilled" ? summarizeGyms(unwrapListResult(gymsRes.value)) : [],
    trainers: trainersRes.status === "fulfilled" ? summarizeTrainers(unwrapListResult(trainersRes.value)) : [],
    packages: packagesRes.status === "fulfilled" ? summarizePackages(unwrapListResult(packagesRes.value)) : [],
  };
};

const buildPrivateContext = async (userId) => {
  if (!userId) return null;

  const [profileRes, packagesRes, bookingsRes] = await Promise.allSettled([
    memberProfileService.getMyProfile(userId),
    memberMyPackageService.getMyPackages(userId),
    bookingService.getMyBookings(userId),
  ]);

  return {
    profile: profileRes.status === "fulfilled" ? profileRes.value : null,
    myPackages: packagesRes.status === "fulfilled" ? summarizeMyPackages(packagesRes.value) : [],
    myBookings: bookingsRes.status === "fulfilled" ? summarizeBookings(bookingsRes.value) : [],
  };
};

const recommendGyms = (publicContext, message, bmiContext) => {
  const gyms = safeArray(publicContext?.gyms);
  if (!gyms.length) return [];

  const lower = normalize(message);
  const locationHints = extractLocationHints(message);

  const rows = gyms
    .map((gym) => {
      const hay = buildGymSearchNeedle(gym);
      let score = 0;

      if (safeLower(gym.status) === "active") score += 50;
      else score -= 100;

      if (locationHints.length && locationHints.some((hint) => hay.includes(hint))) score += 40;
      if (!locationHints.length) score += 5;

      const cleanedNeedle = lower
        .replace(/\bgym\b/g, " ")
        .replace(/\bphong tap\b/g, " ")
        .replace(/\bcho tap\b/g, " ")
        .replace(/\bgiup minh\b/g, " ")
        .replace(/\bcho minh\b/g, " ")
        .replace(/\btim\b/g, " ")
        .replace(/\bgoi y\b/g, " ")
        .trim();

      if (cleanedNeedle && hay.includes(cleanedNeedle)) score += 20;
      if (bmiContext?.goal) score += 5;
      if (hay.includes("japan") && locationHints.length) score -= 120;

      return { ...gym, score };
    })
    .filter((gym) => gym.score > -50)
    .sort((a, b) => b.score - a.score || String(a.name).localeCompare(String(b.name)));

  const activeRows = rows.filter((gym) => safeLower(gym.status) === "active");
  return (activeRows.length ? activeRows : rows).slice(0, 8);
};

const recommendPackages = (publicContext, bmiContext) => {
  const packages = safeArray(publicContext?.packages);
  if (!packages.length) return [];

  return packages
    .filter((pkg) => pkg.gymName)
    .sort((a, b) => {
      const aPrice = safeNumber(a.price, 999999999);
      const bPrice = safeNumber(b.price, 999999999);
      const aSessions = safeNumber(a.sessions, 999);
      const bSessions = safeNumber(b.sessions, 999);
      return aPrice - bPrice || aSessions - bSessions || String(a.name).localeCompare(String(b.name));
    })
    .slice(0, 8);
};

const recommendTrainersByPackages = (publicContext, privateContext, bmiContext, message = "") => {
  const trainers = safeArray(publicContext?.trainers);
  const packages = safeArray(publicContext?.packages);
  const lower = normalize(message);
  const goal = safeLower(bmiContext?.goal || "");

  const activePkg =
    safeArray(privateContext?.myPackages).find((x) => safeLower(x.status) === "active") || safeArray(privateContext?.myPackages)[0] || null;

  const matchedPackages = activePkg ? packages.filter((pkg) => Number(pkg.gymId) === Number(activePkg.gymId)) : packages;

  const rows = matchedPackages
    .map((pkg) => {
      const trainer = trainers.find((t) => Number(t.id) === Number(pkg.trainerId)) || null;
      if (!trainer) return null;

      const searchHay = normalize(`${trainer.name} ${trainer.specialization} ${pkg.name} ${pkg.gymName}`);
      let score = 0;

      if (activePkg && Number(activePkg.gymId) === Number(pkg.gymId)) score += 40;
      if (safeNumber(trainer.rating, 0) > 0) score += safeNumber(trainer.rating, 0) * 10;
      if (goal && searchHay.includes(goal)) score += 18;
      if (goal.includes("tang can") && /(strength|bulking|mass|tang can|tang co|co bap|suc manh)/.test(searchHay)) score += 18;
      if (goal.includes("giam") && /(fat|cardio|giam|lean)/.test(searchHay)) score += 18;

      const cleanedNeedle = lower.replace(/\b(pt|huan luyen vien|trainer)\b/g, "").trim();
      if (cleanedNeedle && searchHay.includes(cleanedNeedle)) score += 10;

      return {
        id: trainer.id,
        name: trainer.name,
        specialization: trainer.specialization || "PT cá nhân",
        rating: trainer.rating,
        packageName: pkg.name,
        packageId: pkg.id,
        gymId: pkg.gymId,
        gymName: pkg.gymName,
        activationId: activePkg && Number(activePkg.gymId) === Number(pkg.gymId) ? activePkg.activationId : null,
        helperText:
          activePkg && Number(activePkg.gymId) === Number(pkg.gymId)
            ? "có thể đi tiếp sang gym detail để đặt lịch"
            : "đi kèm gói tập của gym này",
        imageUrl: trainer.imageUrl || null,
        score,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || String(a.name).localeCompare(String(b.name)));

  if (rows.length) return rows.slice(0, 8);

  return trainers
    .map((trainer) => ({
      id: trainer.id,
      name: trainer.name,
      specialization: trainer.specialization || "PT cá nhân",
      rating: trainer.rating,
      gymId: trainer.gymId || null,
      gymName: null,
      packageName: null,
      packageId: null,
      activationId: null,
      helperText: bmiContext?.goal ? `hợp mục tiêu ${bmiContext.goal.toLowerCase()}` : "cần chọn gym hoặc gói trước",
      imageUrl: trainer.imageUrl || null,
      score:
        safeNumber(trainer.rating, 0) * 10 + (goal && normalize(`${trainer.name} ${trainer.specialization}`).includes(goal) ? 15 : 0),
    }))
    .sort((a, b) => b.score - a.score || String(a.name).localeCompare(String(b.name)))
    .slice(0, 8);
};

const replyForMemberPackage = (privateContext) => {
  const first = safeArray(privateContext?.myPackages).find((x) => safeLower(x.status) === "active") || safeArray(privateContext?.myPackages)[0];

  if (!first) {
    return {
      reply: "Hiện tại bạn chưa có gói active. Muốn đặt lịch PT, bạn cần mua gói tập của gym trước rồi mới chọn PT thuộc gói đó.",
      suggestions: [],
      actions: [buildNavigateAction("/marketplace/gyms", "Xem gym")],
    };
  }

  return {
    reply: `Bạn đang có gói ${first.packageName}${first.gymName ? ` tại ${first.gymName}` : ""}. Bạn còn ${first.sessionsRemaining} buổi, đã dùng ${first.sessionsUsed}/${first.totalSessions}. Hạn dùng đến ${formatDateVN(first.expiryDate)}.`,
    suggestions: [],
    actions: [buildNavigateAction("/member/my-packages", "Xem gói của tôi")],
  };
};

const replyForMemberSchedule = (message, privateContext, history = []) => {
  const normalizedMessage = `${normalize(message)} ${getRecentHistoryText(history, 3)}`.trim();
  const bookings = safeArray(privateContext?.myBookings);
  const weekBookings = getBookingsThisWeek(bookings);
  const upcoming = getUpcomingBookings(bookings, { limit: 5 });

  const asksThisWeek = ["tuan nay", "trong tuan", "full tuan", "ca tuan", "tat ca cac ngay trong tuan"].some((x) =>
    normalizedMessage.includes(x)
  );
  const asksToday = normalizedMessage.includes("hom nay");
  const asksTomorrow = normalizedMessage.includes("ngay mai") || normalizedMessage === "mai";

  if (asksThisWeek) {
    if (!weekBookings.length) {
      return {
        reply: "Tuần này mình chưa thấy lịch tập nào đã xác nhận của bạn.",
        suggestions: [],
        actions: [buildNavigateAction("/member/bookings", "Mở lịch của tôi")],
      };
    }

    return {
      reply: [`Tuần này bạn có ${weekBookings.length} buổi tập đã xác nhận:`, ...weekBookings.map(formatBookingLine)].join("\n"),
      suggestions: [],
      actions: [buildNavigateAction("/member/bookings", "Mở lịch của tôi")],
    };
  }

  if (asksToday || asksTomorrow) {
    const target = asksTomorrow ? addDaysLocal(new Date(), 1) : new Date();
    const start = getStartOfDay(target);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);

    const rows = filterBookingsInRange(bookings, start, end);

    if (!rows.length) {
      return {
        reply: `${asksTomorrow ? "Ngày mai" : "Hôm nay"} bạn chưa có lịch tập nào đã xác nhận.`,
        suggestions: [],
        actions: [buildNavigateAction("/member/bookings", "Mở lịch của tôi")],
      };
    }

    return {
      reply: [`${asksTomorrow ? "Ngày mai" : "Hôm nay"} bạn có ${rows.length} buổi tập:`, ...rows.map(formatBookingLine)].join("\n"),
      suggestions: [],
      actions: [buildNavigateAction("/member/bookings", "Mở lịch của tôi")],
    };
  }

  const upcomingBooking = upcoming[0] || null;
  if (!upcomingBooking) {
    return {
      reply: "Hiện mình chưa thấy buổi tập sắp tới nào của bạn. Khi muốn đặt lịch, bạn chọn gym phù hợp trước, sau đó chọn gói và PT đi kèm.",
      suggestions: [],
      actions: [buildNavigateAction("/marketplace/gyms", "Xem gym")],
    };
  }

  return {
    reply: `Buổi gần nhất của bạn là ${formatDateVN(upcomingBooking.bookingDate)} lúc ${formatTimeHHMM(upcomingBooking.startTime)} với ${upcomingBooking.trainerName}${upcomingBooking.gymName ? ` tại ${upcomingBooking.gymName}` : ""}.`,
    suggestions: [],
    actions: [buildNavigateAction("/member/bookings", "Mở lịch của tôi")],
  };
};

const resolvePreferredTrainer = (message, publicContext) => {
  const trainers = safeArray(publicContext?.trainers);
  const lower = normalize(message);

  return (
    trainers.find((trainer) => {
      const name = normalize(trainer?.name || "");
      return name && lower.includes(name);
    }) || null
  );
};

const resolveTrainerFromMessage = (message, trainerRows) => {
  const lower = normalize(message);
  return safeArray(trainerRows).find((t) => lower.includes(normalize(t?.User?.username || t?.name || t?.username || ""))) || null;
};

const findPackageFromText = (text, publicContext) => {
  const lower = normalize(text);
  return safeArray(publicContext?.packages).find((pkg) => {
    const name = normalize(pkg?.name || "");
    return name && lower.includes(name);
  }) || null;
};

const extractBookingContextFromHistory = ({
  message,
  history = [],
  publicContext,
  bookingContextFromClient = null,
}) => {
  const texts = [...safeArray(history).map((x) => safeText(x?.content)), safeText(message)].filter(Boolean);

  let trainer = findTrainerInCollection(publicContext?.trainers, bookingContextFromClient);
  let packageMatch = findPackageInCollection(publicContext?.packages, bookingContextFromClient);
  let date = bookingContextFromClient?.selectedDate || null;
  let time = bookingContextFromClient?.selectedTime || null;

  for (let i = texts.length - 1; i >= 0; i -= 1) {
    const text = texts[i];

    if (!trainer) trainer = resolvePreferredTrainer(text, publicContext);
    if (!packageMatch) packageMatch = findPackageFromText(text, publicContext);
    if (!date) date = parseDateFromMessage(text);
    if (!time) time = parseTimeFromMessage(text);

    if (trainer && packageMatch && date && time) break;
  }

  return {
    trainer,
    packageMatch,
    date,
    time,
  };
};

const buildGeneralReply = (isAuthed, bmiContext) => {
  const shortHealthHint = bmiContext?.bmi ? buildBmiSummaryLine(bmiContext) : null;

  if (isAuthed) {
    return {
      reply: shortHealthHint
        ? `${shortHealthHint} Mình có thể hỗ trợ thêm về lịch, gói tập, PT, ăn uống hoặc mục tiêu tập luyện của bạn.`
        : "Mình đang ở đây. Bạn cứ hỏi tự nhiên, mình sẽ trả lời đúng trọng tâm và bám dữ liệu hệ thống khi cần.",
      suggestions: [],
    };
  }

  return {
    reply: shortHealthHint
      ? `${shortHealthHint} Nếu bạn muốn, mình có thể tư vấn thêm về ăn uống, lịch tập hoặc gợi ý gym phù hợp.`
      : "Mình vẫn nói chuyện ngoài lề được. Khi cần chuyện gym, PT, gói tập hay lịch tập thì mình kéo lại GFMS cho bạn sau.",
    suggestions: [],
  };
};

const buildAiContextSnapshot = ({ isAuthed, publicContext, privateContext, bmiContext, pageContext, intent, userPreferences }) => {
  const snapshot = {
    intent,
    pageType: pageContext?.pageType || "general",
    habits: buildUserHabitSummary(userPreferences),
    bmi: bmiContext?.bmi
      ? {
          bmi: bmiContext.bmi,
          classification: bmiContext?.classification?.label || null,
          heightCm: bmiContext?.heightCm || null,
          weightKg: bmiContext?.weightKg || null,
          goal: bmiContext?.goal || null,
        }
      : null,
    publicData: {
      gyms: safeArray(publicContext?.gyms).slice(0, 4).map((x) => ({ id: x.id, name: x.name, address: x.address })),
      packages: safeArray(publicContext?.packages)
        .slice(0, 4)
        .map((x) => ({ id: x.id, name: x.name, gymName: x.gymName, sessions: x.sessions, price: x.price })),
      trainers: safeArray(publicContext?.trainers)
        .slice(0, 4)
        .map((x) => ({ id: x.id, name: x.name, specialization: x.specialization, rating: x.rating })),
    },
    privateData: null,
  };

  if (!isAuthed) return snapshot;

  if (intent === "member_package") {
    snapshot.privateData = {
      activePackages: safeArray(privateContext?.myPackages)
        .filter((x) => safeLower(x.status) === "active")
        .slice(0, 3)
        .map((x) => ({
          activationId: x.activationId,
          packageName: x.packageName,
          gymName: x.gymName,
          sessionsRemaining: x.sessionsRemaining,
          expiryDate: x.expiryDate,
        })),
    };
    return snapshot;
  }

  if (intent === "member_schedule" || intent === "booking") {
    snapshot.privateData = {
      upcomingBookings: getUpcomingBookings(privateContext?.myBookings || [], { limit: 4 }).map((x) => ({
        id: x.id,
        bookingDate: x.bookingDate,
        startTime: x.startTime,
        trainerName: x.trainerName,
        gymName: x.gymName,
        packageName: x.packageName,
        status: x.status,
      })),
      activePackages: safeArray(privateContext?.myPackages)
        .filter((x) => safeLower(x.status) === "active")
        .slice(0, 2)
        .map((x) => ({
          activationId: x.activationId,
          packageName: x.packageName,
          gymName: x.gymName,
          sessionsRemaining: x.sessionsRemaining,
          expiryDate: x.expiryDate,
        })),
    };
  }

  return snapshot;
};

const answerGeneralConversation = async ({ message, history = [], isAuthed, bmiContext, pageContext, userPreferences }) => {
  const contextParts = {
    isAuthed,
    pageType: pageContext?.pageType || "general",
    bmiSummary: bmiContext?.bmi ? buildBmiSummaryLine(bmiContext) : null,
    habits: buildUserHabitSummary(userPreferences),
  };

  const recentHistory = safeArray(history)
    .slice(-6)
    .map((item) => ({ role: item.role, content: safeText(item.content) }))
    .filter((item) => item.content);

  const llmReply = await generateReplyWithOpenRouter({
    systemPrompt: GFMS_CHAT_FALLBACK_PROMPT,
    messages: [
      ...recentHistory,
      {
        role: "user",
        content: [
          `Ngữ cảnh: ${JSON.stringify(contextParts)}`,
          `Tin nhắn hiện tại: ${safeText(message)}`,
          "Hãy trả lời thật tự nhiên, ngắn gọn, đúng trọng tâm. Không lặp BMI trừ khi người dùng đang hỏi về sức khỏe, ăn uống, tập luyện hoặc mục tiêu cơ thể.",
        ].join("\n"),
      },
    ],
    temperature: 0.55,
    max_tokens: 220,
  });

  const lower = normalize(message);
  const systemActions = [];

  if (["dang ky", "tao tai khoan", "register", "sign up"].some((w) => lower.includes(w))) {
    systemActions.push(buildNavigateAction("/register", "Đăng ký"));
    systemActions.push(buildNavigateAction("/login", "Đăng nhập"));
  } else if (["dang nhap", "login", "vao he thong", "vo he thong"].some((w) => lower.includes(w))) {
    systemActions.push(buildNavigateAction("/login", "Đăng nhập"));
    if (!isAuthed) systemActions.push(buildNavigateAction("/register", "Đăng ký"));
  } else if (["website gfms", "trang chu", "vao website gfms"].some((w) => lower.includes(w))) {
    systemActions.push(buildNavigateAction("/", "Về trang chủ"));
  }

  if (safeText(llmReply)) {
    return { reply: safeText(llmReply), suggestions: [], actions: systemActions };
  }

  return buildGeneralReply(isAuthed, bmiContext);
};

const NON_REWRITE_INTENTS = new Set(["member_package", "member_schedule", "booking"]);

const finalizeAssistantResponse = async ({
  response,
  message,
  history,
  intent,
  isAuthed,
  publicContext,
  privateContext,
  bmiContext,
  pageContext,
  userPreferences,
}) => {
  const baseResponse = {
    suggestions: [],
    actions: [],
    cards: null,
    proposedAction: null,
    requiresConfirmation: false,
    bmiSummary: bmiContext || null,
    bookingContext: null,
    ...(response || {}),
  };

  const reply = safeText(baseResponse.reply);
  if (!reply) return baseResponse;

  if (NON_REWRITE_INTENTS.has(intent)) {
    return {
      ...baseResponse,
      reply,
    };
  }

  const rewrittenReply = await rewriteReplyWithOpenRouter({
    systemPrompt: GFMS_SYSTEM_PROMPT,
    userMessage: message,
    history,
    rawReply: reply,
    contextSnapshot: buildAiContextSnapshot({
      isAuthed,
      publicContext,
      privateContext,
      bmiContext,
      pageContext,
      intent,
      userPreferences,
    }),
  });

  return {
    ...baseResponse,
    reply: safeText(rewrittenReply) || reply,
  };
};

const inferIntentHybrid = async ({ message, history = [], isAuthed, bookingContextFromClient = null }) => {
  const followUpIntent = inferIntentFromFollowUp({ message, history, isAuthed, bookingContextFromClient });
  if (followUpIntent) return followUpIntent;

  const ruleIntent = inferIntent(message, isAuthed);
  if (ruleIntent !== "general") return ruleIntent;

  const llmIntent = await classifyIntentWithOpenRouter({
    systemPrompt: GFMS_INTENT_PROMPT,
    message,
    labels: ["general", "bmi", "nutrition", "workout", "gym", "package", "trainer", "booking", "member_package", "member_schedule"],
  });

  if (!llmIntent) return ruleIntent;
  if (!isAuthed && ["member_package", "member_schedule"].includes(llmIntent)) return "general";

  return llmIntent;
};

const inferFitnessProfile = (bmiContext) => {
  const bmi = Number(bmiContext?.bmi || 0);
  const goal = safeLower(bmiContext?.goal || "");

  if (goal.includes("tang can")) {
    return {
      primaryGoal: "tăng cân",
      packageKeywords: ["tăng cân", "tăng cơ", "bulking", "mass", "strength"],
      trainerKeywords: ["tăng cân", "tăng cơ", "strength", "bulking", "mass"],
    };
  }

  if (goal.includes("tang co")) {
    return {
      primaryGoal: "tăng cơ",
      packageKeywords: ["tăng cơ", "muscle", "hypertrophy", "strength"],
      trainerKeywords: ["tăng cơ", "muscle", "strength", "bodybuilding"],
    };
  }

  if (goal.includes("giam mo") || goal.includes("giam can")) {
    return {
      primaryGoal: "giảm mỡ",
      packageKeywords: ["giảm mỡ", "giảm cân", "fat loss", "cardio", "lean"],
      trainerKeywords: ["giảm mỡ", "fat loss", "cardio", "lean"],
    };
  }

  if (bmi > 0 && bmi < 18.5) {
    return {
      primaryGoal: "tăng cân",
      packageKeywords: ["tăng cân", "tăng cơ", "bulking", "mass", "strength"],
      trainerKeywords: ["tăng cân", "tăng cơ", "strength"],
    };
  }

  if (bmi >= 25) {
    return {
      primaryGoal: "giảm mỡ",
      packageKeywords: ["giảm mỡ", "giảm cân", "fat loss", "cardio", "lean"],
      trainerKeywords: ["giảm mỡ", "fat loss", "cardio"],
    };
  }

  return {
    primaryGoal: "cải thiện sức khỏe",
    packageKeywords: ["cơ bản", "fitness", "general", "wellness", "sức khỏe"],
    trainerKeywords: ["fitness", "general", "wellness", "sức khỏe"],
  };
};

const scorePackageForProfile = (pkg, fitnessProfile, preferredTrainer, bmiContext) => {
  let score = 0;
  const hay = normalize([pkg?.name, pkg?.description, pkg?.type, pkg?.gymName].filter(Boolean).join(" "));

  if (preferredTrainer && Number(pkg?.trainerId) === Number(preferredTrainer?.id)) score += 80;
  if (preferredTrainer && Number(pkg?.gymId) === Number(preferredTrainer?.gymId)) score += 40;

  for (const kw of safeArray(fitnessProfile?.packageKeywords)) {
    if (hay.includes(normalize(kw))) score += 16;
  }

  if (safeNumber(pkg?.sessions, 0) > 0) score += 4;
  if (safeNumber(pkg?.price, 0) > 0) score += 2;
  if (bmiContext?.goal && hay.includes(normalize(bmiContext.goal))) score += 20;

  return score;
};

const findBestPackagesForTrainerAndProfile = ({ publicContext, preferredTrainer, bmiContext }) => {
  const packages = safeArray(publicContext?.packages);
  const fitnessProfile = inferFitnessProfile(bmiContext);

  return packages
    .filter((pkg) => {
      if (!preferredTrainer) return true;
      return Number(pkg?.gymId) === Number(preferredTrainer?.gymId);
    })
    .map((pkg) => ({
      ...pkg,
      score: scorePackageForProfile(pkg, fitnessProfile, preferredTrainer, bmiContext),
    }))
    .filter((pkg) => pkg.score > 0)
    .sort((a, b) => b.score - a.score || safeNumber(a.price, 999999999) - safeNumber(b.price, 999999999))
    .slice(0, 5);
};

const buildBookingNavigatePayload = ({
  gymId,
  gymName,
  trainerId,
  trainerName,
  packageId,
  packageName,
  activationId,
  selectedDate,
  selectedTime,
}) => ({
  gymId: gymId || null,
  gymName: gymName || null,
  trainerId: trainerId || null,
  trainerName: trainerName || null,
  packageId: packageId || null,
  packageName: packageName || null,
  activationId: activationId || null,
  selectedDate: selectedDate || null,
  selectedTime: selectedTime || null,
});

const buildNavigateToGymDetailAction = (gymId, label = "Đi tới gym để đặt lịch") =>
  buildNavigateAction(`/marketplace/gyms/${gymId}`, label);

const buildBookingReply = async ({
  user,
  message,
  privateContext,
  pageContext,
  publicContext,
  bookingContextFromClient = null,
  history = [],
}) => {
  const lower = normalize(message);

  if (!user?.id) {
    return {
      reply: "Để đặt lịch trong GFMS, bạn cần đăng nhập trước. Sau đó hệ thống sẽ đi theo đúng flow: chọn gym, chọn gói tập, rồi mới chọn PT và lịch tập.",
      suggestions: [],
      actions: [
        buildNavigateAction("/login", "Đăng nhập"),
        buildNavigateAction("/register", "Đăng ký"),
        buildNavigateAction("/marketplace/gyms", "Xem gym"),
      ],
      bookingContext: bookingContextFromClient || null,
    };
  }

  const myPackages = safeArray(privateContext?.myPackages);
  const activePackages = myPackages.filter((x) => safeLower(x.status) === "active");
  const activePackage = activePackages[0] || null;

  if (!activePackage) {
    return {
      reply:
        "Để đặt lịch PT trong hệ thống này, bạn cần đi theo đúng flow: chọn gym trước, sau đó chọn gói tập của gym đó, rồi mới chọn PT và lịch tập. Hiện tại bạn chưa có gói active nên mình chưa thể hỏi ngày tập ngay được.",
      suggestions: [],
      actions: [
        buildNavigateAction("/marketplace/gyms", "Chọn gym trước"),
        buildNavigateAction("/marketplace/packages", "Xem gói tập"),
      ],
      cards: publicContext?.gyms?.length ? buildGymCards(publicContext.gyms.slice(0, 8), null) : null,
      bookingContext: bookingContextFromClient || null,
    };
  }

  const selectedActivationId =
    Number(bookingContextFromClient?.activationId || 0) ||
    Number(pageContext?.activationId || 0) ||
    Number(activePackage.activationId);

  const currentPackage = activePackages.find((x) => Number(x.activationId) === selectedActivationId) || activePackage;

  let trainerBundle = null;
  try {
    trainerBundle = await bookingService.getAvailableTrainers(user.id, currentPackage.activationId);
  } catch {
    trainerBundle = null;
  }

  const trainers = safeArray(trainerBundle?.trainers);
  const bookingOnlyMessage = [
    "dat lich",
    "book pt",
    "booking",
    "toi muon dat lich",
    "toi muon book",
    "dat buoi tap",
    "dat lich tap",
  ].some((kw) => lower.includes(kw));

  const trainersForMemory = trainers.map((t) => ({
    id: t.id,
    name: getTrainerDisplayName(t),
    gymId: t?.gymId || currentPackage.gymId || null,
    gymName: currentPackage.gymName || null,
  }));

  const memory = extractBookingContextFromHistory({
    message,
    history,
    publicContext: {
      ...publicContext,
      trainers: trainersForMemory.length ? trainersForMemory : safeArray(publicContext?.trainers),
      packages: publicContext?.packages || [],
    },
    bookingContextFromClient,
  });

  let trainerMentioned =
    findTrainerInCollection(trainers, bookingContextFromClient) ||
    findTrainerInCollection(trainers, {
      trainerId: memory?.trainer?.id,
      trainerName: memory?.trainer?.name,
    }) ||
    resolveTrainerFromMessage(message, trainers);

  const selectedDate = memory.date || parseDateFromMessage(message);
  const selectedTime = memory.time || parseTimeFromMessage(message);

  const nextBookingContextBase = {
    ...(bookingContextFromClient || {}),
    activationId: currentPackage.activationId,
    packageId: currentPackage.packageId || bookingContextFromClient?.packageId || null,
    packageName: currentPackage.packageName,
    gymId: currentPackage.gymId,
    gymName: currentPackage.gymName,
  };

  if (!trainerMentioned && bookingContextFromClient?.selectionSource === "trainer_card") {
    return {
      reply: `Mình đã nhận PT ${bookingContextFromClient?.trainerName || "bạn vừa chọn"}, nhưng PT này hiện không khả dụng trong gói active ${currentPackage.packageName}. Bạn chọn một PT khả dụng bên dưới nhé.`,
      suggestions: trainers.slice(0, 3).map((t) => ({
        type: "message",
        label: getTrainerDisplayName(t),
        value: `Tôi muốn đặt lịch với PT ${getTrainerDisplayName(t)}`,
      })),
      cards: trainers.length
        ? buildTrainerCards(
            trainers.slice(0, 8).map((t) => ({
              id: t.id,
              name: getTrainerDisplayName(t),
              specialization: Array.isArray(t.specialization) ? t.specialization.join(", ") : safeText(t.specialization),
              rating: t.rating,
              gymId: currentPackage.gymId,
              gymName: currentPackage.gymName,
              packageId: currentPackage.packageId,
              packageName: currentPackage.packageName,
              helperText: "PT khả dụng từ gói active của bạn",
              activationId: currentPackage.activationId,
              imageUrl: t?.imageUrl || t?.avatar || t?.photo || t?.User?.image || t?.User?.avatar || null,
            }))
          )
        : null,
      actions: [buildNavigateAction("/member/my-packages", "Xem gói của tôi")],
      bookingContext: nextBookingContextBase,
    };
  }

  if (!trainerMentioned && !selectedDate && !selectedTime && bookingOnlyMessage) {
    const trainerCards = trainers.length
      ? buildTrainerCards(
          trainers.slice(0, 8).map((t) => ({
            id: t.id,
            name: getTrainerDisplayName(t),
            specialization: Array.isArray(t.specialization) ? t.specialization.join(", ") : safeText(t.specialization),
            rating: t.rating,
            gymId: currentPackage.gymId,
            gymName: currentPackage.gymName,
            packageId: currentPackage.packageId,
            packageName: currentPackage.packageName,
            helperText: "PT khả dụng từ gói active của bạn",
            activationId: currentPackage.activationId,
            imageUrl: t?.imageUrl || t?.avatar || t?.photo || t?.User?.image || t?.User?.avatar || null,
          }))
        )
      : null;

    return {
      reply: `Trong GFMS, bạn đang đặt lịch từ gói active hiện tại là ${currentPackage.packageName}${currentPackage.gymName ? ` tại ${currentPackage.gymName}` : ""}. Bước tiếp theo là chọn PT thuộc gói này trước, rồi mình mới kiểm tra ngày và giờ cho bạn.`,
      suggestions: trainers.slice(0, 3).map((t) => ({
        type: "message",
        label: getTrainerDisplayName(t),
        value: `Tôi muốn đặt lịch với PT ${getTrainerDisplayName(t)}`,
      })),
      cards: trainerCards,
      actions: [buildNavigateAction("/member/my-packages", "Xem gói của tôi")],
      bookingContext: nextBookingContextBase,
    };
  }

  if (!trainerMentioned) {
    const trainerCards = trainers.length
      ? buildTrainerCards(
          trainers.slice(0, 8).map((t) => ({
            id: t.id,
            name: getTrainerDisplayName(t),
            specialization: Array.isArray(t.specialization) ? t.specialization.join(", ") : safeText(t.specialization),
            rating: t.rating,
            gymId: currentPackage.gymId,
            gymName: currentPackage.gymName,
            packageId: currentPackage.packageId,
            packageName: currentPackage.packageName,
            helperText: "bạn cần chọn PT trước rồi mới chọn lịch",
            activationId: currentPackage.activationId,
            imageUrl: t?.imageUrl || t?.avatar || t?.photo || t?.User?.image || t?.User?.avatar || null,
          }))
        )
      : null;

    return {
      reply: `Bạn đang đi từ gói ${currentPackage.packageName}${currentPackage.gymName ? ` tại ${currentPackage.gymName}` : ""}. Bạn chọn một PT thuộc gói này trước nhé, sau đó mình mới kiểm tra lịch rảnh.`,
      suggestions: trainers.slice(0, 3).map((t) => ({
        type: "message",
        label: getTrainerDisplayName(t),
        value: `Tôi muốn đặt lịch với PT ${getTrainerDisplayName(t)}`,
      })),
      cards: trainerCards,
      actions: [buildNavigateAction("/member/my-packages", "Xem gói của tôi")],
      bookingContext: nextBookingContextBase,
    };
  }

  const trainerName = getTrainerDisplayName(trainerMentioned);
  const nextBookingContext = {
    ...nextBookingContextBase,
    trainerId: trainerMentioned.id,
    trainerName,
    selectedDate: selectedDate || null,
    selectedTime: selectedTime || null,
  };

  if (!selectedDate) {
    const suggestedDate = toISODateLocal(addDaysLocal(new Date(), 1));
    return {
      reply: `Mình đã nhớ PT ${trainerName} thuộc gói ${currentPackage.packageName}. Giờ bạn cho mình ngày muốn tập theo dạng YYYY-MM-DD hoặc kiểu 16/4 cũng được, ví dụ ${suggestedDate}.`,
      suggestions: [
        {
          type: "message",
          label: "Ngày mai",
          value: `Đặt với PT ${trainerName} ngày ${suggestedDate}`,
        },
      ],
      actions: [buildNavigateAction("/member/my-packages", "Xem gói của tôi")],
      bookingContext: nextBookingContext,
    };
  }

  let slots = [];
  try {
    slots = await bookingService.getAvailableSlots(user.id, {
      trainerId: trainerMentioned.id,
      date: selectedDate,
      activationId: currentPackage.activationId,
    });
  } catch (e) {
    return {
      reply: e.message || "Không thể kiểm tra slot lúc này.",
      suggestions: [],
      actions: [buildNavigateAction("/member/bookings", "Mở lịch của tôi")],
      bookingContext: nextBookingContext,
    };
  }

  if (!slots.length) {
    return {
      reply: `PT ${trainerName} hiện chưa có slot trống vào ngày ${formatDateVN(selectedDate)}. Bạn chọn ngày khác nhé.`,
      suggestions: [
        {
          type: "message",
          label: "Chọn ngày khác",
          value: `Đặt với PT ${trainerName} ngày ${toISODateLocal(addDaysLocal(new Date(), 2))}`,
        },
      ],
      bookingContext: nextBookingContext,
    };
  }

  if (!selectedTime) {
    return {
      reply: `Mình đã nhớ PT ${trainerName}, gói ${currentPackage.packageName} và ngày ${formatDateVN(selectedDate)}. Hiện có ${slots.length} slot trống. Bạn chọn giờ giúp mình nhé.`,
      suggestions: slots.slice(0, 5).map((s) => ({
        type: "message",
        label: formatTimeHHMM(s.startTime),
        value: `Đặt với PT ${trainerName} ngày ${selectedDate} lúc ${formatTimeHHMM(s.startTime)}`,
      })),
      bookingContext: {
        ...nextBookingContext,
        selectedDate,
      },
    };
  }

  const matchedSlot = slots.find((s) => formatTimeHHMM(s.startTime) === selectedTime);

  if (!matchedSlot) {
    return {
      reply: `Khung giờ ${selectedTime} hiện không còn trống. Bạn chọn một giờ còn lại bên dưới nhé.`,
      suggestions: slots.slice(0, 5).map((s) => ({
        type: "message",
        label: formatTimeHHMM(s.startTime),
        value: `Đặt với PT ${trainerName} ngày ${selectedDate} lúc ${formatTimeHHMM(s.startTime)}`,
      })),
      bookingContext: {
        ...nextBookingContext,
        selectedDate,
      },
    };
  }

  return {
    reply: `Mình đã giữ sẵn thông tin cho bạn: gym ${currentPackage.gymName || "đã chọn"}, gói ${currentPackage.packageName}, PT ${trainerName}, ngày ${formatDateVN(selectedDate)}, lúc ${selectedTime}. Bây giờ bạn bấm sang trang gym detail để thực hiện booking tại đó nhé.`,
    suggestions: [],
    actions: [
      buildNavigateToGymDetailAction(currentPackage.gymId, "Đi tới gym này để đặt lịch"),
      buildNavigateAction("/member/my-packages", "Xem gói của tôi"),
    ],
    cards: {
      type: "booking_candidate",
      title: "Thông tin đã giữ sẵn",
      items: [
        {
          id: `${trainerMentioned.id}-${selectedDate}-${selectedTime}`,
          title: `${trainerName} • ${formatDateVN(selectedDate)}`,
          subtitle: `${selectedTime} • ${currentPackage.packageName}`,
          meta: currentPackage.gymName || "",
          badge: "Đi tiếp tại Gym Detail",
        },
      ],
    },
    proposedAction: buildNavigateToGymDetailAction(currentPackage.gymId, "Đi tới gym này để đặt lịch"),
    requiresConfirmation: false,
    bookingContext: {
      ...nextBookingContext,
      ...buildBookingNavigatePayload({
        gymId: currentPackage.gymId,
        gymName: currentPackage.gymName,
        trainerId: trainerMentioned.id,
        trainerName,
        packageId: currentPackage.packageId,
        packageName: currentPackage.packageName,
        activationId: currentPackage.activationId,
        selectedDate,
        selectedTime,
      }),
    },
  };
};

const buildSmartBookingRecommendation = async ({
  user,
  message,
  history = [],
  publicContext,
  privateContext,
  bmiContext,
  bookingContextFromClient = null,
}) => {
  const fitnessProfile = inferFitnessProfile(bmiContext);

  const memory = extractBookingContextFromHistory({
    message,
    history,
    publicContext,
    bookingContextFromClient,
  });

  const preferredTrainer = memory.trainer;
  const selectedDate = memory.date;
  const selectedTime = memory.time;
  let selectedPackage = memory.packageMatch || null;

  if (!preferredTrainer) {
    return {
      reply: "Mình chưa xác định rõ PT bạn muốn. Bạn nói tên PT giúp mình, mình sẽ kiểm tra gym, gói phù hợp và slot trống cho bạn luôn.",
      suggestions: [],
      actions: [buildNavigateAction("/marketplace/trainers", "Xem PT")],
      bookingContext: bookingContextFromClient || null,
    };
  }

  const matchedPackages = findBestPackagesForTrainerAndProfile({
    publicContext,
    preferredTrainer,
    bmiContext,
  });

  if (!matchedPackages.length) {
    return {
      reply: `Mình đã xác định PT ${preferredTrainer.name}, nhưng hiện chưa thấy gói nào tại gym của PT này phù hợp với mục tiêu ${fitnessProfile.primaryGoal} của bạn. Mình có thể gợi ý PT khác hoặc gym khác hợp hơn.`,
      suggestions: [],
      actions: [
        buildNavigateAction("/marketplace/trainers", "Xem PT"),
        buildNavigateAction("/marketplace/gyms", "Xem gym"),
      ],
      bookingContext: {
        ...(bookingContextFromClient || {}),
        trainerId: preferredTrainer.id,
        trainerName: preferredTrainer.name,
        gymId: preferredTrainer.gymId || null,
      },
    };
  }

  if (!selectedPackage) {
    selectedPackage = matchedPackages[0];
  }

  const nextBookingContext = {
    ...(bookingContextFromClient || {}),
    trainerId: preferredTrainer.id,
    trainerName: preferredTrainer.name,
    gymId: selectedPackage?.gymId || preferredTrainer?.gymId || null,
    gymName: selectedPackage?.gymName || bookingContextFromClient?.gymName || null,
    packageId: selectedPackage?.id || null,
    packageName: selectedPackage?.name || null,
    selectedDate: selectedDate || null,
    selectedTime: selectedTime || null,
  };

  if (!selectedDate) {
    return {
      reply: `Mình đã nhớ PT ${preferredTrainer.name} rồi. Với thể trạng hiện tại của bạn, gói phù hợp nhất là ${selectedPackage.name}${selectedPackage.gymName ? ` tại ${selectedPackage.gymName}` : ""}. Giờ bạn chỉ cần nhắn ngày muốn tập, ví dụ 16/4 hoặc 2026-04-16, mình sẽ kiểm tra slot ngay.`,
      suggestions: [
        {
          type: "message",
          label: "Ngày mai",
          value: `Tôi muốn đặt lịch với PT ${preferredTrainer.name} ngày ${toISODateLocal(addDaysLocal(new Date(), 1))}`,
        },
      ],
      actions: [buildNavigateAction(`/marketplace/packages/${selectedPackage.id}`, "Xem gói phù hợp")],
      cards: buildPackageCards([selectedPackage], bmiContext, preferredTrainer, null),
      bookingContext: nextBookingContext,
    };
  }

  let slots = [];
  try {
    slots = await bookingService.getAvailableSlots(user?.id || null, {
      trainerId: preferredTrainer.id,
      date: selectedDate,
      activationId: null,
    });
  } catch {
    slots = [];
  }

  if (!slots.length) {
    return {
      reply: `Mình đã kiểm tra PT ${preferredTrainer.name} vào ngày ${formatDateVN(selectedDate)} nhưng hiện chưa thấy slot trống. Gói phù hợp nhất với bạn tại gym của PT này vẫn là ${selectedPackage.name}. Bạn muốn đổi sang ngày khác để mình kiểm tra tiếp không?`,
      suggestions: [
        {
          type: "message",
          label: "Đổi sang ngày khác",
          value: `Tôi muốn đặt lịch với PT ${preferredTrainer.name} ngày ${toISODateLocal(addDaysLocal(new Date(), 2))}`,
        },
      ],
      actions: [buildNavigateAction(`/marketplace/packages/${selectedPackage.id}`, "Xem gói phù hợp")],
      cards: buildPackageCards([selectedPackage], bmiContext, preferredTrainer, selectedDate),
      bookingContext: nextBookingContext,
    };
  }

  if (!selectedTime) {
    return {
      reply: `Mình đã nhớ PT ${preferredTrainer.name}, gói ${selectedPackage.name} và ngày ${formatDateVN(selectedDate)}. Hiện PT này còn ${slots.length} khung giờ trống. Bạn chọn giờ giúp mình nhé.`,
      suggestions: slots.slice(0, 5).map((s) => ({
        type: "message",
        label: formatTimeHHMM(s.startTime),
        value: `Đặt với PT ${preferredTrainer.name} ngày ${selectedDate} lúc ${formatTimeHHMM(s.startTime)}`,
      })),
      cards: buildPackageCards([selectedPackage], bmiContext, preferredTrainer, selectedDate),
      bookingContext: {
        ...nextBookingContext,
        selectedDate,
      },
    };
  }

  const matchedSlot = slots.find((s) => formatTimeHHMM(s.startTime) === selectedTime);

  if (!matchedSlot) {
    return {
      reply: `Khung giờ ${selectedTime} hiện không còn trống. Bạn chọn một giờ còn lại bên dưới nhé.`,
      suggestions: slots.slice(0, 5).map((s) => ({
        type: "message",
        label: formatTimeHHMM(s.startTime),
        value: `Đặt với PT ${preferredTrainer.name} ngày ${selectedDate} lúc ${formatTimeHHMM(s.startTime)}`,
      })),
      bookingContext: {
        ...nextBookingContext,
        selectedDate,
      },
    };
  }

  return {
    reply: `Mình đã giữ sẵn thông tin cho bạn: PT ${preferredTrainer.name}, gói ${selectedPackage.name}, ngày ${formatDateVN(selectedDate)}, lúc ${selectedTime}. Bạn bấm sang gym detail để đặt lịch trực tiếp tại đó nhé.`,
    suggestions: [],
    actions: [
      buildNavigateToGymDetailAction(selectedPackage.gymId, "Đi tới gym này để đặt lịch"),
      buildNavigateAction(`/marketplace/packages/${selectedPackage.id}`, "Xem gói phù hợp"),
    ],
    cards: {
      type: "booking_candidate",
      title: "Thông tin đã giữ sẵn",
      items: [
        {
          id: `${preferredTrainer.id}-${selectedDate}-${selectedTime}`,
          title: `${preferredTrainer.name} • ${formatDateVN(selectedDate)}`,
          subtitle: `${selectedTime} • ${selectedPackage.name}`,
          meta: selectedPackage.gymName || "",
          badge: "Đi tiếp tại Gym Detail",
        },
      ],
    },
    proposedAction: buildNavigateToGymDetailAction(selectedPackage.gymId, "Đi tới gym này để đặt lịch"),
    requiresConfirmation: false,
    bookingContext: {
      ...nextBookingContext,
      ...buildBookingNavigatePayload({
        gymId: selectedPackage.gymId,
        gymName: selectedPackage.gymName,
        trainerId: preferredTrainer.id,
        trainerName: preferredTrainer.name,
        packageId: selectedPackage.id,
        packageName: selectedPackage.name,
        activationId: null,
        selectedDate,
        selectedTime,
      }),
    },
  };
};

const aiService = {
  async chat({ user, body }) {
    const message = safeText(body?.message);
    const history = safeArray(body?.history);
    const pageContext = body?.pageContext || {};
    const bookingContextFromClient = body?.bookingContext || null;
    const userPreferences = body?.userPreferences || null;

    if (!message) {
      const e = new Error("Thiếu message");
      e.statusCode = 400;
      throw e;
    }

    const normalizedMessage = normalize(message);

    if (/hom nay la ngay may|hom nay ngay may|ngay hom nay la bao nhieu|hn la ngay may/.test(normalizedMessage)) {
      return {
        reply: `Hôm nay là ngày ${formatDateVN(toISODateLocal(new Date()))} nha.`,
        suggestions: [],
        actions: [],
        cards: null,
        proposedAction: null,
        requiresConfirmation: false,
        bmiSummary: null,
        bookingContext: bookingContextFromClient || null,
      };
    }

    const isAuthed = !!user?.id;
    const [publicContext, privateContext] = await Promise.all([buildPublicContext(), buildPrivateContext(user?.id || null)]);

    const bmiContext = extractBmiContext({ message, history, privateContext });
    const navAction = detectNavigationIntent(message, isAuthed);
    const intent = await inferIntentHybrid({ message, history, isAuthed, bookingContextFromClient });

    let response;

    if (navAction) {
      response = {
        reply: "Mình đã hiểu rồi, bạn bấm nút bên dưới là tới đúng chỗ cần xem.",
        suggestions: [],
        actions: [navAction],
        cards: null,
        proposedAction: navAction,
        requiresConfirmation: false,
        bmiSummary: bmiContext,
        bookingContext: bookingContextFromClient || null,
      };
    } else if (intent === "member_package" && isAuthed) {
      const res = replyForMemberPackage(privateContext);
      response = {
        ...res,
        cards: null,
        proposedAction: null,
        requiresConfirmation: false,
        bmiSummary: bmiContext,
        bookingContext: bookingContextFromClient || null,
      };
    } else if (intent === "member_schedule" && isAuthed) {
      const res = replyForMemberSchedule(message, privateContext, history);
      response = {
        ...res,
        cards: null,
        proposedAction: null,
        requiresConfirmation: false,
        bmiSummary: bmiContext,
        bookingContext: bookingContextFromClient || null,
      };
    } else if (intent === "booking") {
      const hasActivePackage = !!safeArray(privateContext?.myPackages).find((x) => safeLower(x.status) === "active");

      if (hasActivePackage) {
        const res = await buildBookingReply({
          user,
          message,
          privateContext,
          pageContext,
          publicContext,
          bookingContextFromClient,
          history,
        });

        response = {
          ...res,
          proposedAction: res?.proposedAction || null,
          requiresConfirmation: !!res?.requiresConfirmation,
          bmiSummary: bmiContext,
        };
      } else {
        const smartBooking = await buildSmartBookingRecommendation({
          user,
          message,
          history,
          publicContext,
          privateContext,
          bmiContext,
          bookingContextFromClient,
        });

        response = {
          ...smartBooking,
          proposedAction: smartBooking?.proposedAction || null,
          requiresConfirmation: !!smartBooking?.requiresConfirmation,
          bmiSummary: bmiContext,
        };
      }
    } else if (intent === "bmi") {
      if (!bmiContext?.bmi) {
        response = {
          reply: "Bạn nhập giúp mình chiều cao và cân nặng theo kiểu tự nhiên, ví dụ: tôi cao 170cm nặng 65kg và muốn giảm mỡ. Mình sẽ tính nhanh rồi tư vấn tiếp cho bạn.",
          suggestions: [],
          cards: null,
          proposedAction: null,
          requiresConfirmation: false,
          bmiSummary: null,
          bookingContext: bookingContextFromClient || null,
        };
      } else {
        response = {
          reply: `${buildBmiSummaryLine(bmiContext)} ${bmiContext.goal ? `Mục tiêu hiện tại của bạn là ${bmiContext.goal.toLowerCase()}.` : ""}`.trim(),
          suggestions: [],
          actions: [buildNavigateAction("/marketplace/gyms", "Xem gym")],
          cards: null,
          proposedAction: null,
          requiresConfirmation: false,
          bmiSummary: bmiContext,
          bookingContext: bookingContextFromClient || null,
        };
      }
    } else if (intent === "nutrition") {
      response = {
        reply: nutritionAdvice(bmiContext),
        suggestions: [],
        actions: [buildNavigateAction("/marketplace/gyms", "Xem gym")],
        cards: null,
        proposedAction: null,
        requiresConfirmation: false,
        bmiSummary: bmiContext,
        bookingContext: bookingContextFromClient || null,
      };
    } else if (intent === "workout") {
      response = {
        reply: workoutAdvice(bmiContext),
        suggestions: [],
        actions: [buildNavigateAction("/marketplace/gyms", "Xem gym")],
        cards: null,
        proposedAction: null,
        requiresConfirmation: false,
        bmiSummary: bmiContext,
        bookingContext: bookingContextFromClient || null,
      };
    } else if (intent === "gym") {
      const gyms = recommendGyms(publicContext, message, bmiContext);
      response = {
        reply: gyms.length
          ? `Mình đã lọc ${Math.min(gyms.length, 8)} gym phù hợp nhất từ dữ liệu hệ thống. Bạn xem card bên dưới, ưu tiên chọn nơi thuận đường và đang hoạt động rồi mình sẽ gợi ý tiếp gói tập hoặc PT cho bạn.`
          : "Hiện mình chưa lấy được danh sách gym từ hệ thống, bạn thử lại giúp mình nhé.",
        suggestions: [],
        actions: [buildNavigateAction("/marketplace/gyms", "Xem tất cả gym")],
        cards: gyms.length ? buildGymCards(gyms, bmiContext) : null,
        proposedAction: null,
        requiresConfirmation: false,
        bmiSummary: bmiContext,
        bookingContext: bookingContextFromClient || null,
      };
    } else if (intent === "package") {
      const packages = recommendPackages(publicContext, bmiContext);
      response = {
        reply: packages.length
          ? "Mình đã lọc các gói tập phù hợp từ dữ liệu thật. Bạn xem card bên dưới, chọn gói thấy ổn rồi mình sẽ đi tiếp sang PT hoặc bước đặt lịch phù hợp."
          : "Hiện mình chưa lấy được danh sách gói tập từ hệ thống.",
        suggestions: [],
        actions: [buildNavigateAction("/marketplace/gyms", "Xem gym")],
        cards: packages.length ? buildPackageCards(packages, bmiContext) : null,
        proposedAction: null,
        requiresConfirmation: false,
        bmiSummary: bmiContext,
        bookingContext: bookingContextFromClient || null,
      };
    } else if (intent === "trainer") {
      const trainerRows = recommendTrainersByPackages(publicContext, privateContext, bmiContext, message);
      const hasActivePackage = !!safeArray(privateContext?.myPackages).find((x) => safeLower(x.status) === "active");

      response = {
        reply: hasActivePackage
          ? "Mình đã ưu tiên các PT phù hợp với gym hoặc gói bạn đang có. Bạn xem card PT bên dưới, nếu muốn đặt lịch thì chọn PT thuộc gói active của mình nhé."
          : "Mình đã lọc vài PT phù hợp từ hệ thống. Với GFMS, PT đi kèm gói tập của gym, nên nếu chưa có gói thì bạn chọn gym trước rồi mình sẽ gợi ý tiếp gói và PT phù hợp.",
        suggestions: [],
        actions: hasActivePackage
          ? [buildNavigateAction("/member/bookings", "Mở lịch của tôi"), buildNavigateAction("/member/my-packages", "Xem gói của tôi")]
          : [buildNavigateAction("/marketplace/gyms", "Xem gym"), buildNavigateAction("/marketplace/trainers", "Xem PT")],
        cards: trainerRows.length ? buildTrainerCards(trainerRows) : null,
        proposedAction: null,
        requiresConfirmation: false,
        bmiSummary: bmiContext,
        bookingContext: bookingContextFromClient || null,
      };
    } else {
      const general = await answerGeneralConversation({
        message,
        history,
        isAuthed,
        bmiContext,
        pageContext,
        userPreferences,
      });
      response = {
        ...general,
        cards: null,
        proposedAction: null,
        requiresConfirmation: false,
        bmiSummary: bmiContext,
        bookingContext: bookingContextFromClient || null,
      };
    }

    return finalizeAssistantResponse({
      response,
      message,
      history,
      intent,
      isAuthed,
      publicContext,
      privateContext,
      bmiContext,
      pageContext,
      userPreferences,
    });
  },

  async confirmAction({ user, action }) {
    const type = safeText(action?.type);
    const payload = action?.payload || {};

    if (!type) {
      const e = new Error("Thiếu action type");
      e.statusCode = 400;
      throw e;
    }

    if (type === "NAVIGATE_TO_PAGE") {
      return {
        reply: "Đã sẵn sàng điều hướng cho bạn.",
        actionResult: payload,
        followUpAction: action,
      };
    }

    const e = new Error(`Action type chưa được hỗ trợ: ${type}`);
    e.statusCode = 400;
    throw e;
  },
};

export default aiService;