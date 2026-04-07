import ownerBookingService from "../../service/owner/booking.service";

const ownerBookingController = {
  /**
   * GET /api/owner/bookings
   * Lấy danh sách bookings của owner
   */
  async getMyBookings(req, res) {
    try {
      const userId = req.user.id;
      const query = req.query;

      const result = await ownerBookingService.getMyBookings(userId, query);

      return res.status(200).json({
        data: result.bookings,
        pagination: result.pagination,
      });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  async getTrainerSchedule(req, res) {
    try {
      const userId = req.user.id;
      const { trainerId } = req.params;
      const { date, includeAllGyms } = req.query;

      if (!date) {
        return res.status(400).json({ message: "Thiếu tham số date" });
      }

      const bookings = await ownerBookingService.getTrainerSchedule(userId, trainerId, date, { includeAllGyms });

      return res.status(200).json({
        data: bookings,
      });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },
};

export default ownerBookingController;
