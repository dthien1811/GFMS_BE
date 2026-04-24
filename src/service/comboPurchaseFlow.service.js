const { Op } = require('sequelize');
const db = require('../models');
const realtimeServiceModule = require('./realtime.service');
const realtimeService = realtimeServiceModule.default || realtimeServiceModule;
const payosService = require('./payment/payos.service');
const crypto = require('crypto');

const { sequelize, PurchaseRequest, EquipmentCombo, EquipmentComboItem, Equipment, EquipmentImage, EquipmentCategory, Gym, Supplier, Transaction, User, EquipmentStock, Inventory, EquipmentUnit, AuditLog } = db;
const { logEquipmentUnitEvents } = require('../utils/equipmentUnitEvent');

const ACTIVE_PENDING_STATUSES = new Set(['pending']);
const REQUEST_STATUSES = {
  SUBMITTED: 'submitted',
  APPROVED_WAITING_PAYMENT: 'approved_waiting_payment',
  PAID_WAITING_ADMIN_CONFIRM: 'paid_waiting_admin_confirm',
  SHIPPING: 'shipping',
  COMPLETED: 'completed',
  REJECTED: 'rejected',
};

function ensure(condition, message, statusCode = 400) {
  if (!condition) {
    const error = new Error(message);
    error.statusCode = statusCode;
    throw error;
  }
}

function parseMeta(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return {}; }
}

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function genCode(prefix) {
  const now = new Date();
  return `${prefix}-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${Math.floor(100000 + Math.random() * 900000)}`;
}

function pad6(n) {
  return String(Math.max(0, Number(n) || 0)).padStart(6, '0');
}

function buildPublicQrUrl(publicToken) {
  const frontendOrigin = String(process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '');
  return `${frontendOrigin}/equipment/scan/${encodeURIComponent(String(publicToken || ''))}`;
}

async function genUniquePublicToken({ transaction } = {}) {
  // 128-bit token hex (32 chars). Not sequential. Safe for public QR.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const token = crypto.randomBytes(16).toString('hex');
    const exists = await EquipmentUnit.findOne({
      where: { publicToken: token },
      attributes: ['id'],
      transaction,
      lock: transaction?.LOCK?.SHARE,
    });
    if (!exists) return token;
  }
  // extremely unlikely; fallback to longer
  return crypto.randomBytes(24).toString('hex');
}

function pickPrimaryEquipmentImage(images = []) {
  if (!Array.isArray(images) || !images.length) return null;
  return images.find((image) => image?.isPrimary) || images.slice().sort((a, b) => Number(a?.sortOrder || 0) - Number(b?.sortOrder || 0))[0] || null;
}

function serializeEquipment(equipment) {
  if (!equipment) return null;
  const json = typeof equipment.toJSON === 'function' ? equipment.toJSON() : equipment;
  const images = Array.isArray(json.images) ? json.images : [];
  const primaryImage = pickPrimaryEquipmentImage(images);
  return {
    id: json.id,
    name: json.name || null,
    code: json.code || null,
    description: json.description || null,
    price: json.price,
    brand: json.brand || null,
    model: json.model || null,
    status: json.status || null,
    specifications: json.specifications || null,
    primaryImageUrl: primaryImage?.url || json.primaryImageUrl || null,
    images: images.map((image) => ({
      id: image.id,
      url: image.url,
      isPrimary: Boolean(image.isPrimary),
      sortOrder: Number(image.sortOrder || 0),
      altText: image.altText || null,
    })),
    category: json.category ? {
      id: json.category.id,
      name: json.category.name || null,
      code: json.category.code || null,
    } : null,
    supplier: json.preferredSupplier ? {
      id: json.preferredSupplier.id,
      name: json.preferredSupplier.name || null,
      code: json.preferredSupplier.code || null,
    } : null,
  };
}

function serializeComboItem(item) {
  if (!item) return null;
  const json = typeof item.toJSON === 'function' ? item.toJSON() : item;
  return {
    id: json.id,
    comboId: json.comboId,
    equipmentId: json.equipmentId,
    quantity: Number(json.quantity || 0),
    note: json.note || null,
    sortOrder: Number(json.sortOrder || 0),
    equipment: serializeEquipment(json.equipment),
  };
}

function serializeCombo(combo) {
  if (!combo) return null;
  const json = typeof combo.toJSON === 'function' ? combo.toJSON() : combo;
  const items = Array.isArray(json.items) ? json.items.map(serializeComboItem).filter(Boolean) : [];
  return {
    id: json.id,
    name: json.name || null,
    code: json.code || null,
    description: json.description || null,
    price: json.price,
    status: json.status || null,
    thumbnail: json.thumbnail || null,
    supplierId: json.supplierId || null,
    isSelling: Boolean(json.isSelling),
    createdAt: json.createdAt,
    updatedAt: json.updatedAt,
    supplier: json.supplier ? {
      id: json.supplier.id,
      name: json.supplier.name || null,
      code: json.supplier.code || null,
      email: json.supplier.email || null,
      phone: json.supplier.phone || null,
    } : null,
    items,
    itemCount: items.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    deviceTypeCount: items.length,
  };
}

function buildComboSnapshot(combo) {
  const serialized = serializeCombo(combo);
  if (!serialized) return null;
  return {
    ...serialized,
    snapshotAt: new Date().toISOString(),
  };
}

function buildDisplayCombo(requestJson) {
  const snapshot = requestJson?.stockSnapshot?.comboSnapshot || null;
  if (snapshot && typeof snapshot === 'object') {
    return {
      id: requestJson.comboId || snapshot.id || null,
      ...(requestJson.combo && typeof requestJson.combo === 'object' ? { status: requestJson.combo.status, isSelling: requestJson.combo.isSelling } : {}),
      ...snapshot,
    };
  }
  return serializeCombo(requestJson.combo);
}

function serializeRequestRecord(record) {
  const json = typeof record?.toJSON === 'function' ? record.toJSON() : record;
  if (!json) return json;

  // Enterprise guard: nếu webhook/confirm không kịp cập nhật status,
  // vẫn suy luận trạng thái theo payments đã completed để tránh vòng lặp thanh toán.
  const payments = Array.isArray(json.payments) ? json.payments : [];
  const isCompleted = (p) => String(p?.paymentStatus || '').toLowerCase() === 'completed';
  const currentStatus = String(json.status || '');
  let derivedStatus = currentStatus;
  const hasAnyCompletedPayment = payments.some((p) => isCompleted(p));
  if (currentStatus === REQUEST_STATUSES.APPROVED_WAITING_PAYMENT && hasAnyCompletedPayment) {
    derivedStatus = REQUEST_STATUSES.PAID_WAITING_ADMIN_CONFIRM;
  }

  return {
    ...json,
    status: derivedStatus,
    combo: buildDisplayCombo(json),
    comboSnapshot: json?.stockSnapshot?.comboSnapshot || null,
  };
}

function phaseAmountFromRequest(request, phase) {
  ensure(String(phase || '').toLowerCase() === 'full', 'Combo chỉ hỗ trợ thanh toán full (100%)', 400);
  const total = roundMoney(request.totalAmount || request.payableAmount || 0);
  return total;
}

async function loadCombo(comboId, options = {}) {
  const combo = await EquipmentCombo.findByPk(comboId, {
    include: [
      { model: Supplier, as: 'supplier', required: false, attributes: ['id', 'name', 'code', 'email', 'phone'] },
      {
        model: EquipmentComboItem,
        as: 'items',
        required: false,
        include: [{
          model: Equipment,
          as: 'equipment',
          attributes: ['id', 'name', 'code', 'description', 'price', 'brand', 'model', 'status', 'specifications'],
          include: [
            { model: EquipmentImage, as: 'images', required: false, attributes: ['id', 'url', 'isPrimary', 'sortOrder', 'altText'] },
            { model: EquipmentCategory, as: 'category', required: false, attributes: ['id', 'name', 'code'] },
            { model: Supplier, as: 'preferredSupplier', required: false, attributes: ['id', 'name', 'code'] },
          ],
        }],
      },
    ],
    order: [
      [{ model: EquipmentComboItem, as: 'items' }, 'sortOrder', 'ASC'],
      [{ model: EquipmentComboItem, as: 'items' }, { model: Equipment, as: 'equipment' }, { model: EquipmentImage, as: 'images' }, 'sortOrder', 'ASC'],
    ],
    ...options,
  });
  return serializeCombo(combo);
}

async function listCombos({ activeOnly = false, query = {}, forAdmin = false } = {}) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
  const offset = (page - 1) * limit;
  const where = {};
  const keyword = String(query.q || '').trim();
  if (activeOnly) {
    where.status = 'active';
    where.isSelling = true;
  } else if (query.status && query.status !== 'all') {
    where.status = query.status;
  }
  if (keyword) {
    where[Op.or] = [
      { name: { [Op.like]: `%${keyword}%` } },
      { code: { [Op.like]: `%${keyword}%` } },
      { description: { [Op.like]: `%${keyword}%` } },
    ];
  }
  const { rows, count } = await EquipmentCombo.findAndCountAll({
    where,
    include: [
      { model: Supplier, as: 'supplier', required: false, attributes: ['id', 'name', 'code'] },
      {
        model: EquipmentComboItem,
        as: 'items',
        required: false,
        include: [{
          model: Equipment,
          as: 'equipment',
          attributes: ['id', 'name', 'code', 'description', 'price', 'brand', 'model', 'status', 'specifications'],
          include: [
            { model: EquipmentImage, as: 'images', required: false, attributes: ['id', 'url', 'isPrimary', 'sortOrder', 'altText'] },
            { model: EquipmentCategory, as: 'category', required: false, attributes: ['id', 'name', 'code'] },
            { model: Supplier, as: 'preferredSupplier', required: false, attributes: ['id', 'name', 'code'] },
          ],
        }],
      },
    ],
    order: [['createdAt', 'DESC'], [{ model: EquipmentComboItem, as: 'items' }, 'sortOrder', 'ASC']],
    limit,
    offset,
    distinct: true,
  });

  const data = rows.map((row) => ({
    ...serializeCombo(row),
    canToggleSelling: forAdmin,
  }));

  return { data, meta: { page, limit, totalItems: count, totalPages: Math.ceil(count / limit) } };
}

async function getComboDetail(comboId) {
  const combo = await loadCombo(comboId);
  ensure(combo, 'Combo không tồn tại', 404);
  return combo;
}

async function createCombo(payload) {
  const { name, code, description, price, status, thumbnail, supplierId, items = [], isSelling = true } = payload || {};
  ensure(String(name || '').trim(), 'name is required');
  ensure(String(code || '').trim(), 'code is required');
  const normalizedItems = Array.isArray(items) ? items : [];
  ensure(normalizedItems.length > 0, 'Combo phải có ít nhất 1 thiết bị');
  const comboPrice = roundMoney(price);
  ensure(comboPrice > 0, 'price must be greater than 0');
  if (supplierId) {
    const supplier = await Supplier.findByPk(Number(supplierId));
    ensure(supplier, 'Supplier not found', 404);
  }
  return sequelize.transaction(async (t) => {
    const combo = await EquipmentCombo.create({
      name: String(name).trim(),
      code: String(code).trim(),
      description: description ? String(description).trim() : null,
      price: comboPrice,
      status: status === 'inactive' ? 'inactive' : 'active',
      thumbnail: thumbnail || null,
      supplierId: supplierId ? Number(supplierId) : null,
      isSelling: Boolean(isSelling),
    }, { transaction: t });

    for (let index = 0; index < normalizedItems.length; index += 1) {
      const item = normalizedItems[index];
      const equipmentId = Number(item.equipmentId || item.id);
      ensure(equipmentId > 0, `equipmentId is invalid at item ${index + 1}`);
      const equipment = await Equipment.findByPk(equipmentId, { transaction: t });
      ensure(equipment, `Equipment ${equipmentId} not found`, 404);
      const quantity = Math.max(1, Number(item.quantity || 1));
      await EquipmentComboItem.create({
        comboId: combo.id,
        equipmentId,
        quantity,
        note: item.note ? String(item.note) : null,
        sortOrder: Number(item.sortOrder || index + 1),
      }, { transaction: t });
    }

    return loadCombo(combo.id, { transaction: t });
  });
}

async function updateCombo(comboId, payload) {
  const combo = await EquipmentCombo.findByPk(comboId);
  ensure(combo, 'Combo không tồn tại', 404);
  return sequelize.transaction(async (t) => {
    const next = {
      name: payload?.name != null ? String(payload.name).trim() : combo.name,
      code: payload?.code != null ? String(payload.code).trim() : combo.code,
      description: payload?.description != null ? String(payload.description).trim() : combo.description,
      price: payload?.price != null ? roundMoney(payload.price) : combo.price,
      status: payload?.status === 'inactive' ? 'inactive' : payload?.status === 'active' ? 'active' : combo.status,
      thumbnail: payload?.thumbnail !== undefined ? payload.thumbnail || null : combo.thumbnail,
      supplierId: payload?.supplierId !== undefined ? (payload.supplierId ? Number(payload.supplierId) : null) : combo.supplierId,
      isSelling: payload?.isSelling !== undefined ? Boolean(payload.isSelling) : combo.isSelling,
    };
    if (next.supplierId) {
      const supplier = await Supplier.findByPk(next.supplierId, { transaction: t });
      ensure(supplier, 'Supplier not found', 404);
    }
    await combo.update(next, { transaction: t });

    if (Array.isArray(payload?.items)) {
      await EquipmentComboItem.destroy({ where: { comboId: combo.id }, transaction: t });
      for (let index = 0; index < payload.items.length; index += 1) {
        const item = payload.items[index];
        const equipmentId = Number(item.equipmentId || item.id);
        ensure(equipmentId > 0, `equipmentId is invalid at item ${index + 1}`);
        const equipment = await Equipment.findByPk(equipmentId, { transaction: t });
        ensure(equipment, `Equipment ${equipmentId} not found`, 404);
        await EquipmentComboItem.create({
          comboId: combo.id,
          equipmentId,
          quantity: Math.max(1, Number(item.quantity || 1)),
          note: item.note ? String(item.note) : null,
          sortOrder: Number(item.sortOrder || index + 1),
        }, { transaction: t });
      }
    }

    return loadCombo(combo.id, { transaction: t });
  });
}

async function deleteCombo(comboId) {
  const combo = await EquipmentCombo.findByPk(comboId);
  ensure(combo, 'Combo không tồn tại', 404);
  const pendingRequest = await PurchaseRequest.findOne({
    where: {
      comboId: combo.id,
      status: {
        [Op.in]: [
          REQUEST_STATUSES.SUBMITTED,
          REQUEST_STATUSES.PAID_WAITING_ADMIN_CONFIRM,
          REQUEST_STATUSES.SHIPPING,
          REQUEST_STATUSES.APPROVED_WAITING_PAYMENT,
        ],
      },
    },
  });
  ensure(!pendingRequest, 'Không thể xóa combo đang có request xử lý');
  await EquipmentCombo.destroy({ where: { id: combo.id } });
  return { success: true };
}

async function toggleComboSelling(comboId, isSelling) {
  const combo = await EquipmentCombo.findByPk(comboId);
  ensure(combo, 'Combo không tồn tại', 404);
  combo.isSelling = Boolean(isSelling);
  if (!combo.isSelling) combo.status = 'inactive';
  if (combo.isSelling && combo.status !== 'active') combo.status = 'active';
  await combo.save();
  return combo;
}



async function ensureOwnerComboStock(request, combo, ownerUserId, transaction) {
  const comboItems = Array.isArray(combo?.items) ? combo.items : [];
  if (!comboItems.length) return;

  const existingLogs = await Inventory.findAll({
    where: {
      gymId: request.gymId,
      transactionType: 'transfer_in',
      transactionId: request.id,
      transactionCode: request.code,
    },
    transaction,
    lock: transaction?.LOCK?.SHARE,
  });
  const loggedEquipmentIds = new Set(existingLogs.map((row) => Number(row.equipmentId)).filter(Boolean));

  for (const item of comboItems) {
    const equipmentId = Number(item.equipmentId || item?.equipment?.id || 0);
    const quantity = Math.max(0, Number(item.quantity || 0));
    if (!equipmentId || !quantity || loggedEquipmentIds.has(equipmentId)) continue;

    let ownerStock = await EquipmentStock.findOne({
      where: { gymId: request.gymId, equipmentId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!ownerStock) {
      ownerStock = await EquipmentStock.create(
        { gymId: request.gymId, equipmentId, quantity: 0, availableQuantity: 0 },
        { transaction }
      );
    }

    const before = Number(ownerStock.quantity || 0);
    ownerStock.quantity = before + quantity;
    ownerStock.availableQuantity = Number(ownerStock.availableQuantity || 0) + quantity;
    ownerStock.lastRestocked = new Date();
    await ownerStock.save({ transaction });

    await Inventory.create({
      gymId: request.gymId,
      equipmentId,
      transactionType: 'transfer_in',
      transactionId: request.id,
      transactionCode: request.code,
      quantity,
      unitPrice: item?.equipment?.price || 0,
      totalValue: Number(item?.equipment?.price || 0) * quantity,
      stockBefore: before,
      stockAfter: Number(ownerStock.quantity || 0),
      notes: `Owner xác nhận đã nhận combo ${request.code}`,
      recordedBy: ownerUserId || null,
      recordedAt: new Date(),
    }, { transaction });

    const now = Date.now();
    const seed = Math.floor(Math.random() * 1000000);
    const tmpPrefix = `TMP-${request.id}-${equipmentId}-${now}-${seed}`;
    const units = [];
    for (let idx = 0; idx < quantity; idx += 1) {
      // eslint-disable-next-line no-await-in-loop
      const publicToken = await genUniquePublicToken({ transaction });
      units.push({
        equipmentId,
        gymId: request.gymId,
        assetCode: `${tmpPrefix}-${idx + 1}`,
        publicToken,
        qrUrl: buildPublicQrUrl(publicToken),
        status: 'active',
        usageStatus: 'in_stock',
        lifecycleStatus: 'active',
        ownerId: ownerUserId || null,
        purchaseRequestId: request.id,
        comboId: request.comboId || null,
        deliveredAt: new Date(),
        notes: `Sinh ra từ combo ${request.code}`,
      });
    }

    const createdUnits = units.length ? await EquipmentUnit.bulkCreate(units, { transaction }) : [];
    if (createdUnits.length) {
      for (const unit of createdUnits) {
        // eslint-disable-next-line no-await-in-loop
        await EquipmentUnit.update(
          { assetCode: `GFMS-EQ-${pad6(unit.id)}` },
          { where: { id: unit.id }, transaction }
        );
      }

      await logEquipmentUnitEvents(
        createdUnits.map((unit) => ({
          equipmentUnitId: unit.id,
          equipmentId,
          gymId: request.gymId,
          eventType: 'created',
          referenceType: 'purchase_request',
          referenceId: request.id,
          performedBy: ownerUserId || null,
          notes: `Owner xác nhận nhận combo ${request.code}`,
          metadata: { purchaseRequestCode: request.code, source: 'combo_confirm_receive' },
          eventAt: new Date(),
        })),
        { transaction }
      );
    }
  }
}

async function createOwnerComboRequest(ownerUserId, payload) {
  const comboId = Number(payload?.comboId || 0);
  const gymId = Number(payload?.gymId || payload?.branchId || 0);
  ensure(comboId > 0, 'comboId is required');
  ensure(gymId > 0, 'gymId is required');
  const combo = await loadCombo(comboId);
  ensure(combo, 'Combo không tồn tại', 404);
  ensure(combo.status === 'active' && combo.isSelling, 'Combo hiện không mở bán', 400);
  const gym = await Gym.findByPk(gymId);
  ensure(gym && Number(gym.ownerId) === Number(ownerUserId), 'Gym not found or not authorized', 403);

  return sequelize.transaction(async (t) => {
    const count = await PurchaseRequest.count({ transaction: t });
    const totalAmount = roundMoney(combo.price);
    const firstEquipmentId = combo.items?.[0]?.equipmentId || null;
    const request = await PurchaseRequest.create({
      code: `CBR-${Date.now()}-${count + 1}`,
      gymId,
      equipmentId: firstEquipmentId,
      comboId: combo.id,
      expectedSupplierId: combo.supplierId || null,
      requestedBy: ownerUserId,
      quantity: 1,
      expectedUnitPrice: totalAmount,
      availableQty: 0,
      issueQty: 0,
      purchaseQty: 1,
      payableAmount: totalAmount,
      totalAmount,
      depositAmount: 0,
      finalAmount: totalAmount,
      remainingAmount: totalAmount,
      reason: 'combo_purchase',
      priority: 'normal',
      note: payload?.note ? String(payload.note) : null,
      contactName: payload?.contactName ? String(payload.contactName) : null,
      contactPhone: payload?.contactPhone ? String(payload.contactPhone) : null,
      contactEmail: payload?.contactEmail ? String(payload.contactEmail) : null,
      status: REQUEST_STATUSES.SUBMITTED,
      stockSnapshot: {
        comboName: combo.name,
        comboCode: combo.code,
        comboItems: (combo.items || []).map((item) => ({
          equipmentId: item.equipmentId,
          equipmentName: item.equipment?.name || null,
          quantity: item.quantity,
        })),
        supplier: combo.supplier ? { id: combo.supplier.id, name: combo.supplier.name } : null,
        comboSnapshot: buildComboSnapshot(combo),
      },
    }, { transaction: t });

    t.afterCommit(async () => {
      await realtimeService.notifyAdministrators({
        title: 'Có yêu cầu mua combo mới',
        message: `${request.code} · ${gym.name} · ${combo.name} · Chờ admin duyệt`,
        notificationType: 'purchase_request',
        relatedType: 'purchaserequest',
        relatedId: request.id,
      });
    });

    return serializeRequestRecord(request);
  });
}

async function ownerListRequests(ownerUserId, query = {}) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
  const offset = (page - 1) * limit;
  const ownerGyms = await Gym.findAll({ where: { ownerId: ownerUserId }, attributes: ['id'], raw: true });
  const gymIds = ownerGyms.map((g) => g.id);
  if (!gymIds.length) return { data: [], meta: { page, limit, totalItems: 0, totalPages: 0 } };
  const where = { gymId: { [Op.in]: gymIds }, comboId: { [Op.ne]: null } };
  if (query.status && query.status !== 'all') where.status = query.status;
  if (query.gymId && query.gymId !== 'all') where.gymId = Number(query.gymId);
  const keyword = String(query.q || '').trim();
  if (keyword) {
    where[Op.or] = [
      { code: { [Op.like]: `%${keyword}%` } },
      { note: { [Op.like]: `%${keyword}%` } },
      { '$combo.name$': { [Op.like]: `%${keyword}%` } },
    ];
  }
  const { rows, count } = await PurchaseRequest.findAndCountAll({
    where,
    include: [
      { model: Gym, as: 'gym', attributes: ['id', 'name'] },
      { model: EquipmentCombo, as: 'combo', include: [
        { model: Supplier, as: 'supplier', attributes: ['id', 'name', 'code', 'email', 'phone'], required: false },
        {
          model: EquipmentComboItem,
          as: 'items',
          required: false,
          include: [{
            model: Equipment,
            as: 'equipment',
            attributes: ['id', 'name', 'code', 'description', 'price', 'brand', 'model', 'status', 'specifications'],
            include: [
              { model: EquipmentImage, as: 'images', required: false, attributes: ['id', 'url', 'isPrimary', 'sortOrder', 'altText'] },
              { model: EquipmentCategory, as: 'category', required: false, attributes: ['id', 'name', 'code'] },
              { model: Supplier, as: 'preferredSupplier', required: false, attributes: ['id', 'name', 'code'] },
            ],
          }],
        },
      ] },
      { model: Transaction, as: 'payments', required: false, where: { transactionType: 'equipment_purchase' } },
    ],
    order: [['createdAt', 'DESC']],
    limit,
    offset,
    distinct: true,
  });
  return { data: rows.map(serializeRequestRecord), meta: { page, limit, totalItems: count, totalPages: Math.ceil(count / limit) } };
}

async function ownerGetRequestDetail(ownerUserId, requestId) {
  const request = await PurchaseRequest.findByPk(requestId, {
    include: [
      { model: Gym, as: 'gym', attributes: ['id', 'name', 'ownerId'] },
      { model: EquipmentCombo, as: 'combo', include: [
        { model: Supplier, as: 'supplier', attributes: ['id', 'name', 'code', 'email', 'phone'], required: false },
        {
          model: EquipmentComboItem,
          as: 'items',
          required: false,
          include: [{
            model: Equipment,
            as: 'equipment',
            attributes: ['id', 'name', 'code', 'description', 'price', 'brand', 'model', 'status', 'specifications'],
            include: [
              { model: EquipmentImage, as: 'images', required: false, attributes: ['id', 'url', 'isPrimary', 'sortOrder', 'altText'] },
              { model: EquipmentCategory, as: 'category', required: false, attributes: ['id', 'name', 'code'] },
              { model: Supplier, as: 'preferredSupplier', required: false, attributes: ['id', 'name', 'code'] },
            ],
          }],
        },
      ] },
      { model: Transaction, as: 'payments', required: false },
    ],
    order: [[{ model: Transaction, as: 'payments' }, 'createdAt', 'DESC']],
  });
  ensure(request, 'Purchase request not found', 404);
  ensure(Number(request.gym?.ownerId) === Number(ownerUserId), 'Not authorized', 403);
  return serializeRequestRecord(request);
}

async function adminListRequests(query = {}) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
  const offset = (page - 1) * limit;
  const where = { comboId: { [Op.ne]: null } };
  if (query.status && query.status !== 'all') where.status = query.status;
  if (query.gymId && query.gymId !== 'all') where.gymId = Number(query.gymId);
  const keyword = String(query.q || '').trim();
  if (keyword) {
    where[Op.or] = [
      { code: { [Op.like]: `%${keyword}%` } },
      { note: { [Op.like]: `%${keyword}%` } },
      { '$combo.name$': { [Op.like]: `%${keyword}%` } },
      { '$gym.name$': { [Op.like]: `%${keyword}%` } },
    ];
  }
  const { rows, count } = await PurchaseRequest.findAndCountAll({
    where,
    include: [
      { model: Gym, as: 'gym', attributes: ['id', 'name'] },
      { model: EquipmentCombo, as: 'combo', include: [
        { model: Supplier, as: 'supplier', attributes: ['id', 'name', 'code', 'email', 'phone'], required: false },
        {
          model: EquipmentComboItem,
          as: 'items',
          required: false,
          include: [{
            model: Equipment,
            as: 'equipment',
            attributes: ['id', 'name', 'code', 'description', 'price', 'brand', 'model', 'status', 'specifications'],
            include: [
              { model: EquipmentImage, as: 'images', required: false, attributes: ['id', 'url', 'isPrimary', 'sortOrder', 'altText'] },
              { model: EquipmentCategory, as: 'category', required: false, attributes: ['id', 'name', 'code'] },
              { model: Supplier, as: 'preferredSupplier', required: false, attributes: ['id', 'name', 'code'] },
            ],
          }],
        },
      ] },
      { model: User, as: 'requester', attributes: ['id', 'username', 'email'] },
      { model: Transaction, as: 'payments', required: false },
    ],
    order: [['createdAt', 'DESC']],
    limit,
    offset,
    distinct: true,
  });
  return { data: rows.map(serializeRequestRecord), meta: { page, limit, total: count } };
}

async function adminGetRequestDetail(requestId) {
  return ownerGetRequestDetail(Number.MAX_SAFE_INTEGER, requestId).catch(async (e) => {
    const request = await PurchaseRequest.findByPk(requestId, {
      include: [
        { model: Gym, as: 'gym', attributes: ['id', 'name', 'ownerId'] },
        { model: User, as: 'requester', attributes: ['id', 'username', 'email'] },
        { model: EquipmentCombo, as: 'combo', include: [{ model: Supplier, as: 'supplier', required: false }, { model: EquipmentComboItem, as: 'items', include: [{ model: Equipment, as: 'equipment', attributes: ['id', 'name', 'code'] }] }] },
        { model: Transaction, as: 'payments', required: false },
      ],
      order: [[{ model: Transaction, as: 'payments' }, 'createdAt', 'DESC']],
    });
    ensure(request, 'Purchase request not found', 404);
    return serializeRequestRecord(request);
  });
}

async function assertRequestStatus(request, expectedStatus, message) {
  ensure(String(request.status) === expectedStatus, message || `Request must be ${expectedStatus}`);
}

async function approveRequest(requestId) {
  return sequelize.transaction(async (t) => {
    const request = await PurchaseRequest.findByPk(requestId, { transaction: t, lock: t.LOCK.UPDATE, include: [{ model: EquipmentCombo, as: 'combo' }] });
    ensure(request, 'Purchase request not found', 404);
    ensure(request.comboId, 'Request không thuộc combo flow', 400);
    await assertRequestStatus(request, REQUEST_STATUSES.SUBMITTED, 'Chỉ request submitted mới được duyệt');
    request.status = REQUEST_STATUSES.APPROVED_WAITING_PAYMENT;
    request.approvedAt = new Date();
    request.rejectReason = null;
    request.adminRejectionNote = null;
    await request.save({ transaction: t });
    t.afterCommit(async () => {
      await realtimeService.notifyUser(request.requestedBy, {
        title: 'Yêu cầu mua combo đã được duyệt',
        message: `${request.code} đã được duyệt. Bạn có thể thanh toán 100% cho combo ${request.combo?.name || ''}.`,
        notificationType: 'purchase_request',
        relatedType: 'purchaserequest',
        relatedId: request.id,
      });
    });
    return serializeRequestRecord(request);
  });
}

async function rejectRequest(requestId, reason) {
  return sequelize.transaction(async (t) => {
    const request = await PurchaseRequest.findByPk(requestId, { transaction: t, lock: t.LOCK.UPDATE });
    ensure(request, 'Purchase request not found', 404);
    ensure(request.comboId, 'Request không thuộc combo flow', 400);
    await assertRequestStatus(request, REQUEST_STATUSES.SUBMITTED, 'Chỉ request submitted mới được từ chối');
    const rejectReason = String(reason || '').trim();
    ensure(rejectReason, 'Missing rejectionReason');
    request.status = REQUEST_STATUSES.REJECTED;
    request.rejectReason = rejectReason;
    request.adminRejectionNote = rejectReason;
    request.rejectedAt = new Date();
    await request.save({ transaction: t });
    t.afterCommit(async () => {
      await realtimeService.notifyUser(request.requestedBy, {
        title: 'Yêu cầu mua combo bị từ chối',
        message: `${request.code}: ${rejectReason}`,
        notificationType: 'purchase_request',
        relatedType: 'purchaserequest',
        relatedId: request.id,
      });
    });
    return serializeRequestRecord(request);
  });
}

async function shipRequest(requestId, adminUserId, req) {
  return sequelize.transaction(async (t) => {
    const request = await PurchaseRequest.findByPk(requestId, { transaction: t, lock: t.LOCK.UPDATE });
    ensure(request, 'Purchase request not found', 404);
    ensure(request.comboId, 'Request không thuộc combo flow', 400);
    await assertRequestStatus(
      request,
      REQUEST_STATUSES.PAID_WAITING_ADMIN_CONFIRM,
      'Chỉ request đã thanh toán thành công mới được chuyển shipping'
    );
    const anyPaid = await Transaction.findOne({
      where: {
        purchaseRequestId: request.id,
        transactionType: 'equipment_purchase',
        paymentStatus: 'completed',
      },
      transaction: t,
      lock: t.LOCK.SHARE,
    });
    ensure(anyPaid, 'Không thể shipping khi chưa có giao dịch thanh toán thành công');
    const oldValues = request.toJSON ? request.toJSON() : request;
    request.status = REQUEST_STATUSES.SHIPPING;
    request.shippingAt = new Date();
    await request.save({ transaction: t });
    if (AuditLog) {
      await AuditLog.create(
        {
          userId: Number(adminUserId || 0) || null,
          action: 'COMBO_PURCHASE_SHIPPING',
          tableName: 'purchaserequest',
          recordId: request.id,
          oldValues,
          newValues: request.toJSON ? request.toJSON() : request,
          ipAddress: req?.ip || null,
          userAgent: req?.headers?.['user-agent'] || null,
        },
        { transaction: t }
      );
    }
    t.afterCommit(async () => {
      await realtimeService.notifyUser(request.requestedBy, {
        title: 'Combo đang được bàn giao',
        message: `${request.code} đã được admin xác nhận giao hàng.`,
        notificationType: 'purchase_request',
        relatedType: 'purchaserequest',
        relatedId: request.id,
      });
    });
    return serializeRequestRecord(request);
  });
}

async function confirmReceived(ownerUserId, requestId, req) {
  return sequelize.transaction(async (t) => {
    const request = await PurchaseRequest.findByPk(requestId, {
      transaction: t,
      lock: t.LOCK.UPDATE,
      include: [
        { model: Gym, as: 'gym', attributes: ['id', 'ownerId'] },
        {
          model: EquipmentCombo,
          as: 'combo',
          include: [
            { model: Supplier, as: 'supplier', attributes: ['id', 'name', 'code'], required: false },
            {
              model: EquipmentComboItem,
              as: 'items',
              required: false,
              include: [{
                model: Equipment,
                as: 'equipment',
                attributes: ['id', 'name', 'code', 'description', 'price', 'brand', 'model', 'status', 'specifications'],
                include: [
                  { model: EquipmentImage, as: 'images', required: false, attributes: ['id', 'url', 'isPrimary', 'sortOrder', 'altText'] },
                  { model: EquipmentCategory, as: 'category', required: false, attributes: ['id', 'name', 'code'] },
                  { model: Supplier, as: 'preferredSupplier', required: false, attributes: ['id', 'name', 'code'] },
                ],
              }],
            },
          ],
        },
      ],
    });
    ensure(request, 'Purchase request not found', 404);
    ensure(Number(request.gym?.ownerId) === Number(ownerUserId), 'Not authorized', 403);
    ensure(request.comboId, 'Request không thuộc combo flow', 400);
    await assertRequestStatus(request, REQUEST_STATUSES.SHIPPING, 'Chỉ request đang shipping mới được xác nhận đã nhận combo');

    await ensureOwnerComboStock(request, request.combo, ownerUserId, t);

    const oldValues = request.toJSON ? request.toJSON() : request;
    request.status = REQUEST_STATUSES.COMPLETED;
    request.confirmedReceivedAt = new Date();
    request.completedAt = new Date();
    request.remainingAmount = 0;
    await request.save({ transaction: t });
    if (AuditLog) {
      await AuditLog.create(
        {
          userId: Number(ownerUserId || 0) || null,
          action: 'COMBO_PURCHASE_COMPLETED',
          tableName: 'purchaserequest',
          recordId: request.id,
          oldValues,
          newValues: request.toJSON ? request.toJSON() : request,
          ipAddress: req?.ip || null,
          userAgent: req?.headers?.['user-agent'] || null,
        },
        { transaction: t }
      );
    }
    t.afterCommit(async () => {
      await realtimeService.notifyAdministrators({
        title: 'Owner đã xác nhận nhận combo',
        message: `${request.code} đã nhận combo và hoàn tất giao dịch.`,
        notificationType: 'purchase_request',
        relatedType: 'purchaserequest',
        relatedId: request.id,
      });
      await realtimeService.emitUser(request.requestedBy, 'equipment:changed', {
        relatedType: 'purchaserequest',
        relatedId: request.id,
        gymId: request.gymId,
        code: request.code,
      });
    });
    return serializeRequestRecord(request);
  });
}

async function findActivePendingPayment(requestId, phase, transaction) {
  return Transaction.findOne({
    where: {
      purchaseRequestId: requestId,
      transactionType: 'equipment_purchase',
      paymentPhase: phase,
      paymentStatus: { [Op.in]: Array.from(ACTIVE_PENDING_STATUSES) },
      [Op.or]: [{ expiresAt: null }, { expiresAt: { [Op.gt]: new Date() } }],
    },
    order: [['id', 'DESC']],
    transaction,
  });
}

async function createPaymentLink(ownerUserId, requestId, phase) {
  return sequelize.transaction(async (t) => {
    const request = await PurchaseRequest.findByPk(requestId, { transaction: t, lock: t.LOCK.UPDATE, include: [{ model: Gym, as: 'gym', attributes: ['id', 'ownerId'] }, { model: EquipmentCombo, as: 'combo', attributes: ['id', 'name', 'code', 'price'] }] });
    ensure(request, 'Purchase request not found', 404);
    ensure(Number(request.gym?.ownerId) === Number(ownerUserId), 'Not authorized', 403);
    ensure(request.comboId, 'Request không thuộc combo flow', 400);
    await assertRequestStatus(request, REQUEST_STATUSES.APPROVED_WAITING_PAYMENT, 'Chỉ request approved_waiting_payment mới được tạo link thanh toán');
    const normalizedPhase = 'full';
    if (phase != null && String(phase).toLowerCase() !== 'full') {
      ensure(false, 'Combo chỉ hỗ trợ thanh toán 100% một lần (full)', 400);
    }

    const existing = await findActivePendingPayment(request.id, normalizedPhase, t);
    if (existing) {
      return {
        checkoutUrl: existing.paymentLink || existing.metadata?.payos?.checkoutUrl || null,
        orderCode: existing.payosOrderCode || existing.id,
        transactionId: existing.id,
        amount: Number(existing.amount || 0),
        reused: true,
      };
    }

    const amount = phaseAmountFromRequest(request, normalizedPhase);
    ensure(amount > 0, 'Số tiền thanh toán không hợp lệ');

    const tx = await Transaction.create({
      transactionCode: genCode('CBPY'),
      gymId: request.gymId,
      purchaseRequestId: request.id,
      amount,
      transactionType: 'equipment_purchase',
      paymentMethod: 'payos',
      paymentStatus: 'pending',
      paymentPhase: normalizedPhase,
      paymentProvider: 'PAYOS',
      description: `${request.code} - ${request.combo?.name || 'Combo'} - full`,
      transactionDate: new Date(),
      processedBy: ownerUserId,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      metadata: {
        purchaseRequestId: request.id,
        purchaseRequestCode: request.code,
        comboId: request.comboId,
        comboName: request.combo?.name || null,
        paymentPhase: normalizedPhase,
      },
    }, { transaction: t });

    const frontendOrigin = String(process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '');
    const defaultOwnerHistoryPath = '/owner/purchase-requests/history';
    const rawReturnBase = String(process.env.PAYOS_RETURN_URL || '').trim();
    const rawCancelBase = String(process.env.PAYOS_CANCEL_URL || '').trim();

    const normalizeOwnerHistoryUrl = (rawValue) => {
      if (!rawValue) return `${frontendOrigin}${defaultOwnerHistoryPath}`;
      const normalizedRaw = String(rawValue).trim();
      const absolute = /^https?:\/\//i.test(normalizedRaw)
        ? normalizedRaw
        : `${frontendOrigin}${normalizedRaw.startsWith('/') ? normalizedRaw : `/${normalizedRaw}`}`;
      return absolute.includes(defaultOwnerHistoryPath)
        ? absolute.replace(/\/+$/, '')
        : `${frontendOrigin}${defaultOwnerHistoryPath}`;
    };

    const normalizedFrontEndReturn = normalizeOwnerHistoryUrl(rawReturnBase);
    const normalizedFrontEndCancel = normalizeOwnerHistoryUrl(rawCancelBase);
    const returnUrl = `${normalizedFrontEndReturn}${normalizedFrontEndReturn.includes('?') ? '&' : '?'}payos=success&orderCode=${encodeURIComponent(tx.id)}&purchaseRequestId=${encodeURIComponent(request.id)}`;
    const cancelUrl = `${normalizedFrontEndCancel}${normalizedFrontEndCancel.includes('?') ? '&' : '?'}payos=cancel&purchaseRequestId=${encodeURIComponent(request.id)}`;
    const payment = await payosService.createPaymentLink({
      orderCode: tx.id,
      amount,
      description: `${request.code}-${request.combo?.code || request.comboId}-full`,
      returnUrl,
      cancelUrl,
      metadata: {
        purchaseRequestId: request.id,
        comboId: request.comboId,
        phase: normalizedPhase,
      },
    });

    await tx.update({
      payosOrderCode: String(payment.orderCode),
      paymentLink: payment.checkoutUrl,
      metadata: {
        ...(tx.metadata || {}),
        payos: {
          orderCode: payment.orderCode,
          paymentLinkId: payment.paymentLinkId,
          checkoutUrl: payment.checkoutUrl,
        },
      },
    }, { transaction: t });

    return { checkoutUrl: payment.checkoutUrl, orderCode: payment.orderCode, paymentLinkId: payment.paymentLinkId, transactionId: tx.id, amount };
  });
}

async function handleSuccessfulPayment(tx, payload, source = 'webhook') {
  const meta = parseMeta(tx.metadata);
  const requestId = Number(tx.purchaseRequestId || meta.purchaseRequestId || 0);
  ensure(requestId > 0, 'Thiếu purchaseRequestId trong transaction', 400);
  const phase = String(tx.paymentPhase || meta.paymentPhase || '').toLowerCase();
  ensure(phase === 'full', 'Combo chỉ hỗ trợ thanh toán full (100%)', 400);

  return sequelize.transaction(async (t) => {
    const lockedTx = await Transaction.findByPk(tx.id, { transaction: t, lock: t.LOCK.UPDATE });
    if (lockedTx.paymentStatus === 'completed') {
      return { transaction: lockedTx, request: await PurchaseRequest.findByPk(requestId, { transaction: t }) };
    }
    const request = await PurchaseRequest.findByPk(requestId, { transaction: t, lock: t.LOCK.UPDATE, include: [{ model: EquipmentCombo, as: 'combo', attributes: ['id', 'name'] }] });
    ensure(request, 'Purchase request not found', 404);

    lockedTx.paymentStatus = 'completed';
    lockedTx.paidAt = new Date();
    lockedTx.transactionDate = new Date();
    lockedTx.rawPayload = payload || null;
    lockedTx.metadata = {
      ...(lockedTx.metadata || {}),
      [`payos${source[0].toUpperCase()}${source.slice(1)}`]: payload,
    };
    await lockedTx.save({ transaction: t });

    // Flow mới:
    // - PayOS báo thanh toán thành công (kể cả 100%) => request chuyển sang paid_waiting_admin_confirm
    // - Không tự cộng kho / completed khi vừa thanh toán
    // - Chỉ khi owner xác nhận đã nhận combo thì mới cộng kho + completed
    if (request.status === REQUEST_STATUSES.APPROVED_WAITING_PAYMENT) {
      request.status = REQUEST_STATUSES.PAID_WAITING_ADMIN_CONFIRM;
      request.remainingAmount = 0;
      await request.save({ transaction: t });
    }

    t.afterCommit(async () => {
      await realtimeService.notifyUser(request.requestedBy, {
        title: 'Đã ghi nhận thanh toán combo',
        message: `${request.code} · ${request.combo?.name || 'Combo'} · Đã thanh toán thành công, chờ admin xác nhận và chuyển hàng.`,
        notificationType: 'payment',
        relatedType: 'purchaserequest',
        relatedId: request.id,
      });
      await realtimeService.notifyAdministrators({
        title: 'PayOS ghi nhận thanh toán combo',
        message: `${request.code} vừa thanh toán thành công, chờ admin chuyển sang shipping.`,
        notificationType: 'payment',
        relatedType: 'purchaserequest',
        relatedId: request.id,
      });
    });

    return { transaction: lockedTx, request };
  });
}

module.exports = {
  REQUEST_STATUSES,
  ensure,
  parseMeta,
  roundMoney,
  listCombos,
  getComboDetail,
  createCombo,
  updateCombo,
  deleteCombo,
  toggleComboSelling,
  createOwnerComboRequest,
  ownerListRequests,
  ownerGetRequestDetail,
  adminListRequests,
  adminGetRequestDetail,
  approveRequest,
  rejectRequest,
  shipRequest,
  confirmReceived,
  createPaymentLink,
  handleSuccessfulPayment,
};
