import marketplaceService from "../marketplace/marketplace.service";
import bookingService from "../member/booking.service";
import memberMyPackageService from "../member/myPackages.service";
import memberProfileService from "../member/profile.service";

const DAY_MS = 24 * 60 * 60 * 1000;

const safeText = (v) => String(v || "").trim();
const safeArray = (v) => (Array.isArray(v) ? v : []);
const safeLower = (v) => safeText(v).toLowerCase();
const safeNumber = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const normalize = (v) =>
  safeLower(v)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9:/.\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

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
    .map((x) => ({ id: x.id, name: x.name, address: x.address, status: x.status, images: x.images || [] }))
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
      bmiContext?.goal ? `Hợp mục tiêu ${bmiContext.goal.toLowerCase()}` : null,
    ]
      .filter(Boolean)
      .join(" • "),
    badge: pkg.type || "PT package",
    actionLabel: "Xem gói",
    action: buildNavigateAction(`/marketplace/packages/${pkg.id}`, "Xem gói"),
  })),
});

const buildTrainerCards = (rows) => ({
  type: "trainer_list",
  title: "PT phù hợp theo gói",
  items: safeArray(rows).slice(0, 8).map((row) => ({
    id: row.id,
    title: row.name,
    subtitle: row.packageName || row.gymName || "PT",
    meta: [row.specialization, row.helperText, row.rating ? `★ ${row.rating}` : null].filter(Boolean).join(" • "),
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

const detectNavigationIntent = (message, isAuthed) => {
  const lower = normalize(message);
  if (isAuthed && ["mo goi cua toi", "vao goi cua toi"].some((w) => lower.includes(w))) {
    return buildNavigateAction("/member/my-packages", "Mở gói của tôi");
  }
  if (isAuthed && ["mo lich cua toi", "vao lich cua toi", "mo trang lich"].some((w) => lower.includes(w))) {
    return buildNavigateAction("/member/bookings", "Mở lịch của tôi");
  }
  if (isAuthed && ["mo tien do", "vao tien do", "trang tien do"].some((w) => lower.includes(w))) {
    return buildNavigateAction("/member/progress", "Mở tiến độ");
  }
  return null;
};

const buildPublicContext = async () => {
  const [gymsRes, trainersRes, packagesRes] = await Promise.allSettled([
    marketplaceService.listGyms({}),
    marketplaceService.listTrainers({}),
    marketplaceService.listPackages({}),
  ]);

  return {
    gyms: gymsRes.status === "fulfilled" ? summarizeGyms(gymsRes.value) : [],
    trainers: trainersRes.status === "fulfilled" ? summarizeTrainers(trainersRes.value) : [],
    packages: packagesRes.status === "fulfilled" ? summarizePackages(packagesRes.value) : [],
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
  return gyms
    .map((gym) => {
      const hay = normalize(`${gym.name} ${gym.address}`);
      let score = 1;
      if (lower && hay.includes(lower.replace(/\bgym\b/g, "").trim())) score += 2;
      if (bmiContext?.goal) score += 1;
      if (gym.status === "active") score += 1;
      return { ...gym, score };
    })
    .sort((a, b) => b.score - a.score || String(a.name).localeCompare(String(b.name)))
    .slice(0, 8);
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

const recommendTrainersByPackages = (publicContext, privateContext, bmiContext) => {
  const trainers = safeArray(publicContext?.trainers);
  const packages = safeArray(publicContext?.packages);
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
            ? "thuộc gym/gói bạn đang có thể dùng"
            : "đi kèm gói tập của gym này",
      };
    })
    .filter(Boolean);

  if (rows.length) return rows.slice(0, 8);

  return trainers.slice(0, 8).map((trainer) => ({
    id: trainer.id,
    name: trainer.name,
    specialization: trainer.specialization || "PT cá nhân",
    rating: trainer.rating,
    gymName: null,
    packageName: null,
    activationId: null,
    helperText: bmiContext?.goal ? `hợp mục tiêu ${bmiContext.goal.toLowerCase()}` : "cần đi qua gói tập của gym",
  }));
};

const replyForMemberPackage = (privateContext) => {
  const first =
    safeArray(privateContext?.myPackages).find((x) => safeLower(x.status) === "active") ||
    safeArray(privateContext?.myPackages)[0];
  if (!first) {
    return {
      reply: "Hiện tại bạn chưa có gói active. Muốn đặt lịch PT, bạn cần mua gói tập của gym trước rồi mới chọn PT thuộc gói đó.",
      suggestions: [
        { type: "message", label: "Gợi ý gói tập phù hợp", value: "Gợi ý gói tập phù hợp" },
        { type: "action", label: "Xem gym", action: buildNavigateAction("/marketplace/gyms", "Xem gym") },
      ],
    };
  }
  return {
    reply: `Bạn đang có gói ${first.packageName}${first.gymName ? ` tại ${first.gymName}` : ""}. Bạn còn ${first.sessionsRemaining} buổi, đã dùng ${first.sessionsUsed}/${first.totalSessions}. Hạn dùng đến ${formatDateVN(first.expiryDate)}.`,
    suggestions: [
      { type: "message", label: "Lịch sắp tới của tôi", value: "Lịch sắp tới của tôi" },
    ],
  };
};

const replyForMemberSchedule = (privateContext) => {
  const upcoming = getUpcomingBooking(privateContext?.myBookings || []);
  if (!upcoming) {
    return {
      reply: "Hiện mình chưa thấy buổi tập sắp tới nào của bạn. Khi đặt lịch, bạn sẽ đi theo gym → gói tập → PT phù hợp của gói đó.",
      suggestions: [
        { type: "message", label: "Gói của tôi", value: "Gói của tôi" },
      ],
    };
  }
  return {
    reply: `Buổi gần nhất của bạn là ngày ${formatDateVN(upcoming.bookingDate)} lúc ${formatTimeHHMM(upcoming.startTime)} với ${upcoming.trainerName}${upcoming.gymName ? ` tại ${upcoming.gymName}` : ""}. Trạng thái hiện tại là ${upcoming.status}.`,
    suggestions: [
      { type: "action", label: "Mở lịch của tôi", action: buildNavigateAction("/member/bookings", "Mở lịch của tôi") },
    ],
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
      suggestions: [{ type: "action", label: "Đăng nhập", action: buildNavigateAction("/login", "Đăng nhập") }],
    };
  }

  const myPackages = safeArray(privateContext?.myPackages);
  const activePackage = myPackages.find((x) => safeLower(x.status) === "active") || null;

  if (!activePackage) {
    return {
      reply: "Bạn chưa có gói active để đặt lịch PT. Với GFMS, flow đúng là vào gym, mua gói tập của gym đó, rồi mới đặt PT phù hợp thuộc gói đó.",
      suggestions: [
        { type: "message", label: "Gợi ý gym cho tôi", value: "Gợi ý gym cho tôi" },
        { type: "message", label: "Gợi ý gói tập phù hợp", value: "Gợi ý gói tập phù hợp" },
      ],
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
      suggestions: [{ type: "action", label: "Mở gói của tôi", action: buildNavigateAction("/member/my-packages", "Mở gói của tôi") }],
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
      suggestions: [{ type: "action", label: "Mở lịch của tôi", action: buildNavigateAction("/member/bookings", "Mở lịch của tôi") }],
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
    suggestions: [{ type: "action", label: "Mở lịch của tôi", action: buildNavigateAction("/member/bookings", "Mở lịch của tôi") }],
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
  if (isAuthed) {
    return {
      reply: bmiContext?.bmi
        ? `${buildBmiSummaryLine(bmiContext)} Mình có thể xem gói hiện tại, lịch sắp tới, tư vấn ăn uống, gợi ý gym/gói tập và hỗ trợ đặt lịch PT đúng flow gym → gói tập → PT.`
        : "Mình có thể giúp bạn xem gói hiện tại, lịch sắp tới, tư vấn ăn uống, gợi ý gym/gói tập và hỗ trợ đặt lịch PT đúng flow gym → gói tập → PT.",
      suggestions: [
        { type: "message", label: "Gói của tôi", value: "Gói của tôi" },
        { type: "message", label: "Lịch sắp tới", value: "Lịch sắp tới của tôi" },
        { type: "message", label: "Tôi nên ăn gì?", value: "Tôi nên ăn gì?" },
      ],
    };
  }

  return {
    reply: bmiContext?.bmi
      ? `${buildBmiSummaryLine(bmiContext)} Bạn có thể hỏi ngắn như “ăn gì”, “gym nào”, “gói nào ổn”, “PT nào hợp”. Mình sẽ trả đúng trọng tâm.`
      : "Mình có thể tư vấn BMI, ăn uống, lịch tập, gym, gói tập và PT. Bạn cứ hỏi ngắn như “ăn gì”, “gym nào”, “gói nào ổn” là mình vẫn hiểu.",
    suggestions: [
      { type: "message", label: "Tính BMI cho tôi", value: "Tôi cao 170cm nặng 65kg, hãy tính BMI và tư vấn cho tôi" },
      { type: "message", label: "Gợi ý gym cho tôi", value: "Gợi ý gym cho tôi" },
      { type: "message", label: "Tôi nên ăn gì?", value: "Tôi nên ăn gì?" },
    ],
  };
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
    const intent = inferIntent(message, isAuthed);

    if (navAction) {
      return {
        reply: "Mình đã hiểu trang bạn muốn mở.",
        suggestions: [],
        cards: null,
        proposedAction: navAction,
        requiresConfirmation: false,
        bmiSummary: bmiContext,
      };
    }

    if (intent === "member_package" && isAuthed) {
      const res = replyForMemberPackage(privateContext);
      return { ...res, cards: null, proposedAction: null, requiresConfirmation: false, bmiSummary: bmiContext };
    }

    if (intent === "member_schedule" && isAuthed) {
      const res = replyForMemberSchedule(privateContext);
      return { ...res, cards: null, proposedAction: null, requiresConfirmation: false, bmiSummary: bmiContext };
    }

    if (intent === "booking") {
      const res = await buildBookingReply({ user, message, privateContext, pageContext });
      return { ...res, bmiSummary: bmiContext };
    }

    if (intent === "bmi") {
      if (!bmiContext?.bmi) {
        return {
          reply: "Bạn nhập giúp mình cả chiều cao và cân nặng nhé, ví dụ 170 cm và 65 kg.",
          suggestions: [{ type: "message", label: "Tính BMI cho tôi", value: "Tôi cao 170cm nặng 65kg, hãy tính BMI và tư vấn cho tôi" }],
          cards: null,
          proposedAction: null,
          requiresConfirmation: false,
          bmiSummary: null,
        };
      }
      return {
        reply: `${buildBmiSummaryLine(bmiContext)} ${bmiContext.goal ? `Mục tiêu hiện tại của bạn là ${bmiContext.goal.toLowerCase()}.` : ""}`.trim(),
        suggestions: [
          { type: "message", label: "Gợi ý ăn uống cho tôi", value: "Gợi ý ăn uống cho tôi" },
          { type: "message", label: "Gợi ý gym cho tôi", value: "Gợi ý gym cho tôi" },
        ],
        cards: null,
        proposedAction: null,
        requiresConfirmation: false,
        bmiSummary: bmiContext,
      };
    }

    if (intent === "nutrition") {
      return {
        reply: nutritionAdvice(bmiContext),
        suggestions: [
          { type: "message", label: "Tôi nên tập gì?", value: "Tôi nên tập gì?" },
          { type: "message", label: "Gợi ý gym cho tôi", value: "Gợi ý gym cho tôi" },
        ],
        cards: null,
        proposedAction: null,
        requiresConfirmation: false,
        bmiSummary: bmiContext,
      };
    }

    if (intent === "workout") {
      return {
        reply: workoutAdvice(bmiContext),
        suggestions: [
          { type: "message", label: "Tôi nên ăn gì?", value: "Tôi nên ăn gì?" },
          { type: "message", label: "Gợi ý gym cho tôi", value: "Gợi ý gym cho tôi" },
        ],
        cards: null,
        proposedAction: null,
        requiresConfirmation: false,
        bmiSummary: bmiContext,
      };
    }

    if (intent === "gym") {
      const gyms = recommendGyms(publicContext, message, bmiContext);
      return {
        reply: gyms.length
          ? `Mình đã chọn ${Math.min(gyms.length, 8)} gym phù hợp${bmiContext?.bmi ? ` dựa trên BMI ${bmiContext.bmi}` : ""}${bmiContext?.goal ? ` và mục tiêu ${bmiContext.goal.toLowerCase()}` : ""}.`
          : "Hiện mình chưa lấy được danh sách gym phù hợp.",
        suggestions: [{ type: "message", label: "Gợi ý gói tập phù hợp", value: "Gợi ý gói tập phù hợp" }],
        cards: gyms.length ? buildGymCards(gyms, bmiContext) : null,
        proposedAction: null,
        requiresConfirmation: false,
        bmiSummary: bmiContext,
      };
    }

    if (intent === "package") {
      const packages = recommendPackages(publicContext, bmiContext);
      return {
        reply: packages.length
          ? "Mình đang ưu tiên các gói tập của gym đang hoạt động. Vì PT đi theo gói, bạn nên chọn gym và gói trước rồi mới đặt PT phù hợp của gói đó."
          : "Hiện mình chưa lấy được danh sách gói tập.",
        suggestions: [{ type: "message", label: "Gợi ý gym cho tôi", value: "Gợi ý gym cho tôi" }],
        cards: packages.length ? buildPackageCards(packages, bmiContext) : null,
        proposedAction: null,
        requiresConfirmation: false,
        bmiSummary: bmiContext,
      };
    }

    if (intent === "trainer") {
      const trainerRows = recommendTrainersByPackages(publicContext, privateContext, bmiContext);
      const hasActivePackage = !!safeArray(privateContext?.myPackages).find((x) => safeLower(x.status) === "active");
      return {
        reply: hasActivePackage
          ? "Mình đang ưu tiên PT phù hợp với gym/gói bạn đang có hoặc các gói liên quan. Bạn chỉ có thể đặt PT thuộc gói active của mình."
          : "Mình đã lọc PT theo các gói tập của gym. Với GFMS, PT không đi độc lập mà đi kèm gói tập của gym, nên nếu chưa có gói thì bạn cần chọn gym và mua gói trước.",
        suggestions: [
          { type: "message", label: "Gợi ý gói tập phù hợp", value: "Gợi ý gói tập phù hợp" },
          { type: "message", label: hasActivePackage ? "Đặt lịch PT" : "Gợi ý gym cho tôi", value: hasActivePackage ? "Tôi muốn đặt lịch PT" : "Gợi ý gym cho tôi" },
        ],
        cards: trainerRows.length ? buildTrainerCards(trainerRows) : null,
        proposedAction: null,
        requiresConfirmation: false,
        bmiSummary: bmiContext,
      };
    }

    const general = buildGeneralReply(isAuthed, bmiContext);
    return {
      ...general,
      cards: null,
      proposedAction: null,
      requiresConfirmation: false,
      bmiSummary: bmiContext,
    };
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
