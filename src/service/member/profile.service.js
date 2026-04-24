import db from "../../models";
import bcrypt from "bcryptjs";
import {
  normalizeTrainerSpecializationIds,
  normalizeTrainerSpecializationsInput,
} from "../../constants/trainerSpecializations.js";
import realtimeService from "../realtime.service";
import membershipCardService from "./membershipCard.service";

const normalizeSex = (value) => {
  const v = String(value || "").trim().toLowerCase();
  if (["male", "female", "other"].includes(v)) return v;
  return "male";
};

const normalizeStatus = (value) => {
  const v = String(value || "").trim().toLowerCase();
  if (["active", "inactive", "suspended"].includes(v)) return v;
  return "active";
};


const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
const isValidPhone = (value) => !value || /^(\+84|0)\d{9,10}$/.test(String(value || "").replace(/\s+/g, ""));
const isStrongPassword = (value) => /^(?=.*[A-Za-z])(?=.*\d).{8,64}$/.test(String(value || ""));

const normalizeCertificateLinks = (input) => {
  const raw = Array.isArray(input)
    ? input
    : String(input || "")
        .split(/[\n,;]+/)
        .map((v) => v.trim())
        .filter(Boolean);

  const unique = [...new Set(raw)].slice(0, 10);
  for (const link of unique) {
    try {
      const u = new URL(link);
      if (!["http:", "https:"].includes(u.protocol)) {
        return { ok: false, message: `Link không hợp lệ: ${link}` };
      }
    } catch (_e) {
      return { ok: false, message: `Link không hợp lệ: ${link}` };
    }
  }

  return { ok: true, value: unique };
};

const toSafeUser = (user, member = null, gym = null, activation = null, latestMetric = null, membershipCard = null) => {
  return {
    id: user.id,
    email: user.email || "",
    username: user.username || "",
    phone: user.phone || "",
    address: user.address || "",
    sex: user.sex || "male",
    avatar: user.avatar || "",
    groupId: user.groupId,
    status: member?.status || user.status || "active",
    emailVerified: !!user.emailVerified,
    lastLogin: user.lastLogin || null,

    memberId: member?.id || null,
    memberCode: member?.membershipNumber || (member?.id ? `MEM${member.id}` : ""),
    joinDate: member?.joinDate || null,
    expiryDate: member?.expiryDate || null,
    fitnessGoal: member?.fitnessGoal || "",
    notes: member?.notes || "",
    currentBmi: member?.currentBmi ?? null,
    targetWeight: member?.targetWeight ?? null,
    bmiUpdatedAt: member?.bmiUpdatedAt || null,

    gym: gym
      ? {
          id: gym.id,
          name: gym.name,
          address: gym.address,
          phone: gym.phone,
          email: gym.email,
          images: gym.images,
        }
      : null,

    currentPackage: activation
      ? {
          id: activation.id,
          packageId: activation.packageId,
          status: activation.status,
          activationDate: activation.activationDate,
          expiryDate: activation.expiryDate,
          totalSessions: activation.totalSessions,
          sessionsUsed: activation.sessionsUsed,
          sessionsRemaining: activation.sessionsRemaining,
          pricePerSession: activation.pricePerSession,
          packageName: activation.Package?.name || "",
          packageType: activation.Package?.type || "",
        }
      : null,

    latestMetric: latestMetric
      ? {
          id: latestMetric.id,
          heightCm: latestMetric.heightCm,
          weightKg: latestMetric.weightKg,
          bmi: latestMetric.bmi,
          status: latestMetric.status,
          note: latestMetric.note,
          recordedAt: latestMetric.recordedAt,
        }
      : null,
    membershipCard: membershipCard
      ? {
          id: membershipCard.id,
          planCode: membershipCard.planCode,
          planMonths: membershipCard.planMonths,
          price: Number(membershipCard.price || 0),
          startDate: membershipCard.startDate,
          endDate: membershipCard.endDate,
          status: membershipCard.status,
        }
      : null,
  };
};

const memberProfileService = {
  async getMyBecomeTrainerRequests(userId) {
    const requests = await db.Request.findAll({
      where: {
        requesterId: userId,
        requestType: "BECOME_TRAINER",
      },
      order: [["createdAt", "DESC"]],
      raw: true,
    });

    const gymIds = [...new Set(
      requests
        .map((r) => Number(r?.data?.application?.gymId))
        .filter((id) => Number.isInteger(id) && id > 0)
    )];

    const gymMap = new Map();
    if (gymIds.length > 0) {
      const gyms = await db.Gym.findAll({
        where: { id: gymIds },
        attributes: ["id", "name"],
        raw: true,
      });
      gyms.forEach((g) => gymMap.set(Number(g.id), g.name));
    }

    return requests.map((request) => {
      const app = request?.data?.application || {};
      const gymId = Number(app.gymId);

      return {
        id: request.id,
        requestType: request.requestType,
        status: request.status,
        reason: request.reason || "",
        requestContent: request?.data?.content || "",
        reviewNote: request.approveNote || "",
        processedAt: request.processedAt || null,
        createdAt: request.createdAt || null,
        application: {
          gymId: Number.isInteger(gymId) && gymId > 0 ? gymId : null,
          gymName: Number.isInteger(gymId) && gymId > 0 ? (gymMap.get(gymId) || null) : null,
          specializations: Array.isArray(app.specializations) ? app.specializations.filter(Boolean) : [],
          certification: String(app.certification || "").trim() || null,
          certificationLinks: Array.isArray(app.certificationLinks) ? app.certificationLinks.filter(Boolean) : [],
          hourlyRate: Number(app.hourlyRate) > 0 ? Number(app.hourlyRate) : null,
        },
      };
    });
  },

  async createBecomeTrainerRequest(userId, payload = {}) {
    const reason = String(payload.reason || "").trim();
    const content = String(payload.content || "").trim();
    const application = payload?.application && typeof payload.application === "object"
      ? payload.application
      : {};

    if (!reason || reason.length < 10) {
      const err = new Error("Vui lòng nhập lý do từ 10 ký tự trở lên");
      err.statusCode = 400;
      throw err;
    }

    if (reason.length > 2000) {
      const err = new Error("Lý do tối đa 2000 ký tự");
      err.statusCode = 400;
      throw err;
    }

    if (content && content.length > 4000) {
      const err = new Error("Nội dung đơn tối đa 4000 ký tự");
      err.statusCode = 400;
      throw err;
    }

    const idsRaw = application.specializationIds ?? application.specialization_ids;
    const spec = Array.isArray(idsRaw) && idsRaw.length
      ? normalizeTrainerSpecializationIds(idsRaw)
      : normalizeTrainerSpecializationsInput(application.specializations);
    if (!spec.ok) {
      const err = new Error(spec.message);
      err.statusCode = 400;
      throw err;
    }

    const certLinks = normalizeCertificateLinks(application.certificationLinks);
    if (!certLinks.ok) {
      const err = new Error(certLinks.message);
      err.statusCode = 400;
      throw err;
    }

    const hourlyRateRaw = Number(application.hourlyRate);
    const hourlyRate =
      Number.isFinite(hourlyRateRaw) && hourlyRateRaw > 0 ? hourlyRateRaw : null;

    const gymId = Number(application.gymId);
    if (!Number.isInteger(gymId) || gymId <= 0) {
      const err = new Error("Vui lòng chọn phòng gym");
      err.statusCode = 400;
      throw err;
    }

    const gym = await db.Gym.findByPk(gymId, { raw: true });
    if (!gym) {
      const err = new Error("Phòng gym không tồn tại");
      err.statusCode = 400;
      throw err;
    }

    const certificateImageUrls = Array.isArray(application.certificateImageUrls)
      ? application.certificateImageUrls
          .map((v) => String(v || "").trim())
          .filter(Boolean)
          .slice(0, 10)
      : [];

    for (const url of certificateImageUrls) {
      try {
        const parsed = new URL(url);
        if (!["http:", "https:"].includes(parsed.protocol)) {
          const err = new Error(`URL ảnh chứng chỉ không hợp lệ: ${url}`);
          err.statusCode = 400;
          throw err;
        }
      } catch (_e) {
        const err = new Error(`URL ảnh chứng chỉ không hợp lệ: ${url}`);
        err.statusCode = 400;
        throw err;
      }
    }

    const user = await db.User.findOne({
      where: { id: userId },
      raw: true,
    });

    if (!user) {
      const err = new Error("Không tìm thấy người dùng");
      err.statusCode = 404;
      throw err;
    }

    if (Number(user.groupId) === 3) {
      const err = new Error("Bạn đã là huấn luyện viên");
      err.statusCode = 400;
      throw err;
    }

    const pendingRequest = await db.Request.findOne({
      where: {
        requesterId: userId,
        requestType: "BECOME_TRAINER",
        status: "PENDING",
      },
      order: [["createdAt", "DESC"]],
      raw: true,
    });

    if (pendingRequest) {
      const err = new Error("Bạn đã có đơn chờ duyệt trở thành huấn luyện viên");
      err.statusCode = 400;
      throw err;
    }

    const created = await db.Request.create({
      requesterId: userId,
      requestType: "BECOME_TRAINER",
      status: "PENDING",
      reason,
      data: {
        source: "member_profile",
        gymId,
        content: content || null,
        application: {
          gymId,
          specializations: spec.value,
          certification: String(application.certification || "").trim() || null,
          certificationLinks: certLinks.value,
          certificateImageUrls,
          hourlyRate,
        },
      },
    });

    const ownerGym = await db.Gym.findByPk(Number(gymId), {
      attributes: ["id", "name", "ownerId"],
    });

    if (ownerGym?.ownerId) {
      await realtimeService.notifyUser(ownerGym.ownerId, {
        title: "Có đơn đăng ký huấn luyện viên mới",
        message: `Có đơn mới gửi tới gym ${ownerGym.name}.`,
        notificationType: "trainer_request",
        relatedType: "request",
        relatedId: created.id,
      });
      realtimeService.emitUser(ownerGym.ownerId, "request:changed", {
        requestId: created.id,
        status: created.status,
        action: "created",
        requestType: created.requestType,
      });
    }

    return {
      id: created.id,
      requestType: created.requestType,
      status: created.status,
      reason: created.reason,
      requestContent: created?.data?.content || null,
      createdAt: created.createdAt,
    };
  },

  async getMyProfile(userId) {
    const user = await db.User.findOne({
      where: { id: userId },
      raw: true,
    });

    if (!user) {
      const err = new Error("Không tìm thấy người dùng");
      err.statusCode = 404;
      throw err;
    }

    let member = await db.Member.findOne({
      where: { userId },
      order: [["updatedAt", "DESC"], ["createdAt", "DESC"], ["id", "DESC"]],
      raw: true,
    });

    let gym = null;
    let activation = null;
    let latestMetric = null;
    let membershipCard = null;

    if (member) {
      const activeCardRow = await db.MembershipCard.findOne({
        where: { status: "active", endDate: { [db.Sequelize.Op.gte]: new Date() } },
        include: [{ model: db.Member, attributes: ["id", "gymId"], where: { userId }, required: true }],
        order: [["endDate", "DESC"], ["id", "DESC"]],
      });
      if (activeCardRow?.Member?.id) {
        member = await db.Member.findOne({ where: { id: activeCardRow.Member.id }, raw: true });
      }

      if (member.gymId) {
        gym = await db.Gym.findOne({
          where: { id: member.gymId },
          raw: true,
        });
      }

      activation = await db.PackageActivation.findOne({
        where: {
          memberId: member.id,
          status: "active",
        },
        include: [
          {
            model: db.Package,
            attributes: ["id", "name", "type", "sessions"],
          },
        ],
        order: [["createdAt", "DESC"]],
      });

      latestMetric = await db.MemberMetric.findOne({
        where: { memberId: member.id },
        order: [["recordedAt", "DESC"], ["id", "DESC"]],
        raw: true,
      });

      membershipCard = await membershipCardService.getMembershipCardSummary(member.id);
    }

    return toSafeUser(user, member, gym, activation, latestMetric, membershipCard);
  },

  async updateMyProfile(userId, payload) {
    const t = await db.sequelize.transaction();
    try {
      const user = await db.User.findOne({
        where: { id: userId },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (!user) {
        const err = new Error("Không tìm thấy người dùng");
        err.statusCode = 404;
        throw err;
      }

      const member = await db.Member.findOne({
        where: { userId },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      const nextEmail = String(payload.email ?? user.email ?? "").trim();
      const nextUsername = String(payload.username ?? user.username ?? "").trim();
      const nextPhone = String(payload.phone ?? user.phone ?? "").trim();
      const nextAddress = String(payload.address ?? user.address ?? "").trim();
      const nextSex = normalizeSex(payload.sex);
      const nextAvatar = String(payload.avatar ?? user.avatar ?? "").trim();

      if (!nextEmail) {
        const err = new Error("Email là bắt buộc");
        err.statusCode = 400;
        throw err;
      }

      if (!isValidEmail(nextEmail)) {
        const err = new Error("Email không đúng định dạng");
        err.statusCode = 400;
        throw err;
      }

      if (!nextUsername) {
        const err = new Error("Tên người dùng là bắt buộc");
        err.statusCode = 400;
        throw err;
      }

      const emailExist = await db.User.findOne({
        where: { email: nextEmail },
        transaction: t,
        raw: true,
      });

      if (emailExist && Number(emailExist.id) !== Number(userId)) {
        const err = new Error("Email đã tồn tại");
        err.statusCode = 400;
        throw err;
      }

      const usernameExist = await db.User.findOne({
        where: { username: nextUsername },
        transaction: t,
        raw: true,
      });

      if (usernameExist && Number(usernameExist.id) !== Number(userId)) {
        const err = new Error("Username đã tồn tại");
        err.statusCode = 400;
        throw err;
      }

      if (nextUsername.length < 2 || nextUsername.length > 100) {
        const err = new Error("Tên người dùng phải từ 2 đến 100 ký tự");
        err.statusCode = 400;
        throw err;
      }

      if (nextAddress.length > 255) {
        const err = new Error("Địa chỉ tối đa 255 ký tự");
        err.statusCode = 400;
        throw err;
      }

      if (!isValidPhone(nextPhone)) {
        const err = new Error("Số điện thoại không hợp lệ");
        err.statusCode = 400;
        throw err;
      }

      if (nextPhone) {
        const phoneExist = await db.User.findOne({
          where: { phone: nextPhone },
          transaction: t,
          raw: true,
        });

        if (phoneExist && Number(phoneExist.id) !== Number(userId)) {
          const err = new Error("Số điện thoại đã tồn tại");
          err.statusCode = 400;
          throw err;
        }
      }

      user.email = nextEmail;
      user.username = nextUsername;
      user.phone = nextPhone;
      user.address = nextAddress;
      user.sex = nextSex;

      user.avatar = nextAvatar;

      if (!user.status) {
        user.status = normalizeStatus(user.status);
      }

      await user.save({ transaction: t });

      await t.commit();

      return await this.getMyProfile(userId);
    } catch (e) {
      await t.rollback();
      throw e;
    }
  },

  async changeMyPassword(userId, payload) {
    const currentPassword = String(payload.currentPassword || "");
    const newPassword = String(payload.newPassword || "");
    const confirmPassword = String(payload.confirmPassword || "");

    if (!currentPassword || !newPassword || !confirmPassword) {
      const err = new Error("Thiếu thông tin đổi mật khẩu");
      err.statusCode = 400;
      throw err;
    }

    if (!isStrongPassword(newPassword)) {
      const err = new Error("Mật khẩu mới phải từ 8 ký tự và có ít nhất 1 chữ cái, 1 số");
      err.statusCode = 400;
      throw err;
    }

    if (newPassword !== confirmPassword) {
      const err = new Error("Xác nhận mật khẩu không khớp");
      err.statusCode = 400;
      throw err;
    }

    const t = await db.sequelize.transaction();
    try {
      const user = await db.User.findOne({
        where: { id: userId },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (!user) {
        const err = new Error("Không tìm thấy người dùng");
        err.statusCode = 404;
        throw err;
      }

      const isCorrect = bcrypt.compareSync(currentPassword, user.password || "");
      if (!isCorrect) {
        const err = new Error("Mật khẩu hiện tại không đúng");
        err.statusCode = 400;
        throw err;
      }

      const isSame = bcrypt.compareSync(newPassword, user.password || "");
      if (isSame) {
        const err = new Error("Mật khẩu mới không được trùng mật khẩu cũ");
        err.statusCode = 400;
        throw err;
      }

      const salt = bcrypt.genSaltSync(10);
      const hashed = bcrypt.hashSync(newPassword, salt);

      user.password = hashed;
      await user.save({ transaction: t });

      await t.commit();
      return true;
    } catch (e) {
      await t.rollback();
      throw e;
    }
  },
};

export default memberProfileService;