"use strict";

/**
 * Controller này export ĐỦ các hàm mà route đang gọi:
 * - listTrainerShares
 * - list, create, update
 * - approve, revoke, toggle
 * - effective, resolve
 * - audits
 * - remove
 * - createForTrainerShare (legacy route nếu bạn đang dùng)
 */

const service = require("../service/adminTrainerShareOverrideService");
const db = require("../models");

function ok(res, data, message = "OK") {
  return res.json({ message, data });
}

function fail(res, err) {
  const status = err?.status || 500;
  return res.status(status).json({
    message: err?.message || "Internal Server Error",
  });
}

module.exports = {
  // ===== base trainer shares for FE left list
  async listTrainerShares(req, res) {
    try {
      const data = await service.listTrainerShares(db, req.query || {});
      return ok(res, data);
    } catch (err) {
      return fail(res, err);
    }
  },

  // ===== list overrides
  async list(req, res) {
    try {
      const data = await service.listOverrides(db, req.query || {});
      return ok(res, data);
    } catch (err) {
      return fail(res, err);
    }
  },

  // ===== create request
  async create(req, res) {
    try {
      const data = await service.createOverrideRequest(db, req, req.body || {});
      return ok(res, data, "CREATED");
    } catch (err) {
      return fail(res, err);
    }
  },

  // ===== update request (pending only)
  async update(req, res) {
    try {
      const data = await service.updateOverrideRequest(db, req, req.params.id, req.body || {});
      return ok(res, data, "UPDATED");
    } catch (err) {
      return fail(res, err);
    }
  },

  // ===== approve
  async approve(req, res) {
    try {
      const data = await service.approveOverride(db, req, req.params.id);
      return ok(res, data, "APPROVED");
    } catch (err) {
      return fail(res, err);
    }
  },

  // ===== revoke
  async revoke(req, res) {
    try {
      const data = await service.revokeOverride(db, req, req.params.id);
      return ok(res, data, "REVOKED");
    } catch (err) {
      return fail(res, err);
    }
  },

  // ===== toggle active
  async toggle(req, res) {
    try {
      const data = await service.toggleOverride(db, req, req.params.id, req.body || {});
      return ok(res, data, "TOGGLED");
    } catch (err) {
      return fail(res, err);
    }
  },

  // ===== effective override now
  async effective(req, res) {
    try {
      const data = await service.getEffectiveOverride(db, req.query || {});
      return ok(res, data);
    } catch (err) {
      return fail(res, err);
    }
  },

  // ===== resolve applied config
  async resolve(req, res) {
    try {
      const data = await service.resolveTrainerShareConfig(db, req.query || {});
      return ok(res, data);
    } catch (err) {
      return fail(res, err);
    }
  },

  // ===== audits
  async audits(req, res) {
    try {
      // hỗ trợ 2 kiểu:
      // - /trainer-share-overrides/audits?trainerShareId=...
      // - /trainer-share-overrides/:id/audits  (fallback: lấy trainerShareId từ query nếu có)
      const q = req.query || {};
      const trainerShareId = q.trainerShareId;
      const data = await service.listAudits(db, { trainerShareId });
      return ok(res, data);
    } catch (err) {
      return fail(res, err);
    }
  },

  // ===== remove (optional)
  async remove(req, res) {
    try {
      const data = await service.removeOverride(db, req, req.params.id);
      return ok(res, data, "DELETED");
    } catch (err) {
      return fail(res, err);
    }
  },

  // ===== legacy: /trainer-shares/:id/override
  async createForTrainerShare(req, res) {
    try {
      // map legacy route -> create override request
      const trainerShareId = Number(req.params.id);
      const body = req.body || {};

      const payload = {
        trainerShareId,
        commissionSplit: body.commissionSplit,
        effectiveFrom: body.effectiveFrom,
        effectiveTo: body.effectiveTo,
        notes: body.notes,
      };

      const data = await service.createOverrideRequest(db, req, payload);
      return ok(res, data, "CREATED");
    } catch (err) {
      return fail(res, err);
    }
  },
};
