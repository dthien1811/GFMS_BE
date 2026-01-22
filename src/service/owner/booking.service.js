import db from "../../models/index";

const { Booking, Member, Trainer, Gym, Package, User } = db;

/**
 * Owner xem danh sách bookings của gyms mình quản lý
 */
const getMyBookings = async (userId, query = {}) => {
  try {
    const { page = 1, limit = 10, status, q, gymId, fromDate, toDate } = query;
    const offset = (page - 1) * limit;

    // Lấy danh sách gym của owner
    const myGyms = await Gym.findAll({
      where: { ownerId: userId },
      attributes: ["id"],
    });
    const myGymIds = myGyms.map((g) => g.id);
    
    console.log("Owner ID:", userId);
    console.log("My Gym IDs:", myGymIds);

    if (myGymIds.length === 0) {
      return {
        bookings: [],
        pagination: { total: 0, page: parseInt(page), limit: parseInt(limit), totalPages: 0 },
      };
    }

    // Kiểm tra tổng số bookings trong database cho gym này
    const totalBookings = await Booking.count({
      where: { gymId: { [db.Sequelize.Op.in]: myGymIds } }
    });
    console.log("Total bookings in my gyms:", totalBookings);

    // Lấy một vài bookings mẫu để xem
    const sampleBookings = await Booking.findAll({
      where: { gymId: { [db.Sequelize.Op.in]: myGymIds } },
      limit: 3,
      raw: true
    });
    console.log("Sample bookings:", JSON.stringify(sampleBookings, null, 2));

    // Lấy danh sách PT trong các gym của owner
    const trainersInMyGyms = await db.sequelize.query(`
      SELECT DISTINCT t.id, t.userId, u.username, u.email, ts.toGymId
      FROM trainer t
      LEFT JOIN user u ON t.userId = u.id
      LEFT JOIN trainershare ts ON t.id = ts.trainerId AND ts.toGymId IN (${myGymIds.join(',')})
      WHERE ts.toGymId IS NOT NULL
    `, { type: db.Sequelize.QueryTypes.SELECT });
    
    console.log("Trainers in my gyms:", JSON.stringify(trainersInMyGyms, null, 2));

    const whereClause = { gymId: { [db.Sequelize.Op.in]: myGymIds } };
    
    if (status) {
      whereClause.status = status;
    }
    
    if (gymId) {
      whereClause.gymId = gymId;
    }

    if (fromDate) {
      whereClause.bookingDate = { [db.Sequelize.Op.gte]: fromDate };
    }
    
    if (toDate) {
      whereClause.bookingDate = whereClause.bookingDate
        ? { ...whereClause.bookingDate, [db.Sequelize.Op.lte]: toDate }
        : { [db.Sequelize.Op.lte]: toDate };
    }

    // Search by trainer name or member name
    let includeMember = {
      model: Member,
      attributes: ["id", "membershipNumber"],
      include: [
        {
          model: User,
          attributes: ["id", "username", "email", "phone"],
        },
      ],
      required: false,
    };

    let includeTrainer = {
      model: Trainer,
      attributes: ["id", "specialization", "experienceYears", "rating"],
      include: [
        {
          model: User,
          attributes: ["id", "username", "email", "phone"],
        },
      ],
      required: false,
    };

    console.log("Where clause:", JSON.stringify(whereClause));

    const { rows, count } = await Booking.findAndCountAll({
      where: whereClause,
      include: [
        includeMember,
        includeTrainer,
        {
          model: Gym,
          attributes: ["id", "name", "address"],
          required: false,
        },
        {
          model: Package,
          attributes: ["id", "name"],
          required: false,
        },
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [
        ["bookingDate", "DESC"],
        ["id", "DESC"]
      ],
      distinct: true,
    });

    console.log("Found bookings:", rows.length);
    console.log("Sample booking data:", JSON.stringify(rows[0], null, 2));

    return {
      bookings: rows,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit),
      },
    };
  } catch (error) {
    console.error("Error in getMyBookings:", error.message);
    console.error("Stack:", error.stack);
    throw error;
  }
};

/**
 * Owner xem chi tiết booking
 */
const getBookingDetail = async (userId, bookingId) => {
  // Lấy danh sách gym của owner
  const myGyms = await Gym.findAll({
    where: { ownerId: userId },
    attributes: ["id"],
  });
  const myGymIds = myGyms.map((g) => g.id);

  const booking = await Booking.findOne({
    where: {
      id: bookingId,
      gymId: { [db.Sequelize.Op.in]: myGymIds },
    },
    include: [
      {
        model: Member,
        include: [{ model: User, attributes: ["id", "username", "email", "phone"] }],
      },
      {
        model: Trainer,
        attributes: ["id", "specialization", "certification"],
        include: [{ model: User, attributes: ["id", "username", "email", "phone"] }],
      },
      {
        model: Gym,
        attributes: ["id", "name", "address"],
      },
      {
        model: Package,
        attributes: ["id", "name", "price"],
      },
    ],
  });

  if (!booking) {
    const error = new Error("Không tìm thấy booking hoặc bạn không có quyền xem");
    error.statusCode = 404;
    throw error;
  }

  return booking;
};

export default {
  getMyBookings,
  getBookingDetail,
};
