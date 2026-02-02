// src/services/trainerShareService.js
import db from "../models/index";

class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
  }
}

const toDate = (v) => {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d;
};

const isInt = (n) => Number.isInteger(Number(n));

const createShareRequest = async (userId, body = {}) => {
  if (!userId) throw new AppError("Unauthorized", 401);

  const {
    fromGymId,
    toGymId,
    startDate,
    endDate,
    shareType = "TEMPORARY",
    commissionSplit,
    notes,
    policyId,
  } = body;

  // validate cơ bản
  if (!isInt(fromGymId) || !isInt(toGymId)) {
    throw new AppError("fromGymId/toGymId must be integer", 400);
  }
  if (Number(fromGymId) === Number(toGymId)) {
    throw new AppError("fromGymId and toGymId cannot be the same", 400);
  }

  const s = toDate(startDate);
  const e = toDate(endDate);
  if (!s || !e) throw new AppError("Invalid startDate/endDate", 400);
  if (s > e) throw new AppError("startDate must be <= endDate", 400);

  if (commissionSplit !== undefined && commissionSplit !== null && commissionSplit !== "") {
    const cs = Number(commissionSplit);
    if (Number.isNaN(cs) || cs < 0 || cs > 1) {
      throw new AppError("commissionSplit must be between 0 and 1", 400);
    }
  }

  // tìm_strip shareType
  const st = String(shareType || "TEMPORARY").toUpperCase();
  if (!["TEMPORARY", "PERMANENT"].includes(st)) {
    throw new AppError("shareType must be TEMPORARY or PERMANENT", 400);
  }

  // tìm trainer theo userId
  const trainer = await db.Trainer.findOne({ where: { userId } });
  if (!trainer) throw new AppError("Trainer profile not found", 404);

  // (optional) check gym tồn tại
  const [fromGym, toGym] = await Promise.all([
    db.Gym.findByPk(fromGymId),
    db.Gym.findByPk(toGymId),
  ]);
  if (!fromGym) throw new AppError("fromGym not found", 404);
  if (!toGym) throw new AppError("toGym not found", 404);

  const created = await db.TrainerShare.create({
    trainerId: trainer.id,
    fromGymId: Number(fromGymId),
    toGymId: Number(toGymId),
    shareType: st,
    startDate: s,
    endDate: e,
    commissionSplit:
      commissionSplit === undefined || commissionSplit === null || commissionSplit === ""
        ? null
        : Number(commissionSplit),
    status: "PENDING",
    requestedBy: userId,
    approvedBy: null,
    notes: notes ?? null,
    policyId: policyId ?? null,
  });

  return created;
};

const getMyShareRequests = async (userId, query = {}) => {
  if (!userId) throw new AppError("Unauthorized", 401);

  const trainer = await db.Trainer.findOne({ where: { userId } });
  if (!trainer) throw new AppError("Trainer profile not found", 404);

  const where = { trainerId: trainer.id };

  if (query.status) {
    where.status = String(query.status).toUpperCase();
  }

  const rows = await db.TrainerShare.findAll({
    where,
    order: [["createdAt", "DESC"]],
    include: [
      { model: db.Gym, as: "fromGym", attributes: ["id", "name"] },
      { model: db.Gym, as: "toGym", attributes: ["id", "name"] },
    ],
  });

  return rows;
};

module.exports = {
  createShareRequest,
  getMyShareRequests,
};
