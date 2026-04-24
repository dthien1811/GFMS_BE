const publicEquipmentAssetService = require("../service/publicEquipmentAssetService");

class PublicEquipmentAssetController {
  scan = async (req, res) => {
    try {
      const data = await publicEquipmentAssetService.scan(req.params.qrToken);
      return res.status(200).json({ data });
    } catch (e) {
      const code = e.statusCode || (String(e.message || "").toLowerCase().includes("not found") ? 404 : 500);
      return res.status(code).json({ message: e.message });
    }
  };
}

module.exports = new PublicEquipmentAssetController();

