import adminInventoryService from "../service/adminInventoryService";

const ok = (res, data) => res.status(200).json(data);
const bad = (res, err) =>
  res.status(400).json({ message: err?.message || String(err || "Bad Request") });

const adminInventoryController = {
  // ✅ gyms
  async getGyms(req, res) {
    try {
      const data = await adminInventoryService.getGyms(req.query);
      return ok(res, data);
    } catch (e) {
      return bad(res, e);
    }
  },

  // ===== categories
  async getEquipmentCategories(req, res) {
    try {
      const data = await adminInventoryService.getEquipmentCategories();
      return ok(res, data);
    } catch (e) {
      return bad(res, e);
    }
  },

  // ===== equipments
  async getEquipments(req, res) {
    try {
      const data = await adminInventoryService.getEquipments(req.query);
      return ok(res, data);
    } catch (e) {
      return bad(res, e);
    }
  },

  async createEquipment(req, res) {
    try {
      const data = await adminInventoryService.createEquipment(req.body);
      return ok(res, data);
    } catch (e) {
      return bad(res, e);
    }
  },

  async updateEquipment(req, res) {
    try {
      const data = await adminInventoryService.updateEquipment(req.params.id, req.body);
      return ok(res, data);
    } catch (e) {
      return bad(res, e);
    }
  },

  async discontinueEquipment(req, res) {
    try {
      const data = await adminInventoryService.discontinueEquipment(req.params.id);
      return ok(res, data);
    } catch (e) {
      return bad(res, e);
    }
  },

  // ==========================
  // ✅ EQUIPMENT IMAGES (NEW)
  // ==========================
  async getEquipmentImages(req, res) {
    try {
      const data = await adminInventoryService.getEquipmentImages(req.params.id);
      return ok(res, data);
    } catch (e) {
      return bad(res, e);
    }
  },

  async uploadEquipmentImages(req, res) {
    try {
      const files = req.files || [];
      const data = await adminInventoryService.uploadEquipmentImages(req.params.id, files);
      return ok(res, data);
    } catch (e) {
      return bad(res, e);
    }
  },

  async setPrimaryEquipmentImage(req, res) {
    try {
      const data = await adminInventoryService.setPrimaryEquipmentImage(
        req.params.id,
        req.params.imageId
      );
      return ok(res, data);
    } catch (e) {
      return bad(res, e);
    }
  },

  async deleteEquipmentImage(req, res) {
    try {
      const data = await adminInventoryService.deleteEquipmentImage(
        req.params.id,
        req.params.imageId
      );
      return ok(res, data);
    } catch (e) {
      return bad(res, e);
    }
  },

  // ===== suppliers
  async getSuppliers(req, res) {
    try {
      const data = await adminInventoryService.getSuppliers(req.query);
      return ok(res, data);
    } catch (e) {
      return bad(res, e);
    }
  },

  async createSupplier(req, res) {
    try {
      const data = await adminInventoryService.createSupplier(req.body);
      return ok(res, data);
    } catch (e) {
      return bad(res, e);
    }
  },

  async updateSupplier(req, res) {
    try {
      const data = await adminInventoryService.updateSupplier(req.params.id, req.body);
      return ok(res, data);
    } catch (e) {
      return bad(res, e);
    }
  },

  // ✅ nhận cả {isActive:true/false} hoặc boolean
  async setSupplierActive(req, res) {
    try {
      const id = req.params.id;
      const body = req.body || {};
      const isActive = typeof body === "object" ? body.isActive : body;
      const data = await adminInventoryService.setSupplierActive(id, isActive);
      return ok(res, data);
    } catch (e) {
      return bad(res, e);
    }
  },

  // ===== stocks
  async getStocks(req, res) {
    try {
      const data = await adminInventoryService.getStocks(req.query);
      return ok(res, data);
    } catch (e) {
      return bad(res, e);
    }
  },

  // ✅ nhập kho
  async createReceipt(req, res) {
    try {
      const auditMeta = { actorUserId: req?.user?.id || null };
      const data = await adminInventoryService.createReceipt(req.body, auditMeta);
      return ok(res, data);
    } catch (e) {
      return bad(res, e);
    }
  },

  // ✅ xuất kho
  async createExport(req, res) {
    try {
      const auditMeta = { actorUserId: req?.user?.id || null };
      const data = await adminInventoryService.createExport(req.body, auditMeta);
      return ok(res, data);
    } catch (e) {
      return bad(res, e);
    }
  },

  // ✅ nhật ký kho
  async getInventoryLogs(req, res) {
    try {
      const data = await adminInventoryService.getInventoryLogs(req.query);
      return ok(res, data);
    } catch (e) {
      return bad(res, e);
    }
  },
};

module.exports = adminInventoryController;
