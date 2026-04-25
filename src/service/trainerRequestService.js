// src/service/trainerRequestService.js
class TrainerRequestService {
  constructor(models) {
    this.models = models;
  }

  // ===============================
  // Validate request payload (hard rules)
  // ===============================
  static _toYMD(value) {
    if (!value) return null;
    const s = String(value).trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (!Number.isInteger(y) || !Number.isInteger(mo) || !Number.isInteger(d)) return null;
    if (mo < 1 || mo > 12) return null;
    if (d < 1 || d > 31) return null;
    return s;
  }

  static _toHHmm(value) {
    if (!value) return null;
    const s = String(value).trim();
    const m = s.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
    if (!m) return null;
    return `${m[1]}:${m[2]}`;
  }

  static _ymdToDate(ymd) {
    const m = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  static _compareYmd(a, b) {
    // returns -1/0/1; null if invalid
    const da = this._ymdToDate(a);
    const db = this._ymdToDate(b);
    if (!da || !db || Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return null;
    const ta = da.getTime();
    const tb = db.getTime();
    return ta === tb ? 0 : ta < tb ? -1 : 1;
  }

  static _todayYmd() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  static _minutesNowLocal() {
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes();
  }

  static _hhmmToMinutes(hhmm) {
    const m = String(hhmm || "").match(/^([01]\d|2[0-3]):([0-5]\d)$/);
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
  }

  static _assertReason(reason) {
    const r = String(reason || "").trim();
    if (!r) {
      const err = new Error("Vui lòng nhập lý do.");
      err.statusCode = 400;
      throw err;
    }
    if (r.length > 1000) {
      const err = new Error("Lý do quá dài.");
      err.statusCode = 400;
      throw err;
    }
  }

  static _validateDataByType(normalizedType, data) {
    if (!data || typeof data !== "object") {
      const err = new Error("Thiếu dữ liệu đơn.");
      err.statusCode = 400;
      throw err;
    }

    const today = this._todayYmd();

    if (normalizedType === "leave") {
      const fromDate = this._toYMD(data.fromDate);
      const toDate = this._toYMD(data.toDate);
      if (!fromDate || !toDate) {
        const err = new Error("Ngày nghỉ không hợp lệ (định dạng yyyy-mm-dd).");
        err.statusCode = 400;
        throw err;
      }
      if (this._compareYmd(fromDate, toDate) === 1) {
        const err = new Error("Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.");
        err.statusCode = 400;
        throw err;
      }
      if (this._compareYmd(fromDate, today) === -1 || this._compareYmd(toDate, today) === -1) {
        const err = new Error("Không thể tạo đơn nghỉ phép cho ngày quá khứ.");
        err.statusCode = 400;
        throw err;
      }
      return { fromDate, toDate };
    }

    if (normalizedType === "overtime") {
      const date = this._toYMD(data.date);
      const fromTime = this._toHHmm(data.fromTime);
      const toTime = this._toHHmm(data.toTime);
      if (!date || !fromTime || !toTime) {
        const err = new Error("Ngày/giờ tăng ca không hợp lệ (yyyy-mm-dd, HH:mm).");
        err.statusCode = 400;
        throw err;
      }
      if (this._compareYmd(date, today) === -1) {
        const err = new Error("Không thể tạo đơn tăng ca cho ngày quá khứ.");
        err.statusCode = 400;
        throw err;
      }
      const fm = this._hhmmToMinutes(fromTime);
      const tm = this._hhmmToMinutes(toTime);
      if (fm === null || tm === null || fm >= tm) {
        const err = new Error("Giờ bắt đầu phải trước giờ kết thúc.");
        err.statusCode = 400;
        throw err;
      }
      // Nếu là hôm nay, không cho chọn khung giờ đã kết thúc.
      if (this._compareYmd(date, today) === 0) {
        const nowMin = this._minutesNowLocal();
        if (tm <= nowMin) {
          const err = new Error("Không thể tạo đơn tăng ca cho khung giờ đã qua.");
          err.statusCode = 400;
          throw err;
        }
      }
      return { date, fromTime, toTime };
    }

    // shift_change / transfer_branch: giữ nguyên (chưa có schema thống nhất)
    return data;
  }

  // ===============================
  // Create trainer request
  // ===============================
  async createTrainerRequest({ requesterId, requestType, reason, data }) {
    const { Request } = this.models;

    // dùng lowercase toàn bộ
    const allowedTypes = [
      "leave",
      "shift_change",
      "transfer_branch",
      "overtime",
    ];

    const normalizedType = String(requestType || "")
      .trim()
      .toLowerCase();

    if (!allowedTypes.includes(normalizedType)) {
      throw new Error(`Invalid request type: "${requestType}"`);
    }

    TrainerRequestService._assertReason(reason);
    const normalizedData = TrainerRequestService._validateDataByType(normalizedType, data);

    const row = await Request.create({
      requesterId,
      requestType: normalizedType,
      status: "pending",
      reason: String(reason || "").trim() || null,
      data: normalizedData || null,
    });

    try {
      const realtimeServiceModule = require("./realtime.service");
      const realtimeService = realtimeServiceModule.default || realtimeServiceModule;
      const { Trainer, Gym, User } = this.models;
      const trainer = await Trainer.findOne({
        where: { userId: requesterId },
        attributes: ["id", "gymId"],
      });
      if (trainer?.gymId) {
        const gym = await Gym.findByPk(trainer.gymId, { attributes: ["ownerId", "name"] });
        const ownerId = gym?.ownerId ? Number(gym.ownerId) : null;
        if (ownerId) {
          const requester = await User.findByPk(requesterId, { attributes: ["username", "email"] });
          const label = requester?.username || requester?.email || `PT #${trainer.id}`;
          const typeVi =
            {
              leave: "nghỉ phép",
              shift_change: "đổi ca",
              transfer_branch: "chuyển chi nhánh",
              overtime: "tăng ca",
            }[normalizedType] || normalizedType;
          await realtimeService.notifyUser(ownerId, {
            title: "Yêu cầu mới từ huấn luyện viên",
            message: `${label} gửi yêu cầu ${typeVi}.`,
            notificationType: "trainer_request",
            relatedType: "request",
            relatedId: row.id,
          });
          realtimeService.emitUser(ownerId, "request:changed", {
            requestId: row.id,
            action: "created",
          });
        }
      }
    } catch (e) {
      console.error("[trainerRequestService] notify owner:", e?.message || e);
    }

    return row;
  }

  // ===============================
  // Get my requests (filter)
  // ===============================
  async getMyRequests({ requesterId, status, requestType }) {
    const { Request, User } = this.models;

    const where = { requesterId };

    if (status) {
      where.status = String(status).trim().toLowerCase();
    }

    if (requestType) {
      where.requestType = String(requestType).trim().toLowerCase();
    }

    return Request.findAll({
      where,
      order: [["createdAt", "DESC"]],
      include: [
        {
          model: User,
          as: "requester",
          attributes: ["id", "username", "email"],
        },
        {
          model: User,
          as: "approver",
          attributes: ["id", "username", "email"],
        },
      ],
    });
  }

  // ===============================
  // Cancel request (only pending)
  // ===============================
  async cancelTrainerRequest({ requesterId, requestId }) {
    const { Request } = this.models;

    const request = await Request.findOne({
      where: { id: requestId, requesterId },
    });

    if (!request) {
      throw new Error("Request not found");
    }

    const currentStatus = String(request.status || "")
      .trim()
      .toLowerCase();

    if (currentStatus !== "pending") {
      throw new Error(
        `Only pending request can be cancelled (current: "${request.status}")`
      );
    }

    request.status = "CANCELLED";
    await request.save();

    return request;
  }
}

module.exports = TrainerRequestService;
