import ownerReviewService from "../../service/owner/review.service";

const ownerReviewController = {
  async getOwnerReviews(req, res) {
    try {
      const userId = req.user.id;
      const result = await ownerReviewService.listOwnerReviews(userId, req.query || {});
      return res.status(200).json({
        data: result.data,
        pagination: result.pagination,
      });
    } catch (e) {
      console.error("Error in getOwnerReviews controller:", e);
      return res.status(e.statusCode || 500).json({ message: e.message || "Lỗi khi tải đánh giá" });
    }
  },
};

export default ownerReviewController;
