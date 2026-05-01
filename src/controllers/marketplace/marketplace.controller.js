import marketplaceService from "../../service/marketplace/marketplace.service.js";

const marketplaceController = {
  listGyms: async (req, res) =>
    res.json({ EC: 0, EM: "OK", DT: await marketplaceService.listGyms(req.query) }),

  getGymDetail: async (req, res) =>
    res.json({ EC: 0, EM: "OK", DT: await marketplaceService.getGymDetail(req.params.id, req.query) }),

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

  listLandingHighlights: async (req, res) =>
    res.json({ EC: 0, EM: "OK", DT: await marketplaceService.getLandingHighlights() }),

  getPackageDetail: async (req, res) =>
    res.json({ EC: 0, EM: "OK", DT: await marketplaceService.getPackageDetail(req.params.id) }),

  listPublicReviews: async (req, res) =>
    res.json({ EC: 0, EM: "OK", DT: await marketplaceService.listPublicReviews(req.query) }),

  // ✅ public slots for wizard
  async getAvailableSlotsPublic(req, res) {
    try {
      const data = await marketplaceService.getAvailableSlotsPublic(req.query);
      return res.status(200).json({ EC: 0, EM: "OK", DT: data });
    } catch (e) {
      return res.status(e.statusCode || 500).json({
        EC: 1,
        EM: e.message || "Server error",
        DT: [],
      });
    }
  },
};

export default marketplaceController;