/**
 * Đổi ngày booking để test retention: mặc định 20/4/2026 11h → 19/4/2026 (member username NGUYEN1112).
 * Usage: npx babel-node scripts/shiftBookingDateForTest.js
 *        npx babel-node scripts/shiftBookingDateForTest.js --username=X --from=2026-04-20 --to=2026-04-19 --hour=11
 */
require("dotenv").config();
const { Op } = require("sequelize");
const db = require("../src/models");

function arg(name, def) {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return def;
}

async function main() {
  const username = arg("--username", "NGUYEN1112");
  const fromDate = arg("--from", "2026-04-20");
  const toDate = arg("--to", "2026-04-19");
  const hourPrefix = arg("--hour", "11");

  const rows = await db.Booking.findAll({
    where: {
      bookingDate: fromDate,
      startTime: { [Op.like]: `${String(hourPrefix).padStart(2, "0")}:%` },
    },
    include: [
      {
        model: db.Member,
        required: true,
        include: [
          {
            model: db.User,
            required: true,
            where: { username: username },
            attributes: ["id", "username"],
          },
        ],
        attributes: ["id"],
      },
    ],
    order: [["id", "ASC"]],
  });

  if (!rows.length) {
    console.log(
      `Không tìm thấy booking: user="${username}", ngày=${fromDate}, giờ bắt đầu ~${hourPrefix}:xx`
    );
    await db.sequelize.close();
    process.exit(0);
  }

  if (rows.length > 1) {
    console.log(`Cảnh báo: có ${rows.length} booking khớp, cập nhật tất cả:`);
    rows.forEach((b) =>
      console.log(`  id=${b.id} ${b.bookingDate} ${b.startTime}-${b.endTime} status=${b.status}`)
    );
  }

  for (const b of rows) {
    const prev = `${b.bookingDate} ${b.startTime}`;
    await b.update({ bookingDate: toDate });
    console.log(`OK booking id=${b.id}: ${prev} → ${toDate} ${b.startTime} (status=${b.status})`);
  }

  await db.sequelize.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
