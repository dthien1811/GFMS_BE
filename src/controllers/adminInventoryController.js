const adminInventoryService = require("../service/adminInventoryService");

const ok = (res, data) => res.status(200).json(data);

// ✅ log chi tiết để biết lỗi thật ở đâu (đặc biệt lỗi SQL)
const bad = (res, err, ctx = "") => {
  try {
    console.error("=== API ERROR ===", ctx);
    console.error("message:", err?.message);
    console.error("sql:", err?.sql);
    console.error("original:", err?.original);
    console.error("stack:", err?.stack);
  } catch (_) {}

  const details = [
    ...(Array.isArray(err?.errors) ? err.errors.map((item) => `${item.path || item.type || "field"}: ${item.message}`) : []),
    err?.original?.sqlMessage,
  ].filter(Boolean);

  const message =
    details.length
      ? details.join(" | ")
      : err?.message || String(err || "Bad Request");

  return res.status(400).json({ message, details });
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
      const data = await adminInventoryService.createEquipment(req.body, req.files);
      return ok(res, data);
    } catch (e) {
      return bad(res, e, "POST /equipments");
    }
  },

  async updateEquipment(req, res) {
    try {
      const data = await adminInventoryService.updateEquipment(req.params.id, req.body, req.files);
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

  async deleteEquipment(req, res) {
    try {
      const data = await adminInventoryService.deleteEquipment(req.params.id);
      return ok(res, data);
    } catch (e) {
      return bad(res, e, "DELETE /equipments/:id");
    }
  },

  // Images
  async getEquipmentImages(req, res) {
    try {
      const data = await adminInventoryService.getEquipmentImages(req.params.id);
      return ok(res, data);
    } catch (e) {
      return bad(res, e, "GET /equipments/:id/images");
    }
  },

  async uploadEquipmentImages(req, res) {
    try {
      const data = await adminInventoryService.uploadEquipmentImages(req.params.id, req.files);
      return ok(res, data);
    } catch (e) {
      return bad(res, e, "POST /equipments/:id/images");
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
      return bad(res, e, "PATCH /equipments/:id/images/:imageId/primary");
    }
  },

  async deleteEquipmentImage(req, res) {
    try {
      const data = await adminInventoryService.deleteEquipmentImage(req.params.id, req.params.imageId);
      return ok(res, data);
    } catch (e) {
      return bad(res, e, "DELETE /equipments/:id/images/:imageId");
    }
  },

  // Suppliers
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

  async setSupplierActive(req, res) {
    try {
      const data = await adminInventoryService.setSupplierActive(req.params.id, req.body);
      return ok(res, data);
    } catch (e) {
      return bad(res, e, "PATCH /suppliers/:id/active");
    }
  },

  // Stocks + logs
  async getStocks(req, res) {
    try {
      const data = await adminInventoryService.getStocks(req.query);
      return ok(res, data);
    } catch (e) {
      return bad(res, e, "GET /stocks");
    }
  },

  async createReceipt(req, res) {
    try {
      const data = await adminInventoryService.createReceipt(req.body);
      return ok(res, data);
    } catch (e) {
      return bad(res, e, "POST /receipts");
    }
  },

  async createExport(req, res) {
    try {
      const data = await adminInventoryService.createExport(req.body);
      return ok(res, data);
    } catch (e) {
      return bad(res, e, "POST /exports");
    }
  },

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
