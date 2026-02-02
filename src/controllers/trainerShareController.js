const trainerShareService = require("../service/trainerShareService");

exports.createShareRequest = async (req, res) => {
  try {
    const userId = req.user?.id;
    const created = await trainerShareService.createShareRequest(userId, req.body);
    return res.status(201).json({ message: "Created share request", data: created });
  } catch (error) {
    console.error("[TrainerShare] createShareRequest error:", error);
    console.error("[TrainerShare] sql:", error?.sql);
    console.error("[TrainerShare] original:", error?.original?.message);
    const code = error.statusCode || 500;
    return res.status(code).json({ message: error.message || "Internal server error" });
  }
};

exports.getMyShareRequests = async (req, res) => {
  try {
    const userId = req.user?.id;
    const rows = await trainerShareService.getMyShareRequests(userId, req.query);
    return res.status(200).json({ message: "Share history", data: rows });
  } catch (error) {
    console.error("[TrainerShare] getMyShareRequests error:", error); // ✅ LOG Ở ĐÂY
    console.error("[TrainerShare] sql:", error?.sql);
    console.error("[TrainerShare] original:", error?.original?.message);
    const code = error.statusCode || 500;
    return res.status(code).json({ message: error.message || "Internal server error" });
  }
};
