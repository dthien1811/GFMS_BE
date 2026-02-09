import marketplaceService from "../../service/marketplace/marketplace.service.js";

const marketplaceController = {
  listGyms: async (req, res) =>
    res.json({ EC: 0, EM: "OK", DT: await marketplaceService.listGyms(req.query) }),

  getGymDetail: async (req, res) =>
    res.json({ EC: 0, EM: "OK", DT: await marketplaceService.getGymDetail(req.params.id) }),

  listGymTrainers: async (req, res) =>
    res.json({ EC: 0, EM: "OK", DT: await marketplaceService.listGymTrainers(req.params.id) }),

  listGymPackages: async (req, res) =>
    res.json({ EC: 0, EM: "OK", DT: await marketplaceService.listGymPackages(req.params.id) }),

  listTrainers: async (req, res) =>
    res.json({ EC: 0, EM: "OK", DT: await marketplaceService.listTrainers(req.query) }),

  getTrainerDetail: async (req, res) =>
    res.json({ EC: 0, EM: "OK", DT: await marketplaceService.getTrainerDetail(req.params.id) }),

  listTrainerPackages: async (req, res) =>
    res.json({ EC: 0, EM: "OK", DT: await marketplaceService.listTrainerPackages(req.params.id) }),

  listPackages: async (req, res) =>
    res.json({ EC: 0, EM: "OK", DT: await marketplaceService.listPackages(req.query) }),

  getPackageDetail: async (req, res) =>
    res.json({ EC: 0, EM: "OK", DT: await marketplaceService.getPackageDetail(req.params.id) }),
};

export default marketplaceController;
