import db from "../../models/index";
import realtimeService from "../realtime.service";

const { Booking, Member, Trainer, Gym, Package, User, TrainerShare, Request } = db;
const OWNER_ACTIVE_TRAINER_SHARE_STATUSES = ['approved', 'pending', 'pending_trainer'];

const ACTIVE_PT_PACKAGE_INCLUDE = [{
  model: db.Package,
  where: {
    packageType: 'personal_training',
  },
  required: true,
}];

const applyPackageActivationCompletion = async (booking) => {
  if (!booking?.packageActivationId) return null;

  const activation = await db.PackageActivation.findByPk(booking.packageActivationId, {
    include: [{ model: db.Package, attributes: ["id", "name"] }],
  });
  if (!activation || activation.sessionsRemaining <= 0) return activation;

  await activation.update({
    sessionsUsed: (activation.sessionsUsed || 0) + 1,
    sessionsRemaining: Math.max(0, activation.sessionsRemaining - 1),
    status: activation.sessionsRemaining - 1 <= 0 ? 'completed' : activation.status,
  });

  return activation;
};

const getDateOnlyString = (value) => {
  if (!value) return null;

  if (typeof value === 'string') {
    const exact = value.match(/^\d{4}-\d{2}-\d{2}/);
    if (exact) return exact[0];
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().split('T')[0];
};


const formatDateVN = (value) => {
  const raw = getDateOnlyString(value);
  if (raw) {
    const [y, m, d] = raw.split("-");
    return `${d}/${m}/${y}`;
  }
  return "ngày đã chọn";
};

const toHHMM = (value) => String(value || "").slice(0, 5);

const formatBookingSlotLabel = (booking) => {
  const dateLabel = formatDateVN(booking?.bookingDate);
  const start = toHHMM(booking?.startTime);
  const end = toHHMM(booking?.endTime);
  return `${dateLabel}${start && end ? ` (${start}-${end})` : ""}`;
};

const notifyMemberPackageMilestones = async (booking, activation) => {
  if (!booking?.memberId || !activation) return;

  const member = await db.Member.findByPk(booking.memberId, { attributes: ["userId"] });
  if (!member?.userId) return;

  const fullActivation = activation?.Package
    ? activation
    : await db.PackageActivation.findByPk(activation.id, {
        include: [{ model: db.Package, attributes: ["id", "name"] }],
      });

  if (!fullActivation) return;

  if (Number(fullActivation.sessionsRemaining || 0) === 1 && String(fullActivation.status || "").toLowerCase() !== "completed") {
    await realtimeService.notifyUser(member.userId, {
      title: "Gói tập sắp hoàn thành",
      message: `Gói ${fullActivation.Package?.name || "tập"} của bạn còn 1 buổi sau khi hoàn thành buổi ${formatBookingSlotLabel(booking)}.`,
      notificationType: "package_purchase",
      relatedType: "packageActivation",
      relatedId: fullActivation.id,
    });
  }

  if (String(fullActivation.status || "").toLowerCase() === "completed") {
    await realtimeService.notifyUser(member.userId, {
      title: "Gói tập đã hoàn thành",
      message: `Gói ${fullActivation.Package?.name || "tập"} đã hoàn thành sau buổi ${formatBookingSlotLabel(booking)}. Bạn có thể vào mục đánh giá để gửi nhận xét.`,
      notificationType: "package_purchase",
      relatedType: "packageActivation",
      relatedId: fullActivation.id,
    });
  }
};

const parseSpecificSchedules = (value) => {
  try {
    if (!value) return [];
    return Array.isArray(value) ? value : JSON.parse(value || '[]');
  } catch (_error) {
    return [];
  }
};

const isShareAvailableOnDate = (share, bookingDateStr) => {
  if (!share || !bookingDateStr) return false;

  if (share.scheduleMode === 'specific_days') {
    const schedules = parseSpecificSchedules(share.specificSchedules);
    return schedules.some((schedule) => schedule?.date === bookingDateStr);
  }

  if (share.scheduleMode === 'all_days') {
    const startDate = getDateOnlyString(share.startDate);
    const endDate = getDateOnlyString(share.endDate);
    if (!startDate) return false;
    return startDate <= bookingDateStr && (!endDate || endDate >= bookingDateStr);
  }

  return false;
};

const getOwnerGymIds = async (userId) => {
  const myGyms = await Gym.findAll({
    where: { ownerId: userId },
    attributes: ['id'],
    raw: true,
  });

  return myGyms.map((gym) => Number(gym.id)).filter(Boolean);
};

const hasApprovedShareAccessForTrainer = async ({ userId, trainerId, gymId, bookingDate }) => {
  const bookingDateStr = getDateOnlyString(bookingDate);
  if (!bookingDateStr) return false;

  const shares = await TrainerShare.findAll({
    where: {
      trainerId,
      requestedBy: userId,
      toGymId: gymId,
      status: { [db.Sequelize.Op.in]: OWNER_ACTIVE_TRAINER_SHARE_STATUSES },
    },
    attributes: ['id', 'scheduleMode', 'specificSchedules', 'startDate', 'endDate'],
  });

  return shares.some((share) => isShareAvailableOnDate(share, bookingDateStr));
};

const assertTrainerAssignableToBooking = async ({ userId, trainerId, gymId, bookingDate }) => {
  const trainer = await Trainer.findByPk(trainerId, {
    include: [{ model: User, attributes: ['id', 'username'] }],
  });

  if (!trainer) {
    const error = new Error('Trainer không tồn tại');
    error.statusCode = 404;
    throw error;
  }

  const trainerIsActive = trainer.isActive !== false && (!trainer.status || String(trainer.status).toLowerCase() === 'active');
  if (!trainerIsActive) {
    const error = new Error('Trainer đang không hoạt động');
    error.statusCode = 400;
    throw error;
  }

  if (Number(trainer.gymId) === Number(gymId)) {
    return { trainer, accessType: 'local' };
  }

  const hasShareAccess = await hasApprovedShareAccessForTrainer({
    userId,
    trainerId,
    gymId,
    bookingDate,
  });

  if (!hasShareAccess) {
    const error = new Error('Trainer thay thế không thuộc gym này hoặc chưa được chia sẻ hợp lệ cho ngày đã chọn');
    error.statusCode = 403;
    throw error;
  }

  return { trainer, accessType: 'shared' };
};

const getAccessibleBookingOrThrow = async (userId, bookingId) => {
  const myGymIds = await getOwnerGymIds(userId);

  let booking = await Booking.findOne({
    where: {
      id: bookingId,
      gymId: { [db.Sequelize.Op.in]: myGymIds },
    },
  });

  if (booking) {
    return { booking, myGymIds, accessType: 'local' };
  }

  booking = await Booking.findByPk(bookingId);
  if (!booking) {
    const error = new Error('Không tìm thấy booking hoặc bạn không có quyền');
    error.statusCode = 404;
    throw error;
  }

  const hasShareAccess = await hasApprovedShareAccessForTrainer({
    userId,
    trainerId: booking.trainerId,
    gymId: booking.gymId,
    bookingDate: booking.bookingDate,
  });

  if (!hasShareAccess) {
    const error = new Error('Không tìm thấy booking hoặc bạn không có quyền');
    error.statusCode = 404;
    throw error;
  }

  return { booking, myGymIds, accessType: 'shared' };
};

const assertTrainerHasNoConflict = async ({ trainerId, bookingDate, startTime, endTime, excludeBookingIds = [], transaction }) => {
  const whereClause = {
    trainerId,
    bookingDate,
    status: { [db.Sequelize.Op.notIn]: ['cancelled', 'no_show', 'completed'] },
  };

  if (excludeBookingIds.length > 0) {
    whereClause.id = { [db.Sequelize.Op.notIn]: excludeBookingIds };
  }

  const existingBookings = await Booking.findAll({
    where: whereClause,
    attributes: ['id', 'startTime', 'endTime'],
    transaction,
  });

  const conflictBooking = existingBookings.find((booking) =>
    startTime < booking.endTime && endTime > booking.startTime
  );

  if (conflictBooking) {
    const error = new Error(
      `PT đã có lịch từ ${conflictBooking.startTime} đến ${conflictBooking.endTime} vào ngày này. Vui lòng chọn giờ khác.`
    );
    error.statusCode = 409;
    throw error;
  }
};

const notifyBookingReassignment = async ({ booking, previousTrainerId, dateChanged, timeChanged }) => {
  try {
    const member = booking.memberId
      ? await db.Member.findByPk(booking.memberId, { attributes: ['userId'] })
      : null;
    const oldTrainer = previousTrainerId
      ? await db.Trainer.findByPk(previousTrainerId, {
          attributes: ['id', 'userId'],
          include: [{ model: User, attributes: ['username'] }],
        })
      : null;
    const currentTrainer = booking.trainerId
      ? await db.Trainer.findByPk(booking.trainerId, {
          attributes: ['id', 'userId'],
          include: [{ model: User, attributes: ['username'] }],
        })
      : null;

    const trainerChanged = previousTrainerId && Number(previousTrainerId) !== Number(booking.trainerId);
    const dateLabel = getDateOnlyString(booking.bookingDate) || 'ngày đã chọn';
    const timeLabel = `${String(booking.startTime || '').slice(0, 5)}-${String(booking.endTime || '').slice(0, 5)}`;

    if (member?.userId && (trainerChanged || dateChanged || timeChanged)) {
      const trainerName = currentTrainer?.User?.username || `PT #${booking.trainerId}`;
      await realtimeService.notifyUser(member.userId, {
        title: 'Lịch tập được cập nhật',
        message: `Buổi tập ngày ${dateLabel} ${timeLabel} đã được sắp xếp với ${trainerName}.`,
        notificationType: 'booking_update',
        relatedType: 'booking',
        relatedId: booking.id,
      });
    }

    if (trainerChanged && oldTrainer?.userId && Number(oldTrainer.id) !== Number(currentTrainer?.id)) {
      await realtimeService.notifyUser(oldTrainer.userId, {
        title: 'Lịch PT được điều phối lại',
        message: `Buổi tập ngày ${dateLabel} ${timeLabel} không còn được phân cho bạn nữa.`,
        notificationType: 'booking_update',
        relatedType: 'booking',
        relatedId: booking.id,
      });
    }

    if (currentTrainer?.userId && (trainerChanged || dateChanged || timeChanged)) {
      await realtimeService.notifyUser(currentTrainer.userId, {
        title: 'Bạn có lịch PT mới',
        message: `Bạn được phân công buổi tập ngày ${dateLabel} ${timeLabel}.`,
        notificationType: 'booking_update',
        relatedType: 'booking',
        relatedId: booking.id,
      });
    }
  } catch (notifyError) {
    console.error('[owner.booking] update notify error:', notifyError.message);
  }
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
    const { page = 1, limit = 10, status, q, gymId, memberId, trainerId, fromDate, toDate } = query;
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
        status: { [db.Sequelize.Op.in]: OWNER_ACTIVE_TRAINER_SHARE_STATUSES }
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

    if (memberId && Number(memberId) > 0) {
      whereClause.memberId = Number(memberId);
    }

    if (trainerId && Number(trainerId) > 0) {
      whereClause.trainerId = Number(trainerId);
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

  let busyRequested = false;
  if (Request && booking.id) {
    const busyRequests = await Request.findAll({
      where: {
        requestType: "BUSY_SLOT",
        status: { [db.Sequelize.Op.in]: ["PENDING", "APPROVED"] },
      },
      attributes: ["id", "data"],
      order: [["createdAt", "DESC"]],
      limit: 400,
    });
    busyRequested = busyRequests.some(
      (r) => Number(r?.data?.bookingId || 0) === Number(booking.id),
    );
  }
  booking.setDataValue("busyRequested", busyRequested);

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
        status: { [db.Sequelize.Op.in]: OWNER_ACTIVE_TRAINER_SHARE_STATUSES }
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
  const { booking } = await getAccessibleBookingOrThrow(userId, bookingId);
  const applyToFuture = data?.applyToFuture === true || data?.applyToFuture === 'true' || data?.applyToFuture === 1 || data?.applyToFuture === '1';

  // Chỉ cho phép cập nhật nếu status là pending hoặc confirmed
  if (booking.status !== "pending" && booking.status !== "confirmed") {
    const error = new Error("Chỉ có thể cập nhật booking ở trạng thái pending hoặc confirmed");
    error.statusCode = 400;
    throw error;
  }

  // Kiểm tra conflict nếu thay đổi trainerId, bookingDate, hoặc time
  const { trainerId, bookingDate, startTime, endTime, notes } = data;
  const previousTrainerId = booking.trainerId ? Number(booking.trainerId) : null;
  const newTrainerId = trainerId || booking.trainerId;
  const newBookingDate = bookingDate || booking.bookingDate;
  const newStartTime = startTime || booking.startTime;
  const newEndTime = endTime || booking.endTime;
  const trainerChanged = Number(previousTrainerId || 0) !== Number(newTrainerId || 0);
  const dateChanged = String(getDateOnlyString(booking.bookingDate) || '') !== String(getDateOnlyString(newBookingDate) || '');
  const timeChanged = String(booking.startTime || '') !== String(newStartTime || '') || String(booking.endTime || '') !== String(newEndTime || '');

  if (trainerId) {
    await assertTrainerAssignableToBooking({
      userId,
      trainerId: Number(newTrainerId),
      gymId: booking.gymId,
      bookingDate: newBookingDate,
    });
  }

  if (trainerId || bookingDate || startTime || endTime) {
    await assertTrainerHasNoConflict({
      trainerId: newTrainerId,
      bookingDate: newBookingDate,
      startTime: newStartTime,
      endTime: newEndTime,
      excludeBookingIds: [Number(bookingId)],
    });
  }

  const canApplyToFuture = applyToFuture && trainerChanged && booking.packageActivationId;

  if (canApplyToFuture) {
    const t = await db.sequelize.transaction();

    try {
      const futureBookings = await Booking.findAll({
        where: {
          packageActivationId: booking.packageActivationId,
          memberId: booking.memberId,
          trainerId: booking.trainerId,
          status: { [db.Sequelize.Op.in]: ['pending', 'confirmed'] },
          bookingDate: { [db.Sequelize.Op.gte]: getDateOnlyString(booking.bookingDate) },
        },
        order: [['bookingDate', 'ASC'], ['startTime', 'ASC']],
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      const bookingIds = futureBookings.map((row) => Number(row.id));
      if (!bookingIds.includes(Number(booking.id))) {
        bookingIds.push(Number(booking.id));
      }

      for (const futureBooking of futureBookings) {
        await assertTrainerAssignableToBooking({
          userId,
          trainerId: Number(newTrainerId),
          gymId: futureBooking.gymId,
          bookingDate: futureBooking.bookingDate,
        });

        await assertTrainerHasNoConflict({
          trainerId: Number(newTrainerId),
          bookingDate: futureBooking.bookingDate,
          startTime: futureBooking.id === booking.id ? newStartTime : futureBooking.startTime,
          endTime: futureBooking.id === booking.id ? newEndTime : futureBooking.endTime,
          excludeBookingIds: bookingIds,
          transaction: t,
        });
      }

      const changedBookings = [];
      for (const futureBooking of futureBookings) {
        const updatePayload = {
          trainerId: newTrainerId,
        };

        if (futureBooking.id === booking.id) {
          updatePayload.bookingDate = newBookingDate;
          updatePayload.startTime = newStartTime;
          updatePayload.endTime = newEndTime;
          updatePayload.notes = notes !== undefined ? notes : futureBooking.notes;
        }

        await futureBooking.update(updatePayload, { transaction: t });
        changedBookings.push({
          booking: futureBooking,
          previousTrainerId,
          dateChanged: futureBooking.id === booking.id ? dateChanged : false,
          timeChanged: futureBooking.id === booking.id ? timeChanged : false,
        });
      }

      await t.commit();

      await Promise.all(
        changedBookings.map((item) =>
          notifyBookingReassignment({
            booking: item.booking,
            previousTrainerId: item.previousTrainerId,
            dateChanged: item.dateChanged,
            timeChanged: item.timeChanged,
          })
        )
      );

      return {
        ...booking.toJSON(),
        trainerId: newTrainerId,
        bookingDate: newBookingDate,
        startTime: newStartTime,
        endTime: newEndTime,
        notes: notes !== undefined ? notes : booking.notes,
        bulkUpdatedCount: changedBookings.length,
      };
    } catch (error) {
      await t.rollback();
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

  await notifyBookingReassignment({
    booking,
    previousTrainerId,
    dateChanged,
    timeChanged,
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
        status: { [db.Sequelize.Op.in]: OWNER_ACTIVE_TRAINER_SHARE_STATUSES }
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
  let completedActivation = null;
  
  // Thêm timestamp tùy theo status
  if (newStatus === 'in_progress') {
    updateData.checkinTime = new Date();
  } else if (newStatus === 'completed') {
    updateData.checkoutTime = new Date();
    completedActivation = await applyPackageActivationCompletion(booking);
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
      message: `Buổi tập ngày ${formatBookingSlotLabel(booking)} ${label}.`,
      notificationType: "booking_update",
      relatedType: "booking",
      relatedId: booking.id,
    });
    if (newStatus === "completed") {
      await notifyMemberPackageMilestones(booking, completedActivation);
    }
    if (trainer?.userId && ["cancelled", "confirmed"].includes(newStatus)) {
      await realtimeService.notifyUser(trainer.userId, {
        title: "Lịch PT thay đổi",
        message: `Buổi tập ngày ${formatBookingSlotLabel(booking)} ${label}.`,
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
    attributes: ['id', 'startTime', 'endTime', 'status', 'notes'],
    include: [
      {
        model: Member,
        attributes: ["id"],
        include: [{ model: User, attributes: ["username"] }],
      },
    ],
    order: [['startTime', 'ASC']],
  });

  // Flag bookings that already have BUSY_SLOT requests (pending/approved)
  const bookingIds = bookings.map((booking) => Number(booking.id)).filter(Boolean);
  const busyRequestedBookingIdSet = new Set();
  if (bookingIds.length > 0 && Request) {
    const busyRequests = await Request.findAll({
      where: {
        requestType: 'BUSY_SLOT',
        status: { [db.Sequelize.Op.in]: ['PENDING', 'APPROVED', 'pending', 'approved'] },
      },
      attributes: ['data'],
      order: [['createdAt', 'DESC']],
      limit: 500,
    });

    busyRequests.forEach((requestItem) => {
      const bookingId = Number(requestItem?.data?.bookingId || 0);
      if (bookingId && bookingIds.includes(bookingId)) {
        busyRequestedBookingIdSet.add(bookingId);
      }
    });
  }

  bookings.forEach((booking) => {
    booking.setDataValue('busyRequested', busyRequestedBookingIdSet.has(Number(booking.id)));
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
      status: { [db.Sequelize.Op.in]: OWNER_ACTIVE_TRAINER_SHARE_STATUSES }
      // Remove date filtering here - will filter in application logic
    },
    attributes: [
      "id",
      "startTime",
      "endTime",
      "scheduleMode",
      "specificSchedules",
      "fromGymId",
      "toGymId",
      "startDate",
      "endDate",
      "sharePaymentStatus",
      "sharePaymentPtAcknowledgedAt",
    ],
    include: [
      {
        model: Gym,
        as: 'toGym',
        attributes: ['id', 'name'],
        required: false,
      },
    ],
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
          trainerShareId: share.id,
          startTime: startTime,
          endTime: endTime,
          status: 'shared',
          type: 'trainer_share',
          Member: null,
          toGym: share.toGym ? { id: share.toGym.id, name: share.toGym.name } : null,
          sharePaymentStatus: share.sharePaymentStatus || null,
          sharePaymentPtAcknowledgedAt: share.sharePaymentPtAcknowledgedAt || null,
        });
      }
    } else if (share.scheduleMode === 'all_days' && share.startTime && share.endTime) {
      // All days mode - block this time
      shareBlocks.push({
        id: `share-${share.id}`,
        trainerShareId: share.id,
        startTime: share.startTime,
        endTime: share.endTime,
        status: 'shared',
        type: 'trainer_share',
        Member: null,
        toGym: share.toGym ? { id: share.toGym.id, name: share.toGym.name } : null,
        sharePaymentStatus: share.sharePaymentStatus || null,
        sharePaymentPtAcknowledgedAt: share.sharePaymentPtAcknowledgedAt || null,
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
