import db from "../../models";
import bcrypt from "bcryptjs";

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

const toSafeUser = (user, member = null, gym = null, activation = null, latestMetric = null) => {
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
  };
};

const memberProfileService = {
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

    const member = await db.Member.findOne({
      where: { userId },
      raw: true,
    });

    let gym = null;
    let activation = null;
    let latestMetric = null;

    if (member) {
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
    }

    return toSafeUser(user, member, gym, activation, latestMetric);
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

      const nextEmail = String(payload.email || "").trim();
      const nextUsername = String(payload.username || "").trim();
      const nextPhone = String(payload.phone || "").trim();
      const nextAddress = String(payload.address || "").trim();
      const nextSex = normalizeSex(payload.sex);
      const nextAvatar = String(payload.avatar || "").trim();

      if (!nextEmail) {
        const err = new Error("Email là bắt buộc");
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

      if (nextAvatar) {
        user.avatar = nextAvatar;
      }

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

    if (newPassword.length < 6) {
      const err = new Error("Mật khẩu mới phải có ít nhất 6 ký tự");
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