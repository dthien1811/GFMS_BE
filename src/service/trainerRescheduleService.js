
const db = require('../models');
const { Op } = require('sequelize');
const realtimeService = require('./realtime.service').default;

const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const timeToMinutes = (t) => {
  const s = String(t || '').slice(0, 5);
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
};
const overlap = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd;
const toHHMM = (t) => String(t || '').slice(0, 5);

const getTrainerByUserId = async (userId) => {
  const trainer = await db.Trainer.findOne({ where: { userId }, attributes: ['id', 'userId'] });
  if (!trainer) {
    const e = new Error('Không tìm thấy hồ sơ PT');
    e.statusCode = 404;
    throw e;
  }
  return trainer;
};

const safeParseJSON = (v, fallback) => {
  try {
    if (!v) return fallback;
    return typeof v === 'string' ? JSON.parse(v) : v;
  } catch {
    return fallback;
  }
};

const getTrainerHoursForDate = (trainer, isoDate) => {
  const availableHours = safeParseJSON(trainer.availableHours, {});
  const dayKey = DAY_KEYS[new Date(`${isoDate}T00:00:00`).getDay()];
  return Array.isArray(availableHours?.[dayKey]) ? availableHours[dayKey] : [];
};

const slotFitsHours = (hours, startTime, endTime) => {
  const s = timeToMinutes(startTime);
  const e = timeToMinutes(endTime);
  return (hours || []).some((h) => s >= timeToMinutes(h.start) && e <= timeToMinutes(h.end));
};

const getRequestOrThrow = async (trainerUserId, requestId, transaction) => {
  const trainer = await getTrainerByUserId(trainerUserId);
  const row = await db.BookingRescheduleRequest.findOne({
    where: { id: requestId, trainerId: trainer.id },
    include: [
      {
        model: db.Booking,
        include: [
          {
            model: db.Member,
            include: [{ model: db.User, attributes: ['id', 'username', 'email'] }],
          },
          {
            model: db.Trainer,
            include: [{ model: db.User, attributes: ['id', 'username', 'email'] }],
          },
          { model: db.Package, attributes: ['id', 'name', 'type'] },
          { model: db.Gym, attributes: ['id', 'name'] },
        ],
      },
    ],
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });
  if (!row) {
    const e = new Error('Không tìm thấy yêu cầu đổi lịch');
    e.statusCode = 404;
    throw e;
  }
  return row;
};

const listMyRescheduleRequests = async (trainerUserId) => {
  const trainer = await getTrainerByUserId(trainerUserId);
  return db.BookingRescheduleRequest.findAll({
    where: { trainerId: trainer.id },
    include: [
      {
        model: db.Booking,
        include: [
          {
            model: db.Member,
            include: [{ model: db.User, attributes: ['id', 'username', 'email'] }],
          },
          { model: db.Package, attributes: ['id', 'name', 'type'] },
          { model: db.Gym, attributes: ['id', 'name'] },
        ],
      },
    ],
    order: [['createdAt', 'DESC']],
  });
};

const approveRescheduleRequest = async (trainerUserId, requestId, payload = {}) => {
  const t = await db.sequelize.transaction();
  try {
    const row = await getRequestOrThrow(trainerUserId, requestId, t);
    if (String(row.status).toLowerCase() !== 'pending') {
      const e = new Error('Yêu cầu này đã được xử lý');
      e.statusCode = 400;
      throw e;
    }

    const booking = row.Booking;
    const bookingStatus = String(booking?.status || '').toLowerCase();
    if (!booking || ['cancelled', 'completed', 'no_show'].includes(bookingStatus)) {
      const e = new Error('Booking hiện không thể đổi lịch');
      e.statusCode = 400;
      throw e;
    }

    const hours = getTrainerHoursForDate(booking.Trainer, row.requestedDate);
    if (!slotFitsHours(hours, row.requestedStartTime, row.requestedEndTime)) {
      const e = new Error('Khung giờ đề xuất không còn nằm trong lịch rảnh của PT');
      e.statusCode = 400;
      throw e;
    }

    const trainerConflict = await db.Booking.findOne({
      where: {
        trainerId: row.trainerId,
        bookingDate: row.requestedDate,
        status: { [Op.ne]: 'cancelled' },
        id: { [Op.ne]: booking.id },
      },
      transaction: t,
    });
    if (trainerConflict && overlap(timeToMinutes(row.requestedStartTime), timeToMinutes(row.requestedEndTime), timeToMinutes(trainerConflict.startTime), timeToMinutes(trainerConflict.endTime))) {
      const e = new Error('Khung giờ này PT đã có lịch khác');
      e.statusCode = 400;
      throw e;
    }

    const memberConflict = await db.Booking.findOne({
      where: {
        createdBy: booking.createdBy,
        bookingDate: row.requestedDate,
        status: { [Op.ne]: 'cancelled' },
        id: { [Op.ne]: booking.id },
      },
      transaction: t,
    });
    if (memberConflict && overlap(timeToMinutes(row.requestedStartTime), timeToMinutes(row.requestedEndTime), timeToMinutes(memberConflict.startTime), timeToMinutes(memberConflict.endTime))) {
      const e = new Error('Hội viên đã có lịch khác trong khung giờ này');
      e.statusCode = 400;
      throw e;
    }

    await booking.update({
      originalBookingDate: booking.originalBookingDate || booking.bookingDate,
      originalStartTime: booking.originalStartTime || booking.startTime,
      originalEndTime: booking.originalEndTime || booking.endTime,
      bookingDate: row.requestedDate,
      startTime: row.requestedStartTime,
      endTime: row.requestedEndTime,
      isRescheduled: true,
      rescheduledAt: new Date(),
      notes: [booking.notes, '[Đã đổi lịch theo yêu cầu hội viên]'].filter(Boolean).join(' '),
    }, { transaction: t });

    await row.update({
      status: 'approved',
      trainerResponseNote: payload.note || null,
      processedByUserId: trainerUserId,
      processedAt: new Date(),
    }, { transaction: t });

    await t.commit();

    if (booking.Member?.User?.id) {
      await realtimeService.notifyUser(Number(booking.Member.User.id), {
        title: 'Yêu cầu đổi lịch đã được chấp nhận',
        message: `Buổi tập của bạn đã được đổi sang ${row.requestedDate} ${toHHMM(row.requestedStartTime)} - ${toHHMM(row.requestedEndTime)}.`,
        notificationType: 'booking_reschedule',
        relatedType: 'booking_reschedule_request',
        relatedId: row.id,
      });
    }
    return row;
  } catch (e) {
    await t.rollback();
    throw e;
  }
};

const rejectRescheduleRequest = async (trainerUserId, requestId, payload = {}) => {
  const t = await db.sequelize.transaction();
  try {
    const row = await getRequestOrThrow(trainerUserId, requestId, t);
    if (String(row.status).toLowerCase() !== 'pending') {
      const e = new Error('Yêu cầu này đã được xử lý');
      e.statusCode = 400;
      throw e;
    }
    await row.update({
      status: 'rejected',
      trainerResponseNote: payload.note || null,
      processedByUserId: trainerUserId,
      processedAt: new Date(),
    }, { transaction: t });
    await t.commit();

    const memberUserId = row?.Booking?.Member?.User?.id;
    if (memberUserId) {
      await realtimeService.notifyUser(Number(memberUserId), {
        title: 'Yêu cầu đổi lịch đã bị từ chối',
        message: payload.note ? `PT đã từ chối yêu cầu đổi lịch: ${payload.note}` : 'PT hiện chưa thể đáp ứng khung giờ bạn yêu cầu.',
        notificationType: 'booking_reschedule',
        relatedType: 'booking_reschedule_request',
        relatedId: row.id,
      });
    }
    return row;
  } catch (e) {
    await t.rollback();
    throw e;
  }
};

module.exports = {
  listMyRescheduleRequests,
  approveRescheduleRequest,
  rejectRescheduleRequest,
};
