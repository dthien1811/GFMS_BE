import db from "../../models";
import { Op } from "sequelize";
import realtimeService from "../realtime.service";

const { Equipment, Gym, EquipmentCategory, EquipmentStock, EquipmentUnit, EquipmentUnitEvent, Maintenance, User } = db;

const emitEquipmentChanged = (userIds = [], payload = {}) => {
  [...new Set((userIds || []).filter(Boolean).map(Number))].forEach((userId) => {
    realtimeService.emitUser(userId, "equipment:changed", payload);
  });
};

const parseMetadata = (raw) => {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const inferMaintenanceSnapshotType = (row) => {
  const status = String(row?.status || "").toLowerCase();
  if (status === "pending") return "maintenance_requested";
  if (status === "approve") return "maintenance_approved";
  if (status === "assigned") return "maintenance_assigned";
  if (status === "in_progress") return "maintenance_started";
  if (status === "completed") return "maintenance_completed";
  if (status === "cancelled") {
    return String(row?.notes || "").includes("[REJECT_REASON]:")
      ? "maintenance_rejected"
      : "maintenance_cancelled";
  }
  return "maintenance_requested";
};

const inferMaintenanceSnapshotTime = (row) => {
  const status = String(row?.status || "").toLowerCase();
  if (status === "completed") return row.completionDate || row.updatedAt || row.createdAt;
  if (status === "approve") return row.scheduledDate || row.updatedAt || row.createdAt;
  return row.updatedAt || row.createdAt;
};

const parsePaging = (query) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
};

const normalizeDateFloor = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
};

const normalizeDateCeil = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(23, 59, 59, 999);
  return date;
};

const classifyEventGroup = (eventType) => {
  const normalized = String(eventType || "").toLowerCase();
  if (normalized.startsWith("maintenance_")) return "maintenance";
  if (normalized.startsWith("transfer_")) return "transfer";
  if (["created", "deployed_to_use", "stored_in_stock"].includes(normalized)) return "inventory";
  if (normalized === "disposed") return "disposal";
  return "other";
};

const parseIntegerList = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map(Number).filter((item) => Number.isInteger(item) && item > 0);
  }
  return String(value)
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item) && item > 0);
};

  const uniqueIntegerList = (value) => [...new Set(parseIntegerList(value))];

const buildUnitSummaryMap = async (rows = []) => {
  const pairs = rows
    .map((row) => ({ equipmentId: Number(row.equipmentId), gymId: Number(row.gymId) }))
    .filter((row) => row.equipmentId && row.gymId);

  if (!pairs.length) return new Map();

  const equipmentIds = [...new Set(pairs.map((row) => row.equipmentId))];
  const gymIds = [...new Set(pairs.map((row) => row.gymId))];

  const units = await EquipmentUnit.findAll({
    attributes: ["equipmentId", "gymId", "status", "usageStatus", [db.Sequelize.fn("COUNT", db.Sequelize.col("id")), "count"]],
    where: {
      equipmentId: { [Op.in]: equipmentIds },
      gymId: { [Op.in]: gymIds },
    },
    group: ["equipmentId", "gymId", "status", "usageStatus"],
    raw: true,
  });

  const summary = new Map();
  units.forEach((unit) => {
    const key = `${unit.gymId}:${unit.equipmentId}`;
    const current = summary.get(key) || {
      activeQuantity: 0,
      inStockQuantity: 0,
      inUseQuantity: 0,
      maintenanceQuantity: 0,
      transferPendingQuantity: 0,
      disposedQuantity: 0,
    };

    const count = Number(unit.count || 0);
    if (unit.status === "active") {
      current.activeQuantity += count;
      if (unit.usageStatus === "in_use") current.inUseQuantity += count;
      else current.inStockQuantity += count;
    }
    if (unit.status === "in_maintenance") current.maintenanceQuantity += count;
    if (unit.status === "transfer_pending") current.transferPendingQuantity += count;
    if (unit.status === "disposed") current.disposedQuantity += count;
    summary.set(key, current);
  });

  return summary;
};

const ownerEquipmentService = {
  // Get all equipment for owner's gyms (via EquipmentStock)
  async getEquipments(ownerUserId, query) {
    const { page, limit, offset } = parsePaging(query);
    const { q, status, categoryId, gymId } = query;
    const onlyInUse = String(query.onlyInUse || "false").toLowerCase() === "true";
    const aggregateByEquipment = String(query.aggregateByEquipment || "false").toLowerCase() === "true";

    // Get owner's gyms - filter theo ownerUserId
    const ownerGyms = await Gym.findAll({
      where: { ownerId: ownerUserId },
      attributes: ["id"],
      raw: true,
    });
    const gymIds = ownerGyms.map((g) => g.id);

    if (gymIds.length === 0) {
      return { data: [], meta: { page, limit, totalItems: 0, totalPages: 0 } };
    }

    const where = { gymId: { [Op.in]: gymIds } };

    if (gymId) {
      where.gymId = Number(gymId);
    }

    const requestedStatus = String(status || "all").trim().toLowerCase();

    // Build Equipment where for filtering
    const equipmentWhere = {};
    if (["active", "discontinued"].includes(requestedStatus)) {
      equipmentWhere.status = status;
    }
    if (categoryId && categoryId !== "all") {
      equipmentWhere.categoryId = Number(categoryId);
    }
    if (q) {
      equipmentWhere[Op.or] = [
        { name: { [Op.like]: `%${q}%` } },
        { code: { [Op.like]: `%${q}%` } },
      ];
    }

    const stockQuery = {
      attributes: ["id", "equipmentId", "gymId", "quantity", "availableQuantity", "reservedQuantity"],
      where,
      include: [
        {
          model: Equipment,
          as: "equipment",
          required: true,
          attributes: ["id", "name", "code", "categoryId", "status", "description", "price"],
          where: equipmentWhere,
          include: [
            { model: EquipmentCategory, as: "category", required: false, attributes: ["id", "name"] },
          ],
        },
        { model: Gym, as: "gym", required: false, attributes: ["id", "name"] },
      ],
      order: [["createdAt", "DESC"]],
      distinct: true,
    };

    let rows = [];
    let count = 0;
    if (onlyInUse || aggregateByEquipment) {
      rows = await EquipmentStock.findAll(stockQuery);
      count = rows.length;
    } else {
      const pagedResult = await EquipmentStock.findAndCountAll({
        ...stockQuery,
        limit,
        offset,
      });
      rows = pagedResult.rows;
      count = pagedResult.count;
    }

    const unitSummaryMap = await buildUnitSummaryMap(rows);

    // Flatten the response to show Equipment properties
    const flattenedRows = rows.map((stock) => ({
      stockId: stock.id,
      id: stock.equipment.id,
      name: stock.equipment.name,
      code: stock.equipment.code,
      status: stock.equipment.status,
      description: stock.equipment.description,
      price: stock.equipment.price,
      categoryId: stock.equipment.categoryId,
      EquipmentCategory: stock.equipment.category,
      Gym: stock.gym,
      stock: {
        id: stock.id,
        quantity: stock.quantity,
        availableQuantity: stock.availableQuantity,
        reservedQuantity: stock.reservedQuantity,
      },
      unitSummary:
        unitSummaryMap.get(`${stock.gymId}:${stock.equipmentId}`) || {
          activeQuantity: Number(stock.availableQuantity || 0),
          inStockQuantity: Number(stock.availableQuantity || 0),
          inUseQuantity: 0,
          maintenanceQuantity: 0,
          transferPendingQuantity: 0,
          disposedQuantity: 0,
        },
    })).filter((row) => {
      if (requestedStatus === "maintenance") {
        return Number(row.unitSummary?.maintenanceQuantity || 0) > 0;
      }
      if (requestedStatus === "transfer" || requestedStatus === "transfer_pending") {
        return Number(row.unitSummary?.transferPendingQuantity || 0) > 0;
      }
      if (onlyInUse) {
        return Number(row.unitSummary?.inUseQuantity || 0) > 0;
      }
      return true;
    });

    const aggregatedRows = aggregateByEquipment
      ? Object.values(flattenedRows.reduce((acc, row) => {
          const key = Number(row.id);
          if (!acc[key]) {
            acc[key] = {
              id: row.id,
              name: row.name,
              code: row.code,
              status: row.status,
              description: row.description,
              price: row.price,
              categoryId: row.categoryId,
              EquipmentCategory: row.EquipmentCategory,
              stock: {
                quantity: 0,
                availableQuantity: 0,
                reservedQuantity: 0,
              },
              unitSummary: {
                activeQuantity: 0,
                inStockQuantity: 0,
                inUseQuantity: 0,
                maintenanceQuantity: 0,
                transferPendingQuantity: 0,
                disposedQuantity: 0,
              },
              gymsUsing: [],
              gymIdsUsing: [],
            };
          }

          acc[key].stock.quantity += Number(row.stock?.quantity || 0);
          acc[key].stock.availableQuantity += Number(row.stock?.availableQuantity || 0);
          acc[key].stock.reservedQuantity += Number(row.stock?.reservedQuantity || 0);
          acc[key].unitSummary.activeQuantity += Number(row.unitSummary?.activeQuantity || 0);
          acc[key].unitSummary.inStockQuantity += Number(row.unitSummary?.inStockQuantity || 0);
          acc[key].unitSummary.inUseQuantity += Number(row.unitSummary?.inUseQuantity || 0);
          acc[key].unitSummary.maintenanceQuantity += Number(row.unitSummary?.maintenanceQuantity || 0);
          acc[key].unitSummary.transferPendingQuantity += Number(row.unitSummary?.transferPendingQuantity || 0);
          acc[key].unitSummary.disposedQuantity += Number(row.unitSummary?.disposedQuantity || 0);

          if (Number(row.unitSummary?.inUseQuantity || 0) > 0 && row.Gym?.id && !acc[key].gymIdsUsing.includes(Number(row.Gym.id))) {
            acc[key].gymIdsUsing.push(Number(row.Gym.id));
            acc[key].gymsUsing.push({ id: row.Gym.id, name: row.Gym.name || `Gym #${row.Gym.id}` });
          }

          return acc;
        }, {}))
      : flattenedRows;

    const totalItems = aggregatedRows.length;
    const pagedData = aggregateByEquipment || onlyInUse
      ? aggregatedRows.slice(offset, offset + limit)
      : aggregatedRows;

    return {
      data: pagedData,
      meta: {
        page,
        limit,
        totalItems: aggregateByEquipment || onlyInUse || requestedStatus === "maintenance" || requestedStatus === "transfer" || requestedStatus === "transfer_pending" ? totalItems : count,
        totalPages: Math.max(1, Math.ceil((aggregateByEquipment || onlyInUse || requestedStatus === "maintenance" || requestedStatus === "transfer" || requestedStatus === "transfer_pending" ? totalItems : count) / limit)),
      },
    };
  },

  // Get equipment detail (with all stocks across owner's gyms)
  async getEquipmentDetail(ownerUserId, equipmentId, query = {}) {
    // Get owner's gyms
    const ownerGyms = await Gym.findAll({
      where: { ownerId: ownerUserId },
      attributes: ["id"],
      raw: true,
    });
    let gymIds = ownerGyms.map((g) => g.id);
    const requestedGymId = Number(query.gymId || 0);

    if (requestedGymId) {
      if (!gymIds.includes(requestedGymId)) {
        throw { message: "Equipment not found", statusCode: 404 };
      }
      gymIds = [requestedGymId];
    }

    if (gymIds.length === 0) {
      throw { message: "Equipment not found", statusCode: 404 };
    }

    // Get equipment with stock info from owner's gyms only
    const stocks = await EquipmentStock.findAll({
      where: {
        equipmentId: Number(equipmentId),
        gymId: { [Op.in]: gymIds },
      },
      include: [
        {
          model: Equipment,
          as: "equipment",
          required: true,
          attributes: ["id", "name", "code", "categoryId", "status", "description", "brand", "model", "price"],
          include: [{ model: EquipmentCategory, as: "category", required: false, attributes: ["id", "name"] }],
        },
        { model: Gym, as: "gym", required: false, attributes: ["id", "name"] },
      ],
    });

    if (stocks.length === 0) {
      throw { message: "Equipment not found", statusCode: 404 };
    }

    const unitSummaryMap = await buildUnitSummaryMap(stocks);
    const gymNameById = new Map(
      stocks
        .map((stock) => [Number(stock.gym?.id), stock.gym?.name])
        .filter(([gymId]) => Number.isInteger(gymId))
    );

    const units = await EquipmentUnit.findAll({
      where: {
        equipmentId: Number(equipmentId),
        gymId: { [Op.in]: gymIds },
      },
      attributes: ["id", "gymId", "assetCode", "status", "usageStatus", "transferId", "createdAt"],
      order: [["gymId", "ASC"], ["id", "ASC"]],
      raw: true,
    });

    const unitIds = units.map((unit) => Number(unit.id)).filter(Boolean);
    let eventTimelineByUnitId = new Map();

    if (unitIds.length > 0) {
      const eventRows = await EquipmentUnitEvent.findAll({
        where: {
          equipmentUnitId: { [Op.in]: unitIds },
        },
        attributes: [
          "id",
          "equipmentUnitId",
          "gymId",
          "fromGymId",
          "toGymId",
          "eventType",
          "referenceType",
          "referenceId",
          "performedBy",
          "notes",
          "metadata",
          "eventAt",
          "createdAt",
        ],
        include: [
          { model: Gym, as: "gym", attributes: ["id", "name"], required: false },
          { model: Gym, as: "fromGym", attributes: ["id", "name"], required: false },
          { model: Gym, as: "toGym", attributes: ["id", "name"], required: false },
          { model: User, as: "actor", attributes: ["id", "username"], required: false },
        ],
        order: [["eventAt", "DESC"], ["id", "DESC"]],
      });

      const maintenanceEventReferenceIds = new Set(
        eventRows
          .filter((row) => String(row.referenceType || "").toLowerCase() === "maintenance" && Number(row.referenceId))
          .map((row) => Number(row.referenceId))
      );

      const maintenanceRows = await Maintenance.findAll({
        where: {
          equipmentUnitId: { [Op.in]: unitIds },
          gymId: { [Op.in]: gymIds },
        },
        attributes: [
          "id",
          "equipmentUnitId",
          "gymId",
          "requestedBy",
          "assignedTo",
          "status",
          "issueDescription",
          "notes",
          "priority",
          "estimatedCost",
          "actualCost",
          "scheduledDate",
          "completionDate",
          "createdAt",
          "updatedAt",
        ],
        include: [
          { model: Gym, attributes: ["id", "name"], required: false },
          { model: User, as: "requester", attributes: ["id", "username"], required: false },
          { model: User, as: "technician", attributes: ["id", "username"], required: false },
        ],
        order: [["createdAt", "DESC"], ["id", "DESC"]],
      });

      eventTimelineByUnitId = eventRows.reduce((acc, row) => {
        const key = Number(row.equipmentUnitId);
        if (!acc.has(key)) acc.set(key, []);
        acc.get(key).push({
          id: row.id,
          gymId: row.gymId,
          gym: row.gym ? row.gym.toJSON() : null,
          fromGymId: row.fromGymId,
          fromGym: row.fromGym ? row.fromGym.toJSON() : null,
          toGymId: row.toGymId,
          toGym: row.toGym ? row.toGym.toJSON() : null,
          eventType: row.eventType,
          referenceType: row.referenceType,
          referenceId: row.referenceId,
          performedBy: row.performedBy,
          actor: row.actor ? row.actor.toJSON() : null,
          notes: row.notes,
          metadata: parseMetadata(row.metadata),
          eventAt: row.eventAt,
          createdAt: row.createdAt,
        });
        return acc;
      }, new Map());

      maintenanceRows.forEach((row) => {
        const key = Number(row.equipmentUnitId);
        if (!maintenanceEventReferenceIds.has(Number(row.id))) {
          const timeline = eventTimelineByUnitId.get(key) || [];
          timeline.push({
            id: `maintenance-snapshot-${row.id}`,
            gymId: row.gymId,
            gym: row.Gym ? row.Gym.toJSON() : null,
            fromGymId: null,
            fromGym: null,
            toGymId: null,
            toGym: null,
            eventType: inferMaintenanceSnapshotType(row),
            referenceType: "maintenance",
            referenceId: row.id,
            performedBy: row.requestedBy || row.assignedTo || null,
            actor: row.technician ? row.technician.toJSON() : row.requester ? row.requester.toJSON() : null,
            notes: row.issueDescription,
            metadata: {
              source: "maintenance_snapshot",
              maintenanceStatus: row.status,
              requester: row.requester ? row.requester.toJSON() : null,
              technician: row.technician ? row.technician.toJSON() : null,
              estimatedCost: row.estimatedCost,
              actualCost: row.actualCost,
            },
            eventAt: inferMaintenanceSnapshotTime(row),
            createdAt: row.createdAt,
          });
          eventTimelineByUnitId.set(key, timeline);
        }
      });

      eventTimelineByUnitId.forEach((entries, key) => {
        eventTimelineByUnitId.set(
          key,
          [...entries].sort((a, b) => {
            const timeA = new Date(a.eventAt || a.createdAt || 0).getTime();
            const timeB = new Date(b.eventAt || b.createdAt || 0).getTime();
            if (timeA !== timeB) return timeB - timeA;
            return String(b.id).localeCompare(String(a.id));
          })
        );
      });
    }

    // Return first stock's equipment with all stocks
    return {
      ...stocks[0].equipment.toJSON(),
      selectedGym: stocks[0].gym ? stocks[0].gym.toJSON() : null,
      stocks: stocks.map((s) => ({
        id: s.id,
        gym: s.gym,
        quantity: s.quantity,
        availableQuantity: s.availableQuantity,
        reservedQuantity: s.reservedQuantity,
        unitSummary:
          unitSummaryMap.get(`${s.gymId}:${s.equipmentId}`) || {
            activeQuantity: Number(s.availableQuantity || 0),
            inStockQuantity: Number(s.availableQuantity || 0),
            inUseQuantity: 0,
            maintenanceQuantity: 0,
            transferPendingQuantity: 0,
            disposedQuantity: 0,
          },
      })),
      units: units.map((unit) => ({
        ...unit,
        gymName: gymNameById.get(Number(unit.gymId)) || null,
        eventTimeline: eventTimelineByUnitId.get(Number(unit.id)) || [],
      })),
    };
  },

  async markEquipmentUnitInUse(ownerUserId, equipmentId, unitId) {
    const equipmentIdNumber = Number(equipmentId);
    const unitIdNumber = Number(unitId);
    if (!equipmentIdNumber || !unitIdNumber) throw { message: "Invalid equipment unit", statusCode: 400 };

    const updatedUnit = await db.sequelize.transaction(async (transaction) => {
      const unit = await EquipmentUnit.findByPk(unitIdNumber, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!unit || Number(unit.equipmentId) !== equipmentIdNumber) {
        throw { message: "Equipment unit not found", statusCode: 404 };
      }

      const gym = await Gym.findByPk(unit.gymId, {
        attributes: ["id", "ownerId"],
        transaction,
      });
      if (!gym || Number(gym.ownerId) !== Number(ownerUserId)) {
        throw { message: "Not authorized", statusCode: 403 };
      }

      if (unit.status !== "active") {
        throw { message: "Chỉ thiết bị đang sẵn sàng mới được đưa ra sử dụng", statusCode: 400 };
      }
      if (unit.usageStatus === "in_use") {
        throw { message: "Thiết bị này đang được sử dụng", statusCode: 400 };
      }

      const stock = await EquipmentStock.findOne({
        where: { gymId: unit.gymId, equipmentId: unit.equipmentId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!stock || Number(stock.availableQuantity || 0) <= 0) {
        throw { message: "Không còn thiết bị trong kho để đưa ra sử dụng", statusCode: 400 };
      }

      await unit.update({ usageStatus: "in_use" }, { transaction });
      await stock.update({
        availableQuantity: Math.max(0, Number(stock.availableQuantity || 0) - 1),
      }, { transaction });

      await EquipmentUnitEvent.create({
        equipmentUnitId: unit.id,
        equipmentId: unit.equipmentId,
        gymId: unit.gymId,
        eventType: "deployed_to_use",
        referenceType: "equipment_unit",
        referenceId: unit.id,
        performedBy: ownerUserId,
        notes: "Đưa thiết bị ra sử dụng",
        metadata: JSON.stringify({ source: "owner_equipment_usage", usageStatus: "in_use" }),
        eventAt: new Date(),
      }, { transaction });

      return unit.reload({ transaction });
    });

    emitEquipmentChanged([ownerUserId], {
      equipmentId: equipmentIdNumber,
      equipmentUnitId: unitIdNumber,
      usageStatus: "in_use",
      action: "marked_in_use",
    });

    return updatedUnit;
  },

  async markEquipmentUnitsInUse(ownerUserId, equipmentId, unitIds) {
    const equipmentIdNumber = Number(equipmentId);
    const targetUnitIds = uniqueIntegerList(unitIds);
    if (!equipmentIdNumber || !targetUnitIds.length) {
      throw { message: "Danh sách thiết bị không hợp lệ", statusCode: 400 };
    }

    const updatedUnits = await db.sequelize.transaction(async (transaction) => {
      const units = await EquipmentUnit.findAll({
        where: {
          id: { [Op.in]: targetUnitIds },
          equipmentId: equipmentIdNumber,
        },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (units.length !== targetUnitIds.length) {
        throw { message: "Có thiết bị không tồn tại hoặc không thuộc loại thiết bị này", statusCode: 404 };
      }

      const gymIds = [...new Set(units.map((unit) => Number(unit.gymId)).filter(Boolean))];
      const gyms = await Gym.findAll({
        where: { id: { [Op.in]: gymIds } },
        attributes: ["id", "ownerId"],
        transaction,
      });
      const invalidGym = gyms.some((gym) => Number(gym.ownerId) !== Number(ownerUserId));
      if (invalidGym || gyms.length !== gymIds.length) {
        throw { message: "Not authorized", statusCode: 403 };
      }

      const notReady = units.find((unit) => unit.status !== "active" || unit.usageStatus !== "in_stock");
      if (notReady) {
        throw { message: `Thiết bị ${notReady.assetCode} không ở trạng thái trong kho để đưa ra sử dụng`, statusCode: 400 };
      }

      const stockByKey = new Map();
      for (const unit of units) {
        const key = `${unit.gymId}:${unit.equipmentId}`;
        if (!stockByKey.has(key)) {
          const stock = await EquipmentStock.findOne({
            where: { gymId: unit.gymId, equipmentId: unit.equipmentId },
            transaction,
            lock: transaction.LOCK.UPDATE,
          });
          if (!stock) throw { message: `Không tìm thấy tồn kho cho ${unit.assetCode}`, statusCode: 404 };
          stockByKey.set(key, stock);
        }
      }

      for (const [key, stock] of stockByKey.entries()) {
        const count = units.filter((unit) => `${unit.gymId}:${unit.equipmentId}` === key).length;
        if (Number(stock.availableQuantity || 0) < count) {
          throw { message: `Không đủ số lượng trong kho để đưa ra sử dụng (${key})`, statusCode: 400 };
        }
        await stock.update({
          availableQuantity: Math.max(0, Number(stock.availableQuantity || 0) - count),
        }, { transaction });
      }

      await EquipmentUnit.update(
        { usageStatus: "in_use" },
        { where: { id: { [Op.in]: targetUnitIds } }, transaction }
      );

      await EquipmentUnitEvent.bulkCreate(
        units.map((unit) => ({
          equipmentUnitId: unit.id,
          equipmentId: unit.equipmentId,
          gymId: unit.gymId,
          eventType: "deployed_to_use",
          referenceType: "equipment_unit",
          referenceId: unit.id,
          performedBy: ownerUserId,
          notes: "Đưa thiết bị ra sử dụng",
          metadata: JSON.stringify({ source: "owner_equipment_usage_bulk", usageStatus: "in_use" }),
          eventAt: new Date(),
        })),
        { transaction }
      );

      return EquipmentUnit.findAll({
        where: { id: { [Op.in]: targetUnitIds } },
        transaction,
      });
    });

    emitEquipmentChanged([ownerUserId], {
      equipmentId: equipmentIdNumber,
      equipmentUnitIds: targetUnitIds,
      usageStatus: "in_use",
      action: "bulk_marked_in_use",
    });

    return updatedUnits;
  },

  async markEquipmentUnitInStock(ownerUserId, equipmentId, unitId) {
    const equipmentIdNumber = Number(equipmentId);
    const unitIdNumber = Number(unitId);
    if (!equipmentIdNumber || !unitIdNumber) throw { message: "Invalid equipment unit", statusCode: 400 };

    const updatedUnit = await db.sequelize.transaction(async (transaction) => {
      const unit = await EquipmentUnit.findByPk(unitIdNumber, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!unit || Number(unit.equipmentId) !== equipmentIdNumber) {
        throw { message: "Equipment unit not found", statusCode: 404 };
      }

      const gym = await Gym.findByPk(unit.gymId, {
        attributes: ["id", "ownerId"],
        transaction,
      });
      if (!gym || Number(gym.ownerId) !== Number(ownerUserId)) {
        throw { message: "Not authorized", statusCode: 403 };
      }

      if (unit.status !== "active") {
        throw { message: "Chỉ thiết bị đang hoạt động mới được cất về kho", statusCode: 400 };
      }
      if (unit.usageStatus === "in_stock") {
        throw { message: "Thiết bị này đang ở trong kho", statusCode: 400 };
      }

      const stock = await EquipmentStock.findOne({
        where: { gymId: unit.gymId, equipmentId: unit.equipmentId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!stock) {
        throw { message: "Equipment stock not found", statusCode: 404 };
      }

      await unit.update({ usageStatus: "in_stock" }, { transaction });
      await stock.update({
        availableQuantity: Number(stock.availableQuantity || 0) + 1,
      }, { transaction });

      await EquipmentUnitEvent.create({
        equipmentUnitId: unit.id,
        equipmentId: unit.equipmentId,
        gymId: unit.gymId,
        eventType: "stored_in_stock",
        referenceType: "equipment_unit",
        referenceId: unit.id,
        performedBy: ownerUserId,
        notes: "Cất thiết bị về kho",
        metadata: JSON.stringify({ source: "owner_equipment_usage", usageStatus: "in_stock" }),
        eventAt: new Date(),
      }, { transaction });

      return unit.reload({ transaction });
    });

    emitEquipmentChanged([ownerUserId], {
      equipmentId: equipmentIdNumber,
      equipmentUnitId: unitIdNumber,
      usageStatus: "in_stock",
      action: "marked_in_stock",
    });

    return updatedUnit;
  },

  async markEquipmentUnitsInStock(ownerUserId, equipmentId, unitIds) {
    const equipmentIdNumber = Number(equipmentId);
    const targetUnitIds = uniqueIntegerList(unitIds);
    if (!equipmentIdNumber || !targetUnitIds.length) {
      throw { message: "Danh sách thiết bị không hợp lệ", statusCode: 400 };
    }

    const updatedUnits = await db.sequelize.transaction(async (transaction) => {
      const units = await EquipmentUnit.findAll({
        where: {
          id: { [Op.in]: targetUnitIds },
          equipmentId: equipmentIdNumber,
        },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (units.length !== targetUnitIds.length) {
        throw { message: "Có thiết bị không tồn tại hoặc không thuộc loại thiết bị này", statusCode: 404 };
      }

      const gymIds = [...new Set(units.map((unit) => Number(unit.gymId)).filter(Boolean))];
      const gyms = await Gym.findAll({
        where: { id: { [Op.in]: gymIds } },
        attributes: ["id", "ownerId"],
        transaction,
      });
      const invalidGym = gyms.some((gym) => Number(gym.ownerId) !== Number(ownerUserId));
      if (invalidGym || gyms.length !== gymIds.length) {
        throw { message: "Not authorized", statusCode: 403 };
      }

      const notReady = units.find((unit) => unit.status !== "active" || unit.usageStatus !== "in_use");
      if (notReady) {
        throw { message: `Thiết bị ${notReady.assetCode} không ở trạng thái đang sử dụng để cất kho`, statusCode: 400 };
      }

      const stockByKey = new Map();
      for (const unit of units) {
        const key = `${unit.gymId}:${unit.equipmentId}`;
        if (!stockByKey.has(key)) {
          const stock = await EquipmentStock.findOne({
            where: { gymId: unit.gymId, equipmentId: unit.equipmentId },
            transaction,
            lock: transaction.LOCK.UPDATE,
          });
          if (!stock) throw { message: `Không tìm thấy tồn kho cho ${unit.assetCode}`, statusCode: 404 };
          stockByKey.set(key, stock);
        }
      }

      for (const [key, stock] of stockByKey.entries()) {
        const count = units.filter((unit) => `${unit.gymId}:${unit.equipmentId}` === key).length;
        await stock.update({
          availableQuantity: Number(stock.availableQuantity || 0) + count,
        }, { transaction });
      }

      await EquipmentUnit.update(
        { usageStatus: "in_stock" },
        { where: { id: { [Op.in]: targetUnitIds } }, transaction }
      );

      await EquipmentUnitEvent.bulkCreate(
        units.map((unit) => ({
          equipmentUnitId: unit.id,
          equipmentId: unit.equipmentId,
          gymId: unit.gymId,
          eventType: "stored_in_stock",
          referenceType: "equipment_unit",
          referenceId: unit.id,
          performedBy: ownerUserId,
          notes: "Cất thiết bị về kho",
          metadata: JSON.stringify({ source: "owner_equipment_usage_bulk", usageStatus: "in_stock" }),
          eventAt: new Date(),
        })),
        { transaction }
      );

      return EquipmentUnit.findAll({
        where: { id: { [Op.in]: targetUnitIds } },
        transaction,
      });
    });

    emitEquipmentChanged([ownerUserId], {
      equipmentId: equipmentIdNumber,
      equipmentUnitIds: targetUnitIds,
      usageStatus: "in_stock",
      action: "bulk_marked_in_stock",
    });

    return updatedUnits;
  },

  async getEquipmentUnitEvents(ownerUserId, equipmentId, query) {
    const { page, limit, offset } = parsePaging(query);
    const fetchAll = String(query.fetchAll || "false").toLowerCase() === "true";

    const ownerGyms = await Gym.findAll({
      where: { ownerId: ownerUserId },
      attributes: ["id"],
      raw: true,
    });
    const gymIds = ownerGyms.map((gym) => Number(gym.id)).filter(Boolean);

    if (gymIds.length === 0) {
      return { data: [], meta: { page, limit, totalItems: 0, totalPages: 0 } };
    }

    const equipmentIdNumber = Number(equipmentId);
    if (!equipmentIdNumber) {
      throw { message: "Invalid equipment id", statusCode: 400 };
    }

    const unitWhere = {
      equipmentId: equipmentIdNumber,
      gymId: { [Op.in]: gymIds },
    };

    const requestedUnitIds = parseIntegerList(query.equipmentUnitIds);
    if (requestedUnitIds.length > 0) {
      unitWhere.id = { [Op.in]: requestedUnitIds };
    } else if (query.equipmentUnitId) {
      unitWhere.id = Number(query.equipmentUnitId);
    }

    const units = await EquipmentUnit.findAll({
      where: unitWhere,
      attributes: ["id", "assetCode", "gymId"],
      include: [{ model: Gym, as: "gym", attributes: ["id", "name"], required: false }],
      raw: false,
    });

    if (!units.length) {
      return { data: [], meta: { page, limit, totalItems: 0, totalPages: 0 } };
    }

    const unitIds = units.map((unit) => Number(unit.id));
    const unitById = new Map(
      units.map((unit) => [Number(unit.id), {
        id: Number(unit.id),
        assetCode: unit.assetCode,
        gymId: Number(unit.gymId),
        gym: unit.gym ? unit.gym.toJSON() : null,
      }])
    );

    const eventWhere = {
      equipmentUnitId: { [Op.in]: unitIds },
    };

    const fromDate = normalizeDateFloor(query.dateFrom);
    const toDate = normalizeDateCeil(query.dateTo);
    if (fromDate || toDate) {
      eventWhere.eventAt = {};
      if (fromDate) eventWhere.eventAt[Op.gte] = fromDate;
      if (toDate) eventWhere.eventAt[Op.lte] = toDate;
    }

    const eventQuery = {
      where: eventWhere,
      include: [
        { model: Gym, as: "gym", attributes: ["id", "name"], required: false },
        { model: Gym, as: "fromGym", attributes: ["id", "name"], required: false },
        { model: Gym, as: "toGym", attributes: ["id", "name"], required: false },
        { model: User, as: "actor", attributes: ["id", "username"], required: false },
      ],
      order: [["eventAt", "DESC"], ["id", "DESC"]],
    };

    if (!fetchAll) {
      eventQuery.limit = limit;
      eventQuery.offset = offset;
    }

    const { rows, count } = fetchAll
      ? { rows: await EquipmentUnitEvent.findAll(eventQuery), count: 0 }
      : await EquipmentUnitEvent.findAndCountAll(eventQuery);

    const eventGroupFilter = String(query.eventGroup || "all").toLowerCase();
    const keyword = String(query.q || "").trim().toLowerCase();

    const data = rows
      .map((row) => {
        const metadata = parseMetadata(row.metadata);
        const unit = unitById.get(Number(row.equipmentUnitId)) || null;
        return {
          id: row.id,
          equipmentUnitId: Number(row.equipmentUnitId),
          unit,
          gymId: row.gymId,
          gym: row.gym ? row.gym.toJSON() : null,
          fromGymId: row.fromGymId,
          fromGym: row.fromGym ? row.fromGym.toJSON() : null,
          toGymId: row.toGymId,
          toGym: row.toGym ? row.toGym.toJSON() : null,
          eventType: row.eventType,
          eventGroup: classifyEventGroup(row.eventType),
          referenceType: row.referenceType,
          referenceId: row.referenceId,
          performedBy: row.performedBy,
          actor: row.actor ? row.actor.toJSON() : null,
          notes: row.notes,
          metadata,
          eventAt: row.eventAt,
        };
      })
      .filter((row) => {
        const matchesGroup = eventGroupFilter === "all" || row.eventGroup === eventGroupFilter;
        const haystack = [
          row.eventType,
          row.unit?.assetCode,
          row.actor?.username,
          row.metadata?.transferCode,
          row.metadata?.receiptCode,
          row.metadata?.transactionCode,
          row.metadata?.technicianName,
          row.metadata?.requester?.username,
          row.metadata?.technician?.username,
          row.notes,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        const matchesKeyword = !keyword || haystack.includes(keyword);
        return matchesGroup && matchesKeyword;
      });

    return {
      data,
      meta: {
        page,
        limit,
        totalItems: fetchAll || keyword || eventGroupFilter !== "all" ? data.length : count,
        totalPages: fetchAll ? 1 : keyword || eventGroupFilter !== "all" ? Math.max(1, Math.ceil(data.length / limit)) : Math.ceil(count / limit),
      },
    };
  },

  // Get categories
  async getCategories() {
    return await EquipmentCategory.findAll({
      attributes: ["id", "name"],
      order: [["name", "ASC"]],
    });
  },
};

export default ownerEquipmentService;
