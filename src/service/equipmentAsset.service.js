const crypto = require('crypto');
const { Op } = require('sequelize');
const db = require('../models');

const { EquipmentUnit, Equipment, EquipmentImage, Gym, User, PurchaseRequest, EquipmentCombo, EquipmentUnitEvent } = db;

const buildFrontendBaseUrl = () => String(process.env.FRONTEND_URL || process.env.CLIENT_URL || 'http://localhost:3000').replace(/\/$/, '');
const makePublicToken = () => crypto.randomBytes(24).toString('base64url');

const normalizeStatus = (status) => {
  const value = String(status || '').toLowerCase();
  if (value === 'maintenance') return 'in_maintenance';
  if (value === 'retired') return 'disposed';
  return value || 'active';
};

const getImageUrl = (equipment) => {
  const images = equipment?.images || equipment?.EquipmentImages || [];
  return equipment?.imageUrl || equipment?.thumbnailUrl || equipment?.thumbnail || images?.[0]?.imageUrl || images?.[0]?.url || images?.[0]?.secureUrl || null;
};

const includeBase = [
  {
    model: Equipment,
    as: 'equipment',
    required: false,
    include: EquipmentImage
      ? [{ model: EquipmentImage, as: 'images', required: false, attributes: ['id', 'url', 'isPrimary', 'sortOrder', 'altText'] }]
      : [],
  },
  { model: Gym, as: 'gym', required: false, include: User ? [{ model: User, as: 'owner', required: false, attributes: ['id', 'username', 'email', 'phone'] }] : [] },
  ...(User ? [{ model: User, as: 'owner', required: false, attributes: ['id', 'username', 'email', 'phone'] }] : []),
  ...(PurchaseRequest ? [{ model: PurchaseRequest, as: 'purchaseRequest', required: false, attributes: ['id', 'code', 'status', 'shippingAt', 'confirmedReceivedAt', 'completedAt', 'createdAt'] }] : []),
  ...(EquipmentCombo ? [{ model: EquipmentCombo, as: 'combo', required: false, attributes: ['id', 'code', 'name', 'price'] }] : []),
];

const includeDetail = [
  ...includeBase,
  ...(EquipmentUnitEvent ? [{
    model: EquipmentUnitEvent,
    as: 'events',
    required: false,
    separate: true,
    limit: 30,
    order: [['eventAt', 'DESC'], ['id', 'DESC']],
    include: User ? [{ model: User, as: 'actor', required: false, attributes: ['id', 'username', 'email'] }] : [],
  }] : []),
];

const safeEvent = (event) => {
  const plain = typeof event?.toJSON === 'function' ? event.toJSON() : event;
  if (!plain) return null;
  let metadata = plain.metadata;
  if (typeof metadata === 'string') {
    try { metadata = JSON.parse(metadata); } catch (_) {}
  }
  return {
    id: plain.id,
    eventType: plain.eventType,
    referenceType: plain.referenceType,
    referenceId: plain.referenceId,
    notes: plain.notes,
    metadata,
    eventAt: plain.eventAt,
    actor: plain.actor ? { id: plain.actor.id, username: plain.actor.username, email: plain.actor.email } : null,
  };
};

const safeAsset = (unit, { publicMode = false } = {}) => {
  const plain = typeof unit?.toJSON === 'function' ? unit.toJSON() : unit;
  if (!plain) return null;
  const equipment = plain.equipment || plain.Equipment || {};
  const gym = plain.gym || plain.Gym || {};
  const owner = plain.owner || gym.owner || null;
  const purchaseRequest = plain.purchaseRequest || null;
  const combo = plain.combo || null;
  const qrStatus = plain.publicToken && plain.qrUrl ? 'has_qr' : 'missing_qr';

  const data = {
    id: publicMode ? undefined : plain.id,
    assetCode: plain.assetCode,
    publicToken: publicMode ? undefined : plain.publicToken,
    qrUrl: plain.qrUrl,
    qrStatus,
    equipmentId: publicMode ? undefined : plain.equipmentId,
    equipmentName: equipment.name || plain.equipmentName || 'Thiết bị',
    equipmentDescription: equipment.description || '',
    imageUrl: getImageUrl(equipment),
    status: normalizeStatus(plain.status),
    usageStatus: plain.usageStatus,
    gymId: publicMode ? undefined : plain.gymId,
    gymName: gym.name || null,
    ownerId: publicMode ? undefined : (plain.ownerId || owner?.id || null),
    ownerName: publicMode ? undefined : (owner?.username || owner?.email || null),
    ownerEmail: publicMode ? undefined : (owner?.email || null),
    purchaseRequestId: publicMode ? undefined : plain.purchaseRequestId,
    purchaseRequestCode: publicMode ? undefined : purchaseRequest?.code || null,
    purchaseRequestStatus: publicMode ? undefined : purchaseRequest?.status || null,
    comboId: publicMode ? undefined : plain.comboId,
    comboName: publicMode ? undefined : combo?.name || null,
    comboCode: publicMode ? undefined : combo?.code || null,
    deliveredAt: plain.deliveredAt || purchaseRequest?.shippingAt || null,
    ownerConfirmedAt: purchaseRequest?.confirmedReceivedAt || purchaseRequest?.completedAt || null,
    completedAt: purchaseRequest?.completedAt || null,
    createdAt: plain.createdAt,
    updatedAt: plain.updatedAt,
    guide: {
      usageGuide: equipment.usageGuide || null,
      trainingInstructions: equipment.trainingInstructions || null,
      muscleGroups: equipment.muscleGroups || null,
      safetyNotes: equipment.safetyNotes || null,
      guideImages: equipment.guideImages || null,
      guideVideoUrl: equipment.guideVideoUrl || null,
    },
    events: publicMode ? undefined : (plain.events || []).map(safeEvent).filter(Boolean),
  };

  if (publicMode) {
    delete data.id; delete data.publicToken; delete data.events;
  }
  return data;
};

const buildWhere = (query = {}) => {
  const where = {};
  if (query.status) where.status = normalizeStatus(query.status);
  if (query.gymId) where.gymId = Number(query.gymId);
  if (query.equipmentId) where.equipmentId = Number(query.equipmentId);
  if (query.ownerId) where.ownerId = Number(query.ownerId);
  if (String(query.missingQr || '').toLowerCase() === 'true') where[Op.or] = [{ publicToken: null }, { qrUrl: null }];
  return where;
};

const buildKeywordWhere = (keyword) => {
  const q = String(keyword || '').trim();
  if (!q) return null;
  return { [Op.or]: [
    { assetCode: { [Op.like]: `%${q}%` } },
    { '$equipment.name$': { [Op.like]: `%${q}%` } },
    { '$gym.name$': { [Op.like]: `%${q}%` } },
    { '$owner.username$': { [Op.like]: `%${q}%` } },
    { '$owner.email$': { [Op.like]: `%${q}%` } },
    { '$purchaseRequest.code$': { [Op.like]: `%${q}%` } },
    { '$combo.name$': { [Op.like]: `%${q}%` } },
  ] };
};

async function listAssets(query = {}, scope = {}) {
  const page = Math.max(1, Number(query.page || 1));
  const limit = Math.max(1, Math.min(100, Number(query.limit || 20)));
  const offset = (page - 1) * limit;
  const where = buildWhere(query);
  if (scope.ownerId) where.ownerId = Number(scope.ownerId);
  const keywordWhere = buildKeywordWhere(query.keyword || query.q || query.search);
  const finalWhere = keywordWhere ? { [Op.and]: [where, keywordWhere] } : where;

  const { rows, count } = await EquipmentUnit.findAndCountAll({
    where: finalWhere,
    include: includeBase,
    order: [['createdAt', 'DESC'], ['id', 'DESC']],
    limit,
    offset,
    distinct: true,
  });
  return { data: rows.map((row) => safeAsset(row)), meta: { page, limit, totalItems: count, totalPages: Math.max(1, Math.ceil(count / limit)) } };
}

async function getAssetById(id, scope = {}) {
  const where = { id: Number(id) };
  if (scope.ownerId) where.ownerId = Number(scope.ownerId);
  const asset = await EquipmentUnit.findOne({ where, include: includeDetail });
  if (!asset) { const err = new Error('Không tìm thấy tài sản thiết bị'); err.status = 404; throw err; }
  return safeAsset(asset);
}

async function getQrById(id, scope = {}) {
  const asset = await getAssetById(id, scope);
  return { assetCode: asset.assetCode, publicToken: asset.publicToken, qrUrl: asset.qrUrl, qrStatus: asset.qrStatus, equipmentName: asset.equipmentName, imageUrl: asset.imageUrl };
}

async function regenerateQr(id) {
  const asset = await EquipmentUnit.findByPk(Number(id));
  if (!asset) { const err = new Error('Không tìm thấy tài sản thiết bị'); err.status = 404; throw err; }
  let publicToken = makePublicToken();
  for (let i = 0; i < 8; i += 1) {
    const exists = await EquipmentUnit.findOne({ where: { publicToken } });
    if (!exists) break;
    publicToken = makePublicToken();
  }
  asset.publicToken = publicToken;
  asset.qrUrl = `${buildFrontendBaseUrl()}/equipment/scan/${publicToken}`;
  await asset.save();
  return getQrById(asset.id);
}

async function scanByToken(publicToken) {
  const token = String(publicToken || '').trim();
  if (!token) { const err = new Error('QR không hợp lệ'); err.status = 400; throw err; }
  const asset = await EquipmentUnit.findOne({ where: { publicToken: token }, include: includeBase });
  if (!asset) { const err = new Error('Không tìm thấy thiết bị từ mã QR'); err.status = 404; throw err; }
  return safeAsset(asset, { publicMode: true });
}

async function summary(scope = {}) {
  const baseWhere = scope.ownerId ? { ownerId: Number(scope.ownerId) } : {};
  const total = await EquipmentUnit.count({ where: baseWhere });
  const active = await EquipmentUnit.count({ where: { ...baseWhere, status: 'active' } });
  const maintenance = await EquipmentUnit.count({ where: { ...baseWhere, status: { [Op.in]: ['in_maintenance', 'maintenance'] } } });
  const broken = await EquipmentUnit.count({ where: { ...baseWhere, status: 'broken' } });
  const retired = await EquipmentUnit.count({ where: { ...baseWhere, status: { [Op.in]: ['disposed', 'retired'] } } });
  const missingQr = await EquipmentUnit.count({ where: { ...baseWhere, [Op.or]: [{ publicToken: null }, { qrUrl: null }] } });
  return { total, active, maintenance, broken, retired, missingQr };
}

module.exports = { listAssets, getAssetById, getQrById, regenerateQr, scanByToken, summary };
