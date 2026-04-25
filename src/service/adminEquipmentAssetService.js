const { Op } = require("sequelize");
const db = require("../models");

const { EquipmentUnit, Equipment, Gym, User, EquipmentImage } = db;

function ensure(condition, message, statusCode = 400) {
  if (!condition) {
    const err = new Error(message);
    err.statusCode = statusCode;
    throw err;
  }
}

function parsePaging(query = {}) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

function pickPrimaryImageUrl(equipmentRow) {
  const eq = equipmentRow?.toJSON ? equipmentRow.toJSON() : equipmentRow;
  const images = Array.isArray(eq?.images) ? eq.images : [];
  const primary = images.find((x) => x?.isPrimary) || images.sort((a, b) => Number(a?.sortOrder || 0) - Number(b?.sortOrder || 0))[0];
  return primary?.url || eq?.primaryImageUrl || null;
}

function buildPublicQrUrl(publicToken) {
  const frontendOrigin = String(process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/+$/, "");
  return `${frontendOrigin}/equipment/scan/${encodeURIComponent(String(publicToken || ""))}`;
}

async function genPublicToken() {
  const crypto = require("crypto");
  return crypto.randomBytes(16).toString("hex");
}

async function genUniquePublicToken({ transaction } = {}) {
  for (let i = 0; i < 5; i += 1) {
    const token = await genPublicToken();
    // eslint-disable-next-line no-await-in-loop
    const exists = await EquipmentUnit.findOne({ where: { publicToken: token }, attributes: ["id"], transaction });
    if (!exists) return token;
  }
  return (await genPublicToken()) + (await genPublicToken());
}

function normalizeLifecycleStatus(value) {
  const v = String(value || "").trim().toLowerCase();
  if (!v || v === "all") return null;
  if (["active", "maintenance", "broken", "retired"].includes(v)) return v;
  return null;
}

function parseBool(value) {
  const v = String(value ?? "").trim().toLowerCase();
  return ["1", "true", "yes", "y", "on"].includes(v);
}

function applyMissingQrWhere(where, query) {
  if (!parseBool(query.missingQr || query.noQr)) return;
  where[Op.or] = [
    ...(Array.isArray(where[Op.or]) ? where[Op.or] : []),
    { publicToken: { [Op.or]: [null, ""] } },
    { assetCode: { [Op.or]: [null, ""] } },
  ];
}

function serializeUnit(unit) {
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
}

const adminEquipmentAssetService = {
  async list(query = {}) {
    const { page, limit, offset } = parsePaging(query);
    const where = {};

    const lifecycle = normalizeLifecycleStatus(query.status || query.lifecycleStatus);
    if (lifecycle) where.lifecycleStatus = lifecycle;

    if (query.gymId && query.gymId !== "all") where.gymId = Number(query.gymId);
    if (query.ownerId && query.ownerId !== "all") where.ownerId = Number(query.ownerId);

    const keyword = String(query.q || "").trim();
    const include = [
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
    ];

    if (keyword) {
      where[Op.or] = [
        { assetCode: { [Op.like]: `%${keyword}%` } },
        { publicToken: { [Op.like]: `%${keyword}%` } },
        { "$equipment.name$": { [Op.like]: `%${keyword}%` } },
        { "$equipment.code$": { [Op.like]: `%${keyword}%` } },
        { "$gym.name$": { [Op.like]: `%${keyword}%` } },
        { "$gym.owner.username$": { [Op.like]: `%${keyword}%` } },
        { "$gym.owner.email$": { [Op.like]: `%${keyword}%` } },
      ];
    }

    applyMissingQrWhere(where, query);

    const { rows, count } = await EquipmentUnit.findAndCountAll({
      where,
      include,
      order: [["updatedAt", "DESC"], ["id", "DESC"]],
      limit,
      offset,
      distinct: true,
    });

    return {
      data: rows.map(serializeUnit),
      meta: { page, limit, total: count },
    };
  },

  async summary(query = {}) {
    const where = {};
    if (query.gymId && query.gymId !== "all") where.gymId = Number(query.gymId);
    if (query.ownerId && query.ownerId !== "all") where.ownerId = Number(query.ownerId);

    const rows = await EquipmentUnit.findAll({
      where,
      attributes: ["lifecycleStatus", [db.Sequelize.fn("COUNT", db.Sequelize.col("id")), "count"]],
      group: ["lifecycleStatus"],
      raw: true,
    });

    const bucket = { total: 0, active: 0, maintenance: 0, broken: 0, retired: 0, noQr: 0 };
    rows.forEach((r) => {
      const k = String(r.lifecycleStatus || "active");
      const n = Number(r.count || 0);
      bucket.total += n;
      if (k in bucket) bucket[k] += n;
    });

    const noQr = await EquipmentUnit.count({
      where: {
        ...where,
        [Op.or]: [
          { publicToken: { [Op.or]: [null, ""] } },
          { assetCode: { [Op.or]: [null, ""] } },
        ],
      },
    });
    bucket.noQr = Number(noQr || 0);

    return { data: bucket };
  },

  async detail(id) {
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
    return serializeUnit(unit);
  },

  async getQr(id) {
    const unit = await EquipmentUnit.findByPk(Number(id), { attributes: ["id", "assetCode", "publicToken", "qrUrl"] });
    ensure(unit, "Equipment asset not found", 404);
    const json = unit.toJSON();
    const token = json.publicToken || null;
    return {
      id: json.id,
      assetCode: json.assetCode,
      publicToken: token,
      qrUrl: json.qrUrl || (token ? buildPublicQrUrl(token) : null),
    };
  },

  async regenerateQr(id, adminUserId) {
    return db.sequelize.transaction(async (t) => {
      const unit = await EquipmentUnit.findByPk(Number(id), { transaction: t, lock: t.LOCK.UPDATE });
      ensure(unit, "Equipment asset not found", 404);

      const AuditLog = db.AuditLog;
      const oldValues = unit.toJSON ? unit.toJSON() : unit;

      const token = await genUniquePublicToken({ transaction: t });
      unit.publicToken = token;
      unit.qrUrl = buildPublicQrUrl(token);
      await unit.save({ transaction: t });

      if (AuditLog) {
        await AuditLog.create(
          {
            userId: Number(adminUserId || 0) || null,
            action: "EQUIPMENT_ASSET_QR_REGENERATED",
            tableName: "equipmentunit",
            recordId: unit.id,
            oldValues: { id: oldValues.id, publicToken: oldValues.publicToken, qrUrl: oldValues.qrUrl },
            newValues: { id: unit.id, publicToken: unit.publicToken, qrUrl: unit.qrUrl },
            ipAddress: null,
            userAgent: null,
          },
          { transaction: t }
        );
      }

      // Optional: log event for audit trail (existing event system)
      if (db.EquipmentUnitEvent) {
        await db.EquipmentUnitEvent.create(
          {
            equipmentUnitId: unit.id,
            equipmentId: unit.equipmentId,
            gymId: unit.gymId,
            fromGymId: null,
            toGymId: null,
            eventType: "qr_regenerated",
            referenceType: "equipment_asset",
            referenceId: unit.id,
            performedBy: adminUserId || null,
            notes: `Regenerated QR token for ${unit.assetCode}`,
            metadata: JSON.stringify({ source: "admin_equipment_assets" }),
            eventAt: new Date(),
          },
          { transaction: t }
        );
      }

      return { id: unit.id, assetCode: unit.assetCode, publicToken: unit.publicToken, qrUrl: unit.qrUrl };
    });
  },
};

module.exports = adminEquipmentAssetService;

