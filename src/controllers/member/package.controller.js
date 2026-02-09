// src/controllers/member/package.controller.js
import memberPackageService from "../../service/member/package.service";

const memberPackageController = {
  // GET /api/member/packages?gymId=1
  async listPackages(req, res) {
    try {
      const gymId = req.query?.gymId ? Number(req.query.gymId) : undefined;
      const data = await memberPackageService.listPackages(req.user.id, { gymId });
      return res.status(200).json({ data });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  // POST /api/member/packages/:id/purchase
  async purchasePackage(req, res) {
    try {
      const data = await memberPackageService.purchasePackage(
        req.user.id,
        req.params.id,
        req.body
      );
      return res.status(201).json({ data });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },
};

export default memberPackageController;
