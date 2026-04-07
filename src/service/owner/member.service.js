import db from "../../models/index";

const { Member, User, Gym, Package, PackageActivation, Trainer } = db;

/**
 * Lấy danh sách users chưa là member của bất kỳ gym nào
 */
const getAvailableUsers = async () => {
  // Lấy tất cả userId đã là member (ở BẤT KỲ gym nào)
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

  console.log('=== getAvailableUsers DEBUG ===');
  console.log('Total users to exclude:', excludedUserIds.length);
  console.log('Members (all gyms):', existingUserIds.length);
  console.log('Trainers (all gyms):', trainerUserIds.length);
  console.log('Owners (all gyms):', ownerUserIds.length);

  // Lấy users chưa là member/trainer/owner
  const availableUsers = await User.findAll({
    where: {
      id: { [db.Sequelize.Op.notIn]: excludedUserIds.length > 0 ? excludedUserIds : [0] },
      // Bỏ filter status để hiện tất cả users
    },
    attributes: ["id", "username", "email", "phone", "status"],
    order: [["createdAt", "DESC"]],
  });

  console.log('Available users found:', availableUsers.length);
  if (availableUsers.length > 0) {
    console.log('Sample available users:', availableUsers.slice(0, 3).map(u => ({
      id: u.id,
      username: u.username,
      email: u.email,
      status: u.status
    })));
  }

  return availableUsers;
};

/**
 * Owner tạo member mới từ user chưa đăng ký
 */
const createMember = async (userId, data) => {
  const { targetUserId, gymId } = data;

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
    currentPackageId: null,
    membershipNumber,
    status: "active",
    joinDate: new Date(),
    sessionsRemaining: 0,
  });

  // Load lại với relations
  const member = await Member.findByPk(newMember.id, {
    include: [
      { model: User, attributes: ["id", "username", "email", "phone"] },
      { model: Gym, attributes: ["id", "name"] },
      { model: Package, as: "currentPackage", attributes: ["id", "name", "durationDays"], required: false },
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
  if (q && q.trim()) {
    const searchPattern = `%${q.trim()}%`;
    
    // Tìm theo membershipNumber hoặc các field trong bảng User
    whereClause[db.Sequelize.Op.or] = [
      { membershipNumber: { [db.Sequelize.Op.like]: searchPattern } },
      { '$User.username$': { [db.Sequelize.Op.like]: searchPattern } },
      { '$User.email$': { [db.Sequelize.Op.like]: searchPattern } },
      { '$User.phone$': { [db.Sequelize.Op.like]: searchPattern } },
    ];
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
      {
        model: Package,
        as: "currentPackage",
        attributes: ["id", "name", "price"],
        required: false,
      },
    ],
    limit: parseInt(limit),
    offset: parseInt(offset),
    order: [["createdAt", "DESC"]],
    distinct: true,
  });

  const missingCurrentPackageMemberIds = rows
    .filter((m) => !m.currentPackage && m.id)
    .map((m) => m.id);

  if (missingCurrentPackageMemberIds.length > 0) {
    const activeActivations = await PackageActivation.findAll({
      where: {
        memberId: { [db.Sequelize.Op.in]: missingCurrentPackageMemberIds },
        status: "active",
      },
      include: [
        {
          model: Package,
          attributes: ["id", "name", "price"],
          required: false,
        },
      ],
      order: [["activationDate", "DESC"], ["createdAt", "DESC"]],
    });

    const latestPackageByMemberId = new Map();
    activeActivations.forEach((a) => {
      if (!latestPackageByMemberId.has(a.memberId) && a.Package) {
        latestPackageByMemberId.set(a.memberId, a.Package);
      }
    });

    rows.forEach((member) => {
      if (!member.currentPackage) {
        const fallbackPkg = latestPackageByMemberId.get(member.id);
        if (fallbackPkg) {
          member.setDataValue("currentPackage", fallbackPkg);
        }
      }
    });
  }

  // Backward compatibility: dữ liệu cũ có thể chưa có membershipNumber
  rows.forEach((member) => {
    if (!member.membershipNumber) {
      member.setDataValue("membershipNumber", `MEM${member.id}`);
    }
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
        attributes: ["id", "name", "price", "durationDays", "packageType", "trainerId"],
        required: false,
      },
      {
        model: PackageActivation,
        as: "PackageActivations",
        attributes: ["id", "activationDate", "expiryDate", "totalSessions", "sessionsUsed", "sessionsRemaining", "status", "packageId"],
        include: [
          {
            model: db.Transaction,
            attributes: ["id", "trainerId", "transactionDate"],
            required: false,
            include: [
              {
                model: Trainer,
                attributes: ["id"],
                required: false,
                include: [
                  {
                    model: User,
                    attributes: ["id", "username"],
                  },
                ],
              },
            ],
          },
          {
            model: Package,
            attributes: ["id", "name", "packageType", "trainerId"],
            include: [
              {
                model: Trainer,
                attributes: ["id"],
                required: false,
                include: [
                  {
                    model: User,
                    attributes: ["id", "username"],
                  },
                ],
              },
            ],
          },
        ],
        required: false,
        where: { status: 'active' },
      },
    ],
    order: [
      [{ model: PackageActivation, as: 'PackageActivations' }, 'activationDate', 'DESC']
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
 * Owner cập nhật member
 */
const updateMember = async (userId, memberId, data) => {
  const { gymId, currentPackageId, status } = data;

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

  // Nếu thay đổi gym, kiểm tra gym mới thuộc owner
  if (gymId && gymId !== member.gymId) {
    if (!myGymIds.includes(Number(gymId))) {
      const error = new Error("Gym không thuộc quyền quản lý");
      error.statusCode = 403;
      throw error;
    }
  }

  // Cập nhật member
  const updateData = {};
  if (gymId) updateData.gymId = gymId;
  if (currentPackageId !== undefined) {
    if (currentPackageId && currentPackageId !== "" && currentPackageId !== null) {
      const error = new Error("Owner không thể mua/gia hạn gói trực tiếp cho hội viên");
      error.statusCode = 400;
      throw error;
    }
    updateData.currentPackageId = null;
  }
  if (status) updateData.status = status;

  await member.update(updateData);

  // Nếu xóa gói (set currentPackageId = null), tự động cancel các gói đang active
  if (currentPackageId === "" || currentPackageId === null) {
    await PackageActivation.update(
      {
        status: "cancelled",
        sessionsRemaining: 0,
      },
      {
        where: {
          memberId,
          status: "active",
        },
      }
    );
    console.log("Auto-cancelled active packages for member:", memberId);
  }

  const updatedMember = await Member.findByPk(member.id, {
    include: [
      { model: User, attributes: ["id", "username", "email", "phone"] },
      { model: Gym, attributes: ["id", "name"] },
      { model: Package, as: "currentPackage", attributes: ["id", "name"], required: false },
    ],
  });

  return updatedMember;
};

/**
 * Owner xóa member (cho nghỉ)
 */
const deleteMember = async (userId, memberId) => {
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
  });

  if (!member) {
    const error = new Error("Không tìm thấy member hoặc bạn không có quyền");
    error.statusCode = 404;
    throw error;
  }

  const activeBookingCount = await db.Booking.count({
    where: {
      memberId,
      status: {
        [db.Sequelize.Op.in]: ["pending", "confirmed", "in_progress"],
      },
    },
  });

  if (activeBookingCount > 0) {
    const error = new Error(`Không thể xóa hội viên này vì còn ${activeBookingCount} booking đang hoạt động (chờ duyệt/đã xác nhận/đang diễn ra). Vui lòng hủy hoặc hoàn thành các booking trước.`);
    error.statusCode = 400;
    throw error;
  }

  const totalBookingCount = await db.Booking.count({ where: { memberId } });
  if (totalBookingCount > 0) {
    const error = new Error(`Không thể xóa hội viên này vì đã có ${totalBookingCount} booking trong lịch sử. Vui lòng sử dụng chức năng "Ngừng hoạt động" để deactivate member thay vì xóa.`);
    error.statusCode = 400;
    throw error;
  }

  const activePackageCount = await PackageActivation.count({
    where: {
      memberId,
      status: "active",
    },
  });

  if (activePackageCount > 0) {
    const error = new Error(`Không thể xóa hội viên này vì còn ${activePackageCount} gói tập đang hoạt động. Vui lòng hủy gói tập trước.`);
    error.statusCode = 400;
    throw error;
  }

  const packageActivations = await PackageActivation.findAll({
    where: { memberId },
    attributes: ["id"],
  });
  const packageActivationIds = packageActivations.map((pa) => pa.id);

  const transactionDeleteConditions = [{ memberId }];
  if (packageActivationIds.length > 0) {
    transactionDeleteConditions.push({
      packageActivationId: {
        [db.Sequelize.Op.in]: packageActivationIds,
      },
    });
  }

  await db.Transaction.destroy({
    where: {
      [db.Sequelize.Op.or]: transactionDeleteConditions,
    },
  });

  await PackageActivation.destroy({ where: { memberId } });
  await db.Booking.destroy({ where: { memberId } });
  await member.destroy();

  return { message: "Đã xóa hội viên thành công" };
};

/**
 * Toggle member status (active/inactive)
 */
const toggleMemberStatus = async (userId, memberId) => {
  console.log("=== toggleMemberStatus ===");
  console.log("userId:", userId, "memberId:", memberId);

  const t = await db.sequelize.transaction();

  try {

  // Get owner's gyms
  const myGymIds = await Gym.findAll({
    where: { ownerId: userId },
    attributes: ["id"],
    transaction: t,
  }).then((gyms) => gyms.map((g) => g.id));

  // Find member
  const member = await Member.findOne({
    where: {
      id: memberId,
      gymId: { [db.Sequelize.Op.in]: myGymIds },
    },
    transaction: t,
  });

  if (!member) {
    const error = new Error("Không tìm thấy hội viên hoặc bạn không có quyền");
    error.statusCode = 404;
    throw error;
  }

  // Toggle status
  const newStatus = member.status === "active" ? "inactive" : "active";
  const updateData = { status: newStatus };

  if (newStatus === "inactive") {
    // Thu hồi quyền tập ngay khi chuyển sang inactive.
    await PackageActivation.update(
      {
        status: "cancelled",
        sessionsRemaining: 0,
      },
      {
        where: {
          memberId,
          status: "active",
        },
        transaction: t,
      }
    );

    updateData.currentPackageId = null;
    updateData.packageActivationId = null;
    updateData.packageExpiryDate = null;
    updateData.sessionsRemaining = 0;
  }

  await member.update(updateData, { transaction: t });

  await t.commit();

  console.log("Updated member status:", member.status);

  const message = newStatus === "active"
    ? "Đã kích hoạt hội viên thành công" 
    : "Đã ngừng hoạt động hội viên và thu hồi quyền tập thành công";

  return { message, status: newStatus };
  } catch (error) {
    await t.rollback();
    throw error;
  }
};

export default {
  getAvailableUsers,
  createMember,
  getMyMembers,
  getMemberDetail,
  updateMember,
  deleteMember,
  toggleMemberStatus,
};
