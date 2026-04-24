const adminEquipmentAssetService = require("../service/adminEquipmentAssetService");

class AdminEquipmentAssetController {
  list = async (req, res) => {
    try {
      const result = await adminEquipmentAssetService.list(req.query);
      return res.status(200).json(result);
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  };

  summary = async (req, res) => {
    try {
      const result = await adminEquipmentAssetService.summary(req.query);
      return res.status(200).json(result);
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  };

  detail = async (req, res) => {
    try {
      const result = await adminEquipmentAssetService.detail(req.params.id);
      return res.status(200).json({ data: result });
    } catch (e) {
      const code = e.statusCode || (String(e.message || "").toLowerCase().includes("not found") ? 404 : 500);
      return res.status(code).json({ message: e.message });
    }
  };

  getQr = async (req, res) => {
    try {
      const result = await adminEquipmentAssetService.getQr(req.params.id);
      return res.status(200).json({ data: result });
    } catch (e) {
      const code = e.statusCode || (String(e.message || "").toLowerCase().includes("not found") ? 404 : 500);
      return res.status(code).json({ message: e.message });
    }
  };

  regenerateQr = async (req, res) => {
    try {
      const result = await adminEquipmentAssetService.regenerateQr(req.params.id, req.user?.id);
      return res.status(200).json({ data: result });
    } catch (e) {
      const code = e.statusCode || (String(e.message || "").toLowerCase().includes("not found") ? 404 : 400);
      return res.status(code).json({ message: e.message });
    }
  };
}

module.exports = new AdminEquipmentAssetController();

