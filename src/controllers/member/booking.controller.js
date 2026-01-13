// controllers/member/booking.controller.js
import bookingService from "../../service/member/booking.service";

const bookingController = {
  // ✅ GET /api/member/bookings/trainers?date=YYYY-MM-DD (optional)
  async getAvailableTrainers(req, res) {
    try {
      const date = req.query?.date ? String(req.query.date).trim() : undefined;
      const data = await bookingService.getAvailableTrainers(req.user.id, date);
      return res.status(200).json({ data });
    } catch (e) {
      const code = e.statusCode || 500;

      // ✅ log rõ ở BE
      console.error("getAvailableTrainers error:", e);

      // ✅ trả lỗi rõ cho FE (dev)
      return res.status(code).json({
        message: e.message || "Internal Server Error",
        // bật debug dễ bắt lỗi 500 (có thể bỏ khi release)
        details: e?.original?.message || e?.parent?.message || null,
        stack: process.env.NODE_ENV !== "production" ? e.stack : undefined,
      });
    }
  },

  // ✅ GET /api/member/bookings/slots?trainerId=...&date=YYYY-MM-DD
  async getAvailableSlots(req, res) {
    try {
      const trainerId = req.query?.trainerId ? String(req.query.trainerId).trim() : "";
      const date = req.query?.date ? String(req.query.date).trim() : "";

      const data = await bookingService.getAvailableSlots(req.user.id, {
        trainerId,
        date,
      });

      return res.status(200).json({ data });
    } catch (e) {
      const code = e.statusCode || 500;
      console.error("getAvailableSlots error:", e);

      return res.status(code).json({
        message: e.message || "Internal Server Error",
        details: e?.original?.message || e?.parent?.message || null,
        stack: process.env.NODE_ENV !== "production" ? e.stack : undefined,
      });
    }
  },

  // ✅ POST /api/member/bookings
  async createBooking(req, res) {
    try {
      const payload = req.body || {};
      const data = await bookingService.createBooking(req.user.id, payload);
      return res.status(201).json({ data });
    } catch (e) {
      const code = e.statusCode || 500;
      console.error("createBooking error:", e);

      return res.status(code).json({
        message: e.message || "Internal Server Error",
        details: e?.original?.message || e?.parent?.message || null,
        stack: process.env.NODE_ENV !== "production" ? e.stack : undefined,
      });
    }
  },

  // ✅ GET /api/member/bookings
  async getMyBookings(req, res) {
    try {
      const data = await bookingService.getMyBookings(req.user.id);
      return res.status(200).json({ data });
    } catch (e) {
      const code = e.statusCode || 500;
      console.error("getMyBookings error:", e);

      return res.status(code).json({
        message: e.message || "Internal Server Error",
        details: e?.original?.message || e?.parent?.message || null,
        stack: process.env.NODE_ENV !== "production" ? e.stack : undefined,
      });
    }
  },

  // ✅ PATCH /api/member/bookings/:id/cancel
  async cancelBooking(req, res) {
    try {
      const bookingId = req.params?.id;
      const payload = req.body || {};
      const data = await bookingService.cancelBooking(req.user.id, bookingId, payload);
      return res.status(200).json({ data });
    } catch (e) {
      const code = e.statusCode || 500;
      console.error("cancelBooking error:", e);

      return res.status(code).json({
        message: e.message || "Internal Server Error",
        details: e?.original?.message || e?.parent?.message || null,
        stack: process.env.NODE_ENV !== "production" ? e.stack : undefined,
      });
    }
  },

  // ✅ POST /api/member/bookings/:id/checkin
  async checkinBooking(req, res) {
    try {
      const bookingId = req.params?.id;
      const payload = req.body || {};
      const data = await bookingService.checkinBooking(req.user.id, bookingId, payload);
      return res.status(200).json({ data });
    } catch (e) {
      const code = e.statusCode || 500;
      console.error("checkinBooking error:", e);

      return res.status(code).json({
        message: e.message || "Internal Server Error",
        details: e?.original?.message || e?.parent?.message || null,
        stack: process.env.NODE_ENV !== "production" ? e.stack : undefined,
      });
    }
  },

  // ✅ POST /api/member/bookings/:id/checkout
  async checkoutBooking(req, res) {
    try {
      const bookingId = req.params?.id;
      const data = await bookingService.checkoutBooking(req.user.id, bookingId);
      return res.status(200).json({ data });
    } catch (e) {
      const code = e.statusCode || 500;
      console.error("checkoutBooking error:", e);

      return res.status(code).json({
        message: e.message || "Internal Server Error",
        details: e?.original?.message || e?.parent?.message || null,
        stack: process.env.NODE_ENV !== "production" ? e.stack : undefined,
      });
    }
  },
};

export default bookingController;
