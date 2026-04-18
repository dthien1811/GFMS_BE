const attendanceService = require("../service/trainerAttendanceService");

const getUserId = (req) => req.user?.id;

module.exports = {
  // GET /api/pt/attendance/today
  async getToday(req, res, next) {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ EM: "Unauthorized: No user ID found in token" });

      const result = await attendanceService.getMyScheduleForDate({
        userId,
        date: req.query.date,
        status: req.query.status,
      });

      res.json({
        bookingDate: result.bookingDate,
        trainer: result.trainer,
        rows: result.rows,
      });
    } catch (e) {
      console.error(">>> ERROR GET TODAY:", e);
      res.status(e.statusCode || 500).json({ 
        EM: "Error fetching schedule", 
        DT: e.message 
      });
    }
  },

  // POST /api/pt/attendance/check-in
  async checkIn(req, res, next) {
    try {
      const userId = getUserId(req);
      const { bookingId, method, status } = req.body || {};

      console.log(">>> CHECK-IN REQUEST:", { userId, bookingId, method, status });

      if (!bookingId) return res.status(400).json({ EM: "bookingId is required" });

      const result = await attendanceService.checkIn({
        userId,
        bookingId,
        method,
        status,
      });

      console.log(">>> CHECK-IN SUCCESS");
      res.status(200).json(result);

    } catch (e) {
      // LOG CHI TIẾT RA TERMINAL ĐỂ DEBUG
      console.error("---------- CHECK-IN ERROR ----------");
      console.error("Message:", e.message);
      console.error("Stack:", e.stack);
      if (e.name === 'SequelizeDatabaseError') {
          console.error("SQL Error Detail:", e.parent);
      }
      console.error("------------------------------------");

      // Trả về lỗi chi tiết cho Frontend dễ sửa
      res.status(e.statusCode || 500).json({
        EM: "Internal Server Error",
        DT: e.message,
        errorName: e.name
      });
    }
  },

  // POST /api/pt/attendance/check-out
  async checkOut(req, res, next) {
    try {
      const userId = getUserId(req);
      const { bookingId, ...otherData } = req.body || {};

      if (!bookingId) return res.status(400).json({ EM: "bookingId is required" });

      const result = await attendanceService.checkOut({
        userId,
        bookingId,
        ...otherData
      });

      res.status(200).json(result);
    } catch (e) {
      console.error(">>> CHECK-OUT ERROR:", e);
      res.status(e.statusCode || 500).json({ 
        EM: "Error during check-out", 
        DT: e.message 
      });
    }
  },

  async reset(req, res, next) {
    try {
      const userId = getUserId(req);
      const { bookingId } = req.body || {};
      if (!bookingId) return res.status(400).json({ EM: "bookingId is required" });

      const result = await attendanceService.resetAttendance({
        userId,
        bookingId,
      });

      res.status(200).json(result);
    } catch (e) {
      console.error(">>> RESET ATTENDANCE ERROR:", e);
      res.status(e.statusCode || 500).json({
        EM: "Error during reset attendance",
        DT: e.message,
        message: e.message,
      });
    }
  },

  async requestBusySlot(req, res, next) {
    try {
      const userId = getUserId(req);
      const { bookingId, reason } = req.body || {};
      if (!bookingId) return res.status(400).json({ EM: "bookingId is required" });

      const result = await attendanceService.requestBusySlot({
        userId,
        bookingId,
        reason,
      });

      res.status(200).json(result);
    } catch (e) {
      res.status(e.statusCode || 500).json({
        EM: "Error sending busy slot request",
        DT: e.message,
        message: e.message,
      });
    }
  },

  /** POST /api/pt/bookings/:bookingId/share-payment-instruction — PT gửi NH + STK sau khi buổi mượn hoàn thành */
  async sendSharePaymentByBooking(req, res, next) {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ EM: "Unauthorized" });
      const bookingId = req.params.bookingId;
      if (!bookingId) return res.status(400).json({ EM: "bookingId is required" });

      let ownerTrainerShareService;
      try {
        ownerTrainerShareService = require("../service/owner/trainershare.service.js");
      } catch (_e) {
        ownerTrainerShareService = require("../service/owner/trainershare.service");
      }
      const svc = ownerTrainerShareService.default || ownerTrainerShareService;

      const data = await svc.sendSharePaymentInstructionByBookingId(
        userId,
        Number(bookingId),
        req.body || {},
      );

      res.status(200).json({
        message: "Đã gửi thông tin chuyển khoản cho chủ phòng mượn",
        data,
      });
    } catch (e) {
      console.error(">>> SHARE PAYMENT INSTRUCTION ERROR:", e);
      res.status(e.statusCode || 500).json({
        EM: e.message || "Error",
        message: e.message,
        DT: e.message,
      });
    }
  },

  /** POST /api/pt/bookings/:bookingId/share-payment-dispute — PT khiếu nại chưa nhận tiền */
  async submitSharePaymentDispute(req, res) {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ EM: "Unauthorized" });
      const bookingId = req.params.bookingId;
      if (!bookingId) return res.status(400).json({ EM: "bookingId is required" });

      let ownerTrainerShareService;
      try {
        ownerTrainerShareService = require("../service/owner/trainershare.service.js");
      } catch (_e) {
        ownerTrainerShareService = require("../service/owner/trainershare.service");
      }
      const svc = ownerTrainerShareService.default || ownerTrainerShareService;

      const data = await svc.submitSharePaymentDisputeByBookingId(userId, Number(bookingId), req.body || {});

      res.status(200).json({
        message: "Đã gửi khiếu nại",
        data,
      });
    } catch (e) {
      console.error(">>> SHARE PAYMENT DISPUTE ERROR:", e);
      res.status(e.statusCode || 500).json({
        EM: e.message || "Error",
        message: e.message,
        DT: e.message,
      });
    }
  },

  /** POST /api/pt/bookings/:bookingId/share-payment-ack — PT xác nhận đã nhận / đồng ý phản hồi chủ phòng */
  async acknowledgeSharePaymentResponse(req, res) {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ EM: "Unauthorized" });
      const bookingId = req.params.bookingId;
      if (!bookingId) return res.status(400).json({ EM: "bookingId is required" });

      let ownerTrainerShareService;
      try {
        ownerTrainerShareService = require("../service/owner/trainershare.service.js");
      } catch (_e) {
        ownerTrainerShareService = require("../service/owner/trainershare.service");
      }
      const svc = ownerTrainerShareService.default || ownerTrainerShareService;

      const data = await svc.acknowledgeBorrowerSharePaymentResponseByBookingId(
        userId,
        Number(bookingId),
      );

      res.status(200).json({
        message: "Đã xác nhận",
        data,
      });
    } catch (e) {
      console.error(">>> SHARE PAYMENT ACK ERROR:", e);
      res.status(e.statusCode || 500).json({
        EM: e.message || "Error",
        message: e.message,
        DT: e.message,
      });
    }
  },
};