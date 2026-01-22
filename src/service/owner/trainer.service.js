import db from "../../models";
const { User, Trainer, Gym, Group, Booking, Member, Package } = db;

// Get all trainers (users with PT role) in owner's gyms
const getMyTrainers = async (userId, query = {}) => {
  const { q = "", page = 1, limit = 10, gymId } = query;

  console.log("=== getMyTrainers ===");
  console.log("userId:", userId, "query:", query);

  // Get owner's gyms
  const myGymIds = await Gym.findAll({
    where: { ownerId: userId },
    attributes: ["id"],
  }).then((gyms) => gyms.map((g) => g.id));

  console.log("Owner's gym IDs:", myGymIds);

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

  console.log("whereClause:", JSON.stringify(whereClause, null, 2));
  console.log("Querying trainers...");

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

    console.log("Found trainers:", count);
    console.log("Sample trainer:", rows[0]);

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

  console.log("=== getUsersWithoutPTRole ===");
  console.log("userId:", userId, "query:", query);

  // Lấy tất cả userId đã là trainer
  const existingTrainers = await Trainer.findAll({
    attributes: ["userId"],
    raw: true,
  });
  const trainerUserIds = existingTrainers.map((t) => t.userId);
  console.log("Existing trainer userIds:", trainerUserIds);

  // Lấy tất cả userId đã là member
  const existingMembers = await db.Member.findAll({
    attributes: ["userId"],
    raw: true,
  });
  const memberUserIds = existingMembers.map((m) => m.userId);
  console.log("Existing member userIds:", memberUserIds);

  // Lấy tất cả userId là owner (có gym)
  const gymOwners = await Gym.findAll({
    attributes: ["ownerId"],
    raw: true,
  });
  const ownerUserIds = gymOwners.map((g) => g.ownerId);
  console.log("Owner userIds:", ownerUserIds);

  // Gộp tất cả userId cần loại trừ
  const excludedUserIds = [...new Set([...trainerUserIds, ...memberUserIds, ...ownerUserIds])];
  console.log("Excluded userIds:", excludedUserIds);

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

  console.log("Found users:", count);

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

  console.log("=== createTrainer service ===");
  console.log("Data:", data);

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

  console.log("Creating trainer record...");

  // Create trainer record
  const trainer = await Trainer.create({
    userId: targetUserId,
    gymId: gymId,
    specialization,
    certification,
    hourlyRate,
    availableHours: availableHours || {},
  });

  console.log("Trainer created, adding Trainers role...");

  // Add Trainers role to user - update groupId trong user table
  await User.update(
    { groupId: trainerGroup.id },
    { where: { id: targetUserId } }
  );

  console.log("PT role added, fetching full data...");

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
  console.log("=== getTrainerSchedule ===");
  console.log("userId:", userId, "trainerId:", trainerId, "query:", query);
  
  const { fromDate, toDate } = query;

  const trainer = await Trainer.findByPk(trainerId, {
    include: [
      { model: User, attributes: ["id", "username", "email", "phone"] },
      { model: Gym }
    ],
  });

  console.log("Found trainer:", trainer ? "YES" : "NO");
  
  if (!trainer) {
    const error = new Error("Không tìm thấy PT");
    error.statusCode = 404;
    throw error;
  }

  console.log("Trainer gym:", trainer.Gym);
  console.log("Trainer.Gym.ownerId:", trainer.Gym?.ownerId, "vs userId:", userId);

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

  console.log("Querying bookings with:", whereClause);
  
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

    console.log("Found bookings:", bookings.length);

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

export default {
  getMyTrainers,
  getUsersWithoutPTRole,
  createTrainer,
  updateTrainer,
  deleteTrainer,
  getTrainerSchedule,
};
