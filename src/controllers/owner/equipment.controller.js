import ownerEquipmentService from "../../service/owner/equipment.service";

const ownerEquipmentController = {
  async getEquipments(req, res) {
    try {
      const data = await ownerEquipmentService.getEquipments(req.user.id, req.query);
      return res.status(200).json(data);
    } catch (e) {
      console.error("Get equipments error:", e);
      return res.status(e.statusCode || 500).json({ message: e.message || "Internal server error" });
    }
  },

  async getEquipmentDetail(req, res) {
    try {
      const data = await ownerEquipmentService.getEquipmentDetail(req.user.id, req.params.id);
      return res.status(200).json({ data });
    } catch (e) {
      console.error("Get equipment detail error:", e);
      return res.status(e.statusCode || 500).json({ message: e.message || "Internal server error" });
    }
  },

  async getCategories(req, res) {
    try {
      const data = await ownerEquipmentService.getCategories();
      return res.status(200).json({ data });
    } catch (e) {
      console.error("Get categories error:", e);
      return res.status(e.statusCode || 500).json({ message: e.message || "Internal server error" });
    }
  },
};

export default ownerEquipmentController;
