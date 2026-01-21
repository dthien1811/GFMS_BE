import adminInventoryService from "../service/adminInventoryService";

const ok = (res, data) => res.status(200).json(data);

// ✅ CHỈ SỬA: log chi tiết để biết lỗi thật ở đâu (đặc biệt lỗi SQL)
const bad = (res, err, ctx = "") => {
  try {
    console.error("=== API ERROR ===", ctx);
    console.error("message:", err?.message);
    console.error("sql:", err?.sql);
    console.error("original:", err?.original);
    console.error("stack:", err?.stack);
  } catch (_) {}

  return res.status(400).json({ message: err?.message || String(err || "Bad Request") });
};

const adminInventoryController = {
  // ✅ gyms
  async getGyms(req, res) {
    try {
      const data = await adminInventoryService.getGyms(req.query);
      return ok(res, data);
    } catch (e) {
      return bad(res, e, "GET /gyms");
    }
  },

  // ===== categories
  async getEquipmentCategories(req, res) {
    try {
      const data = await adminInventoryService.getEquipmentCategories();
      return ok(res, data);
    } catch (e) {
      return bad(res, e, "GET /equipment-categories");
    }
  },

  // ===== equipments
  async getEquipments(req, res) {
    try {
      const data = await adminInventoryService.getEquipments(req.query);
      return ok(res, data);
    } catch (e) {
      return bad(res, e, "GET /equipments");
    }
  },

  async createEquipment(req, res) {
    try {
      const data = await adminInventoryService.createEquipment(req.body);
      return ok(res, data);
    } catch (e) {
      return bad(res, e, "POST /equipments");
    }
  },

  async updateEquipment(req, res) {
    try {
      const data = await adminInventoryService.updateEquipment(req.params.id, req.body);
      return ok(res, data);
    } catch (e) {
      return bad(res, e, "PUT /equipments/:id");
    }
  },

  async discontinueEquipment(req, res) {
    try {
      const data = await adminInventoryService.discontinueEquipment(req.params.id);
      return ok(res, data);
    } catch (e) {
      return bad(res, e, "PATCH /equipments/:id/discontinue");
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
      // ✅ log rõ endpoint đang fail đúng lúc bấm "Ảnh"
      return bad(res, e, `GET /equipments/${req.params.id}/images`);
    }
  },

  async uploadEquipmentImages(req, res) {
    try {
      const files = req.files || [];
      const data = await adminInventoryService.uploadEquipmentImages(req.params.id, files);
      return ok(res, data);
    } catch (e) {
      return bad(res, e, `POST /equipments/${req.params.id}/images`);
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
      return bad(res, e, `PATCH /equipments/${req.params.id}/images/${req.params.imageId}/primary`);
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
      return bad(res, e, `DELETE /equipments/${req.params.id}/images/${req.params.imageId}`);
    }
  },

  // ===== suppliers
  async getSuppliers(req, res) {
    try {
      const data = await adminInventoryService.getSuppliers(req.query);
      return ok(res, data);
    } catch (e) {
      return bad(res, e, "GET /suppliers");
    }
  },

  async createSupplier(req, res) {
    try {
      const data = await adminInventoryService.createSupplier(req.body);
      return ok(res, data);
    } catch (e) {
      return bad(res, e, "POST /suppliers");
    }
  },

  async updateSupplier(req, res) {
    try {
      const data = await adminInventoryService.updateSupplier(req.params.id, req.body);
      return ok(res, data);
    } catch (e) {
      return bad(res, e, "PUT /suppliers/:id");
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
      return bad(res, e, "PATCH /suppliers/:id/active");
    }
  },

  // ===== stocks
  async getStocks(req, res) {
    try {
      const data = await adminInventoryService.getStocks(req.query);
      return ok(res, data);
    } catch (e) {
      return bad(res, e, "GET /stocks");
    }
  },

  // ✅ nhập kho
  async createReceipt(req, res) {
    try {
      const auditMeta = { actorUserId: req?.user?.id || null };
      const data = await adminInventoryService.createReceipt(req.body, auditMeta);
      return ok(res, data);
    } catch (e) {
      return bad(res, e, "POST /receipts");
    }
  },

  // ✅ xuất kho
  async createExport(req, res) {
    try {
      const auditMeta = { actorUserId: req?.user?.id || null };
      const data = await adminInventoryService.createExport(req.body, auditMeta);
      return ok(res, data);
    } catch (e) {
      return bad(res, e, "POST /exports");
    }
  },

  // ✅ nhật ký kho
  async getInventoryLogs(req, res) {
    try {
      const data = await adminInventoryService.getInventoryLogs(req.query);
      return ok(res, data);
    } catch (e) {
      return bad(res, e, "GET /inventory-logs");
    }
  },
};

module.exports = adminInventoryController;
