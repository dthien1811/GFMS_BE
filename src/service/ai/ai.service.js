import OpenAI from "openai";
import marketplaceService from "../marketplace/marketplace.service";
import bookingService from "../member/booking.service";
import memberMyPackageService from "../member/myPackages.service";
import memberProfileService from "../member/profile.service";

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const MODEL = process.env.OPENAI_MODEL || "gpt-5.4";

const safeText = (v) => String(v || "").trim();
const safeLower = (v) => safeText(v).toLowerCase();
const safeArray = (v) => (Array.isArray(v) ? v : []);

const tryJsonParse = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    const match = String(text || "").match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
};

const normalizeDateInput = (raw) => {
  const s = safeText(raw);
  if (!s) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const dd = String(m[1]).padStart(2, "0");
    const mm = String(m[2]).padStart(2, "0");
    const yyyy = m[3];
    return `${yyyy}-${mm}-${dd}`;
  }

  return null;
};

const normalizeTimeInput = (raw) => {
  const s = safeLower(raw);
  if (!s) return null;

  const hhmm = s.match(/\b(\d{1,2}):(\d{2})\b/);
  if (hhmm) {
    const h = String(hhmm[1]).padStart(2, "0");
    const m = String(hhmm[2]).padStart(2, "0");
    return `${h}:${m}`;
  }

  const hh = s.match(/\b(\d{1,2})h\b/);
  if (hh) {
    const h = String(hh[1]).padStart(2, "0");
    return `${h}:00`;
  }

  return null;
};

const pickDateFromMessage = (message) => {
  const s = safeText(message);
  const match = s.match(/(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})/);
  return match ? normalizeDateInput(match[1]) : null;
};

const pickTimeFromMessage = (message) => {
  const s = safeText(message);
  const match = s.match(/(\d{1,2}:\d{2}|\d{1,2}h)/i);
  return match ? normalizeTimeInput(match[1]) : null;
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

const summarizeGyms = (rows) =>
  safeArray(rows).slice(0, 8).map((x) => ({
    id: x.id,
    name: x.name,
    address: x.address,
    status: x.status,
  }));

const summarizeTrainers = (rows) =>
  safeArray(rows).slice(0, 8).map((x) => ({
    id: x.id,
    name: x?.User?.username || x?.username || `PT #${x.id}`,
    specialization: x.specialization,
    rating: x.rating,
    gymId: x.gymId,
  }));

const summarizePackages = (rows) =>
  safeArray(rows).slice(0, 10).map((x) => ({
    id: x.id,
    name: x.name,
    type: x.type,
    sessions: x.sessions,
    price: x.price,
    gymId: x.gymId,
    gymName: x?.Gym?.name || null,
  }));

const summarizeMyPackages = (rows) =>
  safeArray(rows).slice(0, 8).map((x) => ({
    activationId: Number(x?.id) || null,
    packageName: x?.Package?.name || x?.name || "Gói tập",
    packageType: x?.Package?.type || "",
    packageDescription: x?.Package?.description || "",
    gymName: x?.Gym?.name || "",
    status: x?.status || "",
    totalSessions: Number(x?.totalSessions || x?.Package?.sessions || 0),
    sessionsUsed: Number(x?.sessionsUsed || 0),
    sessionsRemaining:
      x?.sessionsRemaining != null
        ? Number(x.sessionsRemaining)
        : Math.max(
            0,
            Number(x?.totalSessions || x?.Package?.sessions || 0) -
              Number(x?.sessionsUsed || 0)
          ),
    expiryDate: x?.expiryDate || null,
    paymentStatus: x?.Transaction?.paymentStatus || null,
  }));

const summarizeBookings = (rows) =>
  safeArray(rows)
    .slice(0, 20)
    .map((x) => ({
      id: x.id,
      bookingDate: x.bookingDate,
      startTime: x.startTime,
      endTime: x.endTime,
      status: x.status,
      trainerName: x?.Trainer?.User?.username || `PT #${x?.trainerId || "?"}`,
      packageName: x?.Package?.name || "",
      gymName: x?.Gym?.name || "",
    }))
    .sort((a, b) => {
      const da = new Date(`${a.bookingDate}T${String(a.startTime).slice(0, 5)}:00`).getTime();
      const db = new Date(`${b.bookingDate}T${String(b.startTime).slice(0, 5)}:00`).getTime();
      return da - db;
    });

const buildNavigateAction = (path, label) => ({
  type: "NAVIGATE_TO_PAGE",
  label,
  payload: { path },
});

const messageHasAny = (message, words = []) => {
  const lower = safeLower(message);
  return words.some((w) => lower.includes(w));
};

const getUpcomingBooking = (bookings = []) => {
  const now = Date.now();
  return safeArray(bookings).find((b) => {
    const t = new Date(`${b.bookingDate}T${String(b.startTime).slice(0, 5)}:00`).getTime();
    return t >= now && !["cancelled"].includes(safeLower(b.status));
  }) || null;
};

const detectNavigationIntent = (message, isAuthed) => {
  const lower = safeLower(message);

  if (
    isAuthed &&
    ["mở gói của tôi", "mở gói", "gói của tôi", "my packages", "my package"].some((w) =>
      lower.includes(w)
    )
  ) {
    return buildNavigateAction("/member/my-packages", "Mở gói của tôi");
  }

  if (
    isAuthed &&
    ["lịch đã đặt", "lịch của tôi", "booking của tôi", "bookings", "mở lịch của tôi"].some((w) =>
      lower.includes(w)
    )
  ) {
    return buildNavigateAction("/member/bookings", "Mở lịch đã đặt");
  }

  if (
    isAuthed &&
    ["mở tiến độ", "mở trang tiến độ", "tiến độ", "progress", "bmi"].some((w) =>
      lower.includes(w)
    )
  ) {
    return buildNavigateAction("/member/progress", "Mở trang tiến độ");
  }

  if (
    isAuthed &&
    ["hồ sơ", "mở hồ sơ", "profile của tôi"].some((w) => lower.includes(w))
  ) {
    return buildNavigateAction("/member/profile", "Mở hồ sơ");
  }

  if (
    isAuthed &&
    ["booking wizard", "mở booking wizard", "đi tới đặt lịch", "mở trang đặt lịch"].some((w) =>
      lower.includes(w)
    )
  ) {
    return buildNavigateAction("/member/booking/wizard", "Mở booking wizard");
  }

  if (["xem danh sách gym", "xem gym", "gym", "phòng gym"].some((w) => lower.includes(w))) {
    return buildNavigateAction("/marketplace/gyms", "Xem danh sách gym");
  }

  if (["xem pt", "trainer", "huấn luyện viên", "xem danh sách pt", "pt"].some((w) => lower.includes(w))) {
    return buildNavigateAction("/marketplace/trainers", "Xem danh sách PT");
  }

  return null;
};

const resolveTrainerFromMessage = (message, trainerRows) => {
  const lower = safeLower(message);

  const byId = lower.match(/(?:pt|trainer)\s*#?\s*(\d+)/i);
  if (byId) {
    const id = Number(byId[1]);
    return safeArray(trainerRows).find((t) => Number(t.id) === id) || null;
  }

  return (
    safeArray(trainerRows).find((t) => {
      const name = safeLower(t?.User?.username || t?.username || t?.name);
      return name && lower.includes(name);
    }) || null
  );
};

const buildRuleBasedReply = ({ message, isAuthed, privateContext, navAction }) => {
  if (isAuthed && messageHasAny(message, ["còn bao nhiêu buổi", "gói của tôi", "sessions"])) {
    const first = safeArray(privateContext?.myPackages).find((x) => safeLower(x.status) === "active")
      || safeArray(privateContext?.myPackages)[0];

    if (first) {
      const desc = first.gymName ? ` tại ${first.gymName}` : "";
      return {
        reply: `Bạn đang có gói ${first.packageName}${desc}. Số buổi còn lại là ${first.sessionsRemaining}, đã dùng ${first.sessionsUsed}/${first.totalSessions}. Hạn sử dụng đến ${formatDateVN(first.expiryDate)}.`,
        suggestions: [
          { type: "message", label: "Lịch tập sắp tới của tôi", value: "Lịch tập sắp tới của tôi" },
          { type: "message", label: "Đặt lịch PT", value: "Tôi muốn đặt lịch PT" },
          { type: "action", label: "Mở gói của tôi", action: buildNavigateAction("/member/my-packages", "Mở gói của tôi") },
        ],
        proposedAction: null,
        requiresConfirmation: false,
      };
    }
  }

  if (isAuthed && messageHasAny(message, ["lịch tập sắp tới", "lịch của tôi", "booking sắp tới"])) {
    const upcoming = getUpcomingBooking(privateContext?.myBookings || []);
    if (upcoming) {
      return {
        reply: `Lịch tập sắp tới của bạn là ngày ${formatDateVN(upcoming.bookingDate)} từ ${String(
          upcoming.startTime
        ).slice(0, 5)} đến ${String(upcoming.endTime).slice(0, 5)} với ${
          upcoming.trainerName
        }. Trạng thái hiện tại là ${upcoming.status}.`,
        suggestions: [
          { type: "action", label: "Mở lịch đã đặt", action: buildNavigateAction("/member/bookings", "Mở lịch đã đặt") },
          { type: "message", label: "Đặt lịch PT", value: "Tôi muốn đặt lịch PT" },
        ],
        proposedAction: null,
        requiresConfirmation: false,
      };
    }

    return {
      reply: "Hiện tại mình chưa thấy lịch tập sắp tới nào của bạn. Bạn có thể đặt một buổi mới ngay bây giờ.",
      suggestions: [
        { type: "message", label: "Đặt lịch PT", value: "Tôi muốn đặt lịch PT" },
        { type: "action", label: "Mở lịch đã đặt", action: buildNavigateAction("/member/bookings", "Mở lịch đã đặt") },
      ],
      proposedAction: null,
      requiresConfirmation: false,
    };
  }

  if (isAuthed && messageHasAny(message, ["bmi", "tiến độ", "cân nặng"])) {
    const latest = privateContext?.profile?.latestMetric;
    if (latest) {
      return {
        reply: `Chỉ số gần nhất của bạn là BMI ${latest.bmi ?? "—"}, cân nặng ${latest.weightKg ?? "—"} kg, chiều cao ${latest.heightCm ?? "—"} cm.`,
        suggestions: [
          { type: "message", label: "Giải thích BMI của tôi", value: "Giải thích BMI của tôi" },
          { type: "action", label: "Mở trang tiến độ", action: buildNavigateAction("/member/progress", "Mở trang tiến độ") },
        ],
        proposedAction: null,
        requiresConfirmation: false,
      };
    }
  }

  if (navAction) {
    return {
      reply: "Mình đã hiểu thao tác bạn muốn mở. Bạn bấm nút bên dưới để đi tới đúng trang.",
      suggestions: [],
      proposedAction: navAction,
      requiresConfirmation: false,
    };
  }

  return {
    reply:
      "Mình có thể giúp bạn tư vấn gym, PT, gói tập, xem lịch đã đặt, kiểm tra gói hiện tại và hỗ trợ đặt lịch PT.",
    suggestions: isAuthed
      ? [
          { type: "message", label: "Tôi còn bao nhiêu buổi?", value: "Tôi còn bao nhiêu buổi?" },
          { type: "message", label: "Lịch tập sắp tới của tôi", value: "Lịch tập sắp tới của tôi" },
          { type: "message", label: "Đặt lịch PT", value: "Tôi muốn đặt lịch PT" },
        ]
      : [
          { type: "message", label: "Gói nào phù hợp cho người mới?", value: "Gói nào phù hợp cho người mới?" },
          { type: "message", label: "PT nào phù hợp để giảm mỡ?", value: "PT nào phù hợp để giảm mỡ?" },
          { type: "action", label: "Xem danh sách gym", action: buildNavigateAction("/marketplace/gyms", "Xem danh sách gym") },
        ],
    proposedAction: null,
    requiresConfirmation: false,
  };
};

const buildBookingHint = async ({ message, user, pageContext, privateContext }) => {
  const lower = safeLower(message);
  const wantsBooking = ["đặt lịch", "book", "booking", "lịch pt", "slot"].some((w) =>
    lower.includes(w)
  );
  if (!wantsBooking) return null;

  if (!user?.id) {
    return {
      reply: "Để mình kiểm tra gói active, PT phù hợp và slot trống chính xác, bạn cần đăng nhập trước.",
      suggestions: [
        { type: "action", label: "Đăng nhập", action: buildNavigateAction("/login", "Đăng nhập") },
        { type: "action", label: "Xem danh sách gym", action: buildNavigateAction("/marketplace/gyms", "Xem danh sách gym") },
      ],
      proposedAction: null,
      requiresConfirmation: false,
    };
  }

  const myPackages = safeArray(privateContext?.myPackages);
  const activePackages = myPackages.filter((x) => safeLower(x.status) === "active");

  if (!activePackages.length) {
    return {
      reply:
        "Hiện tại bạn chưa có gói active để đặt lịch PT. Bạn hãy mua gói trước, sau đó mình sẽ hỗ trợ kiểm tra PT và slot trống.",
      suggestions: [
        { type: "action", label: "Xem danh sách gym", action: buildNavigateAction("/marketplace/gyms", "Xem danh sách gym") },
      ],
      proposedAction: null,
      requiresConfirmation: false,
    };
  }

  const activationId = Number(pageContext?.activationId) || Number(activePackages[0].activationId);

  let trainerBundle = null;
  try {
    trainerBundle = await bookingService.getAvailableTrainers(user.id, activationId);
  } catch {
    trainerBundle = null;
  }

  const trainers = safeArray(trainerBundle?.trainers);
  if (!trainers.length) {
    return {
      reply:
        "Mình chưa tìm thấy PT phù hợp với gói đang active của bạn. Bạn có thể kiểm tra lại gói hoặc thử ở booking wizard.",
      suggestions: [
        { type: "action", label: "Mở gói của tôi", action: buildNavigateAction("/member/my-packages", "Mở gói của tôi") },
        { type: "action", label: "Mở booking wizard", action: buildNavigateAction("/member/booking/wizard", "Mở booking wizard") },
      ],
      proposedAction: null,
      requiresConfirmation: false,
    };
  }

  const selectedTrainer = resolveTrainerFromMessage(message, trainers);
  const selectedDate = pickDateFromMessage(message);

  if (!selectedTrainer || !selectedDate) {
    return {
      reply: `Mình đã tìm được ${trainers.length} PT phù hợp với gói hiện tại của bạn. Hãy cho mình biết PT nào và ngày nào bạn muốn tập. Ví dụ: “Đặt với PT ${
        trainers[0]?.User?.username || trainers[0]?.name || trainers[0]?.id
      } ngày 2026-03-30”.`,
      suggestions: [
        ...trainers.slice(0, 3).map((t) => ({
          type: "message",
          label: `Đặt với PT ${t?.User?.username || t?.name || t.id}`,
          value: `Đặt với PT ${t?.User?.username || t?.name || t.id} ngày 2026-03-30`,
        })),
        { type: "action", label: "Mở booking wizard", action: buildNavigateAction("/member/booking/wizard", "Mở booking wizard") },
      ],
      proposedAction: null,
      requiresConfirmation: false,
    };
  }

  let slots = [];
  try {
    slots = await bookingService.getAvailableSlots(user.id, {
      trainerId: selectedTrainer.id,
      date: selectedDate,
      activationId,
    });
  } catch (e) {
    return {
      reply: e.message || "Không thể kiểm tra slot vào lúc này.",
      suggestions: [
        { type: "action", label: "Mở booking wizard", action: buildNavigateAction("/member/booking/wizard", "Mở booking wizard") },
      ],
      proposedAction: null,
      requiresConfirmation: false,
    };
  }

  if (!slots.length) {
    return {
      reply: `PT ${selectedTrainer?.User?.username || selectedTrainer?.name || selectedTrainer.id} hiện không còn slot trống vào ngày ${selectedDate}. Bạn có thể chọn ngày khác hoặc PT khác.`,
      suggestions: [
        { type: "action", label: "Mở booking wizard", action: buildNavigateAction("/member/booking/wizard", "Mở booking wizard") },
      ],
      proposedAction: null,
      requiresConfirmation: false,
    };
  }

  const selectedTime = pickTimeFromMessage(message);
  if (!selectedTime) {
    return {
      reply: `Mình đã tìm thấy ${slots.length} slot trống cho PT ${
        selectedTrainer?.User?.username || selectedTrainer?.name || selectedTrainer.id
      } vào ngày ${selectedDate}. Bạn chọn một giờ bên dưới nhé.`,
      suggestions: slots.slice(0, 4).map((s) => ({
        type: "message",
        label: `Đặt lúc ${String(s.startTime).slice(0, 5)}`,
        value: `Đặt với PT ${
          selectedTrainer?.User?.username || selectedTrainer?.name || selectedTrainer.id
        } ngày ${selectedDate} lúc ${String(s.startTime).slice(0, 5)}`,
      })),
      proposedAction: null,
      requiresConfirmation: false,
    };
  }

  const matchedSlot = slots.find((s) => String(s.startTime).slice(0, 5) === selectedTime);
  if (!matchedSlot) {
    return {
      reply: `Giờ ${selectedTime} hiện không còn trống. Bạn hãy chọn một khung giờ còn lại bên dưới.`,
      suggestions: slots.slice(0, 4).map((s) => ({
        type: "message",
        label: `Đặt lúc ${String(s.startTime).slice(0, 5)}`,
        value: `Đặt với PT ${
          selectedTrainer?.User?.username || selectedTrainer?.name || selectedTrainer.id
        } ngày ${selectedDate} lúc ${String(s.startTime).slice(0, 5)}`,
      })),
      proposedAction: null,
      requiresConfirmation: false,
    };
  }

  return {
    reply: `Mình đã tìm thấy slot phù hợp: PT ${
      selectedTrainer?.User?.username || selectedTrainer?.name || selectedTrainer.id
    }, ngày ${selectedDate}, lúc ${selectedTime}. Nếu bạn đồng ý, bấm xác nhận để hệ thống tạo booking.`,
    suggestions: [
      { type: "action", label: "Mở lịch đã đặt", action: buildNavigateAction("/member/bookings", "Mở lịch đã đặt") },
    ],
    proposedAction: {
      type: "CREATE_BOOKING",
      label: "Xác nhận đặt lịch",
      payload: {
        activationId,
        trainerId: selectedTrainer.id,
        date: selectedDate,
        startTime: selectedTime,
      },
    },
    requiresConfirmation: true,
  };
};

const buildPrompt = ({ message, pageContext, isAuthed, publicContext, privateContext, navAction }) => `
Bạn là GFMS AI Assistant cho hệ thống nhượng quyền gym GFMS.

Quy tắc:
- Chỉ trả lời trong domain: gym, PT, gói tập, booking, hồ sơ member, BMI/metrics, FAQ nghiệp vụ.
- Chỉ dùng dữ liệu có trong CONTEXT.
- Không bịa dữ liệu.
- Nếu PRECOMPUTED_ACTION có dữ liệu thì dùng nguyên action đó.
- suggestions phải là mảng object theo format:
  { "type": "message", "label": "...", "value": "..." }
  hoặc
  { "type": "action", "label": "...", "action": {...} }

Trả về JSON hợp lệ duy nhất theo format:
{
  "reply": "...",
  "suggestions": [],
  "proposedAction": null,
  "requiresConfirmation": false
}

USER_MESSAGE:
${message}

PAGE_CONTEXT:
${JSON.stringify(pageContext || {}, null, 2)}

AUTH_STATE:
${JSON.stringify({ isAuthed }, null, 2)}

PUBLIC_CONTEXT:
${JSON.stringify(publicContext || {}, null, 2)}

PRIVATE_CONTEXT:
${JSON.stringify(privateContext || null, null, 2)}

PRECOMPUTED_ACTION:
${JSON.stringify(navAction || null, null, 2)}
`;

const callLLM = async (prompt) => {
  if (!openai) return null;

  const response = await openai.responses.create({
    model: MODEL,
    input: prompt,
  });

  const text = response.output_text || "";
  return tryJsonParse(text);
};

const sanitizeLLMResult = (data, navAction) => ({
  reply:
    safeText(data?.reply) ||
    "Mình đã xem dữ liệu của bạn nhưng chưa thể tạo phản hồi rõ ràng.",
  suggestions: safeArray(data?.suggestions).slice(0, 5),
  proposedAction: data?.proposedAction || navAction || null,
  requiresConfirmation: !!data?.requiresConfirmation,
});

const buildPrivateContext = async (userId) => {
  if (!userId) return null;

  const [profileRes, packagesRes, bookingsRes] = await Promise.allSettled([
    memberProfileService.getMyProfile(userId),
    memberMyPackageService.getMyPackages(userId),
    bookingService.getMyBookings(userId),
  ]);

  const profile = profileRes.status === "fulfilled" ? profileRes.value : null;
  const myPackages = packagesRes.status === "fulfilled" ? summarizeMyPackages(packagesRes.value) : [];
  const myBookings = bookingsRes.status === "fulfilled" ? summarizeBookings(bookingsRes.value) : [];

  return {
    profile,
    myPackages,
    myBookings,
  };
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

const aiService = {
  async chat({ user, body }) {
    const message = safeText(body?.message);
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

    const navAction = detectNavigationIntent(message, isAuthed);

    const bookingHint = await buildBookingHint({
      message,
      user,
      pageContext,
      privateContext,
    });
    if (bookingHint) {
      return bookingHint;
    }

    const ruleReply = buildRuleBasedReply({
      message,
      isAuthed,
      privateContext,
      navAction,
    });

    if (!openai) return ruleReply;

    try {
      const prompt = buildPrompt({
        message,
        pageContext,
        isAuthed,
        publicContext,
        privateContext,
        navAction,
      });

      const llm = await callLLM(prompt);
      if (!llm) return ruleReply;

      const clean = sanitizeLLMResult(llm, navAction);

      if (navAction && !clean.proposedAction) {
        clean.proposedAction = navAction;
      }

      return {
        ...ruleReply,
        ...clean,
      };
    } catch {
      return ruleReply;
    }
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
        followUpAction: buildNavigateAction("/member/bookings", "Mở lịch đã đặt"),
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