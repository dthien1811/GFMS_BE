import db from "../../models/index";

const { TrainerShare, Trainer, Gym, User, Policy } = db;

/**
 * Owner tạo yêu cầu chia sẻ trainer
 */
const createTrainerShare = async (userId, data) => {
  const { 
    trainerId, 
    fromGymId, 
    toGymId,
    memberId, // Thêm memberId để tự động tạo booking khi approve
    shareType, 
    scheduleMode,
    startDate, 
    endDate, 
    startTime, 
    endTime, 
    multipleDates,
    commissionSplit, 
    notes 
  } = data;

  // Validate required fields
  if (!trainerId || !fromGymId || !toGymId) {
    const error = new Error("Thiếu thông tin bắt buộc (trainerId, fromGymId, toGymId)");
    error.statusCode = 400;
    throw error;
  }

  // Kiểm tra trainer tồn tại
  const trainer = await Trainer.findByPk(trainerId);
  if (!trainer) {
    const error = new Error("Trainer không tồn tại");
    error.statusCode = 404;
    throw error;
  }

  // Kiểm tra gym tồn tại
  const fromGym = await Gym.findByPk(fromGymId);
  const toGym = await Gym.findByPk(toGymId);
  if (!fromGym || !toGym) {
    const error = new Error("Gym không tồn tại");
    error.statusCode = 404;
    throw error;
  }

  // Validate time conflict based on schedule mode
  const { Booking } = db;
  
  // Helper function to check conflict with existing approved trainer shares
  const checkTrainerShareConflict = async (date, timeStart, timeEnd) => {
    const existingShares = await TrainerShare.findAll({
      where: {
        trainerId,
        status: 'approved',
        startDate: { [db.Sequelize.Op.lte]: date },
        [db.Sequelize.Op.or]: [
          { endDate: { [db.Sequelize.Op.gte]: date } },
          { endDate: null }
        ]
      },
      attributes: ['id', 'startTime', 'endTime', 'scheduleMode', 'specificSchedules'],
      raw: true
    });

    for (const share of existingShares) {
      if (share.scheduleMode === 'specific_days' && share.specificSchedules) {
        const schedules = typeof share.specificSchedules === 'string' 
          ? JSON.parse(share.specificSchedules) 
          : share.specificSchedules;
        const scheduleForDate = schedules.find(s => s.date === date);
        if (scheduleForDate) {
          if (timeStart < scheduleForDate.endTime && timeEnd > scheduleForDate.startTime) {
            return true;
          }
        }
      } else if (share.scheduleMode === 'all_days' && share.startTime && share.endTime) {
        if (timeStart < share.endTime && timeEnd > share.startTime) {
          return true;
        }
      }
    }
    return false;
  };
  
  if (scheduleMode === "single" && startDate && startTime && endTime) {
    // Check conflict for single date - CHỈ check trainer share conflict, KHÔNG check booking
    // Vì mục đích của share là chia sẻ PT (kể cả khi đang bận)
    
    // Check trainer share conflict
    const hasShareConflict = await checkTrainerShareConflict(startDate, startTime, endTime);
    if (hasShareConflict) {
      const error = new Error("Trainer đã được chia sẻ trong khoảng thời gian này");
      error.statusCode = 409;
      throw error;
    }
  } else if (scheduleMode === "date_range" && startDate && endDate && startTime && endTime) {
    // Check conflict for date range - check each day
    const currentDate = new Date(startDate);
    const endDateObj = new Date(endDate);
    
    while (currentDate <= endDateObj) {
      const dateStr = currentDate.toISOString().split('T')[0];
      
      const existingBookings = await Booking.findAll({
        where: {
          trainerId,
          bookingDate: dateStr,
          status: { [db.Sequelize.Op.notIn]: ['cancelled', 'no_show'] }
        },
        attributes: ['id', 'startTime', 'endTime'],
        raw: true
      });

      const hasBookingConflict = existingBookings.some(b => 
        startTime < b.endTime && endTime > b.startTime
      );

      if (hasBookingConflict) {
        const error = new Error(`Trainer đã có lịch booking vào ngày ${dateStr}`);
        error.statusCode = 409;
        throw error;
      }

      const hasShareConflict = await checkTrainerShareConflict(dateStr, startTime, endTime);
      if (hasShareConflict) {
        const error = new Error(`Trainer đã được chia sẻ vào ngày ${dateStr}`);
        error.statusCode = 409;
        throw error;
      }
      
      currentDate.setDate(currentDate.getDate() + 1);
    }
  } else if (scheduleMode === "multiple_dates" && multipleDates && multipleDates.length > 0) {
    // Check conflict for each specific date
    for (const dateItem of multipleDates) {
      if (!dateItem.date || !dateItem.startTime || !dateItem.endTime) continue;
      
      // CHỈ check trainer share conflict, KHÔNG check booking
      const hasShareConflict = await checkTrainerShareConflict(
        dateItem.date, 
        dateItem.startTime, 
        dateItem.endTime
      );
      if (hasShareConflict) {
        const error = new Error(`Trainer đã được chia sẻ vào ngày ${dateItem.date}`);
        error.statusCode = 409;
        throw error;
      }
    }
  }

  // Prepare data for database
  // Convert new scheduleMode to old format for backward compatibility
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

  // Tạo trainer share request
  const trainerShare = await TrainerShare.create({
    trainerId,
    fromGymId,
    toGymId,
    memberId: memberId || null, // Lưu memberId (optional)
    shareType: shareType || "temporary",
    startDate,
    endDate: scheduleMode === "single" ? startDate : endDate,
    startTime,
    endTime,
    scheduleMode: dbScheduleMode,
    specificSchedules: specificSchedules,
    weekdaySchedules: null,
    commissionSplit: commissionSplit || 0.7,
    status: "waiting_acceptance", // Chờ Owner A chấp nhận
    requestedBy: userId,
    notes,
  });

  return trainerShare;
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
    whereClause.status = status;
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
    trainerShares: rows,
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
      requestedBy: userId,
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
      },
    ],
  });

  if (!trainerShare) {
    const error = new Error("Không tìm thấy trainer share hoặc bạn không có quyền xem");
    error.statusCode = 404;
    throw error;
  }

  return trainerShare;
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

  // Chỉ cho phép update khi status là waiting_acceptance
  if (trainerShare.status !== "waiting_acceptance") {
    const error = new Error(`Không thể cập nhật trainer share với status '${trainerShare.status}'`);
    error.statusCode = 400;
    throw error;
  }

  // Validate time conflict nếu có thay đổi startDate hoặc startTime/endTime
  const newStartDate = data.startDate || trainerShare.startDate;
  const newStartTime = data.startTime !== undefined ? data.startTime : trainerShare.startTime;
  const newEndTime = data.endTime !== undefined ? data.endTime : trainerShare.endTime;

  if (newStartDate && newStartTime && newEndTime) {
    const { Booking } = db;
    
    // Lấy tất cả bookings của trainer trong ngày
    const existingBookings = await Booking.findAll({
      where: {
        trainerId: trainerShare.trainerId,
        bookingDate: newStartDate,
        status: {
          [db.Sequelize.Op.notIn]: ['cancelled', 'no_show']
        }
      },
      attributes: ['id', 'startTime', 'endTime', 'bookingDate'],
      raw: true
    });

    // Check overlap bằng JavaScript
    const hasConflict = existingBookings.some(b => {
      // (start1 < end2) AND (end1 > start2)
      return newStartTime < b.endTime && newEndTime > b.startTime;
    });

    if (hasConflict) {
      const error = new Error("Trainer đã có lịch trong khoảng thời gian này");
      error.statusCode = 409;
      throw error;
    }
  }

  // Update các trường được phép
  const allowedFields = ["shareType", "startDate", "endDate", "startTime", "endTime", "commissionSplit", "notes"];

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      trainerShare[field] = data[field];
    }
  }

  await trainerShare.save();

  return trainerShare;
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

  // Chỉ cho phép xóa khi status là waiting_acceptance
  if (trainerShare.status !== "waiting_acceptance") {
    const error = new Error(`Không thể xóa trainer share với status '${trainerShare.status}'`);
    error.statusCode = 400;
    throw error;
  }

  await trainerShare.destroy();

  return { message: "Đã xóa trainer share request thành công" };
};

/**
 * Owner lấy danh sách trainers có sẵn cho gym
 * Trả về trainers thuộc gym này (để share đi)
 */
const getAvailableTrainers = async (userId, gymId) => {
  // Lấy trainers thuộc gym này
  const trainers = await Trainer.findAll({
    where: {
      gymId: gymId,
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
    attributes: ["id", "specialization", "certification", "gymId"],
  });

  return { trainers };
};

/**
 * Owner B xem các yêu cầu chia sẻ trainer nhận được
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
    whereClause.status = status;
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
    data: rows,
    pagination: {
      total: count,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(count / limit)
    }
  };
};

/**
 * Owner B chấp nhận yêu cầu chia sẻ trainer
 */
const acceptTrainerShareRequest = async (userId, requestId) => {
  const request = await TrainerShare.findByPk(requestId, {
    include: [
      { model: Gym, as: 'fromGym' }
    ]
  });

  if (!request) {
    const error = new Error("Yêu cầu không tồn tại");
    error.statusCode = 404;
    throw error;
  }

  // Kiểm tra fromGym có thuộc userId không (người cho mượn mới có quyền chấp nhận)
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

  return request;
};

/**
 * Owner B từ chối yêu cầu chia sẻ trainer
 */
const rejectTrainerShareRequest = async (userId, requestId, reason) => {
  const request = await TrainerShare.findByPk(requestId, {
    include: [
      { model: Gym, as: 'fromGym' }
    ]
  });

  if (!request) {
    const error = new Error("Yêu cầu không tồn tại");
    error.statusCode = 404;
    throw error;
  }

  // Kiểm tra fromGym có thuộc userId không (người cho mượn mới có quyền từ chối)
  if (request.fromGym.ownerId !== userId) {
    const error = new Error("Bạn không có quyền từ chối yêu cầu này");
    error.statusCode = 403;
    throw error;
  }

  // Chỉ cho phép từ chối nếu status = waiting_acceptance
  if (request.status !== 'waiting_acceptance') {
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

  return request;
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
};
