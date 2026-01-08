import bookingService from "../../service/member/booking.service";

const bookingController = {
  async getAvailableTrainers(req, res) {
    try {
      const { date } = req.query; // optional YYYY-MM-DD
      const data = await bookingService.getAvailableTrainers(req.user.id, date);
      return res.status(200).json({ data });
    } catch (e) {
      const code = e.statusCode || 500;
      return res.status(code).json({ message: e.message });
    }
  },

  async getAvailableSlots(req, res) {
    try {
      const { trainerId, date } = req.query; // YYYY-MM-DD
      const data = await bookingService.getAvailableSlots(req.user.id, { trainerId, date });
      return res.status(200).json({ data });
    } catch (e) {
      const code = e.statusCode || 500;
      return res.status(code).json({ message: e.message });
    }
  },

  async createBooking(req, res) {
    try {
      const data = await bookingService.createBooking(req.user.id, req.body);
      return res.status(201).json({ data });
    } catch (e) {
      const code = e.statusCode || 500;
      return res.status(code).json({ message: e.message });
    }
  },

  async getMyBookings(req, res) {
    try {
      const data = await bookingService.getMyBookings(req.user.id);
      return res.status(200).json({ data });
    } catch (e) {
      const code = e.statusCode || 500;
      return res.status(code).json({ message: e.message });
    }
  },

  async cancelBooking(req, res) {
    try {
      const data = await bookingService.cancelBooking(req.user.id, req.params.id, req.body);
      return res.status(200).json({ data });
    } catch (e) {
      const code = e.statusCode || 500;
      return res.status(code).json({ message: e.message });
    }
  },

  async checkinBooking(req, res) {
    try {
      const data = await bookingService.checkinBooking(req.user.id, req.params.id, req.body);
      return res.status(200).json({ data });
    } catch (e) {
      const code = e.statusCode || 500;
      return res.status(code).json({ message: e.message });
    }
  },

  async checkoutBooking(req, res) {
    try {
      const data = await bookingService.checkoutBooking(req.user.id, req.params.id);
      return res.status(200).json({ data });
    } catch (e) {
      const code = e.statusCode || 500;
      return res.status(code).json({ message: e.message });
    }
  },
};

export default bookingController;
