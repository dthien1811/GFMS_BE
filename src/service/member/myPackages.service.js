import db from "../../models";

async function getMemberByUserId(userId) {
  return db.Member.findOne({ where: { userId } });
}

const memberMyPackageService = {
  async getMyPackages(userId) {
    const member = await getMemberByUserId(userId);
    if (!member) {
      const err = new Error("Không tìm thấy Member.");
      err.statusCode = 404;
      throw err;
    }

    // ✅ Lấy tất cả PackageActivation
    const activations = await db.PackageActivation.findAll({
      where: { memberId: member.id },
      include: [
        { model: db.Package, attributes: ["id", "name", "type", "sessions", "price", "durationDays"] },
        { model: db.Transaction, attributes: ["id", "transactionCode", "amount", "paymentMethod", "paymentStatus", "transactionDate", "description"] },
      ],
      order: [["createdAt", "DESC"]],
    });

    // ✅ Lấy các Transaction pending chưa có PackageActivation (PayOS chờ thanh toán)
    const pendingTransactions = await db.Transaction.findAll({
      where: {
        memberId: member.id,
        transactionType: "package_purchase",
        paymentStatus: "pending",
        packageActivationId: null, // Chưa có activation
      },
      include: [
        { model: db.Package, attributes: ["id", "name", "type", "sessions", "price", "durationDays"] },
      ],
      order: [["createdAt", "DESC"]],
    });

    // ✅ Map activations
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
    }));

    // ✅ Map pending transactions (chưa có activation)
    const pendingList = pendingTransactions.map((tx) => ({
      id: `pending-${tx.id}`, // Fake ID để phân biệt
      status: null, // Chưa có status vì chưa có activation
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
      },
    }));

    // ✅ Gộp và sắp xếp: pending trước, rồi đến activations
    return [...pendingList, ...activationList].sort((a, b) => {
      const aDate = a.Transaction?.transactionDate || a.Transaction?.createdAt || new Date(0);
      const bDate = b.Transaction?.transactionDate || b.Transaction?.createdAt || new Date(0);
      return new Date(bDate) - new Date(aDate);
    });
  },
};

export default memberMyPackageService;
