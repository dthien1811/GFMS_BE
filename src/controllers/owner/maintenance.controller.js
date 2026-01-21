import ownerMaintenanceService from "../../service/owner/maintenance.service";

const ownerMaintenanceController = {
  async getMaintenances(req, res) {
    try {
      const data = await ownerMaintenanceService.getMaintenances(
        req.user.id,
        req.query
      );
      return res.status(200).json(data);
    } catch (e) {
      return res
        .status(e.statusCode || 500)
        .json({ message: e.message });
    }
  },

  async getMaintenanceDetail(req, res) {
    try {
      const data = await ownerMaintenanceService.getMaintenanceDetail(
        req.user.id,
        req.params.id
      );
      return res.status(200).json({ data });
    } catch (e) {
      return res
        .status(e.statusCode || 500)
        .json({ message: e.message });
    }
  },

  async createMaintenance(req, res) {
    try {
      const data = await ownerMaintenanceService.createMaintenance(
        req.user.id,
        req.body
      );
      return res.status(201).json({ data });
    } catch (e) {
      return res
        .status(e.statusCode || 500)
        .json({ message: e.message });
    }
  },

  async cancelMaintenance(req, res) {
    try {
      const data = await ownerMaintenanceService.cancelMaintenance(
        req.user.id,
        req.params.id
      );
      return res.status(200).json({ data });
    } catch (e) {
      return res
        .status(e.statusCode || 500)
        .json({ message: e.message });
    }
  },
};

export default ownerMaintenanceController;
