// be/src/service/trainerBookingService.js
const { Booking, Member, Gym } = require('../models');

// Lấy tất cả các lịch đã đặt của PT
const getTrainerBookings = async (trainerId) => {
  try {
    const bookings = await Booking.findAll({
      where: { trainerId }, 
      include: [
        { model: Member, attributes: ['id', 'name'] },
        { model: Gym, attributes: ['id', 'name'] },
      ],
      order: [['createdAt', 'DESC']]
    });
    return bookings;
  } catch (error) {
    console.error("Error in getTrainerBookings service:", error);
    throw new Error('Error fetching trainer bookings');
  }
};

// Xác nhận lịch của PT
const confirmBooking = async (bookingId) => {
  try {
    const booking = await Booking.findByPk(bookingId);
    if (!booking) throw new Error('Booking not found');

    booking.status = 'confirmed'; 
    await booking.save();
    return booking;
  } catch (error) {
    console.error("Error in confirmBooking service:", error);
    throw new Error('Error confirming booking');
  }
};

// EXPORT ĐỂ CONTROLLER DÙNG ĐƯỢC
module.exports = {
  getTrainerBookings,
  confirmBooking
};