import memberPackageService from "../../service/member/package.service";

const memberPackageController = {
  async listPackages(req, res) {
    try {
      const data = await memberPackageService.listPackages(req.user.id);
      return res.status(200).json({ data });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

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
