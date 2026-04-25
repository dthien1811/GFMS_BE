import db from "../../models";
import { Op } from "sequelize";
import ownerMaintenanceService from "./maintenance.service";

const { EquipmentUnit, Equipment, Gym, User, EquipmentImage } = db;

const ensure = (condition, message, statusCode = 400) => {
  if (!condition) {
    const err = new Error(message);
    err.statusCode = statusCode;
    throw err;
  }
};

const parsePaging = (query = {}) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
};

const buildPublicQrUrl = (publicToken) => {
  const frontendOrigin = String(process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/+$/, "");
  return `${frontendOrigin}/equipment/scan/${encodeURIComponent(String(publicToken || ""))}`;
};

const pickPrimaryImageUrl = (equipmentRow) => {
  const eq = equipmentRow?.toJSON ? equipmentRow.toJSON() : equipmentRow;
  const images = Array.isArray(eq?.images) ? eq.images : [];
  const primary = images.find((x) => x?.isPrimary) || images.sort((a, b) => Number(a?.sortOrder || 0) - Number(b?.sortOrder || 0))[0];
  return primary?.url || eq?.primaryImageUrl || null;
};

const serializeUnit = (unit) => {
  const json = unit?.toJSON ? unit.toJSON() : unit;
  const equipment = json?.equipment || null;
  const gym = json?.gym || null;
  const owner = gym?.owner || null;
  return {
    id: json.id,
    assetCode: json.assetCode,
    publicToken: json.publicToken || null,
    qrUrl: json.qrUrl || (json.publicToken ? buildPublicQrUrl(json.publicToken) : null),
    status: json.lifecycleStatus || "active",
    deliveredAt: json.deliveredAt || json.createdAt || null,
    equipmentId: json.equipmentId,
    equipmentName: equipment?.name || null,
    imageUrl: equipment ? pickPrimaryImageUrl(equipment) : null,
    ownerId: json.ownerId || gym?.ownerId || null,
    owner: owner ? { id: owner.id, username: owner.username || null, email: owner.email || null } : null,
    gymId: json.gymId,
    gymName: gym?.name || null,
    purchaseRequestId: json.purchaseRequestId || null,
    comboId: json.comboId || null,
    createdAt: json.createdAt,
    updatedAt: json.updatedAt,
  };
};

const normalizeLifecycleStatus = (value) => {
  const v = String(value || "").trim().toLowerCase();
  if (!v || v === "all") return null;
  if (["active", "maintenance", "broken", "retired"].includes(v)) return v;
  return null;
};

const ownerEquipmentAssetService = {
  async resolveByToken(ownerUserId, qrToken) {
    const token = String(qrToken || "").trim();
    ensure(token, "Missing qrToken", 400);

    const unit = await EquipmentUnit.findOne({
      where: { publicToken: token },
      include: [
        { model: Gym, as: "gym", attributes: ["id", "ownerId", "name"], required: false },
        { model: Equipment, as: "equipment", attributes: ["id", "name", "code"], required: false },
      ],
    });
    ensure(unit, "Equipment asset not found", 404);
    ensure(Number(unit.gym?.ownerId) === Number(ownerUserId), "Not authorized", 403);

    return {
      id: unit.id,
      assetCode: unit.assetCode,
      equipmentId: unit.equipmentId,
      equipmentName: unit.equipment?.name || null,
      gymId: unit.gymId,
      gymName: unit.gym?.name || null,
      lifecycleStatus: unit.lifecycleStatus || "active",
    };
  },
  async list(ownerUserId, query = {}) {
    const { page, limit, offset } = parsePaging(query);

    const ownerGyms = await Gym.findAll({
      where: { ownerId: ownerUserId },
      attributes: ["id"],
      raw: true,
    });
    const gymIds = ownerGyms.map((g) => Number(g.id)).filter((id) => Number.isInteger(id) && id > 0);
    if (!gymIds.length) return { data: [], meta: { page, limit, total: 0 } };

    const requestedGymId = Number(query.gymId || 0);
    if (requestedGymId && !gymIds.includes(requestedGymId)) {
      const err = new Error("Gym không thuộc quyền quản lý");
      err.statusCode = 403;
      throw err;
    }

    const scopedGymIds = requestedGymId ? [requestedGymId] : gymIds;
    const where = { gymId: { [Op.in]: scopedGymIds } };

    const lifecycle = normalizeLifecycleStatus(query.status || query.lifecycleStatus);
    if (lifecycle) where.lifecycleStatus = lifecycle;

    const keyword = String(query.q || "").trim();
    if (keyword) {
      where[Op.or] = [
        { assetCode: { [Op.like]: `%${keyword}%` } },
        { publicToken: { [Op.like]: `%${keyword}%` } },
        { "$equipment.name$": { [Op.like]: `%${keyword}%` } },
        { "$equipment.code$": { [Op.like]: `%${keyword}%` } },
        { "$gym.name$": { [Op.like]: `%${keyword}%` } },
      ];
    }

    const { rows, count } = await EquipmentUnit.findAndCountAll({
      where,
      include: [
        {
          model: Equipment,
          as: "equipment",
          attributes: ["id", "name", "code"],
          include: EquipmentImage ? [{ model: EquipmentImage, as: "images", required: false, attributes: ["id", "url", "isPrimary", "sortOrder", "altText"] }] : [],
          required: false,
        },
        {
          model: Gym,
          as: "gym",
          attributes: ["id", "name", "ownerId"],
          include: [{ model: User, as: "owner", attributes: ["id", "username", "email"], required: false }],
          required: false,
        },
      ],
      order: [["updatedAt", "DESC"], ["id", "DESC"]],
      limit,
      offset,
      distinct: true,
    });

    return { data: rows.map(serializeUnit), meta: { page, limit, total: count } };
  },

  async detail(ownerUserId, id) {
    const unit = await EquipmentUnit.findByPk(Number(id), {
      include: [
        {
          model: Equipment,
          as: "equipment",
          attributes: ["id", "name", "code", "description"],
          include: EquipmentImage ? [{ model: EquipmentImage, as: "images", required: false, attributes: ["id", "url", "isPrimary", "sortOrder", "altText"] }] : [],
          required: false,
        },
        {
          model: Gym,
          as: "gym",
          attributes: ["id", "name", "ownerId"],
          include: [{ model: User, as: "owner", attributes: ["id", "username", "email"], required: false }],
          required: false,
        },
      ],
    });
    ensure(unit, "Equipment asset not found", 404);
    const json = unit.toJSON();
    ensure(Number(json?.gym?.ownerId) === Number(ownerUserId), "Not authorized", 403);
    return serializeUnit(unit);
  },

  async getQr(ownerUserId, id) {
    const unit = await EquipmentUnit.findByPk(Number(id), {
      attributes: ["id", "assetCode", "publicToken", "qrUrl", "gymId"],
      include: [{ model: Gym, as: "gym", attributes: ["id", "ownerId"], required: false }],
    });
    ensure(unit, "Equipment asset not found", 404);
    ensure(Number(unit.gym?.ownerId) === Number(ownerUserId), "Not authorized", 403);
    const json = unit.toJSON();
    const token = json.publicToken || null;
    return {
      id: json.id,
      assetCode: json.assetCode,
      publicToken: token,
      qrUrl: json.qrUrl || (token ? buildPublicQrUrl(token) : null),
    };
  },

  // Phase 2 hook: create maintenance request for a specific asset (QR flow)
  async createMaintenance(ownerUserId, assetId, payload = {}) {
    const unit = await EquipmentUnit.findByPk(Number(assetId), {
      attributes: ["id", "gymId", "equipmentId"],
      include: [{ model: Gym, as: "gym", attributes: ["id", "ownerId"], required: false }],
    });
    ensure(unit, "Equipment asset not found", 404);
    ensure(Number(unit.gym?.ownerId) === Number(ownerUserId), "Not authorized", 403);

    const issueDescription = payload?.issueDescription ? String(payload.issueDescription).trim() : "";
    return ownerMaintenanceService.createMaintenance(ownerUserId, {
      gymId: Number(unit.gymId),
      equipmentId: Number(unit.equipmentId),
      equipmentUnitId: Number(unit.id),
      issueDescription,
    });
  },
};

export default ownerEquipmentAssetService;

