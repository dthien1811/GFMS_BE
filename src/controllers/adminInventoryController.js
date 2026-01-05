import adminInventoryService from "../service/adminInventoryService";
const getAuditMeta = (req) => {
  const actorUserId = req?.user?.id || null;
  return {
    actorUserId,
    ipAddress: req.headers["x-forwarded-for"] || req.socket?.remoteAddress || null,
    userAgent: req.headers["user-agent"] || null,
  };
};

const ok = (res, data) => res.status(200).json(data);
const created = (res, data) => res.status(201).json(data);

// ===== Equipment =====
const readEquipments = async (req, res) => {
  try {
    return res.json(await adminInventoryService.getEquipments(req.query));
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: e.message });
  }
};

const createEquipment = async (req, res) => {
  try {
    const result = await adminInventoryService.createEquipment(req.body, getAuditMeta(req));
    return created(res, result);
  } catch (e) {
    console.error("createEquipment:", e);
    return res.status(400).json({ message: e?.message || "Create failed" });
  }
};

const updateEquipment = async (req, res) => {
  try {
    const result = await adminInventoryService.updateEquipment(req.params.id, req.body, getAuditMeta(req));
    if (!result) return res.status(404).json({ message: "Equipment not found" });
    return ok(res, result);
  } catch (e) {
    console.error("updateEquipment:", e);
    return res.status(400).json({ message: e?.message || "Update failed" });
  }
};

const discontinueEquipment = async (req, res) => {
  try {
    const result = await adminInventoryService.discontinueEquipment(req.params.id, getAuditMeta(req));
    return ok(res, result);
  } catch (e) {
    console.error("discontinueEquipment:", e);
    return res.status(400).json({ message: e?.message || "Discontinue failed" });
  }
};

const readEquipmentCategories = async (req, res) => {
  try {
    return res.json(await adminInventoryService.getEquipmentCategories(req.query));
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: e.message });
  }
};

// ===== Supplier =====
const readSuppliers = async (req, res) => {
  try {
    return res.json(await adminInventoryService.getSuppliers(req.query));
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: e.message });
  }
};

const createSupplier = async (req, res) => {
  try {
    const result = await adminInventoryService.createSupplier(req.body, getAuditMeta(req));
    return created(res, result);
  } catch (e) {
    console.error("createSupplier:", e);
    return res.status(400).json({ message: e?.message || "Create failed" });
  }
};

const updateSupplier = async (req, res) => {
  try {
    const result = await adminInventoryService.updateSupplier(req.params.id, req.body, getAuditMeta(req));
    if (!result) return res.status(404).json({ message: "Supplier not found" });
    return ok(res, result);
  } catch (e) {
    console.error("updateSupplier:", e);
    return res.status(400).json({ message: e?.message || "Update failed" });
  }
};

const setSupplierActive = async (req, res) => {
  try {
    const { isActive } = req.body;
    const result = await adminInventoryService.setSupplierActive(req.params.id, isActive, getAuditMeta(req));
    return ok(res, result);
  } catch (e) {
    console.error("setSupplierActive:", e);
    return res.status(400).json({ message: e?.message || "Update failed" });
  }
};

// ===== Stock =====
const readStocks = async (req, res) => {
  try {
    return res.json(await adminInventoryService.getStocks(req.query));
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: e.message });
  }
};

// ===== Import / Export =====
const createReceiptImport = async (req, res) => {
  try {
    const result = await adminInventoryService.createReceiptImport(req.body, getAuditMeta(req), req);
    return created(res, result);
  } catch (e) {
    console.error("createReceiptImport:", e);
    return res.status(400).json({ message: e?.message || "Import failed" });
  }
};

const createExport = async (req, res) => {
  try {
    const result = await adminInventoryService.createExport(req.body, getAuditMeta(req), req);
    return created(res, result);
  } catch (e) {
    console.error("createExport:", e);
    return res.status(400).json({ message: e?.message || "Export failed" });
  }
};

module.exports = {
  readEquipments,
  createEquipment,
  updateEquipment,
  discontinueEquipment,
  readEquipmentCategories,

  readSuppliers,
  createSupplier,
  updateSupplier,
  setSupplierActive,

  readStocks,
  createReceiptImport,
  createExport,
};
