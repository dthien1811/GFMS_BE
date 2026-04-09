import db from "../../models/index";
import realtimeService from "../realtime.service";

const { FranchiseRequest, User } = db;

const emitFranchiseChanged = (userIds = [], payload = {}) => {
  [...new Set((userIds || []).filter(Boolean).map(Number))].forEach((userId) => {
    realtimeService.emitUser(userId, "franchise:changed", payload);
  });
};

/**
 * Owner tạo yêu cầu nhượng quyền
 */
const createFranchiseRequest = async (userId, data) => {
  const {
    businessName,
    location,
    contactPerson,
    contactPhone,
    contactEmail,
    investmentAmount,
    businessPlan,
  } = data;

  // Validate required fields
  if (!businessName || !location || !contactPerson) {
    const error = new Error("Thiếu thông tin bắt buộc (businessName, location, contactPerson)");
    error.statusCode = 400;
    throw error;
  }

  // Kiểm tra user có tồn tại không
  const user = await User.findByPk(userId);
  if (!user) {
    const error = new Error("User không tồn tại");
    error.statusCode = 404;
    throw error;
  }

  // Tạo franchise request
  const franchiseRequest = await FranchiseRequest.create({
    requesterId: userId,
    businessName,
    location,
    contactPerson,
    contactPhone,
    contactEmail,
    investmentAmount,
    businessPlan,
    status: "pending",
  });

  try {
    const u = await User.findByPk(userId, { attributes: ["username", "email"] });
    const ownerLabel = u?.username || u?.email || `User #${userId}`;
    await realtimeService.notifyAdministrators({
      title: "Yêu cầu nhượng quyền mới",
      message: `Mã #${franchiseRequest.id} · ${businessName} · ${contactPerson} · Owner: ${ownerLabel}`,
      notificationType: "admin_franchise_request_submitted",
      relatedType: "franchise_request",
      relatedId: franchiseRequest.id,
    });
  } catch (e) {
    console.error("[owner.franchise] notifyAdministrators:", e?.message || e);
  }

  emitFranchiseChanged([userId], {
    requestId: franchiseRequest.id,
    status: franchiseRequest.status,
    action: "created",
  });

  return franchiseRequest;
};

/**
 * Owner xem danh sách franchise request của mình
 */
const getMyFranchiseRequests = async (userId, query = {}) => {
  const { page = 1, limit = 10, status, q } = query;

  const offset = (page - 1) * limit;

  const whereClause = { requesterId: userId };
  if (status) {
    whereClause.status = status;
  }
  if (q && q.trim()) {
    // Tìm kiếm theo tên doanh nghiệp, địa điểm, hoặc người liên hệ
    whereClause[db.Sequelize.Op.or] = [
      { businessName: { [db.Sequelize.Op.like]: `%${q.trim()}%` } },
      { location: { [db.Sequelize.Op.like]: `%${q.trim()}%` } },
      { contactPerson: { [db.Sequelize.Op.like]: `%${q.trim()}%` } },
    ];
  }

  const { rows, count } = await FranchiseRequest.findAndCountAll({
    where: whereClause,
    include: [
      {
        model: User,
        as: "requester",
        attributes: ["id", "username", "email"],
      },
      {
        model: User,
        as: "reviewer",
        attributes: ["id", "username", "email"],
      },
    ],
    limit: parseInt(limit),
    offset: parseInt(offset),
    order: [["createdAt", "DESC"]],
  });

  return {
    franchiseRequests: rows,
    pagination: {
      total: count,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(count / limit),
    },
  };
};

/**
 * Owner xem chi tiết một franchise request của mình
 */
const getMyFranchiseRequestDetail = async (userId, requestId) => {
  const franchiseRequest = await FranchiseRequest.findOne({
    where: {
      id: requestId,
      requesterId: userId, // Chỉ xem được request của chính mình
    },
    include: [
      {
        model: User,
        as: "requester",
        attributes: ["id", "username", "email"],
      },
      {
        model: User,
        as: "reviewer",
        attributes: ["id", "username", "email"],
      },
    ],
  });

  if (!franchiseRequest) {
    const error = new Error("Không tìm thấy franchise request hoặc bạn không có quyền xem");
    error.statusCode = 404;
    throw error;
  }

  return franchiseRequest;
};

/**
 * Owner cập nhật franchise request của mình (chỉ khi còn pending)
 */
const updateMyFranchiseRequest = async (userId, requestId, data) => {
  const franchiseRequest = await FranchiseRequest.findOne({
    where: {
      id: requestId,
      requesterId: userId,
    },
  });

  if (!franchiseRequest) {
    const error = new Error("Không tìm thấy franchise request hoặc bạn không có quyền cập nhật");
    error.statusCode = 404;
    throw error;
  }

  // Chỉ cho phép update khi status là pending
  if (franchiseRequest.status !== "pending") {
    const error = new Error(
      `Không thể cập nhật franchise request với status '${franchiseRequest.status}'`
    );
    error.statusCode = 400;
    throw error;
  }

  // Update các trường được phép
  const allowedFields = [
    "businessName",
    "location",
    "contactPerson",
    "contactPhone",
    "contactEmail",
    "investmentAmount",
    "businessPlan",
  ];

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      franchiseRequest[field] = data[field];
    }
  }

  await franchiseRequest.save();

  emitFranchiseChanged([userId], {
    requestId: franchiseRequest.id,
    status: franchiseRequest.status,
    action: "updated",
  });

  return franchiseRequest;
};

/**
 * Owner xóa franchise request của mình (chỉ khi còn pending)
 */
const deleteMyFranchiseRequest = async (userId, requestId) => {
  const franchiseRequest = await FranchiseRequest.findOne({
    where: {
      id: requestId,
      requesterId: userId,
    },
  });

  if (!franchiseRequest) {
    const error = new Error("Không tìm thấy franchise request hoặc bạn không có quyền xóa");
    error.statusCode = 404;
    throw error;
  }

  // Chỉ cho phép xóa khi status là pending
  if (franchiseRequest.status !== "pending") {
    const error = new Error(
      `Không thể xóa franchise request với status '${franchiseRequest.status}'`
    );
    error.statusCode = 400;
    throw error;
  }

  emitFranchiseChanged([userId], {
    requestId: franchiseRequest.id,
    status: franchiseRequest.status,
    action: "deleted",
  });

  await franchiseRequest.destroy();

  return { message: "Đã xóa franchise request thành công" };
};
export default {
  createFranchiseRequest,
  getMyFranchiseRequests,
  getMyFranchiseRequestDetail,
  updateMyFranchiseRequest,
  deleteMyFranchiseRequest,
};
