import ownerEquipmentService from "../../service/owner/equipment.service";

const ownerEquipmentController = {
  async getEquipments(req, res) {
    try {
      const data = await ownerEquipmentService.getEquipments(req.user.id, req.query);
      return res.status(200).json(data);
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  async getEquipmentDetail(req, res) {
    try {
      const data = await ownerEquipmentService.getEquipmentDetail(req.user.id, req.params.id);
      return res.status(200).json({ data });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  async getCategories(req, res) {
    try {
      const data = await ownerEquipmentService.getCategories();
      return res.status(200).json({ data });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },
};

export default ownerEquipmentController;
