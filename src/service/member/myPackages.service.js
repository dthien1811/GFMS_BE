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

    const activations = await db.PackageActivation.findAll({
      where: { memberId: member.id },
      include: [
        { model: db.Package, attributes: ["id", "name", "type", "sessions", "price", "durationDays"] },
        { model: db.Transaction, attributes: ["id", "transactionCode", "amount", "paymentMethod", "paymentStatus", "transactionDate", "description"] },
      ],
      order: [["createdAt", "DESC"]],
    });

    return activations.map((a) => ({
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
  },
};

export default memberMyPackageService;
