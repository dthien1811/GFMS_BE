
const { Request, User, Trainer, Gym, Member, Booking, TrainerShare, sequelize } = require("../../models");
const { Sequelize } = require('sequelize');
const realtimeServiceModule = require("../realtime.service");
const realtimeService = realtimeServiceModule.default || realtimeServiceModule;
const BUSY_REQUEST_NOTE_MARKER = "[PT_BUSY_REQUEST]";
const ACTIVE_TRAINER_SHARE_STATUSES = ["approved", "shared", "active", "pending_trainer"];
const ACTIVE_TRAINER_SHARE_STATUSES_ANY_CASE = Array.from(
  new Set(
    ACTIVE_TRAINER_SHARE_STATUSES.flatMap((status) => [
      status,
      String(status).toUpperCase(),
    ])
  )
);

const emitOwnerRequestChanged = (userIds = [], payload = {}) => {
  [...new Set((userIds || []).filter(Boolean).map(Number))].forEach((userId) => {
    realtimeService.emitUser(userId, "request:changed", payload);
  });
};

/** Trùng 5 chuyên môn chuẩn form mượn PT (GFMS_FE constants/trainerSpecializations) */
const BORROW_SPECIALIZATION_CANONICAL = Object.freeze([
  "Giảm mỡ & định hình toàn thân",
  "Tăng khối cơ & phát triển toàn diện",
  "Sức mạnh & phát triển thể hình",
  "Thể lực & nâng cao thể trạng",
  "Tư thế và vận động hỗ trợ chiều cao",
]);

const parseBorrowSpecTokens = (raw) =>
  String(raw || "")
    .split(/[\n,;|]+/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);

const trainerSpecMatchesBorrowCanonical = (trainerSpecialization, borrowCanonical) => {
  const need = String(borrowCanonical || "").trim();
  if (!need) return true;
  const tokens = parseBorrowSpecTokens(trainerSpecialization);
  return tokens.some((t) => t === need || t.includes(need) || need.includes(t));
};

const resolveBorrowCanonicalFromTrainerSpecialization = (trainerSpecialization) => {
  const raw = String(trainerSpecialization || "").trim();
  if (!raw) return "";
  for (const opt of BORROW_SPECIALIZATION_CANONICAL) {
    if (trainerSpecMatchesBorrowCanonical(raw, opt)) return opt;
  }
  return "";
};

const prettyType = (t) => {
  const key = String(t || "").toLowerCase();
  if (key === "leave") return "nghỉ phép";
  if (key === "overtime") return "tăng ca";
  if (key === "shift_change") return "đổi ca";
  if (key === "transfer_branch") return "chuyển cơ sở";
  return key || "yêu cầu";
};

const resolveGymIdsForAccess = async (request, { transaction } = {}) => {
  const data = request?.data || {};
  const type = String(request.requestType || "").trim().toUpperCase();
  const ids = [];
  const push = (v) => {
    const n = Number(v);
    if (Number.isInteger(n) && n > 0) ids.push(n);
  };
  push(data.gymId);
  if (data.application) push(data.application.gymId);
  push(data.fromGymId);
  push(data.toGymId);
  push(data.targetGymId);
  if (type === "BUSY_SLOT" && data.bookingId) {
    const booking = await Booking.findByPk(Number(data.bookingId), {
      attributes: ["gymId"],
      transaction,
      lock: transaction ? transaction.LOCK.UPDATE : undefined,
    });
    push(booking?.gymId);
  }
  const trainer = await Trainer.findOne({
    where: { userId: request.requesterId },
    attributes: ["gymId"],
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });
  push(trainer?.gymId);
  return [...new Set(ids)];
};

const assertActorMayModerateRequest = async (actorUserId, actorGroupName, request, transaction) => {
  if (!actorUserId) {
    const err = new Error("Thiếu thông tin người duyệt");
    err.statusCode = 401;
    throw err;
  }
  const g = String(actorGroupName || "").toLowerCase();
  if (g.includes("administrator")) return;
  const gymIds = await resolveGymIdsForAccess(request, { transaction });
  if (!gymIds.length) {
    const err = new Error("Không xác định được chi nhánh liên quan yêu cầu");
    err.statusCode = 400;
    throw err;
  }
  const owned = await Gym.findAll({
    where: { ownerId: actorUserId, id: { [Sequelize.Op.in]: gymIds } },
    attributes: ["id"],
    transaction,
  });
  if (!owned.length) {
    const err = new Error("Bạn không có quyền xử lý yêu cầu này");
    err.statusCode = 403;
    throw err;
  }
};

const getRequestNotificationTemplates = (requestType, rejectNote) => {
  const type = String(requestType || "").trim().toUpperCase();
  if (type === "BUSY_SLOT") {
    return {
      approved: {
        title: "Yêu cầu báo bận đã được duyệt",
        message: "Chủ phòng tập đã duyệt yêu cầu báo bận khung giờ dạy của bạn.",
      },
      rejected: {
        title: "Yêu cầu báo bận bị từ chối",
        message: rejectNote || "Chủ phòng tập đã từ chối yêu cầu báo bận khung giờ dạy của bạn.",
      },
    };
  }

  if (["LEAVE", "SHIFT_CHANGE", "TRANSFER_BRANCH", "OVERTIME"].includes(type)) {
    const label = prettyType(type);
    return {
      approved: {
        title: "Yêu cầu đã được duyệt",
        message: `Yêu cầu ${label} của bạn đã được chủ phòng tập duyệt.`,
      },
      rejected: {
        title: "Yêu cầu bị từ chối",
        message:
          rejectNote ||
          `Chủ phòng tập đã từ chối yêu cầu ${label} của bạn.`,
      },
    };
  }

  return {
    approved: {
      title: "Đơn đăng ký huấn luyện viên đã được duyệt",
      message: "Chủ gym đã duyệt đơn đăng ký trở thành huấn luyện viên của bạn.",
    },
    rejected: {
      title: "Đơn đăng ký huấn luyện viên bị từ chối",
      message: rejectNote || "Chủ gym đã từ chối đơn đăng ký trở thành huấn luyện viên của bạn.",
    },
  };
};

const toMinutes = (timeValue) => {
  const raw = String(timeValue || "").trim();
  const m = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
};

const overlaps = (aStart, aEnd, bStart, bEnd) => {
  if (![aStart, aEnd, bStart, bEnd].every((v) => Number.isFinite(v))) return false;
  return aStart < bEnd && aEnd > bStart;
};

const parseSpecs = (raw) =>
  String(raw || "")
    .split(/[\n,;|]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

const hasSpecializationOverlap = (trainerSpecsRaw, targetSpecsRaw) => {
  const a = parseSpecs(trainerSpecsRaw);
  const b = parseSpecs(targetSpecsRaw);
  if (!a.length || !b.length) return false;
  const bSet = new Set(b);
  return a.some((s) => bSet.has(s));
};

const getDayKeyFromDate = (dateValue) => {
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return null;
  const keys = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  return keys[d.getDay()] || null;
};

const parseAvailableHours = (raw) => {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch (_e) {
    return {};
  }
};

const normalizeYmd = (value) => {
  if (!value) return "";
  const raw = String(value).trim();
  const direct = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (direct) return `${direct[1]}-${direct[2]}-${direct[3]}`;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const isTrainerWorkingForSlot = (availableHoursRaw, bookingDate, startTime, endTime) => {
  const dayKey = getDayKeyFromDate(bookingDate);
  if (!dayKey) return false;
  const startMin = toMinutes(startTime);
  const endMin = toMinutes(endTime);
  if (!Number.isFinite(startMin) || !Number.isFinite(endMin) || endMin <= startMin) return false;

  const availableHours = parseAvailableHours(availableHoursRaw);
  const slots = Array.isArray(availableHours?.[dayKey]) ? availableHours[dayKey] : [];
  if (!slots.length) return false;

  return slots.some((slot) => {
    const slotStart = toMinutes(slot?.start || slot?.startTime);
    const slotEnd = toMinutes(slot?.end || slot?.endTime);
    return Number.isFinite(slotStart) && Number.isFinite(slotEnd) && slotStart <= startMin && slotEnd >= endMin;
  });
};

const findInternalReplacementForBusyBooking = async ({
  booking,
  transaction = null,
  preferredTrainerId = null,
  maxCandidates = 5,
  busyTrainerIdFromRequest = null,
  requesterUserId = null,
}) => {
  const gymId = Number(booking?.gymId || 0);
  const bidBook = Number(booking?.trainerId || booking?.ptId || 0);
  const bidReq = Number(busyTrainerIdFromRequest || 0);
  let bidRequesterTrainer = 0;
  if (requesterUserId) {
    const tr = await Trainer.findOne({
      where: { userId: Number(requesterUserId) },
      attributes: ["id"],
      transaction,
      lock: transaction ? transaction.LOCK.UPDATE : undefined,
    });
    bidRequesterTrainer = Number(tr?.id || 0);
  }
  const excludeTrainerIds = [
    ...new Set([bidBook, bidReq, bidRequesterTrainer].filter((id) => Number.isInteger(id) && id > 0)),
  ];
  const currentTrainerId = bidReq > 0 ? bidReq : bidBook > 0 ? bidBook : bidRequesterTrainer;
  if (!gymId || !currentTrainerId) {
    return { replacement: null, reason: "Thiếu dữ liệu gym hoặc huấn luyện viên hiện tại." };
  }
  if (!excludeTrainerIds.length) {
    return { replacement: null, reason: "Thiếu dữ liệu huấn luyện viên cần loại trừ khỏi danh sách thay thế." };
  }

  const currentTrainer = await Trainer.findByPk(currentTrainerId, {
    attributes: ["id", "specialization"],
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });
  if (!currentTrainer) {
    return { replacement: null, reason: "Không tìm thấy huấn luyện viên hiện tại của lịch." };
  }

  const candidates = await Trainer.findAll({
    where: {
      gymId,
      id: { [Sequelize.Op.notIn]: excludeTrainerIds },
      isActive: { [Sequelize.Op.ne]: false },
    },
    attributes: ["id", "userId", "specialization", "availableHours"],
    include: [{ model: User, attributes: ["id", "username"], required: false }],
    order: [["id", "ASC"]],
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });

  const bookingDate = booking.bookingDate;
  const bookingDateYmd = normalizeYmd(bookingDate);
  const bookingStartMin = toMinutes(booking.startTime);
  const bookingEndMin = toMinutes(booking.endTime);
  if (!Number.isFinite(bookingStartMin) || !Number.isFinite(bookingEndMin)) {
    return { replacement: null, reason: "Khung giờ của lịch không hợp lệ." };
  }

  const diagnostics = {
    total: candidates.length,
    specializationMismatch: 0,
    unavailableHours: 0,
    bookingConflict: 0,
    shareConflict: 0,
  };

  const validCandidates = [];
  for (const candidate of candidates) {
    if (!hasSpecializationOverlap(candidate.specialization, currentTrainer.specialization)) {
      diagnostics.specializationMismatch += 1;
      continue;
    }
    if (!isTrainerWorkingForSlot(candidate.availableHours, bookingDate, booking.startTime, booking.endTime)) {
      diagnostics.unavailableHours += 1;
      continue;
    }

    const conflictBookings = await Booking.findAll({
      where: {
        trainerId: candidate.id,
        [Sequelize.Op.and]: [
          Sequelize.where(
            Sequelize.fn("DATE", Sequelize.col("bookingDate")),
            bookingDateYmd
          ),
        ],
      },
      attributes: ["id", "startTime", "endTime", "status"],
      transaction,
    });

    if (Array.isArray(conflictBookings) && conflictBookings.length > 0) {
      const hasOverlap = conflictBookings.some((item) => {
        const itemStatus = String(item?.status || "").toLowerCase();
        if (["cancelled", "no_show", "completed", "rejected"].includes(itemStatus)) return false;
        const s = toMinutes(item.startTime);
        const e = toMinutes(item.endTime);
        return overlaps(bookingStartMin, bookingEndMin, s, e);
      });
      if (hasOverlap) {
        diagnostics.bookingConflict += 1;
        continue;
      }
    }

    const shareConflicts = await TrainerShare.findAll({
      where: {
        trainerId: candidate.id,
        status: { [Sequelize.Op.in]: ACTIVE_TRAINER_SHARE_STATUSES_ANY_CASE },
      },
      attributes: ["id", "scheduleMode", "startDate", "endDate", "startTime", "endTime", "specificSchedules"],
      transaction,
    });

    if (Array.isArray(shareConflicts) && shareConflicts.length > 0) {
      const hasShareOverlap = shareConflicts.some((share) => {
        const mode = String(share?.scheduleMode || "").toLowerCase();
        if (mode === "all_days") {
          const startDate = normalizeYmd(share?.startDate);
          const endDate = normalizeYmd(share?.endDate);
          const inRange = startDate && startDate <= bookingDateYmd && (!endDate || endDate >= bookingDateYmd);
          if (!inRange) return false;
          const s = toMinutes(share.startTime);
          const e = toMinutes(share.endTime);
          return overlaps(bookingStartMin, bookingEndMin, s, e);
        }

        if (mode === "specific_days") {
          let schedules = [];
          try {
            schedules = Array.isArray(share?.specificSchedules)
              ? share.specificSchedules
              : JSON.parse(share?.specificSchedules || "[]");
          } catch (_e) {
            schedules = [];
          }
          const matched = schedules.find((s) => normalizeYmd(s?.date) === bookingDateYmd);
          if (!matched) return false;
          const s = toMinutes(matched.startTime);
          const e = toMinutes(matched.endTime);
          return overlaps(bookingStartMin, bookingEndMin, s, e);
        }

        return false;
      });
      if (hasShareOverlap) {
        diagnostics.shareConflict += 1;
        continue;
      }
    }

    validCandidates.push(candidate);
    if (validCandidates.length >= Math.max(1, Number(maxCandidates) || 5)) break;
  }

  if (validCandidates.length > 0) {
    const preferredId = Number(preferredTrainerId || 0);
    const preferred = preferredId
      ? validCandidates.find((item) => Number(item?.id) === preferredId) || null
      : null;
    return {
      replacement: preferred || validCandidates[0],
      candidates: validCandidates,
      reason: "",
    };
  }

  if (!diagnostics.total) {
    return { replacement: null, candidates: [], reason: "Không có huấn luyện viên nội bộ nào khác trong chi nhánh này." };
  }
  return {
    replacement: null,
    candidates: [],
    reason:
      `Không có huấn luyện viên nội bộ phù hợp (` +
      `khác chuyên môn: ${diagnostics.specializationMismatch}, ` +
      `ngoài ca làm: ${diagnostics.unavailableHours}, ` +
      `trùng lịch dạy: ${diagnostics.bookingConflict}, ` +
      `trùng lịch chia sẻ: ${diagnostics.shareConflict}).`,
  };
};

module.exports = {
  async getRequests({ page = 1, limit = 10, gymId, actorUserId = null, actorGroupName = null } = {}) {
    try {
      const safePage = Number.isInteger(Number(page)) && Number(page) > 0 ? Number(page) : 1;
      const safeLimit = Number.isInteger(Number(limit)) && Number(limit) > 0
        ? Math.min(Number(limit), 50)
        : 10;
      const scopedGymId = Number.isInteger(Number(gymId)) && Number(gymId) > 0 ? Number(gymId) : null;

      const isAdmin = /administrator/i.test(String(actorGroupName || ""));
      let ownedGymIdSet = new Set();
      if (!isAdmin && actorUserId) {
        const ownedRows = await Gym.findAll({
          where: { ownerId: actorUserId },
          attributes: ["id"],
          raw: true,
        });
        ownedGymIdSet = new Set(
          ownedRows.map((r) => Number(r.id)).filter((n) => Number.isInteger(n) && n > 0)
        );
        if (ownedGymIdSet.size === 0) {
          return {
            data: [],
            pagination: { page: safePage, limit: safeLimit, total: 0, totalPages: 1 },
          };
        }
      }
      if (!isAdmin && scopedGymId && !ownedGymIdSet.has(scopedGymId)) {
        return {
          data: [],
          pagination: { page: safePage, limit: safeLimit, total: 0, totalPages: 1 },
        };
      }

      const requests = await Request.findAll({
        where: {
          status: {
            [Sequelize.Op.ne]: 'cancelled',  // Lọc bỏ những yêu cầu có trạng thái 'cancelled'
          }
        },
        order: [['createdAt', 'DESC'], ['id', 'DESC']],
        include: [
          {
            model: User,
            as: 'requester',
            attributes: ['id', 'username', 'avatar'],
          },
          {
            model: User,
            as: 'approver',
            attributes: ['id', 'username'],  // Lấy cột 'username' của người duyệt
          }
        ]
      });

      const requesterUserIds = [...new Set(
        requests.map((r) => Number(r.requesterId)).filter((n) => Number.isInteger(n) && n > 0)
      )];
      const trainerRows =
        requesterUserIds.length > 0
          ? await Trainer.findAll({
              where: { userId: { [Sequelize.Op.in]: requesterUserIds } },
              attributes: ["userId", "gymId"],
              raw: true,
            })
          : [];
      const trainerGymByUserId = new Map();
      trainerRows.forEach((row) => {
        const uid = Number(row.userId);
        const gid = Number(row.gymId);
        if (uid > 0 && gid > 0) trainerGymByUserId.set(uid, gid);
      });

      const gymIds = [...new Set(
        [
          ...requests.flatMap((r) => {
            const d = r?.data || {};
            const app = d.application || {};
            return [
              Number(app.gymId),
              Number(d.gymId),
              Number(d.fromGymId),
              Number(d.toGymId),
              Number(d.targetGymId),
            ].filter((n) => Number.isInteger(n) && n > 0);
          }),
          ...trainerGymByUserId.values(),
        ]
      )];

      let gymMap = new Map();
      if (gymIds.length > 0) {
        const gyms = await Gym.findAll({
          where: { id: { [Sequelize.Op.in]: gymIds } },
          attributes: ["id", "name"],
          raw: true,
        });
        gyms.forEach((g) => gymMap.set(Number(g.id), g.name));
      }

      const busySlotMemberIds = [...new Set(
        requests
          .filter((request) => String(request?.requestType || "").trim().toUpperCase() === "BUSY_SLOT")
          .map((request) => Number(request?.data?.memberId))
          .filter((id) => Number.isInteger(id) && id > 0)
      )];

      let memberNameMap = new Map();
      if (busySlotMemberIds.length > 0 && Member) {
        const members = await Member.findAll({
          where: { id: { [Sequelize.Op.in]: busySlotMemberIds } },
          attributes: ["id"],
          include: [{ model: User, as: "User", attributes: ["username"], required: false }],
        });
        members.forEach((member) => {
          memberNameMap.set(Number(member.id), member?.User?.username || null);
        });
      }

      const mapped = requests.map((request) => {
        const application = request?.data?.application || {};
        const requestData = request?.data || null;
        const requestMemberId = Number(requestData?.memberId || 0);
        const requestGymId = Number(requestData?.gymId || 0);
        const trainerGymId = trainerGymByUserId.get(Number(request.requesterId)) || null;
        const dataWithTrainerGym =
          requestData && typeof requestData === "object"
            ? { ...requestData, ...(trainerGymId && !requestData.gymId ? { gymId: trainerGymId } : {}) }
            : trainerGymId
            ? { gymId: trainerGymId }
            : null;
        const resolvedGymIdForRow = Number(dataWithTrainerGym?.gymId || requestGymId || 0);
        const gymId = Number(application.gymId);
        const gymName = Number.isInteger(gymId) && gymId > 0
          ? gymMap.get(gymId) || null
          : null;
        const spec = Array.isArray(application.specializations)
          ? application.specializations.filter(Boolean).join(", ")
          : "";
        const cert = String(application.certification || "").trim();
        const links = Array.isArray(application.certificationLinks)
          ? application.certificationLinks.filter(Boolean)
          : [];
        const images = Array.isArray(application.certificateImageUrls)
          ? application.certificateImageUrls.filter(Boolean)
          : [];
        const hr = Number(application.hourlyRate);

        const applicationSummary = [
          Number.isInteger(gymId) && gymId > 0 ? `Gym: #${gymId}` : "",
          spec ? `Chuyên môn: ${spec}` : "",
          cert ? `Chứng chỉ: ${cert}` : "",
          links.length ? `Link chứng chỉ: ${links.join(", ")}` : "",
          images.length ? `Ảnh chứng chỉ: ${images.length} ảnh` : "",
          Number.isFinite(hr) && hr > 0 ? `Giá/giờ: ${hr}` : "",
        ].filter(Boolean).join(" | ");

        return {
          id: request.id,
          requestType: request.requestType,
          status: request.status,
          reason: request.reason,
          requesterId: request.requesterId,
          requestData: dataWithTrainerGym
            ? {
                ...dataWithTrainerGym,
                memberName:
                  dataWithTrainerGym.memberName
                  || (requestMemberId ? memberNameMap.get(requestMemberId) || null : null),
                gymName:
                  dataWithTrainerGym.gymName
                  || (Number.isInteger(resolvedGymIdForRow) && resolvedGymIdForRow > 0
                    ? gymMap.get(resolvedGymIdForRow) || null
                    : null),
              }
            : null,
          requestContent: request?.data?.content || applicationSummary,
          requestApplication: {
            gymId: Number.isInteger(gymId) && gymId > 0 ? gymId : null,
            gymName,
            specializations: Array.isArray(application.specializations)
              ? application.specializations.filter(Boolean)
              : [],
            certification: cert || null,
            certificationLinks: links,
            certificateImageUrls: images,
            hourlyRate: Number.isFinite(hr) && hr > 0 ? hr : null,
          },
          requesterUsername: request.requester ? request.requester.username : null,
          requesterAvatar: request.requester ? request.requester.avatar : null,
          approverUsername: request.approver ? request.approver.username : null,
        };
      });

      const enriched = await Promise.all(
        mapped.map(async (item) => {
          if (String(item?.requestType || "").toUpperCase() !== "BUSY_SLOT") return item;
          const bookingId = Number(item?.requestData?.bookingId || 0);
          if (!bookingId) return item;
          const booking = await Booking.findByPk(bookingId, {
            attributes: ["id", "trainerId", "gymId", "bookingDate", "startTime", "endTime"],
            include: [
              {
                model: Trainer,
                attributes: ["id", "specialization"],
                required: false,
              },
            ],
          });
          if (!booking) return item;
          const busyTrainerSpec = booking?.Trainer?.specialization || "";
          const borrowCanonical =
            resolveBorrowCanonicalFromTrainerSpecialization(busyTrainerSpec);
          const replacementResult = await findInternalReplacementForBusyBooking({
            booking,
            maxCandidates: 5,
            busyTrainerIdFromRequest: Number(item?.requestData?.trainerId || 0) || null,
            requesterUserId: item?.requesterId || null,
          });
          const replacement = replacementResult?.replacement || null;
          const candidates = Array.isArray(replacementResult?.candidates) ? replacementResult.candidates : [];
          return {
            ...item,
            requestData: {
              ...(item.requestData || {}),
              busyTrainerId: booking.trainerId || null,
              busyTrainerSpecialization: busyTrainerSpec,
              ...(borrowCanonical ? { borrowSpecialization: borrowCanonical } : {}),
              internalReplacementAvailable: Boolean(replacement),
              internalReplacementTrainerId: replacement?.id || null,
              internalReplacementTrainerName: replacement?.User?.username || null,
              internalReplacementCandidates: candidates.map((candidate) => ({
                id: candidate?.id || null,
                name: candidate?.User?.username || null,
                specialization: candidate?.specialization || "",
              })),
            },
          };
        })
      );

      const filtered = enriched.filter((request) => {
        const candidateGymIds = [
          request?.requestApplication?.gymId,
          request?.requestData?.gymId,
          request?.requestData?.application?.gymId,
          request?.requestData?.fromGymId,
          request?.requestData?.toGymId,
          request?.requestData?.targetGymId,
        ]
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value) && value > 0);

        if (!isAdmin) {
          const touchesOwned = candidateGymIds.some((id) => ownedGymIdSet.has(id));
          if (!touchesOwned) return false;
        }

        if (scopedGymId) {
          return candidateGymIds.includes(scopedGymId);
        }
        return true;
      });

      const total = filtered.length;
      const offset = (safePage - 1) * safeLimit;
      const pagedData = filtered.slice(offset, offset + safeLimit);

      const totalPages = Math.max(1, Math.ceil(total / safeLimit));
      return {
        data: pagedData,
        pagination: {
          page: safePage,
          limit: safeLimit,
          total,
          totalPages,
        },
      };
    } catch (error) {
      console.error("Error fetching requests:", error);
      throw new Error('Error fetching requests: ' + error.message);
    }
  },

  async approveRequest(requestId, approverId, approveNote, options = {}) {
    return sequelize.transaction(async (t) => {
      const request = await Request.findByPk(requestId, {
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!request) throw new Error('Request not found');

      await assertActorMayModerateRequest(approverId, options?.actorGroupName, request, t);

      const assignmentMode = String(options?.assignmentMode || "internal_first").toLowerCase();
      const selectedTrainerId = Number(options?.selectedTrainerId || 0);
      const normalizedType = String(request.requestType || '').trim().toUpperCase();
      if (normalizedType === 'BECOME_TRAINER') {
        const application = request?.data?.application || {};
        const requester = await User.findByPk(request.requesterId, {
          transaction: t,
          lock: t.LOCK.UPDATE,
        });

        const specialization = Array.isArray(application.specializations)
          ? application.specializations.filter(Boolean).join(', ')
          : String(application.specializations || '').trim();

        const certification = String(application.certification || '').trim() || null;
        const gymId = Number.isInteger(Number(application.gymId)) && Number(application.gymId) > 0
          ? Number(application.gymId)
          : null;
        const hourlyRate = Number(application.hourlyRate) > 0 ? Number(application.hourlyRate) : null;
        const socialLinks = {
          certificateLinks: Array.isArray(application.certificationLinks)
            ? application.certificationLinks.filter(Boolean)
            : [],
          certificateImageUrls: Array.isArray(application.certificateImageUrls)
            ? application.certificateImageUrls.filter(Boolean)
            : [],
        };

        const existingTrainer = await Trainer.findOne({
          where: { userId: request.requesterId },
          transaction: t,
          lock: t.LOCK.UPDATE,
        });

        if (existingTrainer) {
          if (gymId) existingTrainer.gymId = gymId;
          if (specialization) existingTrainer.specialization = specialization;
          if (certification) existingTrainer.certification = certification;
          if (hourlyRate) existingTrainer.hourlyRate = hourlyRate;
          existingTrainer.socialLinks = {
            ...(existingTrainer.socialLinks || {}),
            ...socialLinks,
          };
          if (existingTrainer.isActive === false) existingTrainer.isActive = true;
          await existingTrainer.save({ transaction: t });
        } else {
          await Trainer.create(
            {
              userId: request.requesterId,
              gymId,
              specialization: specialization || null,
              certification,
              hourlyRate,
              socialLinks,
              status: 'active',
              isActive: true,
            },
            { transaction: t }
          );
        }

        if (requester && Number(requester.groupId) !== 3) {
          requester.groupId = 3;
          await requester.save({ transaction: t });
        }
      } else if (normalizedType === 'BUSY_SLOT') {
        const bookingId = Number(request?.data?.bookingId || 0);
        if (bookingId <= 0) {
          const err = new Error("Yêu cầu báo bận không hợp lệ: thiếu thông tin booking");
          err.statusCode = 400;
          throw err;
        }

        const booking = await Booking.findByPk(bookingId, {
          transaction: t,
          lock: t.LOCK.UPDATE,
        });
        if (!booking) {
          const err = new Error("Không tìm thấy lịch tập cần xử lý");
          err.statusCode = 404;
          throw err;
        }

        const shouldAutoAssignInternal = assignmentMode !== "borrow_only";
        const replacementResult = shouldAutoAssignInternal
          ? await findInternalReplacementForBusyBooking({
              booking,
              transaction: t,
              preferredTrainerId: selectedTrainerId || null,
              maxCandidates: 10,
              busyTrainerIdFromRequest: Number(request?.data?.trainerId || 0) || null,
              requesterUserId: request.requesterId || null,
            })
          : { replacement: null, reason: "" };
        const replacement = replacementResult?.replacement || null;
        const candidates = Array.isArray(replacementResult?.candidates) ? replacementResult.candidates : [];

        if (shouldAutoAssignInternal && selectedTrainerId > 0) {
          const isSelectedCandidateValid = candidates.some((candidate) => Number(candidate?.id) === selectedTrainerId);
          if (!isSelectedCandidateValid) {
            const err = new Error("Huấn luyện viên nội bộ đã chọn không còn phù hợp ở thời điểm duyệt. Vui lòng tải lại danh sách.");
            err.statusCode = 409;
            throw err;
          }
        }

        if (shouldAutoAssignInternal && !replacement) {
          const err = new Error(
            replacementResult?.reason || "Không có huấn luyện viên nội bộ phù hợp trong khung giờ này"
          );
          err.statusCode = 409;
          throw err;
        }

        if (replacement) {
          booking.trainerId = replacement.id;
        }
        const currentNotes = String(booking.notes || "");
        if (!currentNotes.includes(BUSY_REQUEST_NOTE_MARKER)) {
          const assignmentNote = replacement
            ? ` | Đã điều phối nội bộ cho huấn luyện viên ${replacement?.User?.username || `#${replacement.id}`}`
            : shouldAutoAssignInternal
            ? " | Không tìm thấy huấn luyện viên nội bộ phù hợp"
            : " | Owner chọn chuyển sang luồng mượn huấn luyện viên";
          const note = `${BUSY_REQUEST_NOTE_MARKER} Owner đã duyệt yêu cầu báo bận #${request.id}${assignmentNote}`;
          booking.notes = currentNotes ? `${currentNotes}\n${note}` : note;
        }
        await booking.save({ transaction: t });

        request.data = {
          ...(request.data || {}),
          internalReplacementAvailable: Boolean(replacement),
          internalReplacementTrainerId: replacement?.id || null,
          internalReplacementTrainerName: replacement?.User?.username || null,
          internalReplacementCandidates: candidates.map((candidate) => ({
            id: candidate?.id || null,
            name: candidate?.User?.username || null,
            specialization: candidate?.specialization || "",
          })),
          assignmentMode,
          needsBorrowFlow: !replacement,
        };
      }

      request.status = 'approved';
      request.approverId = approverId;
      request.approveNote = approveNote || '';
      request.processedAt = new Date();
      await request.save({ transaction: t });

      emitOwnerRequestChanged([approverId, request.requesterId], {
        requestId: request.id,
        status: request.status,
        action: "approved",
        requestType: request.requestType,
      });

      const templates = getRequestNotificationTemplates(request.requestType);
      if (request.requesterId) {
        await realtimeService.notifyUser(request.requesterId, {
          title: templates.approved.title,
          message: templates.approved.message,
          notificationType: "request_update",
          relatedType: "request",
          relatedId: request.id,
        });
      }

      return request;
    });
  },

  async rejectRequest(requestId, approverId, rejectNote, options = {}) {
    const request = await Request.findByPk(requestId);
    if (!request) throw new Error('Request not found');

    await assertActorMayModerateRequest(approverId, options?.actorGroupName, request, null);

    request.status = 'rejected';
    request.approverId = approverId;
    request.approveNote = rejectNote || '';
    request.processedAt = new Date();

    await request.save();

    emitOwnerRequestChanged([approverId, request.requesterId], {
      requestId: request.id,
      status: request.status,
      action: "rejected",
      requestType: request.requestType,
    });

    const templates = getRequestNotificationTemplates(request.requestType, rejectNote);
    if (request.requesterId) {
      const reasonText = String(rejectNote || "").trim();
      const baseMessage = String(templates.rejected.message || `Yêu cầu ${prettyType(request.requestType)} của bạn đã bị từ chối.`);
      const shouldAppendDetail =
        reasonText &&
        !baseMessage.toLowerCase().includes(reasonText.toLowerCase()) &&
        !/lý do\s*:/i.test(baseMessage);
      const finalMessage = shouldAppendDetail ? `${baseMessage} Lý do: ${reasonText}` : baseMessage;
      await realtimeService.notifyUser(request.requesterId, {
        title: templates.rejected.title,
        message: finalMessage,
        notificationType: "request_update",
        relatedType: "request",
        relatedId: request.id,
      });
    }
    return request;
  },
};