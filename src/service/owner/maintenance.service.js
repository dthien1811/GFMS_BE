import db from "../../models";
import { Op } from "sequelize";
import realtimeService from "../realtime.service";
import equipmentUnitEventUtils from "../../utils/equipmentUnitEvent";

const { Maintenance, Equipment, EquipmentStock, EquipmentUnit, Gym, User, sequelize } = db;
const { logEquipmentUnitEvents } = equipmentUnitEventUtils;

const emitMaintenanceChanged = (userIds = [], payload = {}) => {
  [...new Set((userIds || []).filter(Boolean).map(Number))].forEach((userId) => {
    realtimeService.emitUser(userId, "maintenance:changed", payload);
  });
};

const safeEquipmentInclude = () => ({
  model: Equipment,
  required: false,
  attributes: ["id", "name", "code", "status", "categoryId"],
});

const ensure = (condition, message, statusCode = 400) => {
  if (!condition) throw { message, statusCode };
};

const parsePaging = (query) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
};

const shouldReserveStockForMaintenance = (usageStatus) => String(usageStatus || "").toLowerCase() === "in_stock";

const ownerMaintenanceService = {
  // Get maintenances for owner's gyms
  async getMaintenances(ownerUserId, query) {
    const { page, limit, offset } = parsePaging(query);
    const { status, gymId, q } = query;

    // First, get owner's gyms
    const ownerGyms = await Gym.findAll({
      where: { ownerId: ownerUserId },
      attributes: ["id"],
      raw: true,
    });

    const gymIds = ownerGyms.map((g) => g.id);

    if (gymIds.length === 0) {
      return {
        data: [],
        meta: { page, limit, totalItems: 0, totalPages: 0 },
      };
    }

    const where = { gymId: { [Op.in]: gymIds } };

    if (status) where.status = status;
    if (gymId) where.gymId = Number(gymId);

    if (q) {
      where[Op.or] = [
        { issueDescription: { [Op.like]: `%${q}%` } },
        { notes: { [Op.like]: `%${q}%` } },
      ];
    }

    const { rows, count } = await Maintenance.findAndCountAll({
      where,
      include: [
        safeEquipmentInclude(),
        { model: EquipmentUnit, as: "equipmentUnit", required: false, attributes: ["id", "assetCode", "status"] },
        { model: Gym, required: false },
        { model: User, as: "requester", required: false },
        { model: User, as: "technician", required: false },
      ],
      order: [["createdAt", "DESC"]],
      limit,
      offset,
    });

    return {
      data: rows,
      meta: {
        page,
        limit,
        totalItems: count,
        totalPages: Math.ceil(count / limit),
      },
    };
  },

  // Get maintenance detail
  async getMaintenanceDetail(ownerUserId, maintenanceId) {
    const id = Number(maintenanceId);
    ensure(id, "Invalid maintenance id");

    // Get owner's gym IDs
    const ownerGyms = await Gym.findAll({
      where: { ownerId: ownerUserId },
      attributes: ["id"],
      raw: true,
    });
    const gymIds = ownerGyms.map((g) => g.id);

    const m = await Maintenance.findByPk(id, {
      include: [
        safeEquipmentInclude(),
        { model: EquipmentUnit, as: "equipmentUnit", required: false, attributes: ["id", "assetCode", "status"] },
        { model: Gym, required: false },
        { model: User, as: "requester", required: false },
        { model: User, as: "technician", required: false },
      ],
    });

    ensure(m, "Maintenance not found", 404);
    ensure(gymIds.includes(m.gymId), "Not authorized to view this maintenance", 403);

    return m;
  },

  // Create maintenance request (owner tạo yêu cầu bảo trì)
  async createMaintenance(ownerUserId, payload) {
    const { gymId, equipmentId, equipmentUnitId, issueDescription } = payload;

    ensure(gymId, "gymId is required");
    ensure(equipmentId, "equipmentId is required");

    // Check if gym belongs to owner
    const gym = await Gym.findByPk(Number(gymId), {
      attributes: ["id", "name", "ownerId"]
    });
    ensure(gym, "Gym not found", 404);
    ensure(gym.ownerId === ownerUserId, "Not authorized", 403);

    // Check if equipment exists
    const equipment = await Equipment.findByPk(Number(equipmentId), {
      attributes: ["id", "name", "code"]
    });
    ensure(equipment, "Equipment not found", 404);

    try {
      return await sequelize.transaction(async (t) => {
        const stock = await EquipmentStock.findOne({
          where: {
            gymId: Number(gymId),
            equipmentId: Number(equipmentId),
          },
          transaction: t,
          lock: t.LOCK.UPDATE,
        });

        ensure(stock, "Equipment stock not found", 404);

        let unit = null;
        if (equipmentUnitId) {
          unit = await EquipmentUnit.findOne({
            where: {
              id: Number(equipmentUnitId),
              gymId: Number(gymId),
              equipmentId: Number(equipmentId),
              status: "active",
              usageStatus: { [Op.in]: ["in_stock", "in_use"] },
              transferId: { [Op.or]: [null, 0] },
            },
            transaction: t,
            lock: t.LOCK.UPDATE,
          });
        }

        if (!unit) {
          unit = await EquipmentUnit.findOne({
            where: {
              gymId: Number(gymId),
              equipmentId: Number(equipmentId),
              status: "active",
              usageStatus: { [Op.in]: ["in_stock", "in_use"] },
              transferId: { [Op.or]: [null, 0] },
            },
            order: [[db.Sequelize.literal("CASE WHEN usageStatus = 'in_stock' THEN 0 ELSE 1 END"), "ASC"], ["id", "ASC"]],
            transaction: t,
            lock: t.LOCK.UPDATE,
          });
        }

        ensure(unit, "Không tìm thấy thiết bị khả dụng để bảo trì", 400);

        if (shouldReserveStockForMaintenance(unit.usageStatus)) {
          ensure(Number(stock.availableQuantity || 0) > 0, "Không còn thiết bị trong kho để đưa vào bảo trì", 400);
        }

        const m = await Maintenance.create(
          {
            gymId: Number(gymId),
            equipmentId: Number(equipmentId),
            equipmentUnitId: Number(unit.id),
            issueDescription: issueDescription ? String(issueDescription).trim() : "",
            status: "pending",
            requestedBy: ownerUserId,
          },
          { transaction: t }
        );

        const gymName = gym?.name || `Gym #${gymId}`;
        const equipLabel = equipment?.name || equipment?.code || `Equipment #${equipmentId}`;
        const preview = (m.issueDescription || "").slice(0, 120);
        t.afterCommit(async () => {
          try {
            await realtimeService.notifyAdministrators({
              title: "Bảo trì thiết bị — yêu cầu mới",
              message: `Mã #${m.id} · ${gymName} · ${equipLabel}${preview ? ` · ${preview}` : ""}`,
              notificationType: "admin_maintenance_request_submitted",
              relatedType: "maintenance",
              relatedId: m.id,
            });
          } catch (e) {
            console.error("[owner.maintenance] notifyAdministrators:", e?.message || e);
          }
        });

        await unit.update(
          {
            status: "in_maintenance",
            notes: issueDescription ? String(issueDescription).trim() : unit.notes,
          },
          { transaction: t }
        );

        if (shouldReserveStockForMaintenance(unit.usageStatus)) {
          await stock.update(
            {
              availableQuantity: Math.max(0, Number(stock.availableQuantity || 0) - 1),
              reservedQuantity: Math.max(0, Number(stock.reservedQuantity || 0) + 1),
            },
            { transaction: t }
          );
        }

        await logEquipmentUnitEvents(
          [
            {
              equipmentUnitId: Number(unit.id),
              equipmentId: Number(equipmentId),
              gymId: Number(gymId),
              eventType: "maintenance_requested",
              referenceType: "maintenance",
              referenceId: Number(m.id),
              performedBy: ownerUserId,
              notes: issueDescription ? String(issueDescription).trim() : null,
              metadata: {
                maintenanceStatus: "pending",
                requesterId: ownerUserId,
                sourceUsageStatus: unit.usageStatus,
              },
              eventAt: m.createdAt,
            },
          ],
          { transaction: t }
        );

        emitMaintenanceChanged([ownerUserId], {
          maintenanceId: m.id,
          equipmentId: Number(equipmentId),
          equipmentUnitId: Number(unit.id),
          gymId: Number(gymId),
          action: "created",
        });

        return m;
      });
    } catch (error) {
      console.error("Maintenance creation error:", error);
      throw { message: error.message || "Failed to create maintenance request", statusCode: error.statusCode || 500 };
    }
  },

  // Cancel maintenance request (owner hủy nếu chưa được duyệt)
  async cancelMaintenance(ownerUserId, maintenanceId) {
    const id = Number(maintenanceId);

    // Get owner's gyms
    const ownerGyms = await Gym.findAll({
      where: { ownerId: ownerUserId },
      attributes: ["id"],
      raw: true,
    });
    const gymIds = ownerGyms.map((g) => g.id);

    return sequelize.transaction(async (t) => {
      const m = await Maintenance.findByPk(id, {
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      ensure(m, "Maintenance not found", 404);
      ensure(gymIds.includes(m.gymId), "Not authorized", 403);
      ensure(
        m.status === "pending",
        "Only pending maintenance can be cancelled"
      );

      let maintenanceSourceUsageStatus = "in_stock";

      if (m.equipmentUnitId) {
        const unit = await EquipmentUnit.findByPk(m.equipmentUnitId, {
          transaction: t,
          lock: t.LOCK.UPDATE,
        });
        if (unit) {
          maintenanceSourceUsageStatus = unit.usageStatus || "in_stock";
          await unit.update({ status: "active", usageStatus: unit.usageStatus || "in_stock", notes: unit.notes }, { transaction: t });
        }
      }

      const stock = await EquipmentStock.findOne({
        where: { gymId: m.gymId, equipmentId: m.equipmentId },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (stock && shouldReserveStockForMaintenance(maintenanceSourceUsageStatus)) {
        await stock.update(
          {
            availableQuantity: Number(stock.availableQuantity || 0) + 1,
            reservedQuantity: Math.max(0, Number(stock.reservedQuantity || 0) - 1),
          },
          { transaction: t }
        );
      }

      await m.update({ status: "cancelled" }, { transaction: t });

      const mid = m.id;
      t.afterCommit(async () => {
        try {
          await realtimeService.notifyAdministrators({
            title: "Bảo trì — owner đã huỷ yêu cầu",
            message: `Mã #${mid} đã chuyển sang trạng thái huỷ (owner).`,
            notificationType: "admin_maintenance_cancelled_by_owner",
            relatedType: "maintenance",
            relatedId: mid,
          });
        } catch (e) {
          console.error("[owner.maintenance] cancel notify:", e?.message || e);
        }
      });

      await logEquipmentUnitEvents(
        [
          {
            equipmentUnitId: Number(m.equipmentUnitId || 0) || null,
            equipmentId: Number(m.equipmentId),
            gymId: Number(m.gymId),
            eventType: "maintenance_cancelled",
            referenceType: "maintenance",
            referenceId: Number(m.id),
            performedBy: ownerUserId,
            notes: m.issueDescription || null,
            metadata: {
              maintenanceStatus: "cancelled",
              requesterId: ownerUserId,
            },
            eventAt: new Date(),
          },
        ],
        { transaction: t }
      );

      emitMaintenanceChanged([ownerUserId], {
        maintenanceId: m.id,
        equipmentId: Number(m.equipmentId),
        equipmentUnitId: Number(m.equipmentUnitId || 0) || null,
        gymId: Number(m.gymId),
        action: "cancelled",
      });

      return m;
    });
  },
};

export default ownerMaintenanceService;
