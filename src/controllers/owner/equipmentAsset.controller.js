import ownerEquipmentAssetService from "../../service/owner/equipmentAsset.service";

const ownerEquipmentAssetController = {
  async list(req, res) {
    try {
      const result = await ownerEquipmentAssetService.list(req.user.id, req.query);
      return res.status(200).json(result);
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message || "Internal server error" });
    }
  },

  async detail(req, res) {
    try {
      const result = await ownerEquipmentAssetService.detail(req.user.id, req.params.id);
      return res.status(200).json({ data: result });
    } catch (e) {
      const code = e.statusCode || (String(e.message || "").toLowerCase().includes("not found") ? 404 : 500);
      return res.status(code).json({ message: e.message || "Internal server error" });
    }
  },

  async getQr(req, res) {
    try {
      const result = await ownerEquipmentAssetService.getQr(req.user.id, req.params.id);
      return res.status(200).json({ data: result });
    } catch (e) {
      const code = e.statusCode || (String(e.message || "").toLowerCase().includes("not found") ? 404 : 500);
      return res.status(code).json({ message: e.message || "Internal server error" });
    }
  },

  async resolveByToken(req, res) {
    try {
      const result = await ownerEquipmentAssetService.resolveByToken(req.user.id, req.params.qrToken);
      return res.status(200).json({ data: result });
    } catch (e) {
      const code = e.statusCode || (String(e.message || "").toLowerCase().includes("not found") ? 404 : 400);
      return res.status(code).json({ message: e.message || "Internal server error" });
    }
  },

  async createMaintenance(req, res) {
    try {
      const result = await ownerEquipmentAssetService.createMaintenance(req.user.id, req.params.id, req.body || {});
      return res.status(201).json({ data: result });
    } catch (e) {
      const code = e.statusCode || (String(e.message || "").toLowerCase().includes("not found") ? 404 : 400);
      return res.status(code).json({ message: e.message || "Internal server error" });
    }
  },
};

export default ownerEquipmentAssetController;

