import db from "../../models";
import { Op } from "sequelize";
import realtimeService from "../realtime.service";

const { Maintenance, Equipment, Gym, User, sequelize } = db;

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
    const { gymId, equipmentId, issueDescription } = payload;

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
        const m = await Maintenance.create(
          {
            gymId: Number(gymId),
            equipmentId: Number(equipmentId),
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

        return m;
      });
    } catch (error) {
      console.error("Maintenance creation error:", error);
      throw { message: error.message || "Failed to create maintenance request", statusCode: 500 };
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

      return m;
    });
  },
};

export default ownerMaintenanceService;
