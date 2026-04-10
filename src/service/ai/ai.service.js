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

const isCasualFollowUpMessage = (message) => /^(tat ca|ca tuan|full tuan|trong tuan|liet ke het|luon|het luon|ca ngay|all|hello|hi|alo|ok|oke|uhm|um)$/.test(normalize(message));

const getRecentHistoryText = (history = [], limit = 4) =>
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

const formatMoney = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `${n.toLocaleString("vi-VN")} đ`;
};

const formatDateVN = (raw) => {
  if (!raw) return "—";
  const s = String(raw);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-");
    return `${d}/${m}/${y}`;
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("vi-VN");
};

const formatTimeHHMM = (raw) => String(raw || "").slice(0, 5);

const toDateTime = (bookingDate, startTime = "00:00") => {
  if (!bookingDate) return null;
  const value = new Date(`${bookingDate}T${formatTimeHHMM(startTime) || "00:00"}:00`);
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

const formatBookingLine = (booking) => {
  return `- ${formatDateVN(booking.bookingDate)} lúc ${formatTimeHHMM(booking.startTime)} với ${booking.trainerName}${booking.gymName ? ` tại ${booking.gymName}` : ""}`;
};

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
    return `${buildBmiSummaryLine(bmiContext)} Bạn nên tăng cân sạch: 3 bữa chính + 2 bữa phụ, ưu tiên cơm, yến mạch, khoai, trứng, sữa, thịt nạc, cá, đậu và trái cây. Mỗi bữa nên có đạm và tăng calo từ từ.`;
  }
  if (goal === "Giảm mỡ" || code === "overweight" || code === "obese") {
    return `${buildBmiSummaryLine(bmiContext)} Bạn nên kiểm soát calo hơn: giữ đạm cao, rau xanh nhiều, tinh bột vừa phải, hạn chế nước ngọt, đồ chiên và ăn khuya. Có thể chia khẩu phần theo 1/2 rau, 1/4 đạm, 1/4 tinh bột.`;
  }
  if (goal === "Tăng cơ") {
    return `${buildBmiSummaryLine(bmiContext)} Để tăng cơ, bạn nên giữ đạm ổn định mỗi ngày, thêm tinh bột tốt quanh buổi tập và ngủ đủ. Các thực phẩm dễ áp dụng là ức gà, bò nạc, cá, trứng, sữa chua, cơm, khoai và chuối.`;
  }
  return `${buildBmiSummaryLine(bmiContext)} Với thể trạng hiện tại, bạn nên ăn cân bằng: đủ protein, rau xanh, tinh bột tốt và nước. Nếu muốn, mình có thể gợi ý thực đơn 1 ngày phù hợp.`;
};

const workoutAdvice = (bmiContext) => {
  if (!bmiContext?.bmi) {
    return "Nếu mới bắt đầu, bạn có thể tập 3 buổi mỗi tuần với bài toàn thân, thêm 1-2 buổi đi bộ nhanh hoặc cardio nhẹ.";
  }
  const goal = bmiContext.goal;
  const code = bmiContext.classification?.code;
  if (goal === "Tăng cân" || code === "underweight") {
    return `${buildBmiSummaryLine(bmiContext)} Bạn nên ưu tiên tập tạ toàn thân 3-4 buổi mỗi tuần, tập trung squat, press, row và hạn chế cardio quá nhiều.`;
  }
  if (goal === "Giảm mỡ" || code === "overweight" || code === "obese") {
    return `${buildBmiSummaryLine(bmiContext)} Bạn nên kết hợp 3 buổi strength + 2 buổi cardio nhẹ mỗi tuần. Mục tiêu là đốt mỡ nhưng vẫn giữ cơ, nên đừng chỉ tập cardio.`;
  }
  if (goal === "Tăng cơ") {
    return `${buildBmiSummaryLine(bmiContext)} Bạn có thể bắt đầu 4 buổi mỗi tuần theo upper/lower hoặc ngực-lưng-chân-vai tay để tăng cơ rõ hơn.`;
  }
  return `${buildBmiSummaryLine(bmiContext)} Bạn có thể bắt đầu 3 buổi mỗi tuần với full-body hoặc upper/lower nhẹ để duy trì thể lực và tăng nền tảng vận động.`;
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
  if (!isLikelyValidGym({ name: pkg?.gymName || "Gym", address: pkg?.gymAddress || pkg?.gymName || "address" })) return false;
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
  safeArray(rows).slice(0, 12).map((x) => ({
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
      const da = new Date(`${a.bookingDate}T${formatTimeHHMM(a.startTime)}:00`).getTime();
      const db = new Date(`${b.bookingDate}T${formatTimeHHMM(b.startTime)}:00`).getTime();
      return da - db;
    });

const getUpcomingBooking = (bookings = []) => {
  const now = Date.now();
  return (
    safeArray(bookings).find((b) => {
      const time = new Date(`${b.bookingDate}T${formatTimeHHMM(b.startTime)}:00`).getTime();
      return time >= now && !["cancelled"].includes(safeLower(b.status));
    }) || null
  );
};

const buildGymCards = (gyms, bmiContext) => ({
  type: "gym_list",
  title: "Gym phù hợp",
  items: safeArray(gyms).slice(0, 8).map((gym) => ({
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

const buildPackageCards = (packages, bmiContext) => ({
  type: "package_list",
  title: "Gói tập phù hợp",
  items: safeArray(packages).slice(0, 8).map((pkg) => ({
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
    tags: [
      pkg.type || "Gói PT",
      bmiContext?.goal ? `Hợp ${bmiContext.goal.toLowerCase()}` : null,
    ].filter(Boolean),
    imageUrl: pkg.imageUrl || null,
    badge: pkg.type || "PT package",
    actionLabel: "Xem gói",
    action: buildNavigateAction(`/marketplace/packages/${pkg.id}`, "Xem gói"),
  })),
});

const buildTrainerCards = (rows) => ({
  type: "trainer_list",
  title: "PT phù hợp",
  items: safeArray(rows).slice(0, 8).map((row) => ({
    id: row.id,
    title: row.name,
    subtitle: row.packageName || row.gymName || "PT cá nhân",
    meta: [row.specialization, row.helperText, row.rating ? `★ ${row.rating}` : null].filter(Boolean).join(" • "),
    tags: [row.gymName, row.packageName].filter(Boolean),
    imageUrl: row.imageUrl || null,
    badge: row.gymName || null,
    actionLabel: row.activationId ? "Đặt lịch với PT này" : "Xem PT",
    action: row.activationId
      ? {
          type: "AI_SET_PROMPT",
          label: "Đặt lịch với PT này",
          payload: { prompt: `Tôi muốn đặt lịch với PT ${row.name}` },
        }
      : buildNavigateAction(`/marketplace/trainers/${row.id}`, "Xem PT"),
  })),
});

const parseDateFromMessage = (message) => {
  const source = safeText(message);
  const exact = source.match(/(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})/);
  if (exact) {
    const raw = exact[1];
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const [d, m, y] = raw.split("/");
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  const lower = normalize(message);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (lower.includes("hom nay")) return today.toISOString().slice(0, 10);
  if (lower.includes("ngay mai") || lower === "mai" || lower.includes(" mai ")) {
    return new Date(today.getTime() + DAY_MS).toISOString().slice(0, 10);
  }
  if (lower.includes("ngay kia") || lower.includes("mot")) {
    return new Date(today.getTime() + DAY_MS * 2).toISOString().slice(0, 10);
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
  member_package: [
    /\bgoi cua toi\b/,
    /\bgoi hien tai\b/,
    /\bcon bao nhieu buoi\b/,
    /\bcon bao nhieu session\b/,
    /\bpackage cua toi\b/,
  ],
  member_schedule: [
    /\blich sap toi\b/,
    /\blich cua toi\b/,
    /\bmai co lich\b/,
    /\bbuoi tiep theo\b/,
    /\bnhac lich\b/,
    /\btuan nay.*lich\b/,
  ],
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

const inferIntentFromFollowUp = ({ message, history = [], isAuthed }) => {
  const normalizedMessage = normalize(message);
  const recentText = getRecentHistoryText(history);
  if (!normalizedMessage) return null;

  if (isAuthed && /(tat ca|ca tuan|full tuan|trong tuan|liet ke|het lich|all ngay|tat ca cac ngay|ca ngay)/.test(normalizedMessage) && recentText.includes("lich")) {
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

const isTimeSensitiveTopic = (message) => {
  const lower = normalize(message);
  if (!lower) return false;

  const realtimeSignals = [
    "hien tai",
    "bay gio",
    "hom nay",
    "moi nhat",
    "nam nay",
    "vua moi",
    "cap nhat",
    "tin moi",
    "latest",
    "current",
    "today",
    "now",
  ];

  const volatileTopics = [
    "tong thong",
    "thu tuong",
    "chu tich nuoc",
    "bo truong",
    "ceo",
    "gia vang",
    "ty gia",
    "usd",
    "bitcoin",
    "btc",
    "ethereum",
    "gia xang",
    "thoi tiet",
    "du bao mua",
    "bong da",
    "ti so",
    "ket qua",
    "lich thi dau",
    "chung khoan",
    "co phieu",
    "luat moi",
    "quy dinh moi",
  ];

  return realtimeSignals.some((x) => lower.includes(x)) && volatileTopics.some((x) => lower.includes(x));
};

const buildTimeSensitiveReply = () => ({
  reply:
    "Mình không có tra cứu web thời gian thực trong chatbox này nên không dám xác nhận thông tin mới nhất ở thời điểm hiện tại. Với các câu hỏi như thời sự, chức danh hiện tại, giá cả, tỷ giá, thời tiết hoặc tỉ số, bạn nên kiểm tra từ nguồn cập nhật live.",
  suggestions: [],
  actions: [],
});

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
    "hue": ["hue"],
  };

  Object.entries(cityAliases).forEach(([canonical, aliases]) => {
    if (aliases.some((alias) => source.includes(alias))) hints.add(canonical);
  });

  const areaRegex = /(?:quan|huyen|phuong|xa)\s+[a-z0-9]+(?:\s+[a-z0-9]+){0,2}/g;
  for (const match of source.match(areaRegex) || []) hints.add(match.trim());

  return [...hints];
};

const buildGymSearchNeedle = (gym) =>
  normalize(
    [gym?.name, gym?.address, gym?.city, gym?.district, gym?.ward, gym?.description]
      .filter(Boolean)
      .join(" ")
  );

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
        .replace(/gym/g, " ")
        .replace(/phong tap/g, " ")
        .replace(/cho tap/g, " ")
        .replace(/giup minh/g, " ")
        .replace(/cho minh/g, " ")
        .replace(/tim/g, " ")
        .replace(/goi y/g, " ")
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
    safeArray(privateContext?.myPackages).find((x) => safeLower(x.status) === "active") ||
    safeArray(privateContext?.myPackages)[0] ||
    null;

  const matchedPackages = activePkg
    ? packages.filter((pkg) => Number(pkg.gymId) === Number(activePkg.gymId))
    : packages;

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
      const cleanedNeedle = lower.replace(/(pt|huan luyen vien|trainer)/g, "").trim();
      if (cleanedNeedle && searchHay.includes(cleanedNeedle)) score += 10;
      return {
        id: trainer.id,
        name: trainer.name,
        specialization: trainer.specialization || "PT cá nhân",
        rating: trainer.rating,
        packageName: pkg.name,
        gymName: pkg.gymName,
        activationId: activePkg && Number(activePkg.gymId) === Number(pkg.gymId) ? activePkg.activationId : null,
        helperText:
          activePkg && Number(activePkg.gymId) === Number(pkg.gymId)
            ? "có thể đặt ngay từ gói đang dùng"
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
      gymName: null,
      packageName: null,
      activationId: null,
      helperText: bmiContext?.goal ? `hợp mục tiêu ${bmiContext.goal.toLowerCase()}` : "cần chọn gym hoặc gói trước",
      imageUrl: trainer.imageUrl || null,
      score: safeNumber(trainer.rating, 0) * 10 + (goal && normalize(`${trainer.name} ${trainer.specialization}`).includes(goal) ? 15 : 0),
    }))
    .sort((a, b) => b.score - a.score || String(a.name).localeCompare(String(b.name)))
    .slice(0, 8);
};

const replyForMemberPackage = (privateContext) => {
  const first =
    safeArray(privateContext?.myPackages).find((x) => safeLower(x.status) === "active") ||
    safeArray(privateContext?.myPackages)[0];
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
  const asksThisWeek = ["tuan nay", "trong tuan", "full tuan", "ca tuan", "tat ca cac ngay trong tuan"].some((x) => normalizedMessage.includes(x));
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

    const reply = [
      `Tuần này bạn có ${weekBookings.length} buổi tập đã xác nhận:`,
      ...weekBookings.map(formatBookingLine),
    ].join("\n");

    return {
      reply,
      suggestions: [],
      actions: [buildNavigateAction("/member/bookings", "Mở lịch của tôi")],
    };
  }

  if (asksToday || asksTomorrow) {
    const target = asksTomorrow ? new Date(Date.now() + DAY_MS) : new Date();
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

const resolveTrainerFromMessage = (message, trainerRows) => {
  const lower = normalize(message);
  return safeArray(trainerRows).find((t) => lower.includes(normalize(t?.User?.username || t?.name || t?.username || ""))) || null;
};

const buildBookingReply = async ({ user, message, privateContext, pageContext }) => {
  if (!user?.id) {
    return {
      reply: "Để đặt lịch PT thật, bạn cần đăng nhập. Khi là member, hệ thống sẽ kiểm tra gói active của gym rồi mới lấy PT phù hợp để đặt lịch.",
      suggestions: [],
        actions: [buildNavigateAction("/login", "Đăng nhập"), buildNavigateAction("/register", "Đăng ký")],
    };
  }

  const myPackages = safeArray(privateContext?.myPackages);
  const activePackage = myPackages.find((x) => safeLower(x.status) === "active") || null;

  if (!activePackage) {
    return {
      reply: "Bạn chưa có gói active để đặt lịch PT. Với GFMS, flow đúng là vào gym, mua gói tập của gym đó, rồi mới đặt PT phù hợp thuộc gói đó.",
      suggestions: [],
      actions: [buildNavigateAction("/marketplace/gyms", "Xem gym"), buildNavigateAction("/register", "Đăng ký")],
    };
  }

  const activationId = Number(pageContext?.activationId) || Number(activePackage.activationId);
  let trainerBundle = null;
  try {
    trainerBundle = await bookingService.getAvailableTrainers(user.id, activationId);
  } catch {
    trainerBundle = null;
  }

  const trainers = safeArray(trainerBundle?.trainers);
  if (!trainers.length) {
    return {
      reply: `Gói ${activePackage.packageName} của bạn hiện chưa tìm thấy PT khả dụng. Bạn có thể kiểm tra lại gói hoặc đổi sang gói PT khác tại ${activePackage.gymName || "gym hiện tại"}.`,
      suggestions: [],
      actions: [buildNavigateAction("/member/my-packages", "Mở gói của tôi")],
    };
  }

  const selectedTrainer = resolveTrainerFromMessage(message, trainers);
  if (!selectedTrainer) {
    const trainerCards = buildTrainerCards(
      trainers.slice(0, 8).map((t) => ({
        id: t.id,
        name: t?.User?.username || t?.name || `PT #${t.id}`,
        specialization: Array.isArray(t.specialization) ? t.specialization.join(", ") : safeText(t.specialization),
        rating: t.rating,
        gymName: activePackage.gymName,
        packageName: activePackage.packageName,
        helperText: "bạn chỉ có thể đặt PT thuộc gói active này",
        activationId: activePackage.activationId,
      }))
    );

    return {
      reply: `Bạn đang có gói ${activePackage.packageName}${activePackage.gymName ? ` tại ${activePackage.gymName}` : ""}. Mình chỉ lấy các PT phù hợp với gói active này để đặt lịch cho bạn. Bạn chọn một PT trước nhé.`,
      suggestions: trainers.slice(0, 3).map((t) => ({
        type: "message",
        label: `${t?.User?.username || t?.name || `PT #${t.id}`}`,
        value: `Tôi muốn đặt lịch với PT ${t?.User?.username || t?.name || `PT #${t.id}`}`,
      })),
      cards: trainerCards,
    };
  }

  const selectedDate = parseDateFromMessage(message);
  if (!selectedDate) {
    const suggestedDate = new Date(Date.now() + DAY_MS).toISOString().slice(0, 10);
    return {
      reply: `Mình đã xác định PT ${selectedTrainer?.User?.username || selectedTrainer?.name || selectedTrainer.id}. Bạn cho mình ngày muốn tập theo dạng YYYY-MM-DD, ví dụ ${suggestedDate}.`,
      suggestions: [{ type: "message", label: "Ngày mai", value: `Đặt với PT ${selectedTrainer?.User?.username || selectedTrainer?.name || selectedTrainer.id} ngày ${suggestedDate}` }],
    };
  }

  let slots = [];
  try {
    slots = await bookingService.getAvailableSlots(user.id, { trainerId: selectedTrainer.id, date: selectedDate, activationId });
  } catch (e) {
    return {
      reply: e.message || "Không thể kiểm tra slot lúc này.",
      suggestions: [],
      actions: [buildNavigateAction("/member/bookings", "Mở lịch của tôi")],
    };
  }

  if (!slots.length) {
    return {
      reply: `PT ${selectedTrainer?.User?.username || selectedTrainer?.name || selectedTrainer.id} hiện chưa có slot trống vào ngày ${formatDateVN(selectedDate)}. Bạn chọn ngày khác nhé.`,
      suggestions: [{ type: "message", label: "Chọn ngày khác", value: `Đặt với PT ${selectedTrainer?.User?.username || selectedTrainer?.name || selectedTrainer.id} ngày ${new Date(Date.now() + DAY_MS * 2).toISOString().slice(0, 10)}` }],
    };
  }

  const selectedTime = parseTimeFromMessage(message);
  if (!selectedTime) {
    return {
      reply: `Mình tìm được ${slots.length} slot trống cho PT ${selectedTrainer?.User?.username || selectedTrainer?.name || selectedTrainer.id} vào ngày ${formatDateVN(selectedDate)}. Bạn chọn giờ giúp mình nhé.`,
      suggestions: slots.slice(0, 5).map((s) => ({
        type: "message",
        label: formatTimeHHMM(s.startTime),
        value: `Đặt với PT ${selectedTrainer?.User?.username || selectedTrainer?.name || selectedTrainer.id} ngày ${selectedDate} lúc ${formatTimeHHMM(s.startTime)}`,
      })),
    };
  }

  const matchedSlot = slots.find((s) => formatTimeHHMM(s.startTime) === selectedTime);
  if (!matchedSlot) {
    return {
      reply: `Khung giờ ${selectedTime} hiện không còn trống. Bạn chọn một giờ còn lại bên dưới nhé.`,
      suggestions: slots.slice(0, 5).map((s) => ({
        type: "message",
        label: formatTimeHHMM(s.startTime),
        value: `Đặt với PT ${selectedTrainer?.User?.username || selectedTrainer?.name || selectedTrainer.id} ngày ${selectedDate} lúc ${formatTimeHHMM(s.startTime)}`,
      })),
    };
  }

  return {
    reply: `Mình đã sẵn sàng đặt lịch cho bạn: ${selectedTrainer?.User?.username || selectedTrainer?.name || selectedTrainer.id}, ngày ${formatDateVN(selectedDate)}, lúc ${selectedTime}, thuộc gói ${activePackage.packageName}. Bạn xác nhận là hệ thống sẽ tạo booking thật ngay.`,
    suggestions: [],
      actions: [buildNavigateAction("/member/bookings", "Mở lịch của tôi")],
    cards: {
      type: "booking_candidate",
      title: "Xác nhận buổi tập",
      items: [
        {
          id: `${selectedTrainer.id}-${selectedDate}-${selectedTime}`,
          title: `${selectedTrainer?.User?.username || selectedTrainer?.name || selectedTrainer.id} • ${formatDateVN(selectedDate)}`,
          subtitle: `${selectedTime} • ${activePackage.packageName}`,
          meta: activePackage.gymName || "",
          badge: "Booking thật",
        },
      ],
    },
    proposedAction: {
      type: "CREATE_BOOKING",
      label: "Xác nhận đặt lịch",
      payload: { activationId, trainerId: selectedTrainer.id, date: selectedDate, startTime: selectedTime },
    },
    requiresConfirmation: true,
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

const buildAiContextSnapshot = ({ isAuthed, publicContext, privateContext, bmiContext, pageContext, intent }) => {
  const snapshot = {
    intent,
    pageType: pageContext?.pageType || "general",
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
      packages: safeArray(publicContext?.packages).slice(0, 4).map((x) => ({ id: x.id, name: x.name, gymName: x.gymName, sessions: x.sessions, price: x.price })),
      trainers: safeArray(publicContext?.trainers).slice(0, 4).map((x) => ({ id: x.id, name: x.name, specialization: x.specialization, rating: x.rating })),
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

const answerGeneralConversation = async ({ message, history = [], isAuthed, bmiContext, pageContext }) => {
  if (isTimeSensitiveTopic(message)) {
    return buildTimeSensitiveReply();
  }

  const contextParts = {
    isAuthed,
    pageType: pageContext?.pageType || "general",
    currentDate: new Date().toISOString(),
    hasRealtimeWebAccess: false,
    bmiSummary: bmiContext?.bmi ? buildBmiSummaryLine(bmiContext) : null,
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

const finalizeAssistantResponse = async ({ response, message, history, intent, isAuthed, publicContext, privateContext, bmiContext, pageContext }) => {
  const baseResponse = {
    suggestions: [],
    actions: [],
    cards: null,
    proposedAction: null,
    requiresConfirmation: false,
    bmiSummary: bmiContext || null,
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
    }),
  });

  return {
    ...baseResponse,
    reply: safeText(rewrittenReply) || reply,
  };
};

const inferIntentHybrid = async ({ message, history = [], isAuthed }) => {
  const followUpIntent = inferIntentFromFollowUp({ message, history, isAuthed });
  if (followUpIntent) return followUpIntent;

  const ruleIntent = inferIntent(message, isAuthed);
  if (ruleIntent !== "general") return ruleIntent;

  const llmIntent = await classifyIntentWithOpenRouter({
    systemPrompt: GFMS_INTENT_PROMPT,
    message,
    labels: [
      "general",
      "bmi",
      "nutrition",
      "workout",
      "gym",
      "package",
      "trainer",
      "booking",
      "member_package",
      "member_schedule",
    ],
  });

  if (!llmIntent) return ruleIntent;
  if (!isAuthed && ["member_package", "member_schedule"].includes(llmIntent)) return "general";
  return llmIntent;
};

const aiService = {
  async chat({ user, body }) {
    const message = safeText(body?.message);
    const history = safeArray(body?.history);
    const pageContext = body?.pageContext || {};

    if (!message) {
      const e = new Error("Thiếu message");
      e.statusCode = 400;
      throw e;
    }

    const isAuthed = !!user?.id;
    const [publicContext, privateContext] = await Promise.all([
      buildPublicContext(),
      buildPrivateContext(user?.id || null),
    ]);

    const bmiContext = extractBmiContext({ message, history, privateContext });
    const navAction = detectNavigationIntent(message, isAuthed);
    const intent = await inferIntentHybrid({ message, history, isAuthed });

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
      };
    } else if (intent === "member_package" && isAuthed) {
      const res = replyForMemberPackage(privateContext);
      response = { ...res, cards: null, proposedAction: null, requiresConfirmation: false, bmiSummary: bmiContext };
    } else if (intent === "member_schedule" && isAuthed) {
      const res = replyForMemberSchedule(message, privateContext, history);
      response = { ...res, cards: null, proposedAction: null, requiresConfirmation: false, bmiSummary: bmiContext };
    } else if (intent === "booking") {
      const res = await buildBookingReply({ user, message, privateContext, pageContext });
      response = { ...res, bmiSummary: bmiContext };
    } else if (intent === "bmi") {
      if (!bmiContext?.bmi) {
        response = {
          reply: "Bạn nhập giúp mình chiều cao và cân nặng theo kiểu tự nhiên, ví dụ: tôi cao 170cm nặng 65kg và muốn giảm mỡ. Mình sẽ tính nhanh rồi tư vấn tiếp cho bạn.",
          suggestions: [],
          cards: null,
          proposedAction: null,
          requiresConfirmation: false,
          bmiSummary: null,
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
      };
    } else {
      const general = await answerGeneralConversation({ message, history, isAuthed, bmiContext, pageContext });
      response = {
        ...general,
        cards: null,
        proposedAction: null,
        requiresConfirmation: false,
        bmiSummary: bmiContext,
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

    if (type === "CREATE_BOOKING") {
      const data = await bookingService.createBooking(user.id, {
        activationId: payload.activationId,
        trainerId: payload.trainerId,
        date: payload.date,
        startTime: payload.startTime,
      });

      return {
        reply: "Đặt lịch thành công. Mình đã tạo booking mới cho bạn.",
        actionResult: data,
        followUpAction: buildNavigateAction("/member/bookings", "Mở lịch của tôi"),
      };
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
