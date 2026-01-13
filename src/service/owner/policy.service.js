import db from "../../models";
import { Op } from "sequelize";

const Policy = db.Policy;
const Gym = db.Gym;

const POLICY_TYPE = "trainer_share";

// ===== Helpers =====
async function getOwnerGymIds(ownerId) {
  const gyms = await Gym.findAll({
    where: { ownerId },
    attributes: ["id"],
  });
  return gyms.map((g) => g.id);
}

function assertNumber(v, name) {
  const n = Number(v);
  if (Number.isNaN(n)) {
    const err = new Error(`${name} must be a number`);
    err.statusCode = 400;
    throw err;
  }
  return n;
}

function validateTrainerShareValue(value) {
  // value là JSON flexible, nhưng UC này chuẩn hoá các field dưới
  const v = value || {};

  // commissionSplit: 0..1
  if (v.commissionSplit != null) {
    const n = assertNumber(v.commissionSplit, "commissionSplit");
    if (n < 0 || n > 1) {
      const err = new Error("commissionSplit must be between 0 and 1");
      err.statusCode = 400;
      throw err;
    }
  }

  // maxHoursPerWeek: >= 0
  if (v.maxHoursPerWeek != null) {
    const n = assertNumber(v.maxHoursPerWeek, "maxHoursPerWeek");
    if (n < 0) {
      const err = new Error("maxHoursPerWeek must be >= 0");
      err.statusCode = 400;
      throw err;
    }
  }

  // cancelBeforeHours: >= 0
  if (v.cancelBeforeHours != null) {
    const n = assertNumber(v.cancelBeforeHours, "cancelBeforeHours");
    if (n < 0) {
      const err = new Error("cancelBeforeHours must be >= 0");
      err.statusCode = 400;
      throw err;
    }
  }

  // cancellationFeeRate: 0..1 (tỉ lệ phí huỷ)
  if (v.cancellationFeeRate != null) {
    const n = assertNumber(v.cancellationFeeRate, "cancellationFeeRate");
    if (n < 0 || n > 1) {
      const err = new Error("cancellationFeeRate must be between 0 and 1");
      err.statusCode = 400;
      throw err;
    }
  }

  // allowCancel: boolean
  if (v.allowCancel != null && typeof v.allowCancel !== "boolean") {
    const err = new Error("allowCancel must be boolean");
    err.statusCode = 400;
    throw err;
  }

  return {
    commissionSplit: v.commissionSplit ?? 0.7, // default giống dữ liệu bạn đang có
    maxHoursPerWeek: v.maxHoursPerWeek ?? 20,
    cancelBeforeHours: v.cancelBeforeHours ?? 24,
    cancellationFeeRate: v.cancellationFeeRate ?? 0.2,
    allowCancel: v.allowCancel ?? true,
    note: v.note ?? "",
  };
}

function assertOwnerGymAccess(gymIds, gymId) {
  const id = Number(gymId);
  if (!id || Number.isNaN(id)) {
    const err = new Error("gymId is required and must be number");
    err.statusCode = 400;
    throw err;
  }
  if (!gymIds.includes(id)) {
    const err = new Error("Gym không thuộc quyền quản lý");
    err.statusCode = 403;
    throw err;
  }
  return id;
}

async function assertPolicyAccessForOwner(gymIds, policy) {
  // Owner có thể xem policy system (gymId null) và policy gym thuộc owner
  if (!policy) {
    const err = new Error("Policy not found");
    err.statusCode = 404;
    throw err;
  }
  if (policy.gymId == null) return true; // system policy
  if (!gymIds.includes(policy.gymId)) {
    const err = new Error("Forbidden");
    err.statusCode = 403;
    throw err;
  }
  return true;
}

// ===== Service =====
const ownerPolicyService = {
  /**
   * List policies trainer_share mà owner có quyền thấy:
   * - system (gymId null) + gym policy (gymId thuộc owner)
   */
  async listTrainerSharePolicies(ownerId, { gymId, includeInactive = true } = {}) {
    const gymIds = await getOwnerGymIds(ownerId);

    // filter gymId nếu truyền vào
    let gymFilterIds = gymIds;
    if (gymId != null) {
      const gid = assertOwnerGymAccess(gymIds, gymId);
      gymFilterIds = [gid];
    }

    const where = {
      policyType: POLICY_TYPE,
      [Op.or]: [{ gymId: null }, { gymId: { [Op.in]: gymFilterIds } }],
    };

    if (!includeInactive) where.isActive = true;

    const rows = await Policy.findAll({
      where,
      order: [["gymId", "ASC"], ["isActive", "DESC"], ["createdAt", "DESC"]],
    });

    return rows;
  },

  /**
   * Get effective policy cho 1 gym:
   * - ưu tiên: policy gymId=... && isActive=1 && (effectiveFrom/effectiveTo valid)
   * - fallback: policy system isActive=1
   */
  async getEffectiveTrainerSharePolicy(ownerId, gymId) {
    const gymIds = await getOwnerGymIds(ownerId);
    const gid = assertOwnerGymAccess(gymIds, gymId);

    const now = new Date();

    const gymPolicy = await Policy.findOne({
      where: {
        policyType: POLICY_TYPE,
        gymId: gid,
        isActive: true,
        [Op.and]: [
          { [Op.or]: [{ effectiveFrom: null }, { effectiveFrom: { [Op.lte]: now } }] },
          { [Op.or]: [{ effectiveTo: null }, { effectiveTo: { [Op.gte]: now } }] },
        ],
      },
      order: [["createdAt", "DESC"]],
    });

    if (gymPolicy) return gymPolicy;

    const systemPolicy = await Policy.findOne({
      where: {
        policyType: POLICY_TYPE,
        gymId: null,
        isActive: true,
        [Op.and]: [
          { [Op.or]: [{ effectiveFrom: null }, { effectiveFrom: { [Op.lte]: now } }] },
          { [Op.or]: [{ effectiveTo: null }, { effectiveTo: { [Op.gte]: now } }] },
        ],
      },
      order: [["createdAt", "DESC"]],
    });

    return systemPolicy; // có thể null nếu DB chưa có
  },

  async getPolicyById(ownerId, id) {
    const gymIds = await getOwnerGymIds(ownerId);
    const policy = await Policy.findByPk(id);
    await assertPolicyAccessForOwner(gymIds, policy);
    return policy;
  },

  /**
   * Create policy gym-specific (trainer_share)
   * Nếu setActive=true -> auto deactivate các policy trainer_share khác của cùng gym
   */
  async createTrainerSharePolicy(ownerId, payload) {
    const gymIds = await getOwnerGymIds(ownerId);

    const gid = assertOwnerGymAccess(gymIds, payload.gymId);

    const value = validateTrainerShareValue(payload.value);

    const isActive = payload.isActive ?? true;
    const effectiveFrom = payload.effectiveFrom ?? null;
    const effectiveTo = payload.effectiveTo ?? null;

    const t = await db.sequelize.transaction();
    try {
      if (isActive) {
        await Policy.update(
          { isActive: false },
          {
            where: { policyType: POLICY_TYPE, gymId: gid, isActive: true },
            transaction: t,
          }
        );
      }

      const created = await Policy.create(
        {
          policyType: POLICY_TYPE,
          name: payload.name || "Trainer Share Policy",
          description: payload.description || "Policy for trainer sharing",
          value,
          isActive,
          appliesTo: "gym",
          gymId: gid,
          effectiveFrom,
          effectiveTo,
        },
        { transaction: t }
      );

      await t.commit();
      return created;
    } catch (e) {
      await t.rollback();
      throw e;
    }
  },

  /**
   * Update policy (chỉ policy gym thuộc owner; không cho update system policy ở owner)
   */
  async updateTrainerSharePolicy(ownerId, id, payload) {
    const gymIds = await getOwnerGymIds(ownerId);
    const policy = await Policy.findByPk(id);
    await assertPolicyAccessForOwner(gymIds, policy);

    if (policy.gymId == null) {
      const err = new Error("Owner không được sửa system policy");
      err.statusCode = 403;
      throw err;
    }

    // validate value nếu có
    let nextValue = policy.value;
    if (payload.value != null) nextValue = validateTrainerShareValue(payload.value);

    const patch = {};
    if (payload.name != null) patch.name = payload.name;
    if (payload.description != null) patch.description = payload.description;
    if (payload.effectiveFrom !== undefined) patch.effectiveFrom = payload.effectiveFrom;
    if (payload.effectiveTo !== undefined) patch.effectiveTo = payload.effectiveTo;
    if (payload.isActive !== undefined) patch.isActive = !!payload.isActive;
    if (payload.value != null) patch.value = nextValue;

    const t = await db.sequelize.transaction();
    try {
      // nếu bật active -> tắt các policy khác cùng gym
      if (patch.isActive === true) {
        await Policy.update(
          { isActive: false },
          {
            where: {
              policyType: POLICY_TYPE,
              gymId: policy.gymId,
              isActive: true,
              id: { [Op.ne]: policy.id },
            },
            transaction: t,
          }
        );
      }

      await policy.update(patch, { transaction: t });
      await t.commit();
      return policy;
    } catch (e) {
      await t.rollback();
      throw e;
    }
  },

  async toggleActive(ownerId, id) {
    const gymIds = await getOwnerGymIds(ownerId);
    const policy = await Policy.findByPk(id);
    await assertPolicyAccessForOwner(gymIds, policy);

    if (policy.gymId == null) {
      const err = new Error("Owner không được toggle system policy");
      err.statusCode = 403;
      throw err;
    }

    const t = await db.sequelize.transaction();
    try {
      const next = !policy.isActive;

      if (next) {
        await Policy.update(
          { isActive: false },
          {
            where: {
              policyType: POLICY_TYPE,
              gymId: policy.gymId,
              isActive: true,
              id: { [Op.ne]: policy.id },
            },
            transaction: t,
          }
        );
      }

      await policy.update({ isActive: next }, { transaction: t });
      await t.commit();
      return policy;
    } catch (e) {
      await t.rollback();
      throw e;
    }
  },

  async deletePolicy(ownerId, id) {
    const gymIds = await getOwnerGymIds(ownerId);
    const policy = await Policy.findByPk(id);
    await assertPolicyAccessForOwner(gymIds, policy);

    if (policy.gymId == null) {
      const err = new Error("Owner không được xoá system policy");
      err.statusCode = 403;
      throw err;
    }

    await policy.destroy();
    return true;
  },
};

export default ownerPolicyService;
