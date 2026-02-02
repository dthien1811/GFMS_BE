import db from "../../models/index";

const { Booking, Member, Trainer, Gym, Package, User } = db;

/**
 * Owner xem danh sách bookings của gyms mình quản lý
 */
const getMyBookings = async (userId, query = {}) => {
  try {
    const { page = 1, limit = 10, status, q, gymId, fromDate, toDate } = query;
    const offset = (page - 1) * limit;

    // Lấy danh sách gym của owner
    const myGyms = await Gym.findAll({
      where: { ownerId: userId },
      attributes: ["id"],
    });
    const myGymIds = myGyms.map((g) => g.id);
    
    console.log("Owner ID:", userId);
    console.log("My Gym IDs:", myGymIds);

    if (myGymIds.length === 0) {
      return {
        bookings: [],
        pagination: { total: 0, page: parseInt(page), limit: parseInt(limit), totalPages: 0 },
      };
    }

    const whereClause = { gymId: { [db.Sequelize.Op.in]: myGymIds } };
    
    if (status) {
      whereClause.status = status;
    }
    
    if (gymId) {
      whereClause.gymId = gymId;
    }

    if (fromDate) {
      whereClause.bookingDate = { [db.Sequelize.Op.gte]: fromDate };
    }
    
    if (toDate) {
      whereClause.bookingDate = whereClause.bookingDate
        ? { ...whereClause.bookingDate, [db.Sequelize.Op.lte]: toDate }
        : { [db.Sequelize.Op.lte]: toDate };
    }

    // Search by trainer name or member name
    let includeMember = {
      model: Member,
      attributes: ["id", "membershipNumber"],
      include: [
        {
          model: User,
          attributes: ["id", "username", "email", "phone"],
        },
      ],
      required: false,
    };

    let includeTrainer = {
      model: Trainer,
      attributes: ["id", "specialization", "experienceYears", "rating"],
      include: [
        {
          model: User,
          attributes: ["id", "username", "email", "phone"],
        },
      ],
      required: false,
    };

    console.log("Where clause:", JSON.stringify(whereClause));

    const { rows, count } = await Booking.findAndCountAll({
      where: whereClause,
      include: [
        includeMember,
        includeTrainer,
        {
          model: Gym,
          attributes: ["id", "name", "address"],
          required: false,
        },
        {
          model: Package,
          attributes: ["id", "name"],
          required: false,
        },
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [
        ["bookingDate", "DESC"],
        ["id", "DESC"]
      ],
      distinct: true,
    });

    console.log("Found bookings:", rows.length);
    console.log("Sample booking data:", JSON.stringify(rows[0], null, 2));

    return {
      bookings: rows,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit),
      },
    };
  } catch (error) {
    console.error("Error in getMyBookings:", error.message);
    console.error("Stack:", error.stack);
    throw error;
  }
};

/**
 * Owner xem chi tiết booking
 */
const getBookingDetail = async (userId, bookingId) => {
  // Lấy danh sách gym của owner
  const myGyms = await Gym.findAll({
    where: { ownerId: userId },
    attributes: ["id"],
  });
  const myGymIds = myGyms.map((g) => g.id);

  const booking = await Booking.findOne({
    where: {
      id: bookingId,
      gymId: { [db.Sequelize.Op.in]: myGymIds },
    },
    include: [
      {
        model: Member,
        include: [{ model: User, attributes: ["id", "username", "email", "phone"] }],
      },
      {
        model: Trainer,
        attributes: ["id", "specialization", "certification"],
        include: [{ model: User, attributes: ["id", "username", "email", "phone"] }],
      },
      {
        model: Gym,
        attributes: ["id", "name", "address"],
      },
      {
        model: Package,
        attributes: ["id", "name", "price"],
      },
    ],
  });

  if (!booking) {
    const error = new Error("Không tìm thấy booking hoặc bạn không có quyền xem");
    error.statusCode = 404;
    throw error;
  }

  return booking;
};

/**
 * Owner tạo booking mới
 */
const createBooking = async (userId, data) => {
  const { memberId, trainerId, gymId, packageId, bookingDate, startTime, endTime, notes } = data;

  // Kiểm tra gym có thuộc owner không
  const gym = await Gym.findOne({
    where: { id: gymId, ownerId: userId },
  });

  if (!gym) {
    const error = new Error("Gym không tồn tại hoặc bạn không có quyền");
    error.statusCode = 403;
    throw error;
  }

  // Kiểm tra member tồn tại
  const member = await Member.findByPk(memberId);
  if (!member) {
    const error = new Error("Member không tồn tại");
    error.statusCode = 404;
    throw error;
  }

  // Kiểm tra trainer tồn tại
  const trainer = await Trainer.findByPk(trainerId);
  if (!trainer) {
    const error = new Error("Trainer không tồn tại");
    error.statusCode = 404;
    throw error;
  }

  // Kiểm tra conflict lịch của trainer
  const existingBookings = await Booking.findAll({
    where: {
      trainerId,
      bookingDate,
      status: { [db.Sequelize.Op.notIn]: ['cancelled', 'no_show'] },
    },
    attributes: ['id', 'startTime', 'endTime'],
  });

  // Check overlap: booking mới overlap với booking cũ khi:
  // startTime_mới < endTime_cũ AND endTime_mới > startTime_cũ
  const hasConflict = existingBookings.some(booking => {
    const existingStart = booking.startTime; // "HH:MM:SS"
    const existingEnd = booking.endTime;
    
    // Overlap khi: (start1 < end2) AND (end1 > start2)
    const isOverlap = (startTime < existingEnd) && (endTime > existingStart);
    
    if (isOverlap) {
      console.log('Conflict detected:', {
        new: { startTime, endTime },
        existing: { startTime: existingStart, endTime: existingEnd }
      });
    }
    
    return isOverlap;
  });

  if (hasConflict) {
    const conflictBooking = existingBookings.find(booking => 
      (startTime < booking.endTime) && (endTime > booking.startTime)
    );
    const error = new Error(
      `PT đã có lịch từ ${conflictBooking.startTime} đến ${conflictBooking.endTime} vào ngày này. Vui lòng chọn giờ khác.`
    );
    error.statusCode = 409;
    throw error;
  }

  // Prepare booking data
  const bookingData = {
    memberId,
    trainerId,
    gymId,
    bookingDate,
    startTime,
    endTime,
    notes,
    status: "confirmed", // pending, confirmed, in_progress, completed, cancelled, no_show
    createdBy: userId,
  };

  // Chỉ thêm packageId nếu có và là số hợp lệ
  if (packageId && !isNaN(packageId) && packageId !== '') {
    bookingData.packageId = parseInt(packageId);
    // Không set packageActivationId vì chưa activate package
  }

  // Tạo booking
  const booking = await Booking.create(bookingData);

  return booking;
};

/**
 * Owner cập nhật booking
 */
const updateBooking = async (userId, bookingId, data) => {
  // Kiểm tra booking có thuộc gym của owner không
  const myGyms = await Gym.findAll({
    where: { ownerId: userId },
    attributes: ["id"],
  });
  const myGymIds = myGyms.map((g) => g.id);

  const booking = await Booking.findOne({
    where: {
      id: bookingId,
      gymId: { [db.Sequelize.Op.in]: myGymIds },
    },
  });

  if (!booking) {
    const error = new Error("Không tìm thấy booking hoặc bạn không có quyền");
    error.statusCode = 404;
    throw error;
  }

  // Chỉ cho phép cập nhật nếu status là pending hoặc confirmed
  if (booking.status !== "pending" && booking.status !== "confirmed") {
    const error = new Error("Chỉ có thể cập nhật booking ở trạng thái pending hoặc confirmed");
    error.statusCode = 400;
    throw error;
  }

  // Kiểm tra conflict nếu thay đổi trainerId, bookingDate, hoặc time
  const { trainerId, bookingDate, startTime, endTime, notes } = data;
  const newTrainerId = trainerId || booking.trainerId;
  const newBookingDate = bookingDate || booking.bookingDate;
  const newStartTime = startTime || booking.startTime;
  const newEndTime = endTime || booking.endTime;

  // Chỉ check conflict nếu có thay đổi về trainer/date/time
  if (trainerId || bookingDate || startTime || endTime) {
    const existingBookings = await Booking.findAll({
      where: {
        trainerId: newTrainerId,
        bookingDate: newBookingDate,
        status: { [db.Sequelize.Op.notIn]: ['cancelled', 'no_show'] },
        id: { [db.Sequelize.Op.ne]: bookingId }, // Exclude booking hiện tại
      },
      attributes: ['id', 'startTime', 'endTime'],
    });

    const hasConflict = existingBookings.some(b => 
      (newStartTime < b.endTime) && (newEndTime > b.startTime)
    );

    if (hasConflict) {
      const conflictBooking = existingBookings.find(b => 
        (newStartTime < b.endTime) && (newEndTime > b.startTime)
      );
      const error = new Error(
        `PT đã có lịch từ ${conflictBooking.startTime} đến ${conflictBooking.endTime} vào ngày này. Vui lòng chọn giờ khác.`
      );
      error.statusCode = 409;
      throw error;
    }
  }

  // Cập nhật
  await booking.update({
    trainerId: newTrainerId,
    bookingDate: newBookingDate,
    startTime: newStartTime,
    endTime: newEndTime,
    notes: notes !== undefined ? notes : booking.notes,
  });

  return booking;
};

/**
 * Owner hủy booking
 */
const cancelBooking = async (userId, bookingId) => {
  // Kiểm tra booking có thuộc gym của owner không
  const myGyms = await Gym.findAll({
    where: { ownerId: userId },
    attributes: ["id"],
  });
  const myGymIds = myGyms.map((g) => g.id);

  const booking = await Booking.findOne({
    where: {
      id: bookingId,
      gymId: { [db.Sequelize.Op.in]: myGymIds },
    },
  });

  if (!booking) {
    const error = new Error("Không tìm thấy booking hoặc bạn không có quyền");
    error.statusCode = 404;
    throw error;
  }

  // Cập nhật status thành cancelled
  await booking.update({ status: "cancelled" });

  return booking;
};

/**
 * Owner cập nhật status của booking
 */
const updateBookingStatus = async (userId, bookingId, newStatus) => {
  // Kiểm tra booking có thuộc gym của owner không
  const myGyms = await Gym.findAll({
    where: { ownerId: userId },
    attributes: ["id"],
  });
  const myGymIds = myGyms.map((g) => g.id);

  const booking = await Booking.findOne({
    where: {
      id: bookingId,
      gymId: { [db.Sequelize.Op.in]: myGymIds },
    },
  });

  if (!booking) {
    const error = new Error("Không tìm thấy booking hoặc bạn không có quyền");
    error.statusCode = 404;
    throw error;
  }

  // Validate status transitions
  const validTransitions = {
    pending: ['confirmed', 'cancelled'],
    confirmed: ['in_progress', 'cancelled', 'no_show'],
    in_progress: ['completed', 'cancelled'],
  };

  const currentStatus = booking.status;
  if (!validTransitions[currentStatus]?.includes(newStatus)) {
    const error = new Error(
      `Không thể chuyển từ trạng thái "${currentStatus}" sang "${newStatus}"`
    );
    error.statusCode = 400;
    throw error;
  }

  // Cập nhật status
  const updateData = { status: newStatus };
  
  // Thêm timestamp tùy theo status
  if (newStatus === 'in_progress') {
    updateData.checkinTime = new Date();
  } else if (newStatus === 'completed') {
    updateData.checkoutTime = new Date();
  } else if (newStatus === 'cancelled') {
    updateData.cancellationDate = new Date();
    updateData.cancellationBy = userId;
  }

  await booking.update(updateData);

  return booking;
};

/**
 * Lấy lịch đã book của trainer theo ngày
 */
const getTrainerSchedule = async (userId, trainerId, date) => {
  // Kiểm tra trainer có thuộc gym của owner không
  const myGyms = await Gym.findAll({
    where: { ownerId: userId },
    attributes: ["id"],
  });
  const myGymIds = myGyms.map((g) => g.id);

  const bookings = await Booking.findAll({
    where: {
      trainerId,
      bookingDate: date,
      gymId: { [db.Sequelize.Op.in]: myGymIds },
      status: { [db.Sequelize.Op.notIn]: ['cancelled', 'no_show'] },
    },
    attributes: ['id', 'startTime', 'endTime', 'status'],
    include: [
      {
        model: Member,
        attributes: ["id"],
        include: [{ model: User, attributes: ["username"] }],
      },
    ],
    order: [['startTime', 'ASC']],
  });

  return bookings;
};

export default {
  getMyBookings,
  getBookingDetail,
  createBooking,
  updateBooking,
  cancelBooking,
  updateBookingStatus,
  getTrainerSchedule,
};
