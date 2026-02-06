import db from "../../models";
import { Op } from "sequelize";
import ExcelJS from "exceljs";

const { Withdrawal, Trainer, User, Gym } = db;

const parsePaging = (query) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
};

const ensureOwnerGymIds = async (ownerUserId) => {
  const gyms = await Gym.findAll({
    where: { ownerId: ownerUserId },
    attributes: ["id"],
    raw: true,
  });
  return gyms.map((g) => g.id);
};

const ownerWithdrawalService = {
  async getWithdrawals(ownerUserId, query = {}) {
    const { page, limit, offset } = parsePaging(query);
    const { status } = query;

    const gymIds = await ensureOwnerGymIds(ownerUserId);
    if (gymIds.length === 0) {
      return { data: [], pagination: { total: 0, page, limit, totalPages: 0 } };
    }

    const where = {};
    if (status) where.status = status;

    const { rows, count } = await Withdrawal.findAndCountAll({
      where,
      include: [
        {
          model: Trainer,
          required: true,
          attributes: ["id", "gymId"],
          where: { gymId: { [Op.in]: gymIds } },
          include: [{ model: User, attributes: ["id", "username", "email", "phone"], required: false }],
        },
      ],
      order: [["createdAt", "DESC"]],
      limit,
      offset,
      distinct: true,
    });

    return {
      data: rows,
      pagination: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit),
      },
    };
  },

  async exportWithdrawals(ownerUserId, query = {}) {
    const { status } = query;
    const gymIds = await ensureOwnerGymIds(ownerUserId);
    if (gymIds.length === 0) {
      return { buffer: Buffer.from(""), contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", filename: "withdrawals.xlsx" };
    }

    const where = {};
    if (status) where.status = status;

    const rows = await Withdrawal.findAll({
      where,
      include: [
        {
          model: Trainer,
          required: true,
          attributes: ["id", "gymId"],
          where: { gymId: { [Op.in]: gymIds } },
          include: [{ model: User, attributes: ["id", "username", "email", "phone"], required: false }],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Withdrawals");
    sheet.columns = [
      { header: "PT", key: "trainer", width: 20 },
      { header: "Email", key: "email", width: 24 },
      { header: "So tien", key: "amount", width: 14 },
      { header: "Phuong thuc", key: "method", width: 14 },
      { header: "Tai khoan", key: "account", width: 32 },
      { header: "Trang thai", key: "status", width: 12 },
      { header: "Ngay yeu cau", key: "createdAt", width: 16 },
    ];

    rows.forEach((w) => {
      let account = {};
      try {
        account = w.accountInfo ? JSON.parse(w.accountInfo) : {};
      } catch {
        account = {};
      }
      sheet.addRow({
        trainer: w.Trainer?.User?.username || "N/A",
        email: w.Trainer?.User?.email || "N/A",
        amount: Number(w.amount || 0),
        method: w.withdrawalMethod || "N/A",
        account:
          w.withdrawalMethod === "bank_transfer"
            ? `${account.bankName || ""} ${account.accountNumber || ""} ${account.accountHolder || ""}`.trim()
            : w.withdrawalMethod || "N/A",
        status: w.status || "pending",
        createdAt: w.createdAt ? new Date(w.createdAt).toLocaleDateString("vi-VN") : "N/A",
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return { buffer, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", filename: "withdrawals.xlsx" };
  },

  async approveWithdrawal(ownerUserId, id) {
    const gymIds = await ensureOwnerGymIds(ownerUserId);
    const withdrawal = await Withdrawal.findByPk(id, {
      include: [{ model: Trainer, attributes: ["id", "gymId", "pendingCommission"] }],
    });
    if (!withdrawal || !withdrawal.Trainer || !gymIds.includes(withdrawal.Trainer.gymId)) {
      const err = new Error("Không tìm thấy yêu cầu hoặc bạn không có quyền.");
      err.statusCode = 404;
      throw err;
    }
    if (withdrawal.status === "completed") {
      const err = new Error("Yêu cầu đã được chi trả.");
      err.statusCode = 400;
      throw err;
    }

    const pending = Number(withdrawal.Trainer.pendingCommission || 0);
    const amount = Number(withdrawal.amount || 0);
    if (amount > pending) {
      const err = new Error("Số tiền vượt quá hoa hồng đang chờ.");
      err.statusCode = 400;
      throw err;
    }

    await withdrawal.update({
      status: "completed",
      processedBy: ownerUserId,
      processedDate: new Date(),
    });

    await withdrawal.Trainer.update({
      pendingCommission: Math.max(0, pending - amount),
      lastPayoutDate: new Date(),
    });

    return withdrawal;
  },

  async rejectWithdrawal(ownerUserId, id, reason = "") {
    const gymIds = await ensureOwnerGymIds(ownerUserId);
    const withdrawal = await Withdrawal.findByPk(id, {
      include: [{ model: Trainer, attributes: ["id", "gymId"] }],
    });
    if (!withdrawal || !withdrawal.Trainer || !gymIds.includes(withdrawal.Trainer.gymId)) {
      const err = new Error("Không tìm thấy yêu cầu hoặc bạn không có quyền.");
      err.statusCode = 404;
      throw err;
    }
    if (withdrawal.status === "completed") {
      const err = new Error("Yêu cầu đã được chi trả.");
      err.statusCode = 400;
      throw err;
    }

    await withdrawal.update({
      status: "rejected",
      processedBy: ownerUserId,
      processedDate: new Date(),
      notes: reason || withdrawal.notes,
    });

    return withdrawal;
  },
};

export default ownerWithdrawalService;
