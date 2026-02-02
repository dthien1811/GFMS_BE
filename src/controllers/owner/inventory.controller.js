import ownerInventoryService from "../../service/owner/inventory.service";

const ownerInventoryController = {
  async getInventory(req, res) {
    try {
      const data = await ownerInventoryService.getInventory(req.user.id, req.query);
      return res.status(200).json(data);
    } catch (e) {
      console.error("Get inventory error:", e);
      return res.status(e.statusCode || 500).json({ message: e.message || "Internal server error" });
    }
  },

  async getInventoryDetail(req, res) {
    try {
      const data = await ownerInventoryService.getInventoryDetail(req.user.id, req.params.id);
      return res.status(200).json({ data });
    } catch (e) {
      console.error("Get inventory detail error:", e);
      return res.status(e.statusCode || 500).json({ message: e.message || "Internal server error" });
    }
  },
};

export default ownerInventoryController;
