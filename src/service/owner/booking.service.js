import db from "../../models/index";

const { Booking, Member, Trainer, Gym, Package, User, TrainerShare } = db;

const ACTIVE_PT_PACKAGE_INCLUDE = [{
  model: db.Package,
  where: {
    packageType: 'personal_training',
  },
  required: true,
}];

const applyPackageActivationCompletion = async (booking) => {
  if (!booking?.packageActivationId) return null;

  const activation = await db.PackageActivation.findByPk(booking.packageActivationId);
  if (!activation || activation.sessionsRemaining <= 0) return activation;

  await activation.update({
    sessionsUsed: (activation.sessionsUsed || 0) + 1,
    sessionsRemaining: Math.max(0, activation.sessionsRemaining - 1),
    status: activation.sessionsRemaining - 1 <= 0 ? 'completed' : activation.status,
  });

  return activation;
};

const resolveBookingPackageActivation = async ({ memberId, trainerId, packageId, packageActivationId, allowSharedTrainer }) => {
  const whereClause = {
    memberId,
    status: 'active',
    sessionsRemaining: { [db.Sequelize.Op.gt]: 0 },
  };

  if (packageActivationId) {
    whereClause.id = packageActivationId;
  }

  const include = [{
    model: db.Package,
    where: {
      packageType: 'personal_training',
      ...(packageId ? { id: packageId } : {}),
      ...(!allowSharedTrainer && trainerId ? { trainerId } : {}),
    },
    required: true,
  }];

  let activation = await db.PackageActivation.findOne({
    where: whereClause,
    include,
    order: [['createdAt', 'DESC']],
  });

  if (!activation && allowSharedTrainer && trainerId) {
    activation = await db.PackageActivation.findOne({
      where: whereClause,
      include: ACTIVE_PT_PACKAGE_INCLUDE,
      order: [['createdAt', 'DESC']],
    });
  }

  return activation;
};

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
    
    // Lấy danh sách trainer shares mà owner này REQUEST (mượn PT)
    const approvedShares = await TrainerShare.findAll({
      where: {
        requestedBy: userId, // Owner MƯỢN trainer
        status: 'approved'
      },
      attributes: ["id", "trainerId", "toGymId", "scheduleMode", "specificSchedules", "startDate", "endDate"],
    });

    // CHỈ lấy bookings từ GYM của owner (bao gồm cả bookings dùng shared trainers)
    if (myGymIds.length === 0) {
      return {
        bookings: [],
        pagination: { total: 0, page: parseInt(page), limit: parseInt(limit), totalPages: 0 },
      };
    }

    const whereClause = {
      gymId: { [db.Sequelize.Op.in]: myGymIds }  // CHỈ lấy từ gym của mình
    };
    
    if (status) {
      whereClause.status = status;
    }
    
    // Nếu có gymId filter trong query, thêm vào điều kiện (nhưng vẫn trong myGymIds)
    if (gymId && gymId !== '') {
      whereClause.gymId = {
        [db.Sequelize.Op.and]: [
          { [db.Sequelize.Op.in]: myGymIds },
          { [db.Sequelize.Op.eq]: parseInt(gymId) }
        ]
      };
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
          ...(q && {
            where: {
              [db.Sequelize.Op.or]: [
                { username: { [db.Sequelize.Op.like]: `%${q}%` } },
                { email: { [db.Sequelize.Op.like]: `%${q}%` } },
                { phone: { [db.Sequelize.Op.like]: `%${q}%` } }
              ]
            }
          })
        },
      ],
      required: q ? true : false, // Nếu có q thì required để filter
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

    // Owner thấy TẤT CẢ bookings trong gym của mình
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
  const { memberId, trainerId, gymId, packageId, packageActivationId, bookingDate, startTime, endTime, notes } = data;

  // Kiểm tra gym có thuộc owner không
  const gym = await Gym.findOne({
    where: { id: gymId, ownerId: userId },
  });

  if (!gym) {
    const error = new Error("Gym không tồn tại hoặc bạn không có quyền");
    error.statusCode = 403;
    throw error;
  }

  // Kiểm tra member tồn tại, thuộc đúng gym và đang active
  const member = await Member.findOne({
    where: {
      id: memberId,
      gymId,
    },
  });
  if (!member) {
    const error = new Error("Member không tồn tại trong gym này");
    error.statusCode = 404;
    throw error;
  }

  if (member.status !== 'active') {
    const error = new Error("Hội viên đang ngừng hoạt động và không có quyền đặt lịch");
    error.statusCode = 400;
    throw error;
  }

  // === NGHIỆP VỤ MỚI: Kiểm tra Membership và Gói PT ===
  
  // 1. Kiểm tra member PHẢI có membership active
  const activeMembership = await db.PackageActivation.findOne({
    where: {
      memberId: memberId,
      status: 'active'
    },
    include: [{
      model: db.Package,
      where: { packageType: 'membership' },
      required: true
    }]
  });

  if (!activeMembership) {
    const error = new Error("Hội viên chưa có membership. Vui lòng mua gói thành viên trước khi đặt lịch.");
    error.statusCode = 400;
    throw error;
  }

  // Kiểm tra membership còn hạn
  if (activeMembership.expiryDate && new Date(activeMembership.expiryDate) < new Date()) {
    const error = new Error("Membership đã hết hạn. Vui lòng gia hạn trước khi đặt lịch.");
    error.statusCode = 400;
    throw error;
  }

  let ptPackageActivation = null;

  // 2. Nếu booking CÓ trainer, kiểm tra gói PT
  if (trainerId) {
    // Kiểm tra trainer tồn tại
    const trainer = await Trainer.findByPk(trainerId);
    if (!trainer) {
      const error = new Error("Trainer không tồn tại");
      error.statusCode = 404;
      throw error;
    }

    // Kiểm tra xem trainer có phải shared trainer không
    const approvedShare = await TrainerShare.findOne({
      where: {
        requestedBy: userId,
        trainerId: trainerId,
        status: 'approved'
      }
    });

    if (approvedShare) {
      // Kiểm tra booking date có trong schedule không
      const bookingDateStr = new Date(bookingDate).toISOString().split('T')[0];
      let isInSchedule = false;

      if (approvedShare.scheduleMode === 'specific_days') {
        const schedules = typeof approvedShare.specificSchedules === 'string' 
          ? JSON.parse(approvedShare.specificSchedules) 
          : approvedShare.specificSchedules;
        isInSchedule = schedules.some(s => s.date === bookingDateStr);
      } else if (approvedShare.scheduleMode === 'all_days') {
        isInSchedule = bookingDateStr >= approvedShare.startDate && bookingDateStr <= approvedShare.endDate;
      }

      if (!isInSchedule) {
        const error = new Error("Ngày booking không nằm trong lịch chia sẻ trainer");
        error.statusCode = 400;
        throw error;
      }

      ptPackageActivation = await resolveBookingPackageActivation({
        memberId,
        trainerId,
        packageId,
        packageActivationId,
        allowSharedTrainer: true,
      });

      if (!ptPackageActivation) {
        const error = new Error("Hội viên chưa có gói PT đang hoạt động để áp dụng cho lịch với PT thay thế.");
        error.statusCode = 400;
        throw error;
      }
    } else {
      // Trainer KHÔNG phải shared trainer → kiểm tra gói PT bình thường
      ptPackageActivation = await resolveBookingPackageActivation({
        memberId,
        trainerId,
        packageId,
        packageActivationId,
        allowSharedTrainer: false,
      });

      if (!ptPackageActivation) {
        const error = new Error(`Hội viên chưa có gói PT với trainer này hoặc đã hết buổi. Vui lòng mua gói PT trước khi đặt lịch.`);
        error.statusCode = 400;
        throw error;
      }

      // Kiểm tra gói PT còn hạn
      if (ptPackageActivation.expiryDate && new Date(ptPackageActivation.expiryDate) < new Date()) {
        const error = new Error("Gói PT đã hết hạn. Vui lòng mua gói mới.");
        error.statusCode = 400;
        throw error;
      }
    }
  }

  // 3. Kiểm tra conflict lịch của trainer (nếu có)
  // 3. Kiểm tra conflict lịch của trainer (nếu có)
  if (trainerId) {
    const existingBookings = await Booking.findAll({
      where: {
        trainerId,
        bookingDate,
        status: { [db.Sequelize.Op.notIn]: ['cancelled', 'no_show', 'completed'] },
      },
      attributes: ['id', 'startTime', 'endTime'],
    });

    // Check overlap
    const hasConflict = existingBookings.some(booking => {
      const existingStart = booking.startTime;
      const existingEnd = booking.endTime;
      const isOverlap = (startTime < existingEnd) && (endTime > existingStart);
      
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
  }

  // Prepare booking data
  const bookingData = {
    memberId,
    trainerId: trainerId || null,
    gymId,
    bookingDate,
    startTime,
    endTime,
    notes,
    status: "confirmed",
    createdBy: userId,
  };

  // Nếu có gói PT, liên kết với packageActivationId
  if (ptPackageActivation) {
    bookingData.packageActivationId = ptPackageActivation.id;
    bookingData.packageId = ptPackageActivation.packageId;
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

  let booking = await Booking.findOne({
    where: {
      id: bookingId,
      gymId: { [db.Sequelize.Op.in]: myGymIds },
    },
  });

  if (!booking) {
    booking = await Booking.findByPk(bookingId);
    if (!booking) {
      const error = new Error("Không tìm thấy booking hoặc bạn không có quyền");
      error.statusCode = 404;
      throw error;
    }

    const bookingDateStr = booking.bookingDate
      ? new Date(booking.bookingDate).toISOString().split("T")[0]
      : null;

    const shares = await TrainerShare.findAll({
      where: {
        trainerId: booking.trainerId,
        requestedBy: userId,
        status: "approved",
      },
      attributes: ["id", "scheduleMode", "specificSchedules", "startDate", "endDate"],
    });

    const hasShareAccess = shares.some((share) => {
      if (!bookingDateStr) return false;
      if (share.scheduleMode === "specific_days") {
        if (!share.specificSchedules) return false;
        let schedules = [];
        try {
          schedules = Array.isArray(share.specificSchedules)
            ? share.specificSchedules
            : JSON.parse(share.specificSchedules || "[]");
        } catch (e) {
          return false;
        }
        return schedules.some((s) => s.date === bookingDateStr);
      }

      if (share.scheduleMode === "all_days") {
        if (!share.startDate) return false;
        const queryDate = new Date(bookingDateStr);
        const startDateOnly = new Date(
          share.startDate.getFullYear(),
          share.startDate.getMonth(),
          share.startDate.getDate()
        );
        const endDateOnly = share.endDate
          ? new Date(
              share.endDate.getFullYear(),
              share.endDate.getMonth(),
              share.endDate.getDate()
            )
          : null;
        return startDateOnly <= queryDate && (!endDateOnly || endDateOnly >= queryDate);
      }

      return false;
    });

    if (!hasShareAccess) {
      const error = new Error("Không tìm thấy booking hoặc bạn không có quyền");
      error.statusCode = 404;
      throw error;
    }
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
        status: { [db.Sequelize.Op.notIn]: ['cancelled', 'no_show', 'completed'] },
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

  let booking = await Booking.findOne({
    where: {
      id: bookingId,
      gymId: { [db.Sequelize.Op.in]: myGymIds },
    },
  });

  // Nếu không tìm thấy trong gym của mình, kiểm tra TrainerShare
  if (!booking) {
    booking = await Booking.findByPk(bookingId);
    
    if (!booking) {
      const error = new Error("Không tìm thấy booking");
      error.statusCode = 404;
      throw error;
    }
    
    // Kiểm tra xem có approved share nào mà owner này REQUEST (mượn trainer)
    const trainerShares = await TrainerShare.findAll({
      where: {
        requestedBy: userId, // Owner MƯỢN trainer
        trainerId: booking.trainerId,
        status: 'approved'
      }
    });
    
    if (trainerShares.length === 0) {
      const error = new Error("Không tìm thấy booking hoặc bạn không có quyền");
      error.statusCode = 404;
      throw error;
    }
    
    // Kiểm tra booking date có nằm trong schedule không
    const bookingDate = new Date(booking.bookingDate);
    const bookingDateStr = bookingDate.toISOString().split('T')[0];
    
    const hasPermission = trainerShares.some(share => {
      if (share.scheduleMode === 'specific_days') {
        const schedules = typeof share.specificSchedules === 'string' 
          ? JSON.parse(share.specificSchedules) 
          : share.specificSchedules;
        
        return schedules.some(schedule => bookingDateStr === schedule.date);
      } else if (share.scheduleMode === 'all_days') {
        return bookingDateStr >= share.startDate && bookingDateStr <= share.endDate;
      }
      return false;
    });
    
    if (!hasPermission) {
      const error = new Error("Không tìm thấy booking hoặc bạn không có quyền");
      error.statusCode = 404;
      throw error;
    }
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
    await applyPackageActivationCompletion(booking);
  } else if (newStatus === 'cancelled') {
    updateData.cancellationDate = new Date();
    updateData.cancellationBy = userId;
  }

  await booking.update(updateData);

  try {
    const member = booking.memberId ? await db.Member.findByPk(booking.memberId, { attributes: ["userId"] }) : null;
    const trainer = booking.trainerId ? await db.Trainer.findByPk(booking.trainerId, { attributes: ["userId"] }) : null;
    const statusLabels = {
      confirmed: "đã được xác nhận",
      in_progress: "đang diễn ra",
      completed: "đã hoàn thành",
      cancelled: "đã bị hủy",
      no_show: "được ghi nhận vắng mặt",
    };
    const label = statusLabels[newStatus] || `đã cập nhật sang ${newStatus}`;
    await realtimeService.notifyUser(member?.userId, {
      title: "Lịch tập được cập nhật",
      message: `Booking #${booking.id} ${label}.`,
      notificationType: "booking_update",
      relatedType: "booking",
      relatedId: booking.id,
    });
    if (trainer?.userId && ["cancelled", "confirmed"].includes(newStatus)) {
      await realtimeService.notifyUser(trainer.userId, {
        title: "Lịch PT thay đổi",
        message: `Booking #${booking.id} ${label}.`,
        notificationType: "booking_update",
        relatedType: "booking",
        relatedId: booking.id,
      });
    }
  } catch (notifyError) {
    console.error("[owner.booking] notify error:", notifyError.message);
  }

  return booking;
};

/**
 * Lấy lịch đã book của trainer theo ngày
 */
const getTrainerSchedule = async (userId, trainerId, date, options = {}) => {
  const includeAllGyms = options?.includeAllGyms === true || options?.includeAllGyms === "true" || options?.includeAllGyms === "1";

  // Kiểm tra trainer có thuộc gym của owner không (trừ khi yêu cầu xem toàn bộ)
  let myGymIds = [];
  if (!includeAllGyms) {
    const myGyms = await Gym.findAll({
      where: { ownerId: userId },
      attributes: ["id"],
    });
    myGymIds = myGyms.map((g) => g.id);
  }

  const bookingWhere = {
    trainerId,
    bookingDate: date,
    status: { [db.Sequelize.Op.notIn]: ['cancelled', 'no_show', 'completed'] },
  };

  if (!includeAllGyms) {
    bookingWhere.gymId = { [db.Sequelize.Op.in]: myGymIds };
  }

  // Load bookings
  const bookings = await Booking.findAll({
    where: bookingWhere,
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

  // Convert date string to Date object for comparison
  const queryDate = new Date(date);

  // Load approved trainer shares for this trainer
  // NOTE: Hiển thị TẤT CẢ trainer shares đã approve cho trainer này (không phân biệt gym owner)
  const { TrainerShare } = db;
  
  // For specific_days mode, we need to load ALL approved shares and filter by specificSchedules
  // For all_days mode, we can use date range filtering
  const trainerShares = await TrainerShare.findAll({
    where: {
      trainerId,
      status: 'approved'
      // Remove date filtering here - will filter in application logic
    },
    attributes: ['id', 'startTime', 'endTime', 'scheduleMode', 'specificSchedules', 'fromGymId', 'toGymId', 'startDate', 'endDate'],
  });

  // Filter by date in application logic
  const dateFilteredShares = trainerShares.filter(share => {
    if (share.scheduleMode === 'specific_days') {
      // For specific_days: check if date is in specificSchedules
      if (!share.specificSchedules) return false;
      
      let schedules;
      try {
        schedules = Array.isArray(share.specificSchedules) ? share.specificSchedules : JSON.parse(share.specificSchedules || '[]');
      } catch (e) {
        return false;
      }
      
      const dateStr = date; // YYYY-MM-DD format
      const hasMatchingDate = schedules.some(s => s.date === dateStr);
      
      return hasMatchingDate;
    } else if (share.scheduleMode === 'all_days') {
      // For all_days: check date range
      const queryDateOnly = new Date(queryDate.getFullYear(), queryDate.getMonth(), queryDate.getDate());
      const startDateOnly = new Date(share.startDate.getFullYear(), share.startDate.getMonth(), share.startDate.getDate());
      const endDateOnly = share.endDate ? new Date(share.endDate.getFullYear(), share.endDate.getMonth(), share.endDate.getDate()) : null;
      
      return startDateOnly <= queryDateOnly && (!endDateOnly || endDateOnly >= queryDateOnly);
    }
    
    return false;
  });





  // Convert trainer shares to booking-like format
  const shareBlocks = [];
  for (const share of dateFilteredShares) {
    if (share.scheduleMode === 'specific_days' && share.specificSchedules) {
      // Parse specificSchedules if it's a string
      let schedules;
      try {
        schedules = Array.isArray(share.specificSchedules) ? share.specificSchedules : JSON.parse(share.specificSchedules || '[]');
      } catch (e) {
        continue;
      }
      
      // Find schedule for this specific date (we know it exists because of filtering)
      const dateStr = date;
      const scheduleForDate = schedules.find(s => s.date === dateStr);
      
      if (scheduleForDate && scheduleForDate.startTime && scheduleForDate.endTime) {
        // Handle time format - ensure it's HH:MM:SS
        const startTime = scheduleForDate.startTime.length === 5 ? `${scheduleForDate.startTime}:00` : scheduleForDate.startTime;
        const endTime = scheduleForDate.endTime.length === 5 ? `${scheduleForDate.endTime}:00` : scheduleForDate.endTime;
        
        shareBlocks.push({
          id: `share-${share.id}`,
          startTime: startTime,
          endTime: endTime,
          status: 'shared',
          type: 'trainer_share',
          Member: null
        });
      }
    } else if (share.scheduleMode === 'all_days' && share.startTime && share.endTime) {
      // All days mode - block this time
      shareBlocks.push({
        id: `share-${share.id}`,
        startTime: share.startTime,
        endTime: share.endTime,
        status: 'shared',
        type: 'trainer_share',
        Member: null
      });
    }
  }

  // Combine bookings and trainer share blocks
  const combined = [...bookings, ...shareBlocks].sort((a, b) => {
    if (a.startTime < b.startTime) return -1;
    if (a.startTime > b.startTime) return 1;
    return 0;
  });

  return combined;
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
