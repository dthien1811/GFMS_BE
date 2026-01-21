import ownerInventoryService from "../../service/owner/inventory.service";

const ownerInventoryController = {
  async getInventory(req, res) {
    try {
      const data = await ownerInventoryService.getInventory(req.user.id, req.query);
      return res.status(200).json(data);
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  async getInventoryDetail(req, res) {
    try {
      const data = await ownerInventoryService.getInventoryDetail(req.user.id, req.params.id);
      return res.status(200).json({ data });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },
};

export default ownerInventoryController;
