/**
 * Tìm booking lịch chia sẻ (trainer_share) theo ngày + giờ + username (member hoặc PT),
 * tạm đổi bookingDate về hôm nay nếu cần để vượt assertAttendanceDateWindow, rồi gọi checkIn + checkOut.
 *
 * Chạy: cd GFMS_BE && npx babel-node scripts/find-and-mark-share-booking.js
 */
require("dotenv").config();
const db = require("../src/models");
const attendanceService = require("../src/service/trainerAttendanceService");

const TARGET_DATE = process.env.TARGET_BOOKING_DATE || "2026-04-20"; // Thứ 2 20/04
const TARGET_TIME_PREFIX = process.env.TARGET_START_TIME || "09:00"; // HH:mm
const USERNAME_HINT = process.env.USERNAME_HINT || "NGUYEN1112";

async function findBooking() {
  const { Op } = db.Sequelize;
  const forceId = process.env.BOOKING_ID ? Number(process.env.BOOKING_ID) : null;

  if (forceId) {
    const b = await db.Booking.findByPk(forceId, {
      include: [
        { model: db.Trainer, include: [{ model: db.User, attributes: ["id", "username"] }] },
        { model: db.Member, include: [{ model: db.User, attributes: ["username"] }] },
      ],
    });
    if (b) return b;
  }

  const user = await db.User.findOne({
    where: { username: { [Op.like]: `%${USERNAME_HINT}%` } },
    attributes: ["id", "username"],
  });
  if (!user) {
    console.error("Không thấy User username chứa:", USERNAME_HINT);
    return null;
  }
  console.log("User:", user.id, user.username);

  const member = await db.Member.findOne({
    where: { userId: user.id },
    attributes: ["id"],
  });

  const baseInclude = [
    { model: db.Trainer, include: [{ model: db.User, attributes: ["id", "username"] }] },
    { model: db.Member, include: [{ model: db.User, attributes: ["username"] }] },
  ];

  const timeClause = { [Op.like]: `${TARGET_TIME_PREFIX}%` };

  const tryWhere = async (dateStr) => {
    if (!member) return null;
    return db.Booking.findOne({
      where: {
        memberId: member.id,
        bookingDate: dateStr,
        sessionType: "trainer_share",
        startTime: timeClause,
      },
      include: baseInclude,
    });
  };

  let booking = await tryWhere(TARGET_DATE);
  if (!booking) {
    const today = new Date().toISOString().slice(0, 10);
    booking = await tryWhere(today);
  }
  if (!booking && member) {
    booking = await db.Booking.findOne({
      where: {
        memberId: member.id,
        sessionType: "trainer_share",
        startTime: timeClause,
      },
      order: [["bookingDate", "DESC"]],
      include: baseInclude,
    });
  }

  return booking;
}

async function main() {
  const booking = await findBooking();
  if (!booking) {
    console.error("Không tìm thấy booking. Thử set TARGET_BOOKING_DATE, USERNAME_HINT, TARGET_START_TIME.");
    process.exit(1);
  }

  const trainerUserId = booking.Trainer?.userId || booking.Trainer?.User?.id;
  if (!trainerUserId) {
    console.error("Booking không có trainer userId");
    process.exit(1);
  }

  const rawDate = booking.bookingDate;
  const today = new Date().toISOString().slice(0, 10);
  console.log("Booking id:", booking.id, "status:", booking.status);
  console.log("bookingDate:", rawDate, "start:", booking.startTime, "trainer user:", trainerUserId);

  if (String(rawDate).slice(0, 10) > today) {
    console.log(">>> bookingDate trong tương lai — tạm set bookingDate =", today, "để API cho phép điểm danh.");
    booking.bookingDate = today;
    await booking.save({ fields: ["bookingDate"] });
  }

  if (String(booking.status).toLowerCase() === "completed") {
    console.log("Buổi đã completed — bỏ qua (hoặc reset attendance trước nếu cần test lại).");
    process.exit(0);
  }

  console.log(">>> checkIn...");
  await attendanceService.checkIn({
    userId: trainerUserId,
    bookingId: booking.id,
    method: "manual",
    status: "present",
  });

  console.log(">>> checkOut (hoàn thành buổi — attendance status dùng present theo ENUM DB)...");
  await attendanceService.checkOut({
    userId: trainerUserId,
    bookingId: booking.id,
    status: "present",
  });

  console.log("OK — booking", booking.id, "đã completed. Bạn có thể test gửi thanh toán mượn PT.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
