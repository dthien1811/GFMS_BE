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

  /**
   * POST /api/owner/bookings
   * Tạo booking mới
   */
  async createBooking(req, res) {
    try {
      const userId = req.user.id;
      const data = req.body;

      console.log("=== CREATE BOOKING ===");
      console.log("User ID:", userId);
      console.log("Data:", data);

      const booking = await ownerBookingService.createBooking(userId, data);

      return res.status(201).json({
        message: "Đặt lịch thành công",
        data: booking,
      });
    } catch (e) {
      console.error("❌ Error in createBooking controller:", e.message);
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  /**
   * PUT /api/owner/bookings/:id
   * Cập nhật booking
   */
  async updateBooking(req, res) {
    try {
      const userId = req.user.id;
      const bookingId = req.params.id;
      const data = req.body;

      const booking = await ownerBookingService.updateBooking(userId, bookingId, data);

      return res.status(200).json({
        message: "Cập nhật booking thành công",
        data: booking,
      });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  /**
   * DELETE /api/owner/bookings/:id/cancel
   * Hủy booking
   */
  async cancelBooking(req, res) {
    try {
      const userId = req.user.id;
      const bookingId = req.params.id;

      await ownerBookingService.cancelBooking(userId, bookingId);

      return res.status(200).json({
        message: "Đã hủy booking",
      });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  /**
   * PATCH /api/owner/bookings/:id/status
   * Cập nhật status của booking
   */
  async updateBookingStatus(req, res) {
    try {
      const userId = req.user.id;
      const bookingId = req.params.id;
      const { status } = req.body;

      if (!status) {
        return res.status(400).json({ message: "Thiếu tham số status" });
      }

      const booking = await ownerBookingService.updateBookingStatus(userId, bookingId, status);

      return res.status(200).json({
        message: "Cập nhật trạng thái thành công",
        data: booking,
      });
    } catch (e) {
      console.error("❌ Error in updateBookingStatus:", e.message);
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  /**
   * GET /api/owner/bookings/trainer/:trainerId/schedule?date=YYYY-MM-DD
   * Lấy lịch đã book của trainer theo ngày
   */
  async getTrainerSchedule(req, res) {
    try {
      const userId = req.user.id;
      const { trainerId } = req.params;
      const { date } = req.query;

      if (!date) {
        return res.status(400).json({ message: "Thiếu tham số date" });
      }

      const bookings = await ownerBookingService.getTrainerSchedule(userId, trainerId, date);

      return res.status(200).json({
        data: bookings,
      });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },
};

export default ownerBookingController;
