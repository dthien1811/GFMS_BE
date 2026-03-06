// be/src/controllers/trainerBookingController.js
const trainerBookingService = require('../service/trainerBookingService');

exports.getTrainerBookings = async (req, res) => {
  // Phải dùng 'id' vì route của bạn là /:id/bookings
  const { id } = req.params; 
  try {
    const bookings = await trainerBookingService.getTrainerBookings(id);
    return res.status(200).json({ bookings });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.confirmBooking = async (req, res) => {
  // Phải dùng 'id' vì route của bạn là /bookings/:id/confirm
  const { id } = req.params; 
  try {
    const booking = await trainerBookingService.confirmBooking(id);
    return res.status(200).json({ message: 'Booking confirmed', booking });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};