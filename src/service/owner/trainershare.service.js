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

const emitTrainerShareChanged = (userIds = [], payload = {}) => {
  [...new Set((userIds || []).filter(Boolean).map(Number))].forEach((targetUserId) => {
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

  const eligibleBorrowUserIds = !hasTrainerId
    ? [...new Set(eligibleBorrowTrainers.map((t) => t.userId).filter(Boolean))]
    : [];

  emitTrainerShareChanged(
    [...new Set([userId, fromGym.ownerId, namedTrainerUserId, ...eligibleBorrowUserIds])].filter(
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
    await realtimeService.notifyUser(namedTrainerUserId, {
      title: "Bạn được chỉ định trong yêu cầu mượn PT",
      message: `${toGym.name} xin mượn bạn (${trainerName}). Vào mục Gửi yêu cầu → Khung giờ mượn PT để nhận lịch.`,
      notificationType: "trainer_share",
      relatedType: "trainerShare",
      relatedId: trainerShare.id,
    });
  }

  if (!hasTrainerId && eligibleBorrowUserIds.length && borrowTrim) {
    const st = normalizeTimeValue(startTime);
    const et = normalizeTimeValue(endTime);
    for (const ptUid of eligibleBorrowUserIds) {
      if (Number(ptUid) === Number(userId)) continue;
      await realtimeService.notifyUser(ptUid, {
        title: "Có khung giờ mượn PT phù hợp chuyên môn của bạn",
        message: `${toGym.name} xin mượn PT (${borrowTrim}) vào ${startDate} ${st}–${et}. Vào Khung giờ mượn PT để nhận lịch.`,
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
    trainerShares: rows.map(serializeOwnerShare),
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
  const allowedFields = ["shareType", "startDate", "endDate", "startTime", "endTime", "commissionSplit", "notes", "memberId"];

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      trainerShare[field] = data[field];
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
  emitTrainerShareChanged([userId, fromGym?.ownerId], {
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
  emitTrainerShareChanged([userId, fromGym?.ownerId], {
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

  emitTrainerShareChanged([userId, request.requestedBy], {
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

  return serializeOwnerShare(request);
};

/**
 * Owner phía gym nguồn từ chối yêu cầu chia sẻ trainer
 */
const rejectTrainerShareRequest = async (userId, requestId, reason) => {
  const request = await TrainerShare.findByPk(requestId, {
    include: [
      { model: Gym, as: 'fromGym' },
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

  emitTrainerShareChanged([userId, request.requestedBy], {
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
    attributes: ["id", "gymId", "availableHours", "specialization"],
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
            notes: request.notes || "Tự động tạo từ yêu cầu mượn huấn luyện viên",
            status: "confirmed",
            createdBy: request.requestedBy || null,
          },
          { transaction }
        );
      }
    }

    emitTrainerShareChanged([request.requestedBy, request.fromGym?.ownerId], {
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
};
