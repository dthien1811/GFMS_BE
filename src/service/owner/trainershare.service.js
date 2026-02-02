import db from "../../models/index";

const { TrainerShare, Trainer, Gym, User, Policy } = db;

/**
 * Owner tạo yêu cầu chia sẻ trainer
 */
const createTrainerShare = async (userId, data) => {
  const { trainerId, fromGymId, toGymId, shareType, startDate, endDate, startTime, endTime, commissionSplit, notes } = data;

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

  // Validate time conflict nếu có startDate và startTime/endTime
  if (startDate && startTime && endTime) {
    const { Booking } = db;
    
    // Lấy tất cả bookings của trainer trong ngày
    const existingBookings = await Booking.findAll({
      where: {
        trainerId,
        bookingDate: startDate,
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
      return startTime < b.endTime && endTime > b.startTime;
    });

    if (hasConflict) {
      const error = new Error("Trainer đã có lịch trong khoảng thời gian này");
      error.statusCode = 409;
      throw error;
    }
  }

  // Tạo trainer share request
  const trainerShare = await TrainerShare.create({
    trainerId,
    fromGymId,
    toGymId,
    shareType: shareType || "temporary",
    startDate,
    endDate,
    startTime,
    endTime,
    commissionSplit: commissionSplit || 0.7,
    status: "pending",
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

  const whereClause = { requestedBy: userId };
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
 * Owner cập nhật trainer share (chỉ khi pending)
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

  // Chỉ cho phép update khi status là pending
  if (trainerShare.status !== "pending") {
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
 * Owner xóa trainer share (chỉ khi pending)
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

  // Chỉ cho phép xóa khi status là pending
  if (trainerShare.status !== "pending") {
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

export default {
  createTrainerShare,
  getMyTrainerShares,
  getMyTrainerShareDetail,
  updateMyTrainerShare,
  deleteMyTrainerShare,
  getAvailableTrainers,
};
