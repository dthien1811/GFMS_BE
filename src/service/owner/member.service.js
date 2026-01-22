import db from "../../models/index";

const { Member, User, Gym, Package, PackageActivation } = db;

/**
 * Lấy danh sách users chưa là member của bất kỳ gym nào
 */
const getAvailableUsers = async () => {
  // Lấy tất cả userId đã là member
  const existingMembers = await Member.findAll({
    attributes: ["userId"],
    raw: true,
  });
  const existingUserIds = existingMembers.map((m) => m.userId);

  // Lấy tất cả userId đã là trainer
  const existingTrainers = await db.Trainer.findAll({
    attributes: ["userId"],
    raw: true,
  });
  const trainerUserIds = existingTrainers.map((t) => t.userId);

  // Lấy tất cả userId là owner (có gym)
  const gymOwners = await Gym.findAll({
    attributes: ["ownerId"],
    raw: true,
  });
  const ownerUserIds = gymOwners.map((g) => g.ownerId);

  // Gộp tất cả userId cần loại trừ
  const excludedUserIds = [...new Set([...existingUserIds, ...trainerUserIds, ...ownerUserIds])];

  // Lấy users chưa là member/trainer/owner
  const availableUsers = await User.findAll({
    where: {
      id: { [db.Sequelize.Op.notIn]: excludedUserIds.length > 0 ? excludedUserIds : [0] },
      status: "active", // Chỉ lấy user đang hoạt động
    },
    attributes: ["id", "username", "email", "phone"],
    order: [["createdAt", "DESC"]],
  });

  return availableUsers;
};

/**
 * Owner tạo member mới từ user chưa đăng ký
 */
const createMember = async (userId, data) => {
  const { targetUserId, gymId, packageId } = data;

  // Kiểm tra gym thuộc về owner
  const gym = await Gym.findOne({
    where: { id: gymId, ownerId: userId },
  });

  if (!gym) {
    const error = new Error("Không tìm thấy gym hoặc bạn không có quyền");
    error.statusCode = 404;
    throw error;
  }

  // Kiểm tra user đã là member chưa
  const existingMember = await Member.findOne({
    where: { userId: targetUserId },
  });

  if (existingMember) {
    const error = new Error("User này đã là hội viên của gym khác");
    error.statusCode = 400;
    throw error;
  }

  // Tạo member
  const membershipNumber = `MEM${Date.now()}`;
  const newMember = await Member.create({
    userId: targetUserId,
    gymId,
    currentPackageId: packageId || null,
    membershipNumber,
    status: "active",
    joinDate: new Date(),
  });

  // Load lại với relations
  const member = await Member.findByPk(newMember.id, {
    include: [
      { model: User, attributes: ["id", "username", "email", "phone"] },
      { model: Gym, attributes: ["id", "name"] },
      { model: Package, as: "currentPackage", attributes: ["id", "name"], required: false },
    ],
  });

  return member;
};

/**
 * Owner xem danh sách members của gyms mình quản lý
 */
const getMyMembers = async (userId, query = {}) => {
  const { page = 1, limit = 10, status, q, gymId } = query;
  const offset = (page - 1) * limit;

  // Lấy danh sách gym của owner
  const myGyms = await Gym.findAll({
    where: { ownerId: userId },
    attributes: ["id"],
  });
  const myGymIds = myGyms.map((g) => g.id);

  if (myGymIds.length === 0) {
    return {
      members: [],
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

  // Search by user info or membership number
  let includeUser = {
    model: User,
    attributes: ["id", "username", "email", "phone"],
  };

  if (q && q.trim()) {
    includeUser.where = {
      [db.Sequelize.Op.or]: [
        { username: { [db.Sequelize.Op.like]: `%${q.trim()}%` } },
        { email: { [db.Sequelize.Op.like]: `%${q.trim()}%` } },
      ],
    };
  }

  const { rows, count } = await Member.findAndCountAll({
    where: whereClause,
    include: [
      {
        model: User,
        attributes: ["id", "username", "email", "phone"],
        required: false,
      },
      {
        model: Gym,
        attributes: ["id", "name"],
        required: false,
      },
    ],
    limit: parseInt(limit),
    offset: parseInt(offset),
    order: [["createdAt", "DESC"]],
    distinct: true,
  });

  return {
    members: rows,
    pagination: {
      total: count,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(count / limit),
    },
  };
};

/**
 * Owner xem chi tiết member
 */
const getMemberDetail = async (userId, memberId) => {
  // Lấy danh sách gym của owner
  const myGyms = await Gym.findAll({
    where: { ownerId: userId },
    attributes: ["id"],
  });
  const myGymIds = myGyms.map((g) => g.id);

  const member = await Member.findOne({
    where: {
      id: memberId,
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
      {
        model: Package,
        as: "currentPackage",
        attributes: ["id", "name", "price", "durationDays"],
        required: false,
      },
    ],
  });

  if (!member) {
    const error = new Error("Không tìm thấy member hoặc bạn không có quyền xem");
    error.statusCode = 404;
    throw error;
  }

  return member;
};

/**
 * Owner xóa member (cho nghỉ)
 */
const deleteMember = async (userId, memberId) => {
  // Lấy danh sách gym của owner
  const myGyms = await Gym.findAll({
    where: { ownerId: userId },
    attributes: ["id"],
  });
  const myGymIds = myGyms.map((g) => g.id);

  // Kiểm tra member có thuộc gym của owner không
  const member = await Member.findOne({
    where: {
      id: memberId,
      gymId: { [db.Sequelize.Op.in]: myGymIds },
    },
  });

  if (!member) {
    const error = new Error("Không tìm thấy member hoặc bạn không có quyền");
    error.statusCode = 404;
    throw error;
  }

  // Xóa member
  await member.destroy();

  return { message: "Đã xóa hội viên thành công" };
};

export default {
  getAvailableUsers,
  createMember,
  getMyMembers,
  getMemberDetail,
  deleteMember,
};
