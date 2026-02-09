// src/service/member/myPackages.service.js
import db from "../../models";

async function getMembersByUserId(userId) {
  return db.Member.findAll({ where: { userId }, attributes: ["id", "gymId"] });
}

const memberMyPackageService = {
  async getMyPackageDetail(userId, activationId) {
  if (String(activationId).startsWith("pending-")) {
    const err = new Error("Giao dịch đang chờ thanh toán");
    err.statusCode = 400;
    throw err;
  }

  const activation = await db.PackageActivation.findOne({
    where: { id: activationId },
    include: [
      { model: db.Package },
      {
        model: db.Member,
        include: [
          { model: db.Gym },
          { model: db.User, attributes: ["id", "username", "email"] },
        ],
      },
      { model: db.Transaction },
    ],
  });

  if (!activation) {
    const err = new Error("Không tìm thấy gói");
    err.statusCode = 404;
    throw err;
  }

  if (activation.Member.userId !== userId) {
    const err = new Error("Không có quyền truy cập gói này");
    err.statusCode = 403;
    throw err;
  }

  return {
    id: activation.id,
    status: activation.status,
    activationDate: activation.activationDate,
    expiryDate: activation.expiryDate,
    sessionsTotal: activation.totalSessions,
    sessionsUsed: activation.sessionsUsed,
    sessionsRemaining: activation.sessionsRemaining,
    Package: activation.Package,
    Gym: activation.Member?.Gym,
    Transaction: activation.Transaction,
    Trainer: null, // 👈 đúng nghiệp vụ
  };
},



  async getMyPackages(userId) {
    const members = await getMembersByUserId(userId);
    if (!members || members.length === 0) {
      const err = new Error("Bạn chưa có membership ở gym nào (chưa mua gói).");
      err.statusCode = 404;
      throw err;
    }

    const memberIds = members.map((m) => m.id);

    // ✅ Lấy tất cả PackageActivation của tất cả memberIds
    const activations = await db.PackageActivation.findAll({
      where: { memberId: memberIds },
      include: [
        {
          model: db.Package,
          attributes: ["id", "name", "type", "sessions", "price", "durationDays", "gymId"],
        },
        {
          model: db.Transaction,
          attributes: ["id", "transactionCode", "amount", "paymentMethod", "paymentStatus", "transactionDate", "description", "gymId"],
        },
        {
          model: db.Member,
          attributes: ["id", "gymId"],
          include: [{ model: db.Gym, attributes: ["id", "name"] }],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    // ✅ Pending transactions (PayOS pending) của tất cả memberIds
    const pendingTransactions = await db.Transaction.findAll({
      where: {
        memberId: memberIds,
        transactionType: "package_purchase",
        paymentStatus: "pending",
        packageActivationId: null,
      },
      include: [
        { model: db.Package, attributes: ["id", "name", "type", "sessions", "price", "durationDays", "gymId"] },
        {
          model: db.Member,
          attributes: ["id", "gymId"],
          include: [{ model: db.Gym, attributes: ["id", "name"] }],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    const activationList = activations.map((a) => ({
      id: a.id,
      status: a.status,
      activationDate: a.activationDate,
      expiryDate: a.expiryDate,
      totalSessions: a.totalSessions,
      sessionsUsed: a.sessionsUsed,
      sessionsRemaining: a.sessionsRemaining,
      pricePerSession: a.pricePerSession,
      Package: a.Package,
      Transaction: a.Transaction,
      Member: a.Member,
      Gym: a.Member?.Gym,
    }));

    const pendingList = pendingTransactions.map((tx) => ({
      id: `pending-${tx.id}`,
      status: null,
      activationDate: null,
      expiryDate: null,
      totalSessions: tx.Package?.sessions || null,
      sessionsUsed: 0,
      sessionsRemaining: 0,
      pricePerSession: null,
      Package: tx.Package,
      Transaction: {
        id: tx.id,
        transactionCode: tx.transactionCode,
        amount: tx.amount,
        paymentMethod: tx.paymentMethod,
        paymentStatus: tx.paymentStatus,
        transactionDate: tx.transactionDate,
        description: tx.description,
        gymId: tx.gymId,
      },
      Member: tx.Member,
      Gym: tx.Member?.Gym,
    }));

    return [...pendingList, ...activationList].sort((a, b) => {
      const aDate = a.Transaction?.transactionDate || a.Transaction?.createdAt || new Date(0);
      const bDate = b.Transaction?.transactionDate || b.Transaction?.createdAt || new Date(0);
      return new Date(bDate) - new Date(aDate);
    });
  },
};

export default memberMyPackageService;
