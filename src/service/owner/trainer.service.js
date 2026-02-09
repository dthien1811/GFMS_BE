import db from "../../models";
const { User, Trainer, Gym, Group, Booking, Member, Package, Review } = db;

// Get all trainers (users with PT role) in owner's gyms
const getMyTrainers = async (userId, query = {}) => {
  const { q = "", page = 1, limit = 10, gymId } = query;

  // Get owner's gyms
  const myGymIds = await Gym.findAll({
    where: { ownerId: userId },
    attributes: ["id"],
  }).then((gyms) => gyms.map((g) => g.id));

  const whereClause = {};
  
  // Filter by search query
  if (q) {
    whereClause[db.Sequelize.Op.or] = [
      { "$User.username$": { [db.Sequelize.Op.like]: `%${q}%` } },
      { "$User.email$": { [db.Sequelize.Op.like]: `%${q}%` } },
      { specialization: { [db.Sequelize.Op.like]: `%${q}%` } },
    ];
  }

  // Filter by gym
  if (gymId) {
    whereClause.gymId = gymId;
  } else {
    whereClause.gymId = { [db.Sequelize.Op.in]: myGymIds };
  }

  const offset = (page - 1) * limit;

  try {
    const { count, rows } = await Trainer.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: User,
          attributes: ["id", "username", "email", "phone"],
        },
        {
          model: Gym,
          attributes: ["id", "name", "address"],
        },
      ],
      limit: parseInt(limit),
      offset: offset,
      distinct: true,
    });

    return {
      trainers: rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        totalPages: Math.ceil(count / limit),
      },
    };
  } catch (error) {
    console.error("❌ Error querying trainers:", error.message);
    console.error("Stack:", error.stack);
    throw error;
  }
};

// Get all users without PT role to convert
const getUsersWithoutPTRole = async (userId, query = {}) => {
  const { q = "", page = 1, limit = 10 } = query;


  // Lấy tất cả userId đã là trainer
  const existingTrainers = await Trainer.findAll({
    attributes: ["userId"],
    raw: true,
  });
  const trainerUserIds = existingTrainers.map((t) => t.userId);

  // Lấy tất cả userId đã là member
  const existingMembers = await db.Member.findAll({
    attributes: ["userId"],
    raw: true,
  });
  const memberUserIds = existingMembers.map((m) => m.userId);

  // Lấy tất cả userId là owner (có gym)
  const gymOwners = await Gym.findAll({
    attributes: ["ownerId"],
    raw: true,
  });
  const ownerUserIds = gymOwners.map((g) => g.ownerId);

  // Gộp tất cả userId cần loại trừ
  const excludedUserIds = [...new Set([...trainerUserIds, ...memberUserIds, ...ownerUserIds])];

  const whereClause = {
    id: { [db.Sequelize.Op.notIn]: excludedUserIds.length > 0 ? excludedUserIds : [0] },
    status: "active",
  };

  if (q) {
    whereClause[db.Sequelize.Op.or] = [
      { username: { [db.Sequelize.Op.like]: `%${q}%` } },
      { email: { [db.Sequelize.Op.like]: `%${q}%` } },
      { phone: { [db.Sequelize.Op.like]: `%${q}%` } },
    ];
  }

  const offset = (page - 1) * limit;

  const { count, rows } = await User.findAndCountAll({
    where: whereClause,
    attributes: ["id", "username", "email", "phone"],
    limit: parseInt(limit),
    offset: offset,
    order: [["createdAt", "DESC"]],
  });


  return {
    users: rows,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: count,
      totalPages: Math.ceil(count / limit),
    },
  };
};

// Create new trainer from user
const createTrainer = async (userId, data) => {
  const { targetUserId, gymId, specialization, certification, hourlyRate, availableHours } = data;


  // Verify owner owns this gym
  const gym = await Gym.findOne({
    where: { id: gymId, ownerId: userId },
  });

  if (!gym) {
    const error = new Error("Bạn không có quyền tạo PT cho gym này");
    error.statusCode = 403;
    throw error;
  }

  // Verify user exists
  const user = await User.findByPk(targetUserId);

  if (!user) {
    const error = new Error("User không tồn tại");
    error.statusCode = 404;
    throw error;
  }

  // Check if trainer record already exists
  const existingTrainer = await Trainer.findOne({ where: { userId: targetUserId } });
  if (existingTrainer) {
    const error = new Error("User đã là PT");
    error.statusCode = 400;
    throw error;
  }

  // Get Trainers group
  const trainerGroup = await Group.findOne({ where: { name: "Trainers" } });
  
  if (!trainerGroup) {
    const error = new Error("Trainers group not found");
    error.statusCode = 500;
    throw error;
  }


  // Create trainer record
  const trainer = await Trainer.create({
    userId: targetUserId,
    gymId: gymId,
    specialization,
    certification,
    hourlyRate,
    availableHours: availableHours || {},
  });


  // Add Trainers role to user - update groupId trong user table
  await User.update(
    { groupId: trainerGroup.id },
    { where: { id: targetUserId } }
  );


  // Return full trainer data
  return await Trainer.findByPk(trainer.id, {
    include: [
      {
        model: User,
        attributes: ["id", "username", "email", "phone"],
      },
      {
        model: Gym,
        attributes: ["id", "name", "address"],
      },
    ],
  });
};

// Update trainer info
const updateTrainer = async (userId, trainerId, data) => {
  const { specialization, certification, hourlyRate, availableHours } = data;

  const trainer = await Trainer.findByPk(trainerId, {
    include: [{ model: Gym }],
  });

  if (!trainer) {
    const error = new Error("Không tìm thấy PT");
    error.statusCode = 404;
    throw error;
  }

  // Verify owner owns the gym
  if (trainer.Gym.ownerId !== userId) {
    const error = new Error("Bạn không có quyền chỉnh sửa PT này");
    error.statusCode = 403;
    throw error;
  }

  await trainer.update({
    specialization,
    certification,
    hourlyRate,
    availableHours,
  });

  return await Trainer.findByPk(trainerId, {
    include: [
      {
        model: User,
        attributes: ["id", "username", "email", "phone"],
      },
      {
        model: Gym,
        attributes: ["id", "name", "address"],
      },
    ],
  });
};

// Delete trainer (remove PT role and trainer record)
const deleteTrainer = async (userId, trainerId) => {
  const trainer = await Trainer.findByPk(trainerId, {
    include: [
      { model: Gym },
      { model: User, include: [{ model: Group, through: { attributes: [] } }] },
    ],
  });

  if (!trainer) {
    const error = new Error("Không tìm thấy PT");
    error.statusCode = 404;
    throw error;
  }

  // Verify owner owns the gym
  if (trainer.Gym.ownerId !== userId) {
    const error = new Error("Bạn không có quyền xóa PT này");
    error.statusCode = 403;
    throw error;
  }

  // Remove Trainers role - set groupId về Guests
  const guestGroup = await Group.findOne({ where: { name: "Guests" } });
  if (guestGroup) {
    await User.update(
      { groupId: guestGroup.id },
      { where: { id: trainer.userId } }
    );
  }

  // Delete trainer record
  await trainer.destroy();

  return { message: "Xóa PT thành công" };
};

// Get trainer's schedule (bookings)
const getTrainerSchedule = async (userId, trainerId, query = {}) => {
  
  const { fromDate, toDate } = query;

  const trainer = await Trainer.findByPk(trainerId, {
    include: [
      { model: User, attributes: ["id", "username", "email", "phone"] },
      { model: Gym }
    ],
  });

  
  if (!trainer) {
    const error = new Error("Không tìm thấy PT");
    error.statusCode = 404;
    throw error;
  }


  // Verify owner owns the gym
  if (trainer.Gym.ownerId !== userId) {
    const error = new Error("Bạn không có quyền xem lịch của PT này");
    error.statusCode = 403;
    throw error;
  }

  const whereClause = { trainerId };

  if (fromDate && toDate) {
    whereClause.bookingDate = {
      [db.Sequelize.Op.between]: [new Date(fromDate), new Date(toDate)],
    };
  }

  
  try {
    const bookings = await Booking.findAll({
      where: whereClause,
      include: [
        {
          model: Member,
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
      order: [["bookingDate", "ASC"]],
    });


    return {
      trainer: {
        id: trainer.id,
        specialization: trainer.specialization,
        availableHours: trainer.availableHours,
        User: trainer.User,
      },
      bookings,
    };
  } catch (error) {
    console.error("❌ Error querying bookings:", error.message);
    console.error("Stack:", error.stack);
    throw error;
  }
};

// Get trainer detail with statistics
const getTrainerDetail = async (userId, trainerId) => {

  // Get owner's gyms
  const myGymIds = await Gym.findAll({
    where: { ownerId: userId },
    attributes: ["id"],
  }).then((gyms) => gyms.map((g) => g.id));

  // Find trainer
  const trainer = await Trainer.findOne({
    where: {
      id: trainerId,
      gymId: { [db.Sequelize.Op.in]: myGymIds },
    },
    include: [
      {
        model: User,
        attributes: ["id", "username", "email", "phone"],
      },
      {
        model: Gym,
        attributes: ["id", "name", "address"],
      },
    ],
  });

  if (!trainer) {
    const error = new Error("Không tìm thấy trainer hoặc bạn không có quyền xem");
    error.statusCode = 404;
    throw error;
  }

  // Get statistics
  const totalBookings = await Booking.count({
    where: { trainerId },
  });

  const completedBookings = await Booking.count({
    where: {
      trainerId,
      status: "completed",
    },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const upcomingBookings = await Booking.count({
    where: {
      trainerId,
      bookingDate: { [db.Sequelize.Op.gte]: today },
      status: { [db.Sequelize.Op.in]: ["pending", "confirmed", "in_progress"] },
    },
  });

  // Calculate average rating (if reviews exist)
  const reviews = await Review.findAll({
    where: { trainerId },
    attributes: ["rating"],
    raw: true,
  });

  const averageRating = reviews.length > 0
    ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
    : null;

  return {
    ...trainer.toJSON(),
    totalBookings,
    completedBookings,
    upcomingBookings,
    averageRating,
  };
};

// Toggle trainer status (activate/deactivate)
const toggleTrainerStatus = async (userId, trainerId) => {

  // Get owner's gyms
  const myGymIds = await Gym.findAll({
    where: { ownerId: userId },
    attributes: ["id"],
  }).then((gyms) => gyms.map((g) => g.id));

  // Find trainer
  const trainer = await Trainer.findOne({
    where: {
      id: trainerId,
      gymId: { [db.Sequelize.Op.in]: myGymIds },
    },
  });

  if (!trainer) {
    const error = new Error("Không tìm thấy trainer hoặc bạn không có quyền");
    error.statusCode = 404;
    throw error;
  }

  // If trying to deactivate, check for upcoming bookings
  if (trainer.isActive !== false && trainer.isActive !== 0) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const upcomingBookings = await Booking.count({
      where: {
        trainerId,
        bookingDate: { [db.Sequelize.Op.gte]: today },
        status: { [db.Sequelize.Op.in]: ["confirmed", "in_progress"] },
      },
    });

    if (upcomingBookings > 0) {
      const error = new Error(`Không thể vô hiệu hóa! PT còn ${upcomingBookings} lịch hẹn sắp tới.`);
      error.statusCode = 400;
      throw error;
    }
  }

  // Toggle status - convert to explicit 0/1
  const currentStatus = trainer.isActive !== false && trainer.isActive !== 0;
  trainer.isActive = currentStatus ? 0 : 1;
  await trainer.save();


  const message = trainer.isActive 
    ? "Đã kích hoạt PT thành công" 
    : "Đã vô hiệu hóa PT thành công";

  return { message, isActive: trainer.isActive };
};

export default {
  getMyTrainers,
  getUsersWithoutPTRole,
  createTrainer,
  updateTrainer,
  deleteTrainer,
  getTrainerSchedule,
  getTrainerDetail,
  toggleTrainerStatus,
};
