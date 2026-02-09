import memberMyPackageService from "../../service/member/myPackages.service";

const memberMyPackageController = {
  async getMyPackages(req, res) {
    try {
      const data = await memberMyPackageService.getMyPackages(req.user.id);
      return res.status(200).json({ data });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },
  async getMyPackageDetail(req, res) {
  try {
    const data = await memberMyPackageService.getMyPackageDetail(
      req.user.id,
      req.params.activationId
    );
    return res.status(200).json({ DT: data });
  } catch (e) {
    return res.status(e.statusCode || 500).json({ message: e.message });
  }
},

};

export default memberMyPackageController;

