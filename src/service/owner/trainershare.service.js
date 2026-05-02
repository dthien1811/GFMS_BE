import db from "../../models/index";
import realtimeService from "../realtime.service";

const {
  TrainerShare,
  Trainer,
  Gym,
  User,
  Policy,
  Member,
  Booking,
  PackageActivation,
  Package,
  Request,
} = db;
const OWNER_ACTIVE_SHARE_STATUSES = ["approved", "pending"];
/** Trạng thái đang giữ slot / mượn (dùng khi check trùng lịch) */
const SHARE_RESERVING_STATUSES = ["approved", "pending", "pending_trainer"];
const TRAINER_SLOT_DURATION_MINUTES = 60;
const DAY_KEYS_BY_INDEX = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

const normalizeOwnerShareStatus = (status) => (status === "pending" ? "approved" : status);

const getOwnerShareStatusWhere = (status) => {
  if (!status) return undefined;
  return status === "approved" ? { [db.Sequelize.Op.in]: OWNER_ACTIVE_SHARE_STATUSES } : status;
};

const serializeOwnerShare = (trainerShare) => {
  if (!trainerShare) return trainerShare;
  const data = trainerShare.toJSON ? trainerShare.toJSON() : { ...trainerShare };
  data.status = normalizeOwnerShareStatus(data.status);
  return data;
};

/** Giá buổi (VNĐ) — null nếu bỏ trống / không hợp lệ */
const parseSessionPrice = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
};

const normalizeSpecificSchedules = (specificSchedules) => {
  if (!specificSchedules) return [];

  if (typeof specificSchedules === "string") {
    try {
      return JSON.parse(specificSchedules) || [];
    } catch {
      return [];
    }
  }

  return Array.isArray(specificSchedules) ? specificSchedules : [];
};

const normalizeTimeValue = (timeValue) => {
  if (!timeValue) return "";
  const parts = String(timeValue).split(":");
  if (parts.length < 2) return "";
  return `${String(parts[0]).padStart(2, "0")}:${String(parts[1]).padStart(2, "0")}`;
};

const timeToMinutes = (timeValue) => {
  const normalized = normalizeTimeValue(timeValue);
  if (!normalized) return null;
  const [hours, minutes] = normalized.split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
};

const minutesToTime = (totalMinutes) => {
  if (!Number.isFinite(totalMinutes)) return "";
  const safeMinutes = Math.max(0, totalMinutes);
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

const normalizeRanges = (ranges = []) => {
  return (Array.isArray(ranges) ? ranges : [])
    .map((range) => ({
      start: normalizeTimeValue(range?.start),
      end: normalizeTimeValue(range?.end),
    }))
    .filter((range) => range.start && range.end && range.start < range.end);
};

const parseAvailableHours = (value) => {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      return JSON.parse(value) || {};
    } catch {
      return {};
    }
  }
  return typeof value === "object" ? value : {};
};

const buildTrainerSlotsForDate = (availableHours, date) => {
  if (!date) return [];
  const parsedDate = new Date(date);
  if (Number.isNaN(parsedDate.getTime())) return [];

  const dayKey = DAY_KEYS_BY_INDEX[parsedDate.getDay()];
  const dayRanges = normalizeRanges(parseAvailableHours(availableHours)?.[dayKey] || []);
  const slots = [];

  dayRanges.forEach((range) => {
    let startMinute = timeToMinutes(range.start);
    const endMinute = timeToMinutes(range.end);
    if (startMinute === null || endMinute === null) return;

    while (startMinute + TRAINER_SLOT_DURATION_MINUTES <= endMinute) {
      slots.push({
        start: minutesToTime(startMinute),
        end: minutesToTime(startMinute + TRAINER_SLOT_DURATION_MINUTES),
      });
      startMinute += TRAINER_SLOT_DURATION_MINUTES;
    }
  });

  return slots;
};

const assertShareMatchesTrainerSlot = ({ trainer, date, startTime, endTime }) => {
  const normalizedStartTime = normalizeTimeValue(startTime);
  const normalizedEndTime = normalizeTimeValue(endTime);
  const slots = buildTrainerSlotsForDate(trainer?.availableHours, date);
  const isValidSlot = slots.some(
    (slot) => slot.start === normalizedStartTime && slot.end === normalizedEndTime
  );

  if (!isValidSlot) {
    const error = new Error("Khung giờ mượn phải trùng đúng khung giờ rảnh của huấn luyện viên");
    error.statusCode = 400;
    throw error;
  }
};

const assertLeadTimeAtLeastFiveHours = ({ date, startTime }) => {
  const normalizedStart = normalizeTimeValue(startTime);
  if (!date || !normalizedStart) return;

  const slotStart = new Date(`${date}T${normalizedStart}:00`);
  if (Number.isNaN(slotStart.getTime())) return;

  const minimumAllowed = new Date(Date.now() + 5 * 60 * 60 * 1000);
  if (slotStart < minimumAllowed) {
    const error = new Error("Thời gian tạo yêu cầu phải trước giờ mượn ít nhất 5 tiếng");
    error.statusCode = 400;
    throw error;
  }
};

const resolveActiveMemberPackageActivation = async ({ memberId, gymId, transaction }) => {
  if (!memberId || !PackageActivation || !Package) return null;

  const activation = await PackageActivation.findOne({
    where: {
      memberId,
      status: "active",
      sessionsRemaining: { [db.Sequelize.Op.gt]: 0 },
    },
    include: [
      {
        model: Package,
        required: true,
        where: {
          packageType: "personal_training",
          ...(gymId ? { gymId } : {}),
        },
      },
    ],
    order: [["createdAt", "DESC"]],
    transaction,
  });

  if (!activation) return null;
  return {
    packageId: activation.packageId || activation.Package?.id || null,
    packageActivationId: activation.id,
  };
};

const checkTrainerShareConflict = async ({ trainerId, date, timeStart, timeEnd, excludeShareId = null }) => {
  const whereClause = {
    trainerId,
    status: { [db.Sequelize.Op.in]: SHARE_RESERVING_STATUSES },
    startDate: { [db.Sequelize.Op.lte]: date },
    [db.Sequelize.Op.or]: [
      { endDate: { [db.Sequelize.Op.gte]: date } },
      { endDate: null },
    ],
  };

  if (excludeShareId) {
    whereClause.id = { [db.Sequelize.Op.ne]: excludeShareId };
  }

  const existingShares = await TrainerShare.findAll({
    where: whereClause,
    attributes: ["id", "startTime", "endTime", "scheduleMode", "specificSchedules"],
    raw: true,
  });

  for (const share of existingShares) {
    if (share.scheduleMode === "specific_days") {
      const schedules = normalizeSpecificSchedules(share.specificSchedules);
      const scheduleForDate = schedules.find((item) => item.date === date);
      if (scheduleForDate && timeStart < scheduleForDate.endTime && timeEnd > scheduleForDate.startTime) {
        return true;
      }
      continue;
    }

    if (share.scheduleMode === "all_days" && share.startTime && share.endTime) {
      if (timeStart < share.endTime && timeEnd > share.startTime) {
        return true;
      }
    }
  }

  return false;
};

const checkBookingConflict = async ({ trainerId, date, timeStart, timeEnd }) => {
  const { Booking } = db;

  const existingBookings = await Booking.findAll({
    where: {
      trainerId,
      bookingDate: date,
      status: { [db.Sequelize.Op.notIn]: ["cancelled", "no_show"] },
    },
    attributes: ["id", "startTime", "endTime"],
    raw: true,
  });

  return existingBookings.some((booking) => timeStart < booking.endTime && timeEnd > booking.startTime);
};

const parseSpecializationTokens = (raw) =>
  String(raw || "")
    .split(/[\n,;|]+/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);

const trainerMatchesBorrowSpecialization = (trainerSpecialization, borrowSpec) => {
  const need = String(borrowSpec || "").trim();
  if (!need) return true;
  const tokens = parseSpecializationTokens(trainerSpecialization);
  return tokens.some((t) => t === need || t.includes(need) || need.includes(t));
};

/** PT tại gym nguồn: khớp chuyên môn + slot rảnh cấu hình + không trùng booking/share */
const listEligibleBorrowTrainersAtGym = async ({
  fromGymIdNum,
  borrowSpecialization,
  date,
  startTime,
  endTime,
}) => {
  const trainersAtGym = await Trainer.findAll({
    where: { gymId: fromGymIdNum },
    attributes: ["id", "userId", "specialization", "availableHours", "gymId"],
  });

  const matched = [];
  for (const tr of trainersAtGym) {
    if (!trainerMatchesBorrowSpecialization(tr.specialization, borrowSpecialization)) continue;
    try {
      assertShareMatchesTrainerSlot({
        trainer: tr,
        date,
        startTime,
        endTime,
      });
    } catch {
      continue;
    }
    const busy = await checkBookingConflict({
      trainerId: tr.id,
      date,
      timeStart: startTime,
      timeEnd: endTime,
    });
    if (busy) continue;
    const shareBusy = await checkTrainerShareConflict({
      trainerId: tr.id,
      date,
      timeStart: startTime,
      timeEnd: endTime,
    });
    if (shareBusy) continue;
    matched.push(tr);
  }
  return matched;
};

/**
 * Mọi userId PT tại gym nguồn có thể **thấy** yêu cầu mở (open) — khớp filter trong listAvailableTrainerShareRequestsForTrainer:
 * không trainerId; nếu có borrowSpecialization thì chỉ PT khớp chuyên môn; nếu không có thì mọi PT tại gym.
 */
const listOpenShareVisibleTrainerUserIds = async (fromGymIdNum, borrowSpecialization) => {
  const trainersAtGym = await Trainer.findAll({
    where: { gymId: fromGymIdNum },
    attributes: ["id", "userId", "specialization"],
  });
  const spec = String(borrowSpecialization || "").trim();
  const ids = [];
  for (const tr of trainersAtGym) {
    if (!tr.userId) continue;
    if (!spec || trainerMatchesBorrowSpecialization(tr.specialization, spec)) {
      ids.push(Number(tr.userId));
    }
  }
  return [...new Set(ids.filter((n) => Number.isFinite(n)))];
};

const forEachDateInRange = async (startDate, endDate, callback) => {
  const currentDate = new Date(startDate);
  const finalDate = new Date(endDate);

  while (currentDate <= finalDate) {
    const dateStr = currentDate.toISOString().split("T")[0];
    await callback(dateStr);
    currentDate.setDate(currentDate.getDate() + 1);
  }
};

const assertReferencedMemberBelongsToGym = async ({ memberId, toGymId }) => {
  if (!memberId) return null;

  const member = await Member.findOne({
    where: {
      id: memberId,
      gymId: toGymId,
    },
    attributes: ["id", "gymId", "status"],
  });

  if (!member) {
    const error = new Error("Hội viên được gắn phải thuộc đúng phòng tập nhận huấn luyện viên");
    error.statusCode = 400;
    throw error;
  }

  return member;
};

/** userId của PT gắn phiếu mượn — dùng cho socket + thông báo realtime. */
const trainerUserIdForShareTrainerId = async (trainerId) => {
  const tid = Number(trainerId || 0);
  if (!tid) return null;
  const row = await Trainer.findByPk(tid, { attributes: ["userId"] });
  const uid = row?.userId != null ? Number(row.userId) : null;
  return Number.isInteger(uid) && uid > 0 ? uid : null;
};

const emitTrainerShareChanged = (userIds = [], payload = {}) => {
  const ids = [...new Set((userIds || []).filter(Boolean).map(Number))];
  console.log(`[trainer_share emit] targets=${JSON.stringify(ids)} action=${payload.action} status=${payload.status} shareId=${payload.shareId}`);
  ids.forEach((targetUserId) => {
    realtimeService.emitUser(targetUserId, "trainer_share:changed", payload);
  });
};

/**
 * Owner tạo yêu cầu chia sẻ trainer
 */
const createTrainerShare = async (userId, data) => {
  const {
    trainerId,
    fromGymId,
    toGymId,
    memberId, // Hội viên tham chiếu tại gym nhận PT
    shareType,
    scheduleMode,
    startDate,
    endDate,
    startTime,
    endTime,
    multipleDates,
    commissionSplit,
    notes,
    borrowSpecialization,
    sessionPrice,
    busySlotRequestId, // ID của yêu cầu báo bận gốc (BUSY_SLOT) - khi owner chuyển sang luồng mượn PT
  } = data;

  const borrowTrim =
    borrowSpecialization !== undefined && borrowSpecialization !== null
      ? String(borrowSpecialization).trim()
      : "";

  // Validate required fields
  if (!fromGymId || !toGymId) {
    const error = new Error("Thiếu thông tin bắt buộc (fromGymId, toGymId)");
    error.statusCode = 400;
    throw error;
  }

  const hasTrainerId = trainerId !== undefined && trainerId !== null && String(trainerId).trim() !== "";
  const trainerIdNum = hasTrainerId ? Number(trainerId) : null;
  const fromGymIdNum = Number(fromGymId);
  const toGymIdNum = Number(toGymId);
  if ((!hasTrainerId ? false : !Number.isInteger(trainerIdNum)) || !Number.isInteger(fromGymIdNum) || !Number.isInteger(toGymIdNum)) {
    const error = new Error("Thông tin trainer/gym không hợp lệ");
    error.statusCode = 400;
    throw error;
  }

  if (fromGymIdNum === toGymIdNum) {
    const error = new Error("Gym nguồn và gym nhận không được trùng nhau");
    error.statusCode = 400;
    throw error;
  }

  // Kiểm tra trainer tồn tại
  let trainer = null;
  if (hasTrainerId) {
    trainer = await Trainer.findByPk(trainerIdNum);
    if (!trainer) {
      const error = new Error("Trainer không tồn tại");
      error.statusCode = 404;
      throw error;
    }
  }

  // Kiểm tra gym tồn tại
  const fromGym = await Gym.findByPk(fromGymIdNum);
  const toGym = await Gym.findByPk(toGymIdNum);
  if (!fromGym || !toGym) {
    const error = new Error("Gym không tồn tại");
    error.statusCode = 404;
    throw error;
  }

  if (Number(toGym.ownerId) !== Number(userId)) {
    const error = new Error("Bạn chỉ có thể tạo yêu cầu cho gym thuộc quyền quản lý của mình");
    error.statusCode = 403;
    throw error;
  }

  if (trainer && Number(trainer.gymId) !== fromGymIdNum) {
    const error = new Error("Huấn luyện viên không thuộc gym nguồn đã chọn");
    error.statusCode = 400;
    throw error;
  }

  if (
    hasTrainerId &&
    trainer &&
    borrowTrim &&
    !trainerMatchesBorrowSpecialization(trainer.specialization, borrowTrim)
  ) {
    const error = new Error(
      "Huấn luyện viên đã chọn không có chuyên môn trùng với chuyên môn cần mượn",
    );
    error.statusCode = 400;
    throw error;
  }

  let eligibleBorrowTrainers = [];

  await assertReferencedMemberBelongsToGym({
    memberId,
    toGymId: toGymIdNum,
  });

  // Validate time conflict based on schedule mode
  if (hasTrainerId && scheduleMode === "single" && startDate && startTime && endTime) {
    assertLeadTimeAtLeastFiveHours({
      date: startDate,
      startTime,
    });

    assertShareMatchesTrainerSlot({
      trainer,
      date: startDate,
      startTime,
      endTime,
    });

    // Check conflict for single date - CHỈ check trainer share conflict, KHÔNG check booking
    // Vì mục đích của share là chia sẻ PT (kể cả khi đang bận)
    
    // Check trainer share conflict
    const hasShareConflict = await checkTrainerShareConflict({
      trainerId: trainerIdNum,
      date: startDate,
      timeStart: startTime,
      timeEnd: endTime,
    });
    if (hasShareConflict) {
      const error = new Error("Trainer đã được chia sẻ trong khoảng thời gian này");
      error.statusCode = 409;
      throw error;
    }
  } else if (hasTrainerId && scheduleMode === "date_range" && startDate && endDate && startTime && endTime) {
    // Check conflict for date range - check each day
    await forEachDateInRange(startDate, endDate, async (dateStr) => {
      assertLeadTimeAtLeastFiveHours({
        date: dateStr,
        startTime,
      });

      assertShareMatchesTrainerSlot({
        trainer,
        date: dateStr,
        startTime,
        endTime,
      });

      const hasBookingConflict = await checkBookingConflict({
        trainerId: trainerIdNum,
        date: dateStr,
        timeStart: startTime,
        timeEnd: endTime,
      });
      if (hasBookingConflict) {
        const error = new Error(`Trainer đã có lịch booking vào ngày ${dateStr}`);
        error.statusCode = 409;
        throw error;
      }

      const hasShareConflict = await checkTrainerShareConflict({
        trainerId: trainerIdNum,
        date: dateStr,
        timeStart: startTime,
        timeEnd: endTime,
      });
      if (hasShareConflict) {
        const error = new Error(`Trainer đã được chia sẻ vào ngày ${dateStr}`);
        error.statusCode = 409;
        throw error;
      }
    });
  } else if (hasTrainerId && scheduleMode === "multiple_dates" && multipleDates && multipleDates.length > 0) {
    // Check conflict for each specific date
    for (const dateItem of multipleDates) {
      if (!dateItem.date || !dateItem.startTime || !dateItem.endTime) continue;

      assertLeadTimeAtLeastFiveHours({
        date: dateItem.date,
        startTime: dateItem.startTime,
      });

      assertShareMatchesTrainerSlot({
        trainer,
        date: dateItem.date,
        startTime: dateItem.startTime,
        endTime: dateItem.endTime,
      });
      
      // CHỈ check trainer share conflict, KHÔNG check booking
      const hasShareConflict = await checkTrainerShareConflict({
        trainerId: trainerIdNum,
        date: dateItem.date,
        timeStart: dateItem.startTime,
        timeEnd: dateItem.endTime,
      });
      if (hasShareConflict) {
        const error = new Error(`Trainer đã được chia sẻ vào ngày ${dateItem.date}`);
        error.statusCode = 409;
        throw error;
      }
    }
  }

  if (!hasTrainerId && scheduleMode === "single" && startDate && startTime && endTime) {
    if (!borrowTrim) {
      const error = new Error("Vui lòng chọn chuyên môn cần mượn");
      error.statusCode = 400;
      throw error;
    }
    assertLeadTimeAtLeastFiveHours({
      date: startDate,
      startTime,
    });
    eligibleBorrowTrainers = await listEligibleBorrowTrainersAtGym({
      fromGymIdNum,
      borrowSpecialization: borrowTrim,
      date: startDate,
      startTime,
      endTime,
    });
    if (!eligibleBorrowTrainers.length) {
      const error = new Error(
        "Không có huấn luyện viên cùng chuyên môn còn rảnh khung giờ này tại phòng tập nguồn",
      );
      error.statusCode = 400;
      throw error;
    }
  } else if (!hasTrainerId && scheduleMode === "single" && startDate && startTime) {
    assertLeadTimeAtLeastFiveHours({
      date: startDate,
      startTime,
    });
  }

  // Chuẩn hóa dữ liệu lịch để lưu vào cơ sở dữ liệu
  let dbScheduleMode = scheduleMode;
  let specificSchedules = null;
  
  if (scheduleMode === "single") {
    dbScheduleMode = "specific_days";
    specificSchedules = [{ date: startDate, startTime, endTime }];
  } else if (scheduleMode === "date_range") {
    dbScheduleMode = "all_days"; // Or could use specific_days with all dates listed
  } else if (scheduleMode === "multiple_dates") {
    dbScheduleMode = "specific_days";
    specificSchedules = multipleDates;
  }

  // Tạo yêu cầu chia sẻ huấn luyện viên
  const busySlotRequestIdNum = busySlotRequestId ? Number(busySlotRequestId) : null;
  const trainerShare = await TrainerShare.create({
    trainerId: trainerIdNum,
    fromGymId: fromGymIdNum,
    toGymId: toGymIdNum,
    memberId: memberId || null,
    shareType: shareType || "temporary",
    startDate,
    endDate: scheduleMode === "single" ? startDate : endDate,
    startTime,
    endTime,
    scheduleMode: dbScheduleMode,
    specificSchedules: specificSchedules,
    weekdaySchedules: null,
    commissionSplit: commissionSplit || 0.7,
    // Có chỉ định PT: PT tự nhận lịch (pending_trainer). Không chỉ định: mở cho PT gym nguồn claim (open).
    status: hasTrainerId ? "pending_trainer" : "open",
    requestedBy: userId,
    notes,
    borrowSpecialization: borrowTrim || null,
    sessionPrice: parseSessionPrice(sessionPrice),
    sharePaymentStatus: "none",
    busySlotRequestId: busySlotRequestIdNum,
  });

  let trainerName = "một huấn luyện viên phù hợp";
  let namedTrainerUserId = null;
  if (hasTrainerId) {
    const trainerProfile = await Trainer.findByPk(trainerIdNum, {
      include: [{ model: User, attributes: ["username"] }],
      attributes: ["id", "userId"],
    });
    trainerName = trainerProfile?.User?.username || `PT #${trainerIdNum}`;
    namedTrainerUserId = trainerProfile?.userId || null;
  }

  /** Mọi PT có thể thấy yêu cầu mở trên app — dùng cho socket + push (không chỉ PT “đủ slot” trong listEligibleBorrowTrainersAtGym) */
  let notifyTrainerUserIds = [];
  if (!hasTrainerId) {
    notifyTrainerUserIds = await listOpenShareVisibleTrainerUserIds(
      fromGymIdNum,
      borrowTrim,
    );
  }

  emitTrainerShareChanged(
    [...new Set([userId, fromGym.ownerId, namedTrainerUserId, ...notifyTrainerUserIds])].filter(
      Boolean,
    ),
    {
      shareId: trainerShare.id,
      status: trainerShare.status,
      action: "created",
      trainerId: trainerIdNum,
      fromGymId: fromGymIdNum,
      toGymId: toGymIdNum,
    },
  );

  if (fromGym.ownerId && Number(fromGym.ownerId) !== Number(userId)) {
    const ownerMsg = hasTrainerId
      ? `${toGym.name} xin mượn ${trainerName}. PT sẽ xác nhận nhận lịch trên ứng dụng; bạn có thể từ chối nếu không đồng ý.`
      : `${toGym.name} vừa gửi yêu cầu mượn ${trainerName}. Bạn có thể chấp nhận hoặc từ chối trực tiếp.`;
    await realtimeService.notifyUser(fromGym.ownerId, {
      title: "Có yêu cầu mượn huấn luyện viên từ đối tác",
      message: ownerMsg,
      notificationType: "trainer_share",
      relatedType: "trainerShare",
      relatedId: trainerShare.id,
    });
  }

  if (
    namedTrainerUserId &&
    Number(namedTrainerUserId) !== Number(userId) &&
    Number(namedTrainerUserId) !== Number(fromGym.ownerId)
  ) {
    const st = normalizeTimeValue(startTime);
    const et = normalizeTimeValue(endTime);
    await realtimeService.notifyUser(namedTrainerUserId, {
      title: "Có yêu cầu mượn huấn luyện viên",
      message: `${toGym.name} cần mượn bạn (${trainerName}) tại ${fromGym.name}, khung ${startDate} ${st}–${et}. Mở Khung giờ mượn PT để nhận lịch.`,
      notificationType: "trainer_share",
      relatedType: "trainerShare",
      relatedId: trainerShare.id,
    });
  }

  if (!hasTrainerId && notifyTrainerUserIds.length) {
    const st = normalizeTimeValue(startTime);
    const et = normalizeTimeValue(endTime);
    const specLine = borrowTrim ? ` Chuyên môn: ${borrowTrim}.` : "";
    for (const ptUid of notifyTrainerUserIds) {
      if (Number(ptUid) === Number(userId)) continue;
      await realtimeService.notifyUser(ptUid, {
        title: "Có yêu cầu mượn huấn luyện viên",
        message: `${toGym.name} cần mượn huấn luyện viên tại ${fromGym.name}, khung ${startDate} ${st}–${et}.${specLine} Mở Khung giờ mượn PT để xem và nhận lịch.`,
        notificationType: "trainer_share",
        relatedType: "trainerShare",
        relatedId: trainerShare.id,
      });
    }
  }

  return serializeOwnerShare(trainerShare);
};

/**
 * Owner xem danh sách trainer share của mình
 */
const getMyTrainerShares = async (userId, query = {}) => {
  const { page = 1, limit = 10, status, q } = query;

  const offset = (page - 1) * limit;

  // Lấy danh sách gym của owner này
  const myGyms = await Gym.findAll({
    where: { ownerId: userId },
    attributes: ['id'],
    raw: true
  });
  const myGymIds = myGyms.map(g => g.id);

  if (myGymIds.length === 0) {
    return { data: [], pagination: { total: 0, page, limit, totalPages: 0 } };
  }

  // Lấy các yêu cầu mà tôi đã tạo (toGymId thuộc gym của tôi - tôi xin mượn PT)
  const whereClause = { 
    requestedBy: userId,
    toGymId: { [db.Sequelize.Op.in]: myGymIds }
  };
  if (status) {
    whereClause.status = getOwnerShareStatusWhere(status);
  }

  // Build search conditions
  let includeConditions = [
    {
      model: Trainer,
      attributes: ["id", "specialization", "certification"],
      include: [
        {
          model: User,
          attributes: ["id", "username", "email"],
        },
      ],
      required: false,
    },
    {
      model: Gym,
      as: "fromGym",
      attributes: ["id", "name", "address"],
    },
    {
      model: Gym,
      as: "toGym",
      attributes: ["id", "name", "address"],
    },
    {
      model: User,
      as: "requester",
      attributes: ["id", "username", "email"],
    },
    {
      model: User,
      as: "approver",
      attributes: ["id", "username", "email"],
    },
    {
      model: Policy,
      attributes: ["id", "name"],
      required: false,
    },
  ];

  // Search by trainer name or gym name
  if (q && q.trim()) {
    includeConditions[0] = {
      model: Trainer,
      attributes: ["id", "specialization", "certification"],
      include: [
        {
          model: User,
          attributes: ["id", "username", "email"],
          where: {
            username: { [db.Sequelize.Op.like]: `%${q.trim()}%` },
          },
          required: false,
        },
      ],
      required: false,
    };
  }

  const { rows, count } = await TrainerShare.findAndCountAll({
    where: whereClause,
    include: includeConditions,
    limit: parseInt(limit),
    offset: parseInt(offset),
    order: [["createdAt", "DESC"]],
  });

  return {
    data: rows.map(serializeOwnerShare),
    pagination: {
      total: count,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(count / limit),
    },
  };
};

/**
 * Owner xem chi tiết một trainer share
 */
const getMyTrainerShareDetail = async (userId, shareId) => {
  const trainerShare = await TrainerShare.findOne({
    where: {
      id: shareId,
    },
    include: [
      {
        model: Trainer,
        attributes: ["id", "specialization", "certification"],
        include: [
          {
            model: User,
            attributes: ["id", "username", "email"],
          },
        ],
      },
      {
        model: Gym,
        as: "fromGym",
        attributes: ["id", "name", "address", "ownerId"],
      },
      {
        model: Gym,
        as: "toGym",
        attributes: ["id", "name", "address", "ownerId"],
      },
      {
        model: User,
        as: "requester",
        attributes: ["id", "username", "email"],
      },
      {
        model: User,
        as: "approver",
        attributes: ["id", "username", "email"],
      },
      {
        model: Policy,
        attributes: ["id", "name"],
      },
    ],
  });

  if (!trainerShare) {
    const error = new Error("Không tìm thấy trainer share hoặc bạn không có quyền xem");
    error.statusCode = 404;
    throw error;
  }

  const uid = Number(userId);
  const toOwner = Number(trainerShare.requestedBy);
  const fromOwner = Number(trainerShare.fromGym?.ownerId);
  if (uid !== toOwner && uid !== fromOwner) {
    const error = new Error("Không tìm thấy trainer share hoặc bạn không có quyền xem");
    error.statusCode = 404;
    throw error;
  }

  return serializeOwnerShare(trainerShare);
};

/**
 * Owner cập nhật trainer share (chỉ khi waiting_acceptance)
 */
const updateMyTrainerShare = async (userId, shareId, data) => {
  const trainerShare = await TrainerShare.findOne({
    where: {
      id: shareId,
      requestedBy: userId,
    },
  });

  if (!trainerShare) {
    const error = new Error("Không tìm thấy trainer share hoặc bạn không có quyền cập nhật");
    error.statusCode = 404;
    throw error;
  }

  const editableOutgoingStatuses = ["waiting_acceptance", "pending_trainer"];
  if (!editableOutgoingStatuses.includes(trainerShare.status)) {
    const error = new Error(`Không thể cập nhật trainer share với status '${trainerShare.status}'`);
    error.statusCode = 400;
    throw error;
  }

  const nextToGymId = data.toGymId || trainerShare.toGymId;
  const nextMemberId = data.memberId !== undefined ? data.memberId : trainerShare.memberId;

  await assertReferencedMemberBelongsToGym({
    memberId: nextMemberId,
    toGymId: nextToGymId,
  });

  const existingSpecificSchedules = normalizeSpecificSchedules(trainerShare.specificSchedules);
  const isSingleSpecificDay =
    trainerShare.scheduleMode === "specific_days" && existingSpecificSchedules.length <= 1;
  const isMultipleSpecificDays =
    trainerShare.scheduleMode === "specific_days" && existingSpecificSchedules.length > 1;

  const newStartDate = data.startDate || trainerShare.startDate;
  const newEndDate = data.endDate !== undefined ? data.endDate : trainerShare.endDate;
  const newStartTime = data.startTime !== undefined ? data.startTime : trainerShare.startTime;
  const newEndTime = data.endTime !== undefined ? data.endTime : trainerShare.endTime;
  const isTryingToChangeSchedule = ["startDate", "endDate", "startTime", "endTime"].some(
    (field) => data[field] !== undefined
  );

  if (isMultipleSpecificDays && isTryingToChangeSchedule) {
    const error = new Error("Phiếu nhiều ngày rời chỉ cho phép sửa hội viên tham chiếu và ghi chú");
    error.statusCode = 400;
    throw error;
  }

  if (isSingleSpecificDay && newStartDate && newStartTime && newEndTime) {
    assertShareMatchesTrainerSlot({
      trainer: await Trainer.findByPk(trainerShare.trainerId, { attributes: ["id", "availableHours"] }),
      date: newStartDate,
      startTime: newStartTime,
      endTime: newEndTime,
    });

    const hasShareConflict = await checkTrainerShareConflict({
      trainerId: trainerShare.trainerId,
      date: newStartDate,
      timeStart: newStartTime,
      timeEnd: newEndTime,
      excludeShareId: trainerShare.id,
    });

    if (hasShareConflict) {
      const error = new Error("Trainer đã được chia sẻ trong khoảng thời gian này");
      error.statusCode = 409;
      throw error;
    }
  }

  if (trainerShare.scheduleMode === "all_days" && newStartDate && newEndDate && newStartTime && newEndTime) {
    const updateTrainer = await Trainer.findByPk(trainerShare.trainerId, { attributes: ["id", "availableHours"] });
    await forEachDateInRange(newStartDate, newEndDate, async (dateStr) => {
      assertShareMatchesTrainerSlot({
        trainer: updateTrainer,
        date: dateStr,
        startTime: newStartTime,
        endTime: newEndTime,
      });

      const hasBookingConflict = await checkBookingConflict({
        trainerId: trainerShare.trainerId,
        date: dateStr,
        timeStart: newStartTime,
        timeEnd: newEndTime,
      });

      if (hasBookingConflict) {
        const error = new Error(`Trainer đã có lịch booking vào ngày ${dateStr}`);
        error.statusCode = 409;
        throw error;
      }

      const hasShareConflict = await checkTrainerShareConflict({
        trainerId: trainerShare.trainerId,
        date: dateStr,
        timeStart: newStartTime,
        timeEnd: newEndTime,
        excludeShareId: trainerShare.id,
      });

      if (hasShareConflict) {
        const error = new Error(`Trainer đã được chia sẻ vào ngày ${dateStr}`);
        error.statusCode = 409;
        throw error;
      }
    });
  }

  // Update các trường được phép
  const allowedFields = [
    "shareType",
    "startDate",
    "endDate",
    "startTime",
    "endTime",
    "commissionSplit",
    "notes",
    "memberId",
  ];

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      trainerShare[field] = data[field];
    }
  }

  if (data.sessionPrice !== undefined) {
    const p = parseSessionPrice(data.sessionPrice);
    if (p !== null) {
      trainerShare.sessionPrice = p;
    }
  }

  if (isSingleSpecificDay) {
    trainerShare.startDate = newStartDate;
    trainerShare.endDate = newStartDate;
    trainerShare.startTime = newStartTime;
    trainerShare.endTime = newEndTime;
    trainerShare.specificSchedules = [
      {
        date: newStartDate,
        startTime: newStartTime,
        endTime: newEndTime,
      },
    ];
  }

  if (trainerShare.scheduleMode === "all_days") {
    trainerShare.startDate = newStartDate;
    trainerShare.endDate = newEndDate;
    trainerShare.startTime = newStartTime;
    trainerShare.endTime = newEndTime;
  }

  await trainerShare.save();

  const fromGym = await Gym.findByPk(trainerShare.fromGymId, { attributes: ["ownerId"] });
  const ptUid = trainerShare.trainerId
    ? await trainerUserIdForShareTrainerId(trainerShare.trainerId)
    : null;
  emitTrainerShareChanged([userId, fromGym?.ownerId, ptUid].filter(Boolean), {
    shareId: trainerShare.id,
    status: trainerShare.status,
    action: "updated",
    trainerId: trainerShare.trainerId,
    fromGymId: trainerShare.fromGymId,
    toGymId: trainerShare.toGymId,
  });

  return serializeOwnerShare(trainerShare);
};

/**
 * Owner xóa trainer share (chỉ khi waiting_acceptance)
 */
const deleteMyTrainerShare = async (userId, shareId) => {
  const trainerShare = await TrainerShare.findOne({
    where: {
      id: shareId,
      requestedBy: userId,
    },
  });

  if (!trainerShare) {
    const error = new Error("Không tìm thấy trainer share hoặc bạn không có quyền xóa");
    error.statusCode = 404;
    throw error;
  }

  const deletableOutgoingStatuses = ["waiting_acceptance", "pending_trainer"];
  if (!deletableOutgoingStatuses.includes(trainerShare.status)) {
    const error = new Error(`Không thể xóa trainer share với status '${trainerShare.status}'`);
    error.statusCode = 400;
    throw error;
  }

  const fromGym = await Gym.findByPk(trainerShare.fromGymId, { attributes: ["ownerId"] });
  const ptUidDel = trainerShare.trainerId
    ? await trainerUserIdForShareTrainerId(trainerShare.trainerId)
    : null;
  emitTrainerShareChanged([userId, fromGym?.ownerId, ptUidDel].filter(Boolean), {
    shareId: trainerShare.id,
    status: trainerShare.status,
    action: "deleted",
    trainerId: trainerShare.trainerId,
    fromGymId: trainerShare.fromGymId,
    toGymId: trainerShare.toGymId,
  });

  await trainerShare.destroy();

  return { message: "Đã xóa trainer share request thành công" };
};

/**
 * Owner lấy danh sách trainers có sẵn cho gym
 * Trả về trainers thuộc gym này (để share đi)
 */
const getAvailableTrainers = async (userId, gymId, options = {}) => {
  const includeBorrowed =
    options?.includeBorrowed === true ||
    options?.includeBorrowed === 'true' ||
    options?.includeBorrowed === '1';

  const gymIdNum = Number(gymId);
  if (!Number.isInteger(gymIdNum)) {
    const error = new Error("Gym không hợp lệ");
    error.statusCode = 400;
    throw error;
  }

  const gymWhereClause = includeBorrowed
    ? { id: gymIdNum, ownerId: userId }
    : { id: gymIdNum };

  const targetGym = await Gym.findOne({
    where: gymWhereClause,
    attributes: ['id', 'name', 'ownerId'],
  });

  if (!targetGym) {
    const error = new Error(
      includeBorrowed
        ? 'Gym không tồn tại hoặc bạn không có quyền'
        : 'Gym nguồn không tồn tại hoặc bạn không có quyền'
    );
    error.statusCode = 404;
    throw error;
  }

  // Lấy trainers thuộc gym này
  const localTrainers = await Trainer.findAll({
    where: {
      gymId: gymIdNum,
    },
    include: [
      {
        model: User,
        attributes: ["id", "username", "email"],
      },
      {
        model: Gym,
        attributes: ["id", "name"],
      },
    ],
    attributes: ["id", "specialization", "certification", "availableHours", "gymId"],
  });

  if (!includeBorrowed) {
    return { trainers: localTrainers };
  }

  const approvedShares = await TrainerShare.findAll({
    where: {
      requestedBy: userId,
      toGymId: gymIdNum,
      status: { [db.Sequelize.Op.in]: [...OWNER_ACTIVE_SHARE_STATUSES, "pending_trainer"] },
    },
    attributes: ['id', 'trainerId', 'fromGymId', 'toGymId', 'scheduleMode', 'specificSchedules', 'startDate', 'endDate'],
    raw: true,
  });

  if (!approvedShares.length) {
    return { trainers: localTrainers };
  }

  const localTrainerIds = new Set(localTrainers.map((trainer) => Number(trainer.id)));
  const borrowedTrainerIds = [...new Set(
    approvedShares
      .map((share) => Number(share.trainerId))
      .filter((trainerId) => trainerId && !localTrainerIds.has(trainerId))
  )];

  if (!borrowedTrainerIds.length) {
    return { trainers: localTrainers };
  }

  const borrowedTrainers = await Trainer.findAll({
    where: { id: borrowedTrainerIds },
    include: [
      {
        model: User,
        attributes: ['id', 'username', 'email'],
      },
      {
        model: Gym,
        attributes: ['id', 'name'],
      },
    ],
    attributes: ['id', 'specialization', 'certification', 'availableHours', 'gymId'],
  });

  const shareByTrainerId = new Map();
  approvedShares.forEach((share) => {
    if (!shareByTrainerId.has(Number(share.trainerId))) {
      shareByTrainerId.set(Number(share.trainerId), share);
    }
  });

  const normalizedBorrowed = borrowedTrainers.map((trainer) => {
    const row = trainer.toJSON ? trainer.toJSON() : trainer;
    const share = shareByTrainerId.get(Number(row.id));
    return {
      ...row,
      isSharedTrainer: true,
      shareId: share?.id || null,
      shareFromGymId: share?.fromGymId || row.gymId || null,
      shareToGymId: share?.toGymId || Number(gymId),
      shareScheduleMode: share?.scheduleMode || null,
      shareStartDate: share?.startDate || null,
      shareEndDate: share?.endDate || null,
    };
  });

  return { trainers: [...localTrainers, ...normalizedBorrowed] };
};

/**
 * Owner phía gym nguồn xem các yêu cầu chia sẻ trainer nhận được
 */
const getReceivedTrainerShareRequests = async (userId, query = {}) => {
  const { page = 1, limit = 10, status, q } = query;
  const offset = (page - 1) * limit;

  // Lấy danh sách gym của owner này
  const myGyms = await Gym.findAll({
    where: { ownerId: userId },
    attributes: ['id'],
    raw: true
  });
  const myGymIds = myGyms.map(g => g.id);

  if (myGymIds.length === 0) {
    return { data: [], pagination: { total: 0, page, limit, totalPages: 0 } };
  }

  // Tìm các yêu cầu có fromGymId là gym của owner này (có người muốn mượn PT từ tôi)
  const whereClause = {
    fromGymId: { [db.Sequelize.Op.in]: myGymIds }
  };

  if (status) {
    whereClause.status = getOwnerShareStatusWhere(status);
  }

  const includeConditions = [
    { model: Trainer, include: [{ model: User, attributes: ['id', 'username', 'email'] }] },
    { model: Gym, as: 'fromGym', attributes: ['id', 'name', 'address'] },
    { model: Gym, as: 'toGym', attributes: ['id', 'name', 'address'] },
    { model: User, as: 'requester', attributes: ['id', 'username', 'email'] }
  ];

  // Search by trainer name
  if (q) {
    includeConditions[0].include[0].where = {
      username: { [db.Sequelize.Op.like]: `%${q}%` }
    };
  }

  const { count, rows } = await TrainerShare.findAndCountAll({
    where: whereClause,
    include: includeConditions,
    limit: parseInt(limit),
    offset,
    order: [['createdAt', 'DESC']]
  });

  return {
    data: rows.map(serializeOwnerShare),
    pagination: {
      total: count,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(count / limit)
    }
  };
};

/**
 * Owner phía gym nguồn chấp nhận yêu cầu chia sẻ trainer
 */
const acceptTrainerShareRequest = async (userId, requestId) => {
  const request = await TrainerShare.findByPk(requestId, {
    include: [
      { model: Gym, as: 'fromGym' },
      { model: Gym, as: 'toGym' },
      {
        model: Trainer,
        include: [{ model: User, attributes: ["username"] }],
        attributes: ["id"],
      },
    ]
  });

  if (!request) {
    const error = new Error("Yêu cầu không tồn tại");
    error.statusCode = 404;
    throw error;
  }

  // Kiểm tra fromGym có thuộc userId không (owner cho mượn mới có quyền chấp nhận)
  if (request.fromGym.ownerId !== userId) {
    const error = new Error("Bạn không có quyền chấp nhận yêu cầu này");
    error.statusCode = 403;
    throw error;
  }

  // Chỉ cho phép chấp nhận nếu status = waiting_acceptance
  if (request.status !== 'waiting_acceptance') {
    const error = new Error("Yêu cầu này không thể chấp nhận");
    error.statusCode = 400;
    throw error;
  }

  request.status = 'approved';
  request.approvedBy = userId;
  request.acceptedBy = userId;
  request.acceptedAt = new Date();
  await request.save();

  // Nếu yêu cầu mượn này đến từ yêu cầu báo bận (busySlotRequestId), cập nhật trạng thái yêu cầu báo bận gốc thành APPROVED
  if (request.busySlotRequestId) {
    const busySlotRequest = await Request.findByPk(request.busySlotRequestId);
    if (busySlotRequest && String(busySlotRequest.requestType || "").toUpperCase() === "BUSY_SLOT") {
      const previousStatus = busySlotRequest.status;
      busySlotRequest.status = "APPROVED";
      busySlotRequest.processedAt = new Date();
      await busySlotRequest.save();
      console.log(`[trainer_share] Đã cập nhật yêu cầu báo bận #${request.busySlotRequestId} từ '${previousStatus}' -> 'APPROVED' (do owner đồng ý cho mượn #${request.id})`);
    }
  }

  const ptUidApproved = request.trainerId
    ? await trainerUserIdForShareTrainerId(request.trainerId)
    : null;
  emitTrainerShareChanged([userId, request.requestedBy, ptUidApproved].filter(Boolean), {
    shareId: request.id,
    status: request.status,
    action: "approved",
    trainerId: request.trainerId,
    fromGymId: request.fromGymId,
    toGymId: request.toGymId,
  });

  if (request.requestedBy && Number(request.requestedBy) !== Number(userId)) {
    await realtimeService.notifyUser(request.requestedBy, {
      title: "Đối tác đã đồng ý cho mượn huấn luyện viên",
      message: `${request.fromGym?.name || "Đối tác"} đã đồng ý cho mượn ${request.Trainer?.User?.username || `Huấn luyện viên #${request.trainerId}`}.`,
      notificationType: "trainer_share",
      relatedType: "trainerShare",
      relatedId: request.id,
    });
  }

  if (
    ptUidApproved &&
    Number(ptUidApproved) !== Number(userId) &&
    Number(ptUidApproved) !== Number(request.requestedBy)
  ) {
    await realtimeService.notifyUser(ptUidApproved, {
      title: "Phiếu mượn PT đã được chấp nhận",
      message: `${request.fromGym?.name || "Chi nhánh cho mượn"} đã đồng ý cho mượn — phiếu #${request.id}. Kiểm tra lịch làm việc.`,
      notificationType: "trainer_share",
      relatedType: "trainerShare",
      relatedId: request.id,
    });
  }

  return serializeOwnerShare(request);
};

/**
 * Owner phía gym nguồn từ chối yêu cầu chia sẻ trainer
 */
const rejectTrainerShareRequest = async (userId, requestId, reason) => {
  const request = await TrainerShare.findByPk(requestId, {
    include: [
      { model: Gym, as: 'fromGym' },
      { model: Gym, as: 'toGym' },
      {
        model: Trainer,
        include: [{ model: User, attributes: ["username"] }],
        attributes: ["id"],
      },
    ]
  });

  if (!request) {
    const error = new Error("Yêu cầu không tồn tại");
    error.statusCode = 404;
    throw error;
  }

  // Kiểm tra fromGym có thuộc userId không (owner cho mượn mới có quyền từ chối)
  if (request.fromGym.ownerId !== userId) {
    const error = new Error("Bạn không có quyền từ chối yêu cầu này");
    error.statusCode = 403;
    throw error;
  }

  const rejectableStatuses = ["waiting_acceptance", "pending_trainer"];
  if (!rejectableStatuses.includes(request.status)) {
    const error = new Error("Yêu cầu này không thể từ chối");
    error.statusCode = 400;
    throw error;
  }

  // Cập nhật status -> rejected_by_partner
  request.status = 'rejected_by_partner';
  request.rejectedBy = userId;
  request.rejectedAt = new Date();
  if (reason) {
    // Lưu lý do từ chối (ghi đè notes cũ)
    request.notes = `Lý do từ chối: ${reason}`;
  }
  await request.save();

  const ptUidRejected = request.trainerId
    ? await trainerUserIdForShareTrainerId(request.trainerId)
    : null;
  emitTrainerShareChanged([userId, request.requestedBy, ptUidRejected].filter(Boolean), {
    shareId: request.id,
    status: request.status,
    action: "rejected",
    trainerId: request.trainerId,
    fromGymId: request.fromGymId,
    toGymId: request.toGymId,
  });

  if (request.requestedBy && Number(request.requestedBy) !== Number(userId)) {
    await realtimeService.notifyUser(request.requestedBy, {
      title: "Đối tác đã từ chối cho mượn huấn luyện viên",
      message: `${request.fromGym?.name || "Đối tác"} đã từ chối yêu cầu mượn ${request.Trainer?.User?.username || `Huấn luyện viên #${request.trainerId}`}.`,
      notificationType: "trainer_share",
      relatedType: "trainerShare",
      relatedId: request.id,
    });
  }

  if (
    ptUidRejected &&
    Number(ptUidRejected) !== Number(userId) &&
    Number(ptUidRejected) !== Number(request.requestedBy)
  ) {
    await realtimeService.notifyUser(ptUidRejected, {
      title: "Phiếu mượn PT bị từ chối",
      message: `${request.fromGym?.name || "Chi nhánh cho mượn"} đã từ chối yêu cầu mượn cho ${request.toGym?.name || "chi nhánh bạn"} — phiếu #${request.id}.`,
      notificationType: "trainer_share",
      relatedType: "trainerShare",
      relatedId: request.id,
    });
  }

  return serializeOwnerShare(request);
};

const listAvailableTrainerShareRequestsForTrainer = async (userId, query = {}) => {
  const trainer = await Trainer.findOne({
    where: { userId },
    attributes: ["id", "gymId", "specialization", "availableHours"],
  });
  if (!trainer) {
    const error = new Error("Không tìm thấy hồ sơ huấn luyện viên");
    error.statusCode = 404;
    throw error;
  }

  const { page = 1, limit = 20 } = query;
  const offset = (Number(page) - 1) * Number(limit);
  const Op = db.Sequelize.Op;

  // - open + trainerId null: khung giờ mở; nếu có borrowSpecialization chỉ PT khớp chuyên môn thấy được
  // - pending_trainer / waiting_acceptance + trainerId = PT này: chỉ định PT — PT nhận lịch (claim)
  const whereClause = {
    fromGymId: trainer.gymId,
    [Op.or]: [
      { status: "open", trainerId: { [Op.is]: null } },
      { status: "pending_trainer", trainerId: trainer.id },
      { status: "waiting_acceptance", trainerId: trainer.id },
    ],
  };

  const allRows = await TrainerShare.findAll({
    where: whereClause,
    include: [
      { model: Gym, as: "fromGym", attributes: ["id", "name", "address"] },
      { model: Gym, as: "toGym", attributes: ["id", "name", "address"] },
      { model: User, as: "requester", attributes: ["id", "username", "email"] },
    ],
    order: [["createdAt", "DESC"]],
    limit: 400,
  });

  const filtered = allRows.filter((request) => {
    const spec = String(request.borrowSpecialization || "").trim();
    if (String(request.status || "") !== "open" || !spec) return true;
    return trainerMatchesBorrowSpecialization(trainer.specialization, spec);
  });

  const total = filtered.length;
  const rows = filtered.slice(offset, offset + Number(limit));

  return {
    data: rows.map(serializeOwnerShare),
    pagination: {
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.max(1, Math.ceil(total / Number(limit))),
    },
  };
};

const claimTrainerShareRequest = async (userId, requestId) => {
  const trainer = await Trainer.findOne({
    where: { userId },
    attributes: ["id", "userId", "gymId", "availableHours", "specialization"],
  });
  if (!trainer) {
    const error = new Error("Không tìm thấy hồ sơ huấn luyện viên");
    error.statusCode = 404;
    throw error;
  }

  return db.sequelize.transaction(async (transaction) => {
    const request = await TrainerShare.findByPk(requestId, {
      include: [
        { model: Gym, as: "fromGym", attributes: ["id", "name", "ownerId"] },
        { model: Gym, as: "toGym", attributes: ["id", "name", "ownerId"] },
      ],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!request) {
      const error = new Error("Yêu cầu không tồn tại");
      error.statusCode = 404;
      throw error;
    }

    if (Number(request.fromGymId) !== Number(trainer.gymId)) {
      const error = new Error("Bạn không thuộc gym nguồn của yêu cầu này");
      error.statusCode = 403;
      throw error;
    }

    const isOpenPool =
      String(request.status || "") === "open" &&
      (request.trainerId == null || request.trainerId === "");
    const isNamedPendingTrainer =
      (String(request.status || "") === "pending_trainer" ||
        String(request.status || "") === "waiting_acceptance") &&
      Number(request.trainerId) === Number(trainer.id);

    const borrowSpec = String(request.borrowSpecialization || "").trim();
    if (
      isOpenPool &&
      borrowSpec &&
      !trainerMatchesBorrowSpecialization(trainer.specialization, borrowSpec)
    ) {
      const error = new Error("Yêu cầu này dành cho chuyên môn khác với hồ sơ của bạn");
      error.statusCode = 403;
      throw error;
    }

    if (!isOpenPool && !isNamedPendingTrainer) {
      const error = new Error("Khung giờ đã được nhận hoặc không còn mở");
      error.statusCode = 409;
      throw error;
    }

    const scheduleDates = [];
    if (request.scheduleMode === "specific_days") {
      normalizeSpecificSchedules(request.specificSchedules).forEach((item) => {
        if (item?.date && item?.startTime && item?.endTime) {
          scheduleDates.push({ date: item.date, startTime: item.startTime, endTime: item.endTime });
        }
      });
    } else if (request.scheduleMode === "all_days" && request.startDate && request.endDate) {
      await forEachDateInRange(request.startDate, request.endDate, async (dateStr) => {
        scheduleDates.push({ date: dateStr, startTime: request.startTime, endTime: request.endTime });
      });
    }

    for (const slot of scheduleDates) {
      assertShareMatchesTrainerSlot({
        trainer,
        date: slot.date,
        startTime: slot.startTime,
        endTime: slot.endTime,
      });

      const hasBookingConflict = await checkBookingConflict({
        trainerId: trainer.id,
        date: slot.date,
        timeStart: slot.startTime,
        timeEnd: slot.endTime,
      });
      if (hasBookingConflict) {
        const error = new Error(`Bạn đã có lịch dạy trùng vào ngày ${slot.date}`);
        error.statusCode = 409;
        throw error;
      }

      const hasShareConflict = await checkTrainerShareConflict({
        trainerId: trainer.id,
        date: slot.date,
        timeStart: slot.startTime,
        timeEnd: slot.endTime,
        excludeShareId: request.id,
      });
      if (hasShareConflict) {
        const error = new Error(`Bạn đã nhận khung giờ trùng vào ngày ${slot.date}`);
        error.statusCode = 409;
        throw error;
      }
    }

    request.trainerId = trainer.id;
    request.status = "approved";
    request.acceptedBy = userId;
    request.approvedBy = userId;
    request.acceptedAt = new Date();
    await request.save({ transaction });

    // ✅ NEW: Notify owner bên mượn (toGym) khi PT ngoài chi nhánh đã nhận lịch
    try {
      const borrowerOwnerId = Number(request?.toGym?.ownerId || 0);
      const isExternalBorrow = Number(request?.fromGymId || 0) !== Number(request?.toGymId || 0);
      if (borrowerOwnerId && isExternalBorrow && Array.isArray(scheduleDates) && scheduleDates.length) {
        const trainerUser = trainer.userId
          ? await User.findByPk(trainer.userId, { attributes: ["id", "username"], transaction })
          : null;
        const trainerName = trainerUser?.username || `PT #${trainer.id}`;

        const first = scheduleDates[0];
        const slotLabel = `${first.date} (${String(first.startTime || "").slice(0, 5)}-${String(first.endTime || "").slice(0, 5)})`;
        const more = scheduleDates.length > 1 ? ` và ${scheduleDates.length - 1} khung giờ khác` : "";
        const gymName = request?.toGym?.name || (request?.toGymId ? `Chi nhánh #${request.toGymId}` : "chi nhánh");

        await realtimeService.notifyUser(borrowerOwnerId, {
          title: "Đã có PT nhận lịch mượn ngoài chi nhánh",
          message: `${trainerName} đã nhận lịch mượn tại ${gymName} vào ${slotLabel}${more}.`,
          notificationType: "trainer_share",
          relatedType: "trainerShare",
          relatedId: request.id,
        });
      }
    } catch (e) {
      console.error("[trainer_share] notify borrower owner on claim failed:", e.message);
    }

    // Nếu yêu cầu mượn này đến từ yêu cầu báo bận (busySlotRequestId), cập nhật trạng thái yêu cầu báo bận gốc thành APPROVED
    if (request.busySlotRequestId) {
      const busySlotRequest = await Request.findByPk(request.busySlotRequestId, { transaction, lock: transaction.LOCK.UPDATE });
      if (busySlotRequest && String(busySlotRequest.requestType || "").toUpperCase() === "BUSY_SLOT") {
        const previousStatus = busySlotRequest.status;
        busySlotRequest.status = "APPROVED";
        busySlotRequest.processedAt = new Date();
        await busySlotRequest.save({ transaction });
        console.log(`[trainer_share] Đã cập nhật yêu cầu báo bận #${request.busySlotRequestId} từ '${previousStatus}' -> 'APPROVED' (do PT #${trainer.id} nhận yêu cầu mượn #${request.id})`);
      }
    }

    // Tự động tạo/cập nhật lịch dạy cho huấn luyện viên từ khung giờ đã nhận
    for (const slot of scheduleDates) {
      // Nếu có hội viên tham chiếu, ưu tiên đổi huấn luyện viên cho booking hiện có đúng khung giờ
      // (để hội viên thấy lịch buổi đó chuyển sang huấn luyện viên được mượn)
      if (request.memberId) {
        const memberBooking = await Booking.findOne({
          where: {
            memberId: request.memberId,
            gymId: request.toGymId,
            bookingDate: slot.date,
            startTime: slot.startTime,
            endTime: slot.endTime,
            status: { [db.Sequelize.Op.notIn]: ["cancelled", "no_show"] },
          },
          order: [["createdAt", "DESC"]],
          transaction,
          lock: transaction.LOCK.UPDATE,
        });

        if (memberBooking) {
          const previousTrainerId = Number(memberBooking.trainerId || 0) || null;
          memberBooking.trainerId = trainer.id;
          memberBooking.trainerShareId = request.id;
          if (!memberBooking.sessionType || String(memberBooking.sessionType).toLowerCase() !== "trainer_share") {
            memberBooking.sessionType = "trainer_share";
          }
          if (!memberBooking.status || String(memberBooking.status).toLowerCase() === "pending") {
            memberBooking.status = "confirmed";
          }
          const auditNote = `Đổi huấn luyện viên theo yêu cầu chia sẻ #${request.id}: ${
            previousTrainerId ? `Huấn luyện viên #${previousTrainerId}` : "Không xác định"
          } -> Huấn luyện viên #${trainer.id}`;
          const nextNote = request.notes
            ? `${request.notes}\n${auditNote}`
            : auditNote;
          memberBooking.notes = memberBooking.notes
            ? `${memberBooking.notes}\n${nextNote}`
            : nextNote;
          await memberBooking.save({ transaction });

          // Realtime: để owner/member/huấn luyện viên cập nhật lịch ngay khi đổi huấn luyện viên
          realtimeService.emitGym(request.toGymId, "booking:status-changed", {
            bookingId: memberBooking.id,
            status: memberBooking.status,
            gymId: request.toGymId,
            trainerId: trainer.id,
            memberId: memberBooking.memberId || request.memberId || null,
            bookingDate: memberBooking.bookingDate,
            startTime: memberBooking.startTime,
            endTime: memberBooking.endTime,
            source: "trainer_share_claim",
          });

          if (request.toGym?.ownerId) {
            realtimeService.emitUser(request.toGym.ownerId, "booking:status-changed", {
              bookingId: memberBooking.id,
              status: memberBooking.status,
              gymId: request.toGymId,
              trainerId: trainer.id,
              memberId: memberBooking.memberId || request.memberId || null,
              bookingDate: memberBooking.bookingDate,
              startTime: memberBooking.startTime,
              endTime: memberBooking.endTime,
              source: "trainer_share_claim",
            });
          }

          if (memberBooking.memberId) {
            const member = await Member.findByPk(memberBooking.memberId, {
              attributes: ["id", "userId"],
              transaction,
            });
            if (member?.userId) {
              await realtimeService.notifyUser(member.userId, {
                title: "Lịch tập của bạn đã được cập nhật huấn luyện viên",
                message: `Buổi tập ngày ${memberBooking.bookingDate} (${String(memberBooking.startTime || "").slice(0, 5)}-${String(memberBooking.endTime || "").slice(0, 5)}) đã được gán huấn luyện viên mới.`,
                notificationType: "booking_update",
                relatedType: "booking",
                relatedId: memberBooking.id,
              });
            }
          }
          continue;
        }
      }

      const existed = await Booking.findOne({
        where: {
          trainerId: trainer.id,
          gymId: request.toGymId,
          bookingDate: slot.date,
          startTime: slot.startTime,
          endTime: slot.endTime,
        },
        transaction,
      });

      if (!existed) {
        let packageInfo = { packageId: null, packageActivationId: null };
        if (request.memberId) {
          const resolved = await resolveActiveMemberPackageActivation({
            memberId: request.memberId,
            gymId: request.toGymId,
            transaction,
          });
          if (resolved) packageInfo = resolved;
        }

        await Booking.create(
          {
            memberId: request.memberId || null,
            trainerId: trainer.id,
            gymId: request.toGymId,
            packageId: packageInfo.packageId,
            packageActivationId: packageInfo.packageActivationId,
            bookingDate: slot.date,
            startTime: slot.startTime,
            endTime: slot.endTime,
            sessionType: "trainer_share",
            trainerShareId: request.id,
            notes: request.notes
              ? `${request.notes}\nPhiếu mượn PT #${request.id}`
              : `Tự động tạo từ yêu cầu mượn huấn luyện viên. Phiếu #${request.id}`,
            status: "confirmed",
            createdBy: request.requestedBy || null,
          },
          { transaction }
        );
      }
    }

    emitTrainerShareChanged([request.requestedBy, request.fromGym?.ownerId, request.toGym?.ownerId], {
      shareId: request.id,
      status: request.status,
      action: "claimed_by_trainer",
      trainerId: request.trainerId,
      fromGymId: request.fromGymId,
      toGymId: request.toGymId,
    });

    if (request.requestedBy) {
      await realtimeService.notifyUser(request.requestedBy, {
        title: "Yêu cầu mượn huấn luyện viên đã được nhận",
        message: `Một huấn luyện viên từ ${request.fromGym?.name || "phòng tập đối tác"} đã nhận khung giờ mượn huấn luyện viên của bạn.`,
        notificationType: "trainer_share",
        relatedType: "trainerShare",
        relatedId: request.id,
      });
    }

    return serializeOwnerShare(request);
  });
};

/**
 * Owner chi nhánh mượn (requestedBy) nhập/sửa giá buổi khi phiếu đã approved, trước khi đối tác gửi CK hoặc khi chưa thanh toán xong.
 */
const updateBorrowerSessionPrice = async (userId, shareId, data) => {
  const trainerShare = await TrainerShare.findOne({
    where: { id: shareId, requestedBy: userId },
  });

  if (!trainerShare) {
    const error = new Error("Không tìm thấy phiếu hoặc bạn không có quyền");
    error.statusCode = 404;
    throw error;
  }

  if (trainerShare.status !== "approved") {
    const error = new Error("Chỉ cập nhật giá khi phiếu đã được đối tác chấp nhận");
    error.statusCode = 400;
    throw error;
  }

  const st = trainerShare.sharePaymentStatus || "none";
  if (st === "awaiting_transfer" || st === "paid") {
    const error = new Error("Không thể sửa giá sau khi đã gửi hoặc đã xác nhận thanh toán");
    error.statusCode = 400;
    throw error;
  }

  const p = parseSessionPrice(data?.sessionPrice);
  if (p === null || p <= 0) {
    const error = new Error("Nhập giá buổi hợp lệ (VNĐ, lớn hơn 0)");
    error.statusCode = 400;
    throw error;
  }

  trainerShare.sessionPrice = p;
  await trainerShare.save();

  const fromGym = await Gym.findByPk(trainerShare.fromGymId, { attributes: ["ownerId"] });
  const toGymForPrice = await Gym.findByPk(trainerShare.toGymId, { attributes: ["name"] });
  const ptUidPrice = trainerShare.trainerId
    ? await trainerUserIdForShareTrainerId(trainerShare.trainerId)
    : null;
  emitTrainerShareChanged([userId, fromGym?.ownerId, ptUidPrice].filter(Boolean), {
    shareId: trainerShare.id,
    status: trainerShare.status,
    action: "session_price_updated",
    trainerId: trainerShare.trainerId,
    fromGymId: trainerShare.fromGymId,
    toGymId: trainerShare.toGymId,
  });

  if (ptUidPrice) {
    const priceLabel = Number(p).toLocaleString("vi-VN");
    await realtimeService.notifyUser(ptUidPrice, {
      title: "Giá buổi mượn PT đã được cập nhật",
      message: `${toGymForPrice?.name || "Chi nhánh mượn"} đã cập nhật giá buổi ${priceLabel}đ (phiếu #${trainerShare.id}).`,
      notificationType: "trainer_share",
      relatedType: "trainerShare",
      relatedId: trainerShare.id,
    });
  }

  return serializeOwnerShare(trainerShare);
};

const bookingDateOnlyStr = (bd) => {
  if (!bd) return "";
  if (bd instanceof Date) return bd.toISOString().slice(0, 10);
  return String(bd).slice(0, 10);
};

/** Các khung giờ trên phiếu mượn — dùng khớp booking đã hoàn thành */
const getShareSlotsForPaymentCheck = (trainerShare) => {
  if (!trainerShare) return [];
  if (trainerShare.scheduleMode === "specific_days" && trainerShare.specificSchedules) {
    return normalizeSpecificSchedules(trainerShare.specificSchedules).map((s) => ({
      date: String(s.date || "").slice(0, 10),
      startTime: s.startTime,
      endTime: s.endTime,
    }));
  }
  if (trainerShare.startDate && trainerShare.startTime && trainerShare.endTime) {
    return [
      {
        date: bookingDateOnlyStr(trainerShare.startDate),
        startTime: trainerShare.startTime,
        endTime: trainerShare.endTime,
      },
    ];
  }
  return [];
};

/**
 * Tìm phiếu mượn PT khớp buổi đã dạy (cùng PT, chi nhánh mượn, ngày giờ).
 * Dùng khi chưa có trainerShareId trên booking.
 */
const findTrainerShareForCompletedBooking = async (booking) => {
  if (String(booking.sessionType || "").toLowerCase() !== "trainer_share") return null;
  const dateStr = bookingDateOnlyStr(booking.bookingDate);
  const shares = await TrainerShare.findAll({
    where: {
      trainerId: booking.trainerId,
      toGymId: booking.gymId,
      status: "approved",
    },
  });
  for (const sh of shares) {
    const slots = getShareSlotsForPaymentCheck(sh);
    for (const sl of slots) {
      if (
        String(sl.date).slice(0, 10) === dateStr &&
        normalizeTimeValue(sl.startTime) === normalizeTimeValue(booking.startTime) &&
        normalizeTimeValue(sl.endTime) === normalizeTimeValue(booking.endTime)
      ) {
        return sh;
      }
    }
  }
  return null;
};

/** Parse id phiếu từ ghi chú khi PT nhận lịch (audit: "yêu cầu chia sẻ #123") */
const extractTrainerShareIdFromNotes = (notes) => {
  const s = String(notes || "");
  const m =
    s.match(/yêu cầu chia sẻ\s*#(\d+)/i) ||
    s.match(/chia\s+sẻ\s*#(\d+)/i) ||
    s.match(/phiếu mượn\s*PT\s*#(\d+)/i);
  if (!m) return null;
  const id = Number(m[1]);
  return Number.isFinite(id) ? id : null;
};

const verifyShareMatchesBooking = (booking, sh) => {
  if (!sh) return false;
  const row = sh.toJSON ? sh.toJSON() : sh;
  if (Number(row.trainerId) !== Number(booking.trainerId)) return false;
  if (Number(row.toGymId) !== Number(booking.gymId)) return false;
  return normalizeOwnerShareStatus(row.status) === "approved";
};

/**
 * Ưu tiên trainerShareId trên booking → ghi chú → khớp ngày/giờ (legacy).
 * Phiếu TrainerShare không bị xóa khi PT nhận lịch; cần liên kết rõ ràng để thanh toán ổn định.
 */
const resolveTrainerShareForPaymentBooking = async (booking) => {
  if (booking.trainerShareId) {
    const sh = await TrainerShare.findByPk(booking.trainerShareId);
    if (verifyShareMatchesBooking(booking, sh)) return sh;
  }

  const fromNotes = extractTrainerShareIdFromNotes(booking.notes);
  if (fromNotes) {
    const sh = await TrainerShare.findByPk(fromNotes);
    if (verifyShareMatchesBooking(booking, sh)) return sh;
  }

  return findTrainerShareForCompletedBooking(booking);
};

const parsePaymentProofImageUrls = (raw) => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw);
      return Array.isArray(p) ? p.map(String).filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  return [];
};

const buildSharePaymentSnapshotPayload = (j, borrowerGymName) => ({
  shareId: j.id,
  sharePaymentStatus: j.sharePaymentStatus || "none",
  sessionPrice: j.sessionPrice,
  paymentInstructionSentAt: j.paymentInstructionSentAt,
  paymentMarkedPaidAt: j.paymentMarkedPaidAt,
  sharePaymentDisputeNote: j.sharePaymentDisputeNote || null,
  sharePaymentDisputedAt: j.sharePaymentDisputedAt || null,
  borrowerGymName: borrowerGymName || null,
  borrowerDisputeResponseNote: j.borrowerDisputeResponseNote || null,
  borrowerDisputeResponseAt: j.borrowerDisputeResponseAt || null,
  paymentProofImageUrls: parsePaymentProofImageUrls(j.paymentProofImageUrls),
  paymentNote: j.paymentNote || null,
  sharePaymentPtAcknowledgedAt: j.sharePaymentPtAcknowledgedAt || null,
});

/** Một query Gym nhẹ thay vì load lại cả TrainerShare + join */
const buildSharePaymentSnapshotFromResolvedShare = async (share) => {
  const j = share.toJSON ? share.toJSON() : share;
  let borrowerGymName = j.toGym?.name || null;
  if (!borrowerGymName && j.toGymId) {
    const g = await Gym.findByPk(j.toGymId, { attributes: ["name"] });
    borrowerGymName = g?.name || null;
  }
  return buildSharePaymentSnapshotPayload(j, borrowerGymName);
};

/**
 * Gắn sharePayment cho nhiều buổi trong một lần — tránh N× resolve + findByPk (lịch điểm danh PT).
 */
const attachSharePaymentSnapshotsBatchForTrainerBookings = async (plainBookings) => {
  const out = new Map();
  const shareBookings = plainBookings.filter(
    (b) => String(b.sessionType || "").toLowerCase() === "trainer_share",
  );
  if (!shareBookings.length) return out;

  const idsByBooking = new Map();
  for (const b of shareBookings) {
    let sid = b.trainerShareId ? Number(b.trainerShareId) : null;
    if (!Number.isFinite(sid) || sid <= 0) sid = extractTrainerShareIdFromNotes(b.notes);
    if (Number.isFinite(sid) && sid > 0) idsByBooking.set(b.id, sid);
  }

  const uniqueIds = [...new Set(idsByBooking.values())];
  let byShareId = new Map();
  if (uniqueIds.length) {
    const rows = await TrainerShare.findAll({
      where: { id: uniqueIds },
      attributes: [
        "id",
        "trainerId",
        "toGymId",
        "status",
        "sharePaymentStatus",
        "sessionPrice",
        "paymentInstructionSentAt",
        "paymentMarkedPaidAt",
        "sharePaymentDisputeNote",
        "sharePaymentDisputedAt",
        "borrowerDisputeResponseNote",
        "borrowerDisputeResponseAt",
        "paymentProofImageUrls",
        "paymentNote",
        "sharePaymentPtAcknowledgedAt",
      ],
      include: [{ model: Gym, as: "toGym", attributes: ["id", "name"] }],
    });
    for (const r of rows) byShareId.set(r.id, r);
  }

  const needLegacy = [];
  for (const b of shareBookings) {
    const sid = idsByBooking.get(b.id);
    const sh = sid ? byShareId.get(sid) : null;
    if (sh && verifyShareMatchesBooking(b, sh)) {
      const j = sh.toJSON ? sh.toJSON() : sh;
      out.set(b.id, buildSharePaymentSnapshotPayload(j, j.toGym?.name || null));
    } else {
      needLegacy.push(b);
    }
  }

  await Promise.all(
    needLegacy.map(async (b) => {
      if (out.has(b.id)) return;
      const sh = await findTrainerShareForCompletedBooking(b);
      if (!sh) return;
      const snap = await buildSharePaymentSnapshotFromResolvedShare(sh);
      if (snap) out.set(b.id, snap);
    }),
  );

  return out;
};

/**
 * Thông tin thanh toán mượn PT gắn buổi — hiển thị cho PT (lịch điểm danh).
 */
const getSharePaymentSnapshotForTrainerBooking = async (booking) => {
  if (String(booking.sessionType || "").toLowerCase() !== "trainer_share") return null;
  const share = await resolveTrainerShareForPaymentBooking(booking);
  if (!share) return null;
  return buildSharePaymentSnapshotFromResolvedShare(share);
};

/**
 * PT gửi khiếu nại chưa nhận được tiền (sau khi đã gửi STK, chờ CK).
 */
const submitSharePaymentDisputeByBookingId = async (userId, bookingId, body = {}) => {
  const booking = await Booking.findOne({
    where: { id: bookingId },
    attributes: [
      "id",
      "trainerId",
      "gymId",
      "bookingDate",
      "startTime",
      "endTime",
      "sessionType",
      "status",
      "notes",
      "trainerShareId",
    ],
  });

  if (!booking) {
    const error = new Error("Không tìm thấy buổi tập");
    error.statusCode = 404;
    throw error;
  }

  const trainer = await Trainer.findOne({ where: { userId }, attributes: ["id", "userId"] });
  if (!trainer || Number(booking.trainerId) !== Number(trainer.id)) {
    const error = new Error("Bạn không phải huấn luyện viên của buổi này");
    error.statusCode = 403;
    throw error;
  }

  if (String(booking.sessionType || "").toLowerCase() !== "trainer_share") {
    const error = new Error("Buổi này không phải lịch mượn PT");
    error.statusCode = 400;
    throw error;
  }

  if (String(booking.status || "").toLowerCase() !== "completed") {
    const error = new Error("Chỉ khiếu nại sau khi buổi đã hoàn thành");
    error.statusCode = 400;
    throw error;
  }

  const shareRow = await resolveTrainerShareForPaymentBooking(booking);
  if (!shareRow) {
    const error = new Error("Không tìm thấy phiếu mượn PT tương ứng buổi này.");
    error.statusCode = 404;
    throw error;
  }

  const trainerShare = await TrainerShare.findByPk(shareRow.id, {
    include: [
      { model: Gym, as: "fromGym", attributes: ["id", "ownerId", "name"] },
      { model: Gym, as: "toGym", attributes: ["id", "name"] },
      { model: Trainer, include: [{ model: User, attributes: ["username"] }] },
    ],
  });

  const note = String(body.note || body.message || "").trim();
  if (note.length < 8) {
    const error = new Error("Vui lòng nhập nội dung khiếu nại (ít nhất 8 ký tự)");
    error.statusCode = 400;
    throw error;
  }

  const pst = trainerShare.sharePaymentStatus || "none";
  const trainerName = trainerShare.Trainer?.User?.username || "Huấn luyện viên";

  /** Đã xác nhận CK trên app nhưng PT báo thực tế chưa nhận — giữ trạng thái paid, chỉ lưu phản ánh */
  if (pst === "paid") {
    trainerShare.sharePaymentDisputeNote = note;
    trainerShare.sharePaymentDisputedAt = new Date();
    await trainerShare.save();

    emitTrainerShareChanged(
      [userId, trainerShare.requestedBy, trainerShare.fromGym?.ownerId].filter(Boolean),
      {
        shareId: trainerShare.id,
        status: trainerShare.status,
        action: "payment_dispute_after_paid",
        trainerId: trainerShare.trainerId,
        fromGymId: trainerShare.fromGymId,
        toGymId: trainerShare.toGymId,
      },
    );

    if (trainerShare.requestedBy && Number(trainerShare.requestedBy) !== Number(userId)) {
      await realtimeService.notifyUser(trainerShare.requestedBy, {
        title: "PT báo chưa nhận tiền (đã xác nhận CK)",
        message: `${trainerName} báo thực tế chưa nhận được tiền dù đã xác nhận trên hệ thống — phiếu #${trainerShare.id} (${trainerShare.toGym?.name || ""}).`,
        notificationType: "trainer_share",
        relatedType: "trainerShare",
        relatedId: trainerShare.id,
      });
    }

    return serializeOwnerShare(trainerShare);
  }

  if (pst !== "awaiting_transfer" && pst !== "disputed") {
    const error = new Error("Chỉ khiếu nại khi đã gửi thông tin nhận tiền và đang chờ chuyển khoản");
    error.statusCode = 400;
    throw error;
  }

  trainerShare.sharePaymentDisputeNote = note;
  trainerShare.sharePaymentDisputedAt = new Date();
  trainerShare.sharePaymentStatus = "disputed";
  await trainerShare.save();

  emitTrainerShareChanged(
    [userId, trainerShare.requestedBy, trainerShare.fromGym?.ownerId].filter(Boolean),
    {
      shareId: trainerShare.id,
      status: trainerShare.status,
      action: "payment_dispute",
      trainerId: trainerShare.trainerId,
      fromGymId: trainerShare.fromGymId,
      toGymId: trainerShare.toGymId,
    },
  );

  if (trainerShare.requestedBy && Number(trainerShare.requestedBy) !== Number(userId)) {
    await realtimeService.notifyUser(trainerShare.requestedBy, {
      title: "Khiếu nại thanh toán mượn PT",
      message: `${trainerName} báo chưa nhận được tiền buổi mượn PT (#${trainerShare.id}) — ${trainerShare.toGym?.name || ""}.`,
      notificationType: "trainer_share",
      relatedType: "trainerShare",
      relatedId: trainerShare.id,
    });
  }

  return serializeOwnerShare(trainerShare);
};

/**
 * PT (người dạy) gửi NH + STK sau khi buổi mượn đã hoàn thành — owner chi nhánh mượn nhận thông báo và thanh toán.
 */
const sendSharePaymentInstructionByBookingId = async (userId, bookingId, body = {}) => {
  const booking = await Booking.findOne({
    where: { id: bookingId },
    attributes: [
      "id",
      "trainerId",
      "gymId",
      "bookingDate",
      "startTime",
      "endTime",
      "sessionType",
      "status",
      "notes",
      "trainerShareId",
    ],
  });

  if (!booking) {
    const error = new Error("Không tìm thấy buổi tập");
    error.statusCode = 404;
    throw error;
  }

  const trainer = await Trainer.findOne({ where: { userId }, attributes: ["id", "userId"] });
  if (!trainer || Number(booking.trainerId) !== Number(trainer.id)) {
    const error = new Error("Bạn không phải huấn luyện viên của buổi này");
    error.statusCode = 403;
    throw error;
  }

  if (String(booking.status || "").toLowerCase() !== "completed") {
    const error = new Error(
      "Chỉ gửi thông tin nhận tiền sau khi đã hoàn thành buổi dạy (điểm danh xong).",
    );
    error.statusCode = 400;
    throw error;
  }

  if (String(booking.sessionType || "").toLowerCase() !== "trainer_share") {
    const error = new Error("Buổi này không phải lịch mượn PT.");
    error.statusCode = 400;
    throw error;
  }

  const shareRow = await resolveTrainerShareForPaymentBooking(booking);
  if (!shareRow) {
    const error = new Error("Không tìm thấy phiếu mượn PT tương ứng buổi này.");
    error.statusCode = 404;
    throw error;
  }

  const trainerShare = await TrainerShare.findByPk(shareRow.id, {
    include: [
      { model: Gym, as: "fromGym", attributes: ["id", "ownerId", "name"] },
      { model: Gym, as: "toGym", attributes: ["id", "name"] },
      { model: Trainer, include: [{ model: User, attributes: ["username"] }] },
    ],
  });

  if (trainerShare.status !== "approved") {
    const error = new Error("Phiếu mượn chưa được chấp nhận");
    error.statusCode = 400;
    throw error;
  }

  const price = Number(trainerShare.sessionPrice);
  if (!Number.isFinite(price) || price <= 0) {
    const error = new Error(
      "Chủ phòng mượn chưa nhập giá buổi — không thể gửi thông tin chuyển khoản.",
    );
    error.statusCode = 400;
    throw error;
  }

  const pst = trainerShare.sharePaymentStatus || "none";
  if (pst === "paid") {
    const error = new Error("Buổi đã được xác nhận thanh toán");
    error.statusCode = 400;
    throw error;
  }

  const bankName = String(body.bankName || "").trim();
  const bankAccountNumber = String(body.bankAccountNumber || "").trim();
  const accountHolderName = String(body.accountHolderName || "").trim();

  if (!bankName || !bankAccountNumber) {
    const error = new Error("Vui lòng nhập tên ngân hàng và số tài khoản");
    error.statusCode = 400;
    throw error;
  }

  trainerShare.lenderBankName = bankName;
  trainerShare.lenderBankAccountNumber = bankAccountNumber;
  trainerShare.lenderAccountHolderName = accountHolderName || null;
  trainerShare.paymentInstructionSentAt = new Date();
  if (pst !== "disputed") {
    trainerShare.sharePaymentStatus = "awaiting_transfer";
  }
  await trainerShare.save();

  const trainerName = trainerShare.Trainer?.User?.username || "Huấn luyện viên";

  emitTrainerShareChanged(
    [userId, trainerShare.requestedBy, trainerShare.fromGym?.ownerId].filter(Boolean),
    {
      shareId: trainerShare.id,
      status: trainerShare.status,
      action: "payment_instruction_sent",
      trainerId: trainerShare.trainerId,
      fromGymId: trainerShare.fromGymId,
      toGymId: trainerShare.toGymId,
    },
  );

  if (trainerShare.requestedBy && Number(trainerShare.requestedBy) !== Number(userId)) {
    await realtimeService.notifyUser(trainerShare.requestedBy, {
      title: "Thông tin chuyển khoản mượn PT",
      message: `${trainerName} đã gửi tài khoản nhận tiền buổi mượn PT (#${trainerShare.id}) — ${trainerShare.toGym?.name || "chi nhánh mượn"}.`,
      notificationType: "trainer_share",
      relatedType: "trainerShare",
      relatedId: trainerShare.id,
    });
  }

  return serializeOwnerShare(trainerShare);
};

/**
 * Owner chi nhánh mượn xác nhận đã chuyển tiền (tuỳ chọn kèm URL ảnh chứng từ CK).
 */
const confirmBorrowerSharePayment = async (userId, shareId, body = {}) => {
  const trainerShare = await TrainerShare.findByPk(shareId, {
    include: [
      { model: Gym, as: "fromGym", attributes: ["id", "ownerId", "name"] },
      { model: Gym, as: "toGym", attributes: ["id", "name"] },
    ],
  });

  if (!trainerShare) {
    const error = new Error("Không tìm thấy phiếu");
    error.statusCode = 404;
    throw error;
  }

  if (Number(trainerShare.requestedBy) !== Number(userId)) {
    const error = new Error("Chỉ owner chi nhánh mượn mới xác nhận đã chuyển tiền");
    error.statusCode = 403;
    throw error;
  }

  const paySt = trainerShare.sharePaymentStatus || "none";
  if (paySt !== "awaiting_transfer" && paySt !== "disputed") {
    const error = new Error("Chưa có yêu cầu thanh toán đang chờ");
    error.statusCode = 400;
    throw error;
  }

  const imageUrls = Array.isArray(body.imageUrls)
    ? body.imageUrls.map((u) => String(u).trim()).filter(Boolean)
    : [];
  const uniqueUrls = [...new Set(imageUrls)].slice(0, 8);
  for (const u of uniqueUrls) {
    if (!/^https?:\/\//i.test(u)) {
      const error = new Error("URL ảnh chứng từ không hợp lệ");
      error.statusCode = 400;
      throw error;
    }
  }
  if (uniqueUrls.length) {
    trainerShare.paymentProofImageUrls = uniqueUrls;
  }

  const note = body.note ? String(body.note).trim() : null;
  if (note) {
    trainerShare.paymentNote = note;
  }

  trainerShare.sharePaymentStatus = "paid";
  trainerShare.paymentMarkedPaidAt = new Date();
  await trainerShare.save();

  const trainerRow = await Trainer.findByPk(trainerShare.trainerId, { attributes: ["userId"] });
  const trainerUserId = trainerRow?.userId;

  emitTrainerShareChanged(
    [userId, trainerShare.fromGym?.ownerId, trainerUserId].filter(Boolean),
    {
      shareId: trainerShare.id,
      status: trainerShare.status,
      action: "payment_confirmed",
      trainerId: trainerShare.trainerId,
      fromGymId: trainerShare.fromGymId,
      toGymId: trainerShare.toGymId,
    },
  );

  const lenderOwnerId = trainerShare.fromGym?.ownerId;
  if (lenderOwnerId && Number(lenderOwnerId) !== Number(userId)) {
    await realtimeService.notifyUser(lenderOwnerId, {
      title: "Đối tác đã xác nhận chuyển khoản mượn PT",
      message: `${trainerShare.toGym?.name || "Đối tác"} đã xác nhận đã chuyển tiền buổi mượn PT (#${trainerShare.id}).`,
      notificationType: "trainer_share",
      relatedType: "trainerShare",
      relatedId: trainerShare.id,
    });
  }

  if (trainerUserId) {
    await realtimeService.notifyUser(trainerUserId, {
      title: "Đã xác nhận thanh toán mượn PT",
      message: `${trainerShare.toGym?.name || "Chi nhánh mượn"} đã xác nhận đã chuyển khoản (phiếu #${trainerShare.id}).`,
      notificationType: "trainer_share",
      relatedType: "trainerShare",
      relatedId: trainerShare.id,
    });
  }

  return serializeOwnerShare(trainerShare);
};

/**
 * Owner chi nhánh mượn phản hồi khiếu nại + ảnh chứng từ CK (PT xem trên lịch điểm danh).
 */
const respondBorrowerSharePaymentDispute = async (userId, shareId, body = {}) => {
  const trainerShare = await TrainerShare.findByPk(shareId, {
    include: [
      { model: Gym, as: "fromGym", attributes: ["id", "ownerId", "name"] },
      { model: Gym, as: "toGym", attributes: ["id", "name"] },
      { model: Trainer, include: [{ model: User, attributes: ["username"] }] },
    ],
  });

  if (!trainerShare) {
    const error = new Error("Không tìm thấy phiếu");
    error.statusCode = 404;
    throw error;
  }

  if (Number(trainerShare.requestedBy) !== Number(userId)) {
    const error = new Error("Chỉ owner chi nhánh mượn mới gửi phản hồi");
    error.statusCode = 403;
    throw error;
  }

  const hasPtComplaint =
    String(trainerShare.sharePaymentDisputeNote || "").trim().length > 0 ||
    (trainerShare.sharePaymentStatus || "") === "disputed";

  if (!hasPtComplaint) {
    const error = new Error("Chưa có khiếu nại từ PT để phản hồi");
    error.statusCode = 400;
    throw error;
  }

  const note = String(body.note || "").trim();
  const imageUrls = Array.isArray(body.imageUrls)
    ? body.imageUrls.map((u) => String(u).trim()).filter(Boolean)
    : [];
  const unique = [...new Set(imageUrls)].slice(0, 8);
  for (const u of unique) {
    if (!/^https?:\/\//i.test(u)) {
      const error = new Error("URL ảnh không hợp lệ");
      error.statusCode = 400;
      throw error;
    }
  }

  if (!note && unique.length === 0) {
    const error = new Error("Nhập nội dung phản hồi hoặc tải ít nhất một ảnh chứng từ");
    error.statusCode = 400;
    throw error;
  }

  if (note.length > 0 && note.length < 3) {
    const error = new Error("Nội dung phản hồi quá ngắn");
    error.statusCode = 400;
    throw error;
  }

  trainerShare.borrowerDisputeResponseNote = note || null;
  trainerShare.borrowerDisputeResponseAt = new Date();
  trainerShare.paymentProofImageUrls = unique.length ? unique : null;
  await trainerShare.save();

  const trainerRow = await Trainer.findByPk(trainerShare.trainerId, { attributes: ["userId"] });
  const trainerUserId = trainerRow?.userId;

  emitTrainerShareChanged(
    [userId, trainerShare.fromGym?.ownerId, trainerUserId].filter(Boolean),
    {
      shareId: trainerShare.id,
      status: trainerShare.status,
      action: "borrower_payment_dispute_response",
      trainerId: trainerShare.trainerId,
      fromGymId: trainerShare.fromGymId,
      toGymId: trainerShare.toGymId,
    },
  );

  if (trainerUserId) {
    await realtimeService.notifyUser(trainerUserId, {
      title: "Phản hồi thanh toán mượn PT",
      message: `${trainerShare.toGym?.name || "Chi nhánh mượn"} đã gửi phản hồi / ảnh chứng từ — phiếu #${trainerShare.id}.`,
      notificationType: "trainer_share",
      relatedType: "trainerShare",
      relatedId: trainerShare.id,
    });
  }

  return serializeOwnerShare(trainerShare);
};

/**
 * PT xác nhận đã nhận tiền / đồng ý phản hồi chủ phòng (sau khi chủ phòng đã gửi phản hồi hoặc ảnh CK).
 */
const acknowledgeBorrowerSharePaymentResponseByBookingId = async (userId, bookingId) => {
  const booking = await Booking.findOne({
    where: { id: bookingId },
    attributes: [
      "id",
      "trainerId",
      "gymId",
      "bookingDate",
      "startTime",
      "endTime",
      "sessionType",
      "status",
      "notes",
      "trainerShareId",
    ],
  });

  if (!booking) {
    const error = new Error("Không tìm thấy buổi tập");
    error.statusCode = 404;
    throw error;
  }

  const trainer = await Trainer.findOne({ where: { userId }, attributes: ["id", "userId"] });
  if (!trainer || Number(booking.trainerId) !== Number(trainer.id)) {
    const error = new Error("Bạn không phải huấn luyện viên của buổi này");
    error.statusCode = 403;
    throw error;
  }

  if (String(booking.sessionType || "").toLowerCase() !== "trainer_share") {
    const error = new Error("Buổi này không phải lịch mượn PT");
    error.statusCode = 400;
    throw error;
  }

  if (String(booking.status || "").toLowerCase() !== "completed") {
    const error = new Error("Chỉ xác nhận sau khi buổi đã hoàn thành");
    error.statusCode = 400;
    throw error;
  }

  const shareRow = await resolveTrainerShareForPaymentBooking(booking);
  if (!shareRow) {
    const error = new Error("Không tìm thấy phiếu mượn PT tương ứng buổi này.");
    error.statusCode = 404;
    throw error;
  }

  const trainerShare = await TrainerShare.findByPk(shareRow.id, {
    include: [
      { model: Gym, as: "fromGym", attributes: ["id", "ownerId", "name"] },
      { model: Gym, as: "toGym", attributes: ["id", "name"] },
      { model: Trainer, include: [{ model: User, attributes: ["username"] }] },
    ],
  });

  const pst = trainerShare.sharePaymentStatus || "none";
  if (pst !== "paid") {
    const error = new Error("Chỉ xác nhận khi chủ phòng đã xác nhận chuyển khoản trên hệ thống");
    error.statusCode = 400;
    throw error;
  }

  if (trainerShare.sharePaymentPtAcknowledgedAt) {
    const error = new Error("Bạn đã xác nhận trước đó");
    error.statusCode = 400;
    throw error;
  }

  // PT có thể xác nhận đã nhận tiền ngay cả khi chưa khiếu nại hoặc owner chưa phản hồi
  trainerShare.sharePaymentPtAcknowledgedAt = new Date();
  await trainerShare.save();

  const trainerName = trainerShare.Trainer?.User?.username || "Huấn luyện viên";

  emitTrainerShareChanged(
    [userId, trainerShare.requestedBy, trainerShare.fromGym?.ownerId].filter(Boolean),
    {
      shareId: trainerShare.id,
      status: trainerShare.status,
      action: "pt_acknowledged_payment_response",
      trainerId: trainerShare.trainerId,
      fromGymId: trainerShare.fromGymId,
      toGymId: trainerShare.toGymId,
    },
  );

  if (trainerShare.requestedBy && Number(trainerShare.requestedBy) !== Number(userId)) {
    await realtimeService.notifyUser(trainerShare.requestedBy, {
      title: "PT đã xác nhận nhận tiền mượn PT",
      message: `${trainerName} đã xác nhận đã nhận / đồng ý phản hồi thanh toán — phiếu #${trainerShare.id} (${trainerShare.toGym?.name || ""}).`,
      notificationType: "trainer_share",
      relatedType: "trainerShare",
      relatedId: trainerShare.id,
    });
  }

  return serializeOwnerShare(trainerShare);
};

export default {
  createTrainerShare,
  getMyTrainerShares,
  getMyTrainerShareDetail,
  updateMyTrainerShare,
  deleteMyTrainerShare,
  getAvailableTrainers,
  getReceivedTrainerShareRequests,
  acceptTrainerShareRequest,
  rejectTrainerShareRequest,
  listAvailableTrainerShareRequestsForTrainer,
  claimTrainerShareRequest,
  updateBorrowerSessionPrice,
  getSharePaymentSnapshotForTrainerBooking,
  attachSharePaymentSnapshotsBatchForTrainerBookings,
  sendSharePaymentInstructionByBookingId,
  submitSharePaymentDisputeByBookingId,
  confirmBorrowerSharePayment,
  respondBorrowerSharePaymentDispute,
  acknowledgeBorrowerSharePaymentResponseByBookingId,
};
