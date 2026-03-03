// src/service/adminTrainerShareOverrideService.js
"use strict";

const { Op } = require("sequelize");

function httpError(status, message, extra = {}) {
  const err = new Error(message);
  err.status = status;
  Object.assign(err, extra);
  return err;
}

function isValidSplit(x) {
  return typeof x === "number" && !Number.isNaN(x) && x > 0 && x < 1;
}

function toDateOrNull(v) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/**
 * OVERLAP rule (chuẩn):
 * [aFrom, aTo) overlap [bFrom, bTo) khi:
 * aFrom < bTo AND aTo > bFrom
 */
function buildOverlapWhere({ trainerShareId, effectiveFrom, effectiveTo, excludeId }) {
  const where = {
    trainerShareId,
    status: "APPROVED",
    isActive: true,
    effectiveFrom: { [Op.lt]: effectiveTo },
    effectiveTo: { [Op.gt]: effectiveFrom },
  };
  if (excludeId) where.id = { [Op.ne]: excludeId };
  return where;
}

/**
 * Lấy models theo project bạn.
 * Bạn chỉnh path require cho đúng (đây là pattern phổ biến Sequelize).
 */
function getModels(db) {
  // db = require("../models") thường có db.sequelize + db.ModelName
  const TrainerShare = db.TrainerShare || db.trainershare || db.TrainerShareModel;
  const TrainerShareOverride = db.TrainerShareOverride || db.trainershareoverride || db.TrainerShareOverrideModel;
  const TrainerShareOverrideAudit =
    db.TrainerShareOverrideAudit || db.trainershareoverrideaudit || db.TrainerShareOverrideAuditModel;

  if (!TrainerShare || !TrainerShareOverride || !TrainerShareOverrideAudit) {
    throw httpError(
      500,
      "Model mapping error: thiếu TrainerShare/TrainerShareOverride/TrainerShareOverrideAudit. Hãy chỉnh getModels() cho đúng project."
    );
  }

  return { TrainerShare, TrainerShareOverride, TrainerShareOverrideAudit };
}

async function createAudit({ db, overrideId, action, oldValue, newValue, actor, transaction = null }) {
  const { TrainerShareOverrideAudit } = getModels(db);

  // hardening: normalize
  const oid = overrideId ? Number(overrideId) : null;
  if (!oid) throw httpError(400, "overrideId không hợp lệ");

  return await TrainerShareOverrideAudit.create(
    {
      overrideId: oid,
      // DB column is STRING(32)
      action: String(action || "UNKNOWN").slice(0, 32),
      oldValue: oldValue ?? null,
      newValue: newValue ?? null,
      actorId: actor?.id ?? null,
      actorRole: actor?.role ?? null,
    },
    { transaction }
  );
}

function pickActor(req) {
  // Tùy project bạn có req.user hay req.authUser...
  const u = req.user || req.authUser || null;
  if (!u) return { id: null, role: null };
  return { id: u.id ?? u.userId ?? null, role: u.role ?? u.userRole ?? null };
}

module.exports = {
  /**
   * LIST trainer shares (base) phục vụ FE left list.
   * Nếu project bạn đã có endpoint khác thì bỏ hàm này.
   */
  async listTrainerShares(db, query = {}) {
    const { TrainerShare } = getModels(db);

    const where = {};
    if (query.status) where.status = String(query.status).toLowerCase(); // bạn đang dùng "approved" ở FE
    if (query.fromGymId) where.fromGymId = Number(query.fromGymId);
    if (query.toGymId) where.toGymId = Number(query.toGymId);
    if (query.ptId) where.ptId = Number(query.ptId);

    const rows = await TrainerShare.findAll({
      where,
      order: [["id", "DESC"]],
    });

    return rows;
  },

  /**
   * LIST overrides theo trainerShareId
   */
  async listOverrides(db, { trainerShareId }) {
    const { TrainerShareOverride } = getModels(db);

    if (!trainerShareId) throw httpError(400, "Thiếu trainerShareId");

    const rows = await TrainerShareOverride.findAll({
      where: { trainerShareId: Number(trainerShareId) },
      order: [["id", "DESC"]],
    });
    return rows;
  },

  /**
   * LIST audits theo trainerShareId
   */
  async listAudits(db, { trainerShareId }) {
    const { TrainerShareOverride, TrainerShareOverrideAudit } = getModels(db);
    if (!trainerShareId) throw httpError(400, "Thiếu trainerShareId");

    const overrides = await TrainerShareOverride.findAll({
      where: { trainerShareId: Number(trainerShareId) },
      attributes: ["id"],
      order: [["id", "DESC"]],
      limit: 200,
      raw: true,
    });

    const overrideIds = overrides.map((r) => r.id);
    if (overrideIds.length === 0) return [];

    const rows = await TrainerShareOverrideAudit.findAll({
      where: { overrideId: overrideIds },
      order: [["id", "DESC"]],
      limit: 200,
    });

    return rows;
  },

  /**
   * CREATE override request (PENDING)
   * payload: { trainerShareId, commissionSplit, effectiveFrom, effectiveTo, notes }
   */
  async createOverrideRequest(db, req, payload) {
    const { sequelize } = db;
    const { TrainerShare, TrainerShareOverride } = getModels(db);

    const actor = pickActor(req);

    const trainerShareId = Number(payload.trainerShareId);
    const commissionSplit = Number(payload.commissionSplit);
    const effectiveFrom = toDateOrNull(payload.effectiveFrom);
    const effectiveTo = toDateOrNull(payload.effectiveTo);
    const notes = payload.notes ? String(payload.notes).trim() : null;

    if (!trainerShareId) throw httpError(400, "trainerShareId không hợp lệ");
    if (!isValidSplit(commissionSplit)) throw httpError(400, "commissionSplit phải (0 < split < 1)");
    if (!effectiveFrom || !effectiveTo) throw httpError(400, "effectiveFrom/effectiveTo không hợp lệ");
    if (effectiveFrom.getTime() >= effectiveTo.getTime())
      throw httpError(400, "effectiveTo phải lớn hơn effectiveFrom");

    return sequelize.transaction(async (t) => {
      const base = await TrainerShare.findByPk(trainerShareId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!base) throw httpError(404, "TrainerShare (base policy) không tồn tại");

      const row = await TrainerShareOverride.create(
        {
          trainerShareId,
          commissionSplit,
          effectiveFrom,
          effectiveTo,
          notes,
          status: "PENDING",
          isActive: false,
          createdBy: actor.id,
          updatedBy: actor.id,
        },
        { transaction: t }
      );

      await createAudit({
        db,
        overrideId: row.id,
        action: "CREATE_REQUEST",
        oldValue: null,
        newValue: {
          commissionSplit,
          effectiveFrom: row.effectiveFrom,
          effectiveTo: row.effectiveTo,
          notes,
          status: row.status,
          isActive: row.isActive,
        },
        actor,
        transaction: t,
      });

      return row;
    });
  },

  /**
   * UPDATE request (chỉ cho PENDING)
   */
  async updateOverrideRequest(db, req, id, payload) {
    const { sequelize } = db;
    const { TrainerShareOverride } = getModels(db);
    const actor = pickActor(req);

    const overrideId = Number(id);
    if (!overrideId) throw httpError(400, "id không hợp lệ");

    const commissionSplit =
      payload.commissionSplit === undefined ? undefined : Number(payload.commissionSplit);
    const effectiveFrom = payload.effectiveFrom === undefined ? undefined : toDateOrNull(payload.effectiveFrom);
    const effectiveTo = payload.effectiveTo === undefined ? undefined : toDateOrNull(payload.effectiveTo);
    const notes = payload.notes === undefined ? undefined : (payload.notes ? String(payload.notes).trim() : null);

    return sequelize.transaction(async (t) => {
      const row = await TrainerShareOverride.findByPk(overrideId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!row) throw httpError(404, "Override không tồn tại");

      if (String(row.status).toUpperCase() !== "PENDING") {
        throw httpError(400, "Chỉ được sửa request khi status = PENDING");
      }

      const oldValue = {
        commissionSplit: row.commissionSplit,
        effectiveFrom: row.effectiveFrom,
        effectiveTo: row.effectiveTo,
        notes: row.notes,
      };

      if (commissionSplit !== undefined) {
        if (!isValidSplit(commissionSplit)) throw httpError(400, "commissionSplit phải (0 < split < 1)");
        row.commissionSplit = commissionSplit;
      }
      if (effectiveFrom !== undefined) {
        if (!effectiveFrom) throw httpError(400, "effectiveFrom không hợp lệ");
        row.effectiveFrom = effectiveFrom;
      }
      if (effectiveTo !== undefined) {
        if (!effectiveTo) throw httpError(400, "effectiveTo không hợp lệ");
        row.effectiveTo = effectiveTo;
      }
      if (notes !== undefined) row.notes = notes;

      if (row.effectiveFrom.getTime() >= row.effectiveTo.getTime()) {
        throw httpError(400, "effectiveTo phải lớn hơn effectiveFrom");
      }

      row.updatedBy = actor.id;

      await row.save({ transaction: t });

      await createAudit({
        db,
        overrideId: row.id,
        action: "UPDATE_REQUEST",
        oldValue,
        newValue: {
          commissionSplit: row.commissionSplit,
          effectiveFrom: row.effectiveFrom,
          effectiveTo: row.effectiveTo,
          notes: row.notes,
        },
        actor,
        transaction: t,
      });

      return row;
    });
  },

  /**
   * APPROVE (BE enforce overlap)
   */
  async approveOverride(db, req, id) {
    const { sequelize } = db;
    const { TrainerShareOverride } = getModels(db);
    const actor = pickActor(req);

    const overrideId = Number(id);
    if (!overrideId) throw httpError(400, "id không hợp lệ");

    return sequelize.transaction(async (t) => {
      const row = await TrainerShareOverride.findByPk(overrideId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!row) throw httpError(404, "Override không tồn tại");

      const st = String(row.status).toUpperCase();
      if (st !== "PENDING") throw httpError(400, "Chỉ approve khi status = PENDING");

      // overlap check with other approved+active
      const overlap = await TrainerShareOverride.findOne({
        where: buildOverlapWhere({
          trainerShareId: row.trainerShareId,
          effectiveFrom: row.effectiveFrom,
          effectiveTo: row.effectiveTo,
          excludeId: row.id,
        }),
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (overlap) {
        throw httpError(
          409,
          `Không thể approve vì bị overlap với override #${overlap.id} (APPROVED)`
        );
      }

      const oldValue = { status: row.status, approvedBy: row.approvedBy, approvedAt: row.approvedAt };

      row.status = "APPROVED";
      row.isActive = true;
      row.approvedBy = actor.id;
      row.approvedAt = new Date();
      row.updatedBy = actor.id;

      await row.save({ transaction: t });

      await createAudit({
        db,
        overrideId: row.id,
        action: "APPROVE",
        oldValue,
        newValue: { status: row.status, approvedBy: row.approvedBy, approvedAt: row.approvedAt },
        actor,
        transaction: t,
      });

      return row;
    });
  },

  /**
   * REVOKE (soft)
   */
  async revokeOverride(db, req, id) {
    const { sequelize } = db;
    const { TrainerShareOverride } = getModels(db);
    const actor = pickActor(req);

    const overrideId = Number(id);
    if (!overrideId) throw httpError(400, "id không hợp lệ");

    return sequelize.transaction(async (t) => {
      const row = await TrainerShareOverride.findByPk(overrideId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!row) throw httpError(404, "Override không tồn tại");

      const st = String(row.status).toUpperCase();
      if (st !== "APPROVED") throw httpError(400, "Chỉ revoke khi status = APPROVED");

      const oldValue = { status: row.status, revokedBy: row.revokedBy, revokedAt: row.revokedAt, isActive: row.isActive };

      row.status = "REVOKED";
      row.isActive = false; // kill
      row.revokedBy = actor.id;
      row.revokedAt = new Date();
      row.updatedBy = actor.id;

      await row.save({ transaction: t });

      await createAudit({
        db,
        overrideId: row.id,
        action: "REVOKE",
        oldValue,
        newValue: { status: row.status, revokedBy: row.revokedBy, revokedAt: row.revokedAt, isActive: row.isActive },
        actor,
        transaction: t,
      });

      return row;
    });
  },

  /**
   * TOGGLE isActive (chỉ cho APPROVED)
   */
  async toggleOverride(db, req, id, payload) {
    const { sequelize } = db;
    const { TrainerShareOverride } = getModels(db);
    const actor = pickActor(req);

    const overrideId = Number(id);
    if (!overrideId) throw httpError(400, "id không hợp lệ");

    const next = !!payload.isActive;

    return sequelize.transaction(async (t) => {
      const row = await TrainerShareOverride.findByPk(overrideId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!row) throw httpError(404, "Override không tồn tại");

      const st = String(row.status).toUpperCase();
      if (st !== "APPROVED") throw httpError(400, "Chỉ toggle khi status = APPROVED");

      // hardening: nếu bật lại isActive=true thì phải check overlap với override active khác
      if (next === true) {
        const overlap = await TrainerShareOverride.findOne({
          where: buildOverlapWhere({
            trainerShareId: row.trainerShareId,
            effectiveFrom: row.effectiveFrom,
            effectiveTo: row.effectiveTo,
            excludeId: row.id,
          }),
          transaction: t,
          lock: t.LOCK.UPDATE,
        });
        if (overlap) {
          throw httpError(409, `Không thể bật isActive vì bị overlap với override #${overlap.id} (APPROVED)`);
        }
      }

      const oldValue = { isActive: row.isActive };

      row.isActive = next;
      row.updatedBy = actor.id;

      await row.save({ transaction: t });

      await createAudit({
        db,
        overrideId: row.id,
        action: "TOGGLE_ACTIVE",
        oldValue,
        newValue: { isActive: row.isActive },
        actor,
        transaction: t,
      });

      return row;
    });
  },

  /**
   * GET effective override "hiện tại" theo trainerShareId + now
   */
  async getEffectiveOverride(db, { trainerShareId, at }) {
    const { TrainerShareOverride } = getModels(db);
    if (!trainerShareId) throw httpError(400, "Thiếu trainerShareId");

    const now = at ? toDateOrNull(at) : new Date();
    if (!now) throw httpError(400, "Thời điểm (at) không hợp lệ");

    const row = await TrainerShareOverride.findOne({
      where: {
        trainerShareId: Number(trainerShareId),
        status: "APPROVED",
        isActive: true,
        effectiveFrom: { [Op.lte]: now },
        effectiveTo: { [Op.gt]: now },
      },
      order: [["effectiveFrom", "DESC"]],
    });

    return row;
  },

  /**
   * RESOLVE applied config: override nếu có, không thì base policy
   * return shape phục vụ UI
   */
  async resolveTrainerShareConfig(db, { trainerShareId, at }) {
    const { TrainerShare } = getModels(db);
    if (!trainerShareId) throw httpError(400, "Thiếu trainerShareId");

    const base = await TrainerShare.findByPk(Number(trainerShareId));
    if (!base) throw httpError(404, "TrainerShare không tồn tại");

    const eff = await this.getEffectiveOverride(db, { trainerShareId, at });

    if (eff) {
      return {
        source: "override",
        trainerShareId: Number(trainerShareId),
        trainerShareOverrideId: eff.id,
        commissionSplit: eff.commissionSplit,
        effectiveFrom: eff.effectiveFrom,
        effectiveTo: eff.effectiveTo,
        notes: eff.notes,
      };
    }

    // fallback base
    return {
      source: "base",
      trainerShareId: Number(trainerShareId),
      trainerShareOverrideId: null,
      commissionSplit: base.commissionSplit ?? base.split ?? null,
      effectiveFrom: null,
      effectiveTo: null,
      notes: null,
    };
  },

  /**
   * REMOVE (không khuyến nghị enterprise). Nếu bạn buộc phải có DELETE:
   * - chỉ cho xóa khi PENDING (để không mất lịch sử compliance)
   */
  async removeOverride(db, req, id) {
    const { sequelize } = db;
    const { TrainerShareOverride } = getModels(db);
    const actor = pickActor(req);

    const overrideId = Number(id);
    if (!overrideId) throw httpError(400, "id không hợp lệ");

    return sequelize.transaction(async (t) => {
      const row = await TrainerShareOverride.findByPk(overrideId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!row) throw httpError(404, "Override không tồn tại");

      const st = String(row.status).toUpperCase();
      if (st !== "PENDING") throw httpError(400, "Chỉ được xóa khi status = PENDING");

      const oldValue = {
        id: row.id,
        commissionSplit: row.commissionSplit,
        effectiveFrom: row.effectiveFrom,
        effectiveTo: row.effectiveTo,
        status: row.status,
      };

      // enterprise hardening: soft-cancel pending instead of hard delete
      row.status = "REJECTED";
      row.isActive = false;
      row.updatedBy = actor.id;
      await row.save({ transaction: t });

      // vẫn ghi audit (nếu model cho phép overrideId null thì ok, còn không thì bỏ)
      // Ở đây giữ overrideId = overrideId để truy vết, tùy bạn.
      try {
        await createAudit({
          db,
          overrideId: overrideId,
          action: "DELETE_PENDING",
          oldValue,
          newValue: null,
          actor,
          transaction: t,
        });
      } catch (_) {}

      return { ok: true };
    });
  },
};
