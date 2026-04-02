import reviewService from "../../service/member/review.service";

const reviewController = {
  async getEligibleCourses(req, res) {
    try {
      const data = await reviewService.getEligibleCourses(req.user.id);
      return res.status(200).json({ data });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  async getMyReviews(req, res) {
    try {
      const data = await reviewService.getMyReviews(req.user.id);
      return res.status(200).json({ data });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  async createReview(req, res) {
    try {
      const data = await reviewService.createReview(req.user.id, req.body);
      return res.status(201).json({ data });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },
};

export default reviewController;
