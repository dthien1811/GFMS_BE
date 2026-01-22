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

      console.log("=== GET OWNER BOOKINGS ===");
      console.log("User ID:", userId);
      console.log("Query params:", query);

      const result = await ownerBookingService.getMyBookings(userId, query);

      return res.status(200).json({
        data: result.bookings,
        pagination: result.pagination,
      });
    } catch (e) {
      console.error("❌ Error in getMyBookings controller:", e.message);
      console.error("Stack:", e.stack);
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  /**
   * GET /api/owner/bookings/:id
   * Lấy chi tiết booking
   */
  async getBookingDetail(req, res) {
    try {
      const userId = req.user.id;
      const bookingId = req.params.id;

      const booking = await ownerBookingService.getBookingDetail(userId, bookingId);

      return res.status(200).json({
        data: booking,
      });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },
};

export default ownerBookingController;
