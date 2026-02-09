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
    currentPackageId: packageId && packageId !== "" ? packageId : null,
    membershipNumber,
    status: "active",
    joinDate: new Date(),
    sessionsRemaining: 0, // Mặc định 0, sẽ được cập nhật nếu có gói
  });

  // Nếu có chọn gói, kích hoạt gói luôn
  if (packageId && packageId !== "") {
    const packageData = await Package.findOne({
      where: {
        id: packageId,
        gymId: gymId,
        isActive: true,
      },
    });

    if (packageData) {
      // Tính ngày hết hạn
      let expiryDate = null;
      if (packageData.durationDays && packageData.durationDays > 0) {
        expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + packageData.durationDays);
      }

      // Tạo transaction
      const transaction = await db.Transaction.create({
        memberId: newMember.id,
        gymId: gymId,
        packageId: packageData.id,
        amount: packageData.price,
        transactionType: "package_purchase",
        paymentStatus: "completed",
        paymentMethod: "cash",
        transactionCode: `OWNER-NEW-${Date.now()}-${newMember.id}`,
        description: `Kích hoạt gói ${packageData.name} khi tạo member bởi Owner`,
        transactionDate: new Date(),
        processedBy: userId,
      });

      // Tạo PackageActivation
      const activation = await PackageActivation.create({
        memberId: newMember.id,
        packageId: packageData.id,
        transactionId: transaction.id,
        activationDate: new Date(),
        expiryDate: expiryDate,
        totalSessions: packageData.sessions,
        sessionsUsed: 0,
        sessionsRemaining: packageData.sessions,
        pricePerSession: packageData.pricePerSession || packageData.price / packageData.sessions,
        status: "active",
        notes: "Kích hoạt khi tạo member bởi Owner",
      });

      // Cập nhật member với packageActivationId và expiryDate
      await newMember.update({
        packageActivationId: activation.id,
        packageExpiryDate: expiryDate,
        sessionsRemaining: packageData.sessions,
      });

      // Cập nhật transaction với packageActivationId
      await transaction.update({ packageActivationId: activation.id });
    }
  }

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
    updateData.currentPackageId = currentPackageId || null;
    // Nếu chọn gói mới (không null), tự động set status = active
    if (currentPackageId && currentPackageId !== "" && currentPackageId !== null) {
      updateData.status = "active";
    }
  }
  if (status) updateData.status = status;

  await member.update(updateData);

  // Nếu xóa gói (set currentPackageId = null), tự động cancel các gói đang active
  if (currentPackageId === "" || currentPackageId === null) {
    await PackageActivation.update(
      { status: "cancelled" },
      {
        where: {
          memberId,
          status: "active",
        },
      }
    );
    console.log("Auto-cancelled active packages for member:", memberId);
  }

  // Load lại với relations
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

  // Kiểm tra xem member có booking đang hoạt động không (pending, confirmed, in_progress)
  const activeBookingCount = await db.Booking.count({
    where: { 
      memberId,
      status: {
        [db.Sequelize.Op.in]: ['pending', 'confirmed', 'in_progress']
      }
    }
  });

  if (activeBookingCount > 0) {
    const error = new Error(`Không thể xóa hội viên này vì còn ${activeBookingCount} booking đang hoạt động (chờ duyệt/đã xác nhận/đang diễn ra). Vui lòng hủy hoặc hoàn thành các booking trước.`);
    error.statusCode = 400;
    throw error;
  }

  // Kiểm tra tất cả booking (kể cả đã kết thúc)
  const totalBookingCount = await db.Booking.count({
    where: { memberId }
  });

  if (totalBookingCount > 0) {
    const error = new Error(`Không thể xóa hội viên này vì đã có ${totalBookingCount} booking trong lịch sử. Vui lòng sử dụng chức năng "Ngừng hoạt động" để deactivate member thay vì xóa.`);
    error.statusCode = 400;
    throw error;
  }

  // Chỉ kiểm tra package activation đang ACTIVE
  const activePackageCount = await PackageActivation.count({
    where: { 
      memberId,
      status: 'active'
    }
  });

  if (activePackageCount > 0) {
    const error = new Error(`Không thể xóa hội viên này vì còn ${activePackageCount} gói tập đang hoạt động. Vui lòng hủy gói tập trước.`);
    error.statusCode = 400;
    throw error;
  }

  // Lấy tất cả PackageActivation của member
  const packageActivations = await PackageActivation.findAll({
    where: { memberId },
    attributes: ['id']
  });
  const packageActivationIds = packageActivations.map(pa => pa.id);

  // Bước 1: Xóa tất cả Transaction liên quan đến member (cả qua memberId và packageActivationId)
  const transactionDeleteConditions = [
    { memberId }
  ];
  
  if (packageActivationIds.length > 0) {
    transactionDeleteConditions.push({
      packageActivationId: {
        [db.Sequelize.Op.in]: packageActivationIds
      }
    });
  }

  const deletedTransactions = await db.Transaction.destroy({
    where: {
      [db.Sequelize.Op.or]: transactionDeleteConditions
    }
  });
  console.log(`Đã xóa ${deletedTransactions} transaction của member ${memberId}`);

  // Bước 2: Xóa tất cả PackageActivation của member
  const deletedPackages = await PackageActivation.destroy({
    where: { memberId }
  });
  console.log(`Đã xóa ${deletedPackages} package activation của member ${memberId}`);

  // Bước 3: Xóa tất cả Booking của member
  const deletedBookings = await db.Booking.destroy({
    where: { memberId }
  });
  console.log(`Đã xóa ${deletedBookings} booking của member ${memberId}`);

  // Bước 4: Xóa member
  await member.destroy();

  return { message: "Đã xóa hội viên thành công" };
};

/**
 * Owner gia hạn gói cho member
 */
const renewMemberPackage = async (userId, memberId, packageId) => {
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
    include: [
      { model: Gym, attributes: ["id", "name"] },
      { model: User, attributes: ["id", "username", "email"] },
    ],
  });

  if (!member) {
    const error = new Error("Không tìm thấy member hoặc bạn không có quyền");
    error.statusCode = 404;
    throw error;
  }

  // Kiểm tra package có thuộc gym không
  const packageData = await Package.findOne({
    where: {
      id: packageId,
      gymId: member.gymId,
      isActive: true,
    },
    include: [
      { model: db.Trainer, attributes: ["id"], include: [{ model: User, attributes: ["username"] }], required: false }
    ]
  });

  if (!packageData) {
    const error = new Error("Không tìm thấy gói hoặc gói không khả dụng");
    error.statusCode = 404;
    throw error;
  }

  console.log(`Mua gói: ${packageData.name}, Type: ${packageData.packageType}, TrainerId: ${packageData.trainerId}`);

  // Xử lý khác nhau cho Membership vs Personal Training
  const isMembership = packageData.packageType === 'membership';
  const isPersonalTraining = packageData.packageType === 'personal_training';

  // Nếu là membership, expire membership cũ
  if (isMembership) {
    await PackageActivation.update(
      { status: 'expired', notes: 'Thay thế bởi membership mới' },
      {
        where: {
          memberId: member.id,
          status: 'active'
        },
        include: [{
          model: Package,
          where: { packageType: 'membership' }
        }]
      }
    );
    console.log(`Đã expire membership cũ của member ${memberId}`);
  }

  // Tính ngày hết hạn
  let expiryDate = null;
  if (packageData.durationDays && packageData.durationDays > 0) {
    expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + packageData.durationDays);
  }

  // Tạo transaction
  const transaction = await db.Transaction.create({
    memberId: member.id,
    gymId: member.gymId,
    packageId: packageData.id,
    amount: packageData.price,
    transactionType: "package_purchase",
    paymentStatus: "completed",
    paymentMethod: "cash",
    transactionCode: `OWNER-${isMembership ? 'MEMBERSHIP' : 'PT'}-${Date.now()}-${member.id}`,
    description: `Mua ${isMembership ? 'Membership' : 'gói PT'} ${packageData.name}${isPersonalTraining ? ` với PT ${packageData.Trainer?.User?.username || packageData.trainerId}` : ''} bởi Owner`,
    transactionDate: new Date(),
    processedBy: userId,
  });

  // Tạo PackageActivation mới
  const newActivation = await PackageActivation.create({
    memberId: member.id,
    packageId: packageData.id,
    transactionId: transaction.id,
    activationDate: new Date(),
    expiryDate: expiryDate,
    totalSessions: packageData.sessions || 0,
    sessionsUsed: 0,
    sessionsRemaining: packageData.sessions || 0,
    pricePerSession: packageData.pricePerSession || (packageData.sessions > 0 ? packageData.price / packageData.sessions : 0),
    status: "active",
    notes: `${isMembership ? 'Membership' : 'Gói PT'} kích hoạt bởi Owner`,
  });

  // Chỉ cập nhật currentPackageId nếu là membership
  const memberUpdateData = { status: "active" };
  if (isMembership) {
    memberUpdateData.currentPackageId = packageData.id;
    memberUpdateData.packageExpiryDate = expiryDate;
  }
  
  await member.update(memberUpdateData);

  // Load lại activation với relations
  const result = await PackageActivation.findByPk(newActivation.id, {
    include: [
      { model: Package, attributes: ["id", "name", "price", "durationDays", "sessions", "packageType", "trainerId"] },
      { model: db.Transaction, attributes: ["id", "transactionCode", "amount", "transactionType"] },
    ],
  });

  return {
    activation: result,
    member: {
      id: member.id,
      membershipNumber: member.membershipNumber,
      User: member.User,
    },
    message: `Đã ${isMembership ? 'kích hoạt membership' : 'mua gói PT'} thành công`,
  };
};

/**
 * Toggle member status (active/inactive)
 */
const toggleMemberStatus = async (userId, memberId) => {
  console.log("=== toggleMemberStatus ===");
  console.log("userId:", userId, "memberId:", memberId);

  // Get owner's gyms
  const myGymIds = await Gym.findAll({
    where: { ownerId: userId },
    attributes: ["id"],
  }).then((gyms) => gyms.map((g) => g.id));

  // Find member
  const member = await Member.findOne({
    where: {
      id: memberId,
      gymId: { [db.Sequelize.Op.in]: myGymIds },
    },
  });

  if (!member) {
    const error = new Error("Không tìm thấy hội viên hoặc bạn không có quyền");
    error.statusCode = 404;
    throw error;
  }

  // If trying to deactivate, check for active package
  if (member.status === "active") {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const activePackages = await PackageActivation.findAll({
      where: {
        memberId,
        status: "active",
        expiryDate: { [db.Sequelize.Op.gte]: today },
      },
      include: [{ model: Package, attributes: ['name'] }],
    });

    console.log("Active packages for member:", activePackages.length, activePackages.map(p => ({ id: p.id, status: p.status, expiryDate: p.expiryDate, package: p.Package?.name })));

    if (activePackages.length > 0) {
      const error = new Error("Không thể vô hiệu hóa! Hội viên còn gói tập đang hoạt động.");
      error.statusCode = 400;
      throw error;
    }
  }

  // Toggle status
  const newStatus = member.status === "active" ? "inactive" : "active";
  member.status = newStatus;
  await member.save();

  console.log("Updated member status:", member.status);

  const message = member.status === "active"
    ? "Đã kích hoạt hội viên thành công" 
    : "Đã vô hiệu hóa hội viên thành công";

  return { message, status: member.status };
};

export default {
  getAvailableUsers,
  createMember,
  getMyMembers,
  getMemberDetail,
  updateMember,
  deleteMember,
  renewMemberPackage,
  toggleMemberStatus,
};
