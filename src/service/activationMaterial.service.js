import db from "../models";
import { Op } from "sequelize";

async function getTrainerByUserId(userId) {
  const trainer = await db.Trainer.findOne({
    where: { userId },
    attributes: ["id", "userId", "gymId"],
  });
  if (!trainer) {
    const e = new Error("Trainer profile not found");
    e.statusCode = 404;
    throw e;
  }
  return trainer;
}

async function trainerCanAccessActivation(trainerId, activation) {
  const pkg = activation.Package;
  if (pkg && Number(pkg.trainerId) === Number(trainerId)) return true;
  const n = await db.Booking.count({
    where: {
      packageActivationId: activation.id,
      trainerId,
      status: { [Op.ne]: "cancelled" },
    },
  });
  return n > 0;
}

async function listEligibleActivations(userId) {
  const trainer = await getTrainerByUserId(userId);
  const bookingRows = await db.Booking.findAll({
    where: {
      trainerId: trainer.id,
      packageActivationId: { [Op.ne]: null },
      status: { [Op.ne]: "cancelled" },
    },
    attributes: ["packageActivationId"],
  });
  const setIds = new Set(
    bookingRows.map((b) => b.packageActivationId).filter((x) => x != null)
  );
  const assignedActs = await db.PackageActivation.findAll({
    attributes: ["id"],
    where: { status: "active" },
    include: [
      {
        model: db.Package,
        where: { trainerId: trainer.id },
        required: true,
        attributes: [],
      },
    ],
  });
  assignedActs.forEach((a) => setIds.add(a.id));
  const allIds = [...setIds];
  if (!allIds.length) return [];
  const activations = await db.PackageActivation.findAll({
    where: { id: { [Op.in]: allIds }, status: "active" },
    include: [
      { model: db.Package, attributes: ["id", "name", "type", "trainerId"] },
      {
        model: db.Member,
        attributes: ["id"],
        include: [{ model: db.User, attributes: ["username"] }],
      },
    ],
    order: [["id", "DESC"]],
  });
  return activations.map((a) => ({
    id: a.id,
    packageName: a.Package?.name,
    memberUsername: a.Member?.User?.username,
    sessionsRemaining: a.sessionsRemaining,
  }));
}

async function sendMaterial(userId, { packageActivationId, materialKind, sourceItemId }) {
  const trainer = await getTrainerByUserId(userId);
  const kind =
    materialKind === "demo_video" || materialKind === "training_plan" ? materialKind : null;
  if (!kind) {
    const e = new Error("materialKind không hợp lệ");
    e.statusCode = 400;
    throw e;
  }
  const sid = String(sourceItemId || "").trim();
  if (!sid) {
    const e = new Error("Thiếu sourceItemId");
    e.statusCode = 400;
    throw e;
  }
  const aid = Number(packageActivationId);
  if (!Number.isFinite(aid)) {
    const e = new Error("packageActivationId không hợp lệ");
    e.statusCode = 400;
    throw e;
  }
  const activation = await db.PackageActivation.findByPk(aid, {
    include: [{ model: db.Package }],
  });
  if (!activation) {
    const e = new Error("Không tìm thấy gói kích hoạt");
    e.statusCode = 404;
    throw e;
  }
  if (activation.status !== "active") {
    const e = new Error("Gói kích hoạt không còn active");
    e.statusCode = 400;
    throw e;
  }
  const ok = await trainerCanAccessActivation(trainer.id, activation);
  if (!ok) {
    const e = new Error("Bạn không có quyền gửi tài liệu cho gói này");
    e.statusCode = 403;
    throw e;
  }
  const trainerRow = await db.Trainer.findByPk(trainer.id, {
    attributes: ["id", "socialLinks"],
  });
  const links = trainerRow.socialLinks || {};
  const list =
    kind === "demo_video"
      ? Array.isArray(links.demoVideos)
        ? links.demoVideos
        : []
      : Array.isArray(links.trainingPlans)
        ? links.trainingPlans
        : [];
  const item = list.find((x) => String(x?.id) === sid);
  if (!item?.url) {
    const e = new Error("Không tìm thấy video hoặc file trong thư viện của bạn");
    e.statusCode = 400;
    throw e;
  }
  try {
    const row = await db.ActivationMaterial.create({
      packageActivationId: aid,
      trainerId: trainer.id,
      materialKind: kind,
      sourceItemId: sid,
      title: item.title ? String(item.title).slice(0, 512) : null,
      fileUrl: String(item.url),
    });
    return row;
  } catch (err) {
    if (err?.name === "SequelizeUniqueConstraintError") {
      const e = new Error("Đã gửi mục này cho gói này rồi");
      e.statusCode = 409;
      throw e;
    }
    throw err;
  }
}

async function listForTrainer(userId, packageActivationId) {
  const trainer = await getTrainerByUserId(userId);
  const aid = Number(packageActivationId);
  if (!Number.isFinite(aid)) {
    const e = new Error("Thiếu packageActivationId");
    e.statusCode = 400;
    throw e;
  }
  const activation = await db.PackageActivation.findByPk(aid, {
    include: [{ model: db.Package }],
  });
  if (!activation) {
    const e = new Error("Không tìm thấy gói kích hoạt");
    e.statusCode = 404;
    throw e;
  }
  const ok = await trainerCanAccessActivation(trainer.id, activation);
  if (!ok) {
    const e = new Error("Không có quyền xem");
    e.statusCode = 403;
    throw e;
  }
  const rows = await db.ActivationMaterial.findAll({
    where: { packageActivationId: aid, trainerId: trainer.id },
    order: [["createdAt", "DESC"]],
  });
  return rows.map((r) => ({
    id: r.id,
    materialKind: r.materialKind,
    title: r.title,
    fileUrl: r.fileUrl,
    sourceItemId: r.sourceItemId,
    createdAt: r.createdAt,
  }));
}

async function deleteMaterial(userId, materialId) {
  const trainer = await getTrainerByUserId(userId);
  const row = await db.ActivationMaterial.findByPk(materialId);
  if (!row) {
    const e = new Error("Không tìm thấy tài liệu");
    e.statusCode = 404;
    throw e;
  }
  if (Number(row.trainerId) !== Number(trainer.id)) {
    const e = new Error("Không có quyền xóa");
    e.statusCode = 403;
    throw e;
  }
  await row.destroy();
  return { ok: true };
}

async function listForMember(userId, activationId) {
  const activation = await db.PackageActivation.findByPk(activationId, {
    include: [{ model: db.Member, attributes: ["userId"] }],
  });
  if (!activation) {
    const e = new Error("Không tìm thấy gói");
    e.statusCode = 404;
    throw e;
  }
  if (Number(activation.Member.userId) !== Number(userId)) {
    const e = new Error("Không có quyền xem");
    e.statusCode = 403;
    throw e;
  }
  const rows = await db.ActivationMaterial.findAll({
    where: { packageActivationId: activationId },
    include: [
      {
        model: db.Trainer,
        attributes: ["id"],
        include: [{ model: db.User, attributes: ["username"] }],
      },
    ],
    order: [["createdAt", "DESC"]],
  });
  return rows.map((r) => ({
    id: r.id,
    materialKind: r.materialKind,
    title: r.title,
    fileUrl: r.fileUrl,
    createdAt: r.createdAt,
    Trainer: r.Trainer
      ? {
          id: r.Trainer.id,
          User: r.Trainer.User ? { username: r.Trainer.User.username } : null,
        }
      : null,
  }));
}

export default {
  listEligibleActivations,
  sendMaterial,
  listForTrainer,
  deleteMaterial,
  listForMember,
};
