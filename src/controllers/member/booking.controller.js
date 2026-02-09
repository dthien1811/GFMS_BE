import bookingService from "../../service/member/booking.service";

const bookingController = {
  async getAvailableTrainers(req, res) {
    try {
      const data = await bookingService.getAvailableTrainers(
        req.user.id,
        req.query.activationId
      );
      res.json({ data });
    } catch (e) {
      res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  async getAvailableSlots(req, res) {
    try {
      const data = await bookingService.getAvailableSlots(req.user.id, req.query);
      res.json({ data });
    } catch (e) {
      res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  async createBooking(req, res) {
    try {
      const data = await bookingService.createBooking(req.user.id, req.body);
      res.status(201).json({ data });
    } catch (e) {
      res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

 async getMyBookings(req, res) {
  try {
    const userId = req.user.id;
    const bookings = await bookingService.getMyBookings(userId);
    return res.json({ data: bookings });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
}


};

export default bookingController;
