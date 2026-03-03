import db from "../../models/index";
const { Booking, Member, EquipmentStock, Equipment, Gym, User, Package, Transaction } = db;
const { Sequelize } = db;

const ownerDashboardController = {
  /**
   * GET /api/owner/dashboard/summary
   * Trả về:
   *  - todayBookings: tổng booking hôm nay
   *  - upcomingBookings: danh sách booking sắp tới (pending/confirmed, từ giờ này trở đi hôm nay + ngày mai)
   *  - expiringMembers: hội viên sắp hết hạn gói (trong 7 ngày)
   *  - lowStock: tồn kho thấp (availableQuantity <= reorderPoint)
   */
  async getSummary(req, res) {
    try {
      const userId = req.user.id;

      // Lấy danh sách gym của owner
      const myGyms = await Gym.findAll({
        where: { ownerId: userId },
        attributes: ["id", "name"],
      });
      const myGymIds = myGyms.map((g) => g.id);

      // Nếu truyền gymId thì lọc theo chi nhánh cụ thể (phải thuộc owner)
      const filterGymId = req.query.gymId ? parseInt(req.query.gymId) : null;
      const activeGymIds =
        filterGymId && myGymIds.includes(filterGymId)
          ? [filterGymId]
          : myGymIds;

      if (myGymIds.length === 0) {
        return res.status(200).json({
          todayBookings: 0,
          totalMembers: 0,
          newMembersCount: 0,
          newMembersToday: [],
          upcomingBookings: [],
          expiringMembers: [],
          lowStock: [],
          totalRevenue: 0,
        });
      }

      const today = new Date();
      const todayStr = today.toISOString().slice(0, 10); // YYYY-MM-DD
      const todayStart = new Date(todayStr + "T00:00:00.000Z");
      const todayEnd   = new Date(todayStr + "T23:59:59.999Z");

      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().slice(0, 10);

      const in7Days = new Date(today);
      in7Days.setDate(in7Days.getDate() + 7);

      // ── 1. Tổng booking hôm nay ──────────────────────────────────
      const todayBookings = await Booking.count({
        where: {
          gymId: { [Sequelize.Op.in]: activeGymIds },
          bookingDate: todayStr,
          status: { [Sequelize.Op.notIn]: ["cancelled"] },
        },
      });

      // ── 2. Booking sắp tới (hôm nay + ngày mai, còn pending/confirmed) ──
      const upcomingBookingRows = await Booking.findAll({
        where: {
          gymId: { [Sequelize.Op.in]: activeGymIds },
          bookingDate: { [Sequelize.Op.in]: [todayStr, tomorrowStr] },
          status: { [Sequelize.Op.in]: ["pending", "confirmed"] },
        },
        include: [
          {
            model: Member,
            attributes: ["id"],
            include: [{ model: User, attributes: ["username"] }],
          },
          {
            model: db.Trainer,
            attributes: ["id"],
            include: [{ model: User, attributes: ["username"] }],
          },
          {
            model: Gym,
            attributes: ["id", "name"],
          },
        ],
        order: [
          ["bookingDate", "ASC"],
          ["startTime", "ASC"],
        ],
        limit: 10,
      });

      const upcomingBookings = upcomingBookingRows.map((b) => ({
        id: b.id,
        bookingDate: b.bookingDate,
        startTime: b.startTime,
        endTime: b.endTime,
        status: b.status,
        memberName: b.Member?.User?.username || "—",
        trainerName: b.Trainer?.User?.username || "—",
        gymName: b.Gym?.name || "—",
      }));

      // ── 3. Hội viên sắp hết hạn gói (packageExpiryDate trong 7 ngày) ──
      const expiringRows = await Member.findAll({
        where: {
          gymId: { [Sequelize.Op.in]: activeGymIds },
          status: "active",
          packageExpiryDate: {
            [Sequelize.Op.gte]: today,
            [Sequelize.Op.lte]: in7Days,
          },
        },
        include: [
          { model: User, attributes: ["username", "email", "phone"] },
          { model: Package, as: "currentPackage", attributes: ["name"] },
        ],
        order: [["packageExpiryDate", "ASC"]],
        limit: 10,
      });

      const expiringMembers = expiringRows.map((m) => {
        const expiry = new Date(m.packageExpiryDate);
        const diffMs = expiry - today;
        const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        return {
          id: m.id,
          memberName: m.User?.username || "—",
          email: m.User?.email || "",
          phone: m.User?.phone || "",
          packageName: m.currentPackage?.name || "—",
          packageExpiryDate: m.packageExpiryDate,
          daysLeft,
          sessionsRemaining: m.sessionsRemaining,
        };
      });

      // ── 4. Tồn kho thấp ──────────────────────────────────────────
      const lowStockRows = await EquipmentStock.findAll({
        where: {
          gymId: { [Sequelize.Op.in]: activeGymIds },
          [Sequelize.Op.and]: Sequelize.literal(
            "`EquipmentStock`.`availableQuantity` <= `EquipmentStock`.`reorderPoint`"
          ),
        },
        include: [
          {
            model: Equipment,
            as: "equipment",
            attributes: ["id", "name", "code"],
          },
          {
            model: Gym,
            as: "gym",
            attributes: ["id", "name"],
          },
        ],
        order: [["availableQuantity", "ASC"]],
        limit: 10,
      });

      const lowStock = lowStockRows.map((s) => ({
        id: s.id,
        equipmentName: s.equipment?.name || "—",
        equipmentCode: s.equipment?.code || "",
        gymName: s.gym?.name || "—",
        availableQuantity: s.availableQuantity,
        quantity: s.quantity,
        reorderPoint: s.reorderPoint,
      }));

      // ── 5. Tổng hội viên active ──────────────────────────────────
      const totalMembers = await Member.count({
        where: {
          gymId: { [Sequelize.Op.in]: activeGymIds },
          status: "active",
        },
      });

      // ── 6. Hội viên mới hôm nay (count + list) ─────────────────────────
      const newMembersRows = await Member.findAll({
        where: {
          gymId: { [Sequelize.Op.in]: activeGymIds },
          createdAt: {
            [Sequelize.Op.gte]: todayStart,
            [Sequelize.Op.lte]: todayEnd,
          },
        },
        include: [
          { model: User, attributes: ["username", "email", "phone"] },
          { model: Package, as: "currentPackage", attributes: ["name"] },
          { model: Gym, attributes: ["name"] },
        ],
        order: [["createdAt", "DESC"]],
        limit: 20,
      });
      const newMembersCount = newMembersRows.length;
      const newMembersToday = newMembersRows.map((m) => ({
        id: m.id,
        memberName: m.User?.username || "—",
        email: m.User?.email || "",
        phone: m.User?.phone || "",
        packageName: m.currentPackage?.name || "—",
        gymName: m.Gym?.name || "—",
        joinTime: m.createdAt,
      }));

      // ── 7. Tổng doanh thu (paymentStatus = 'completed') ─────────
      const revenueResult = await Transaction.findOne({
        attributes: [
          [Sequelize.fn("COALESCE", Sequelize.fn("SUM", Sequelize.col("amount")), 0), "total"],
        ],
        where: {
          gymId: { [Sequelize.Op.in]: activeGymIds },
          paymentStatus: "completed",
        },
        raw: true,
      });
      const totalRevenue = parseFloat(revenueResult?.total || 0);

      return res.status(200).json({
        gyms: myGyms,
        todayBookings,
        totalMembers,
        newMembersCount,
        newMembersToday,
        upcomingBookings,
        expiringMembers,
        lowStock,
        totalRevenue,
      });
    } catch (e) {
      console.error("[ownerDashboard] getSummary error:", e);
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },
};

export default ownerDashboardController;
