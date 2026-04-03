import reviewService from "../../service/member/review.service";

const reviewController = {
  async getEligible(req, res) {
    try {
      const data = await reviewService.getEligibleReviewTargets(req.user.id);
      return res.status(200).json({ data });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  async getEligibleCourses(req, res) {
    try {
      const data = await reviewService.getEligibleReviewTargets(req.user.id);
      return res.status(200).json({ data });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  async listMine(req, res) {
    try {
      const data = await reviewService.listMine(req.user.id);
      return res.status(200).json({ data });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  async getMyReviews(req, res) {
    try {
      const data = await reviewService.listMine(req.user.id);
      return res.status(200).json({ data });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  async create(req, res) {
    try {
      const data = await reviewService.create(req.user.id, req.body || {});
      return res.status(201).json({ data, message: "Đã gửi đánh giá" });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  async createReview(req, res) {
    try {
      const data = await reviewService.create(req.user.id, req.body || {});
      return res.status(201).json({ data, message: "Đã gửi đánh giá" });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },
};

export default reviewController;