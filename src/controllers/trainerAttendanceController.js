// src/controllers/trainerAttendanceController.js
const attendanceService = require("../service/trainerAttendanceService");

const getUserId = (req) => req.user?.id;

module.exports = {
  // GET /api/pt/attendance/today?date=YYYY-MM-DD&status=confirmed
  async getToday(req, res, next) {
    try {
      const userId = getUserId(req);
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
      next(e);
    }
  },

  // POST /api/pt/attendance/check-in
  // body: { bookingId, method?, status? }
  async checkIn(req, res, next) {
    try {
      const userId = getUserId(req);
      const { bookingId, method, status } = req.body || {};
      if (!bookingId) return res.status(400).json({ EM: "bookingId is required" });

      const result = await attendanceService.checkIn({
        userId,
        bookingId,
        method,
        status,
      });

      res.status(200).json(result);
    } catch (e) {
      next(e);
    }
  },

  // POST /api/pt/attendance/check-out
  // body: { bookingId, sessionNotes?, exercises?, weight?, bodyFat?, muscleMass?, sessionRating? }
  async checkOut(req, res, next) {
    try {
      const userId = getUserId(req);
      const {
        bookingId,
        sessionNotes,
        exercises,
        weight,
        bodyFat,
        muscleMass,
        sessionRating,
      } = req.body || {};

      if (!bookingId) return res.status(400).json({ EM: "bookingId is required" });

      const result = await attendanceService.checkOut({
        userId,
        bookingId,
        sessionNotes,
        exercises,
        weight,
        bodyFat,
        muscleMass,
        sessionRating,
      });

      res.status(200).json(result);
    } catch (e) {
      next(e);
    }
  },
};
