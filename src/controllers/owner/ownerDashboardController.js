import db from "../../models/index";
const { Booking, Member, EquipmentStock, Equipment, Gym, User, Package, Transaction, Commission } = db;
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
      const localDateKey = (d = new Date()) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
      };
      const localMonthKey = (d = new Date()) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        return `${y}-${m}`;
      };
      const nowLocal = new Date();
      const todayKey = localDateKey(nowLocal);
      const monthKey = localMonthKey(nowLocal);
      const revenueDateExpr = Sequelize.literal(
        "COALESCE(DATE(`Commission`.`sessionDate`), DATE(`Commission`.`createdAt`))"
      );

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
          bestSellingPackages: [],
          totalRevenue: 0,
          todayRevenue: 0,
          monthRevenue: 0,
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

      const todayBookingRows = await Booking.findAll({
        where: {
          gymId: { [Sequelize.Op.in]: activeGymIds },
          bookingDate: todayStr,
          status: { [Sequelize.Op.notIn]: ["cancelled"] },
        },
        include: [
          {
            model: Member,
            attributes: ["id"],
            include: [{ model: User, attributes: ["username"] }],
            required: false,
          },
          {
            model: db.Trainer,
            attributes: ["id"],
            include: [{ model: User, attributes: ["username"] }],
            required: false,
          },
          {
            model: Gym,
            attributes: ["id", "name"],
            required: false,
          },
        ],
        order: [["startTime", "ASC"], ["createdAt", "DESC"]],
        limit: 100,
      });
      const todayBookingsDetails = todayBookingRows.map((b) => ({
        id: b.id,
        bookingDate: b.bookingDate,
        startTime: b.startTime,
        endTime: b.endTime,
        status: b.status,
        memberName: b.Member?.User?.username || "—",
        trainerName: b.Trainer?.User?.username || "—",
        gymName: b.Gym?.name || "—",
      }));

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

      const activeMemberRows = await Member.findAll({
        where: {
          gymId: { [Sequelize.Op.in]: activeGymIds },
          status: "active",
        },
        include: [
          { model: User, attributes: ["username", "email", "phone"], required: false },
          { model: Package, as: "currentPackage", attributes: ["name"], required: false },
          { model: Gym, attributes: ["name"], required: false },
        ],
        order: [["updatedAt", "DESC"]],
        limit: 120,
      });
      const activeMembers = activeMemberRows.map((m) => ({
        id: m.id,
        memberName: m.User?.username || "—",
        email: m.User?.email || "",
        phone: m.User?.phone || "",
        packageName: m.currentPackage?.name || "—",
        gymName: m.Gym?.name || "—",
        sessionsRemaining: m.sessionsRemaining,
      }));

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

      // ── 7. Doanh thu owner:
      //    - Doanh thu từ buổi PT: sessionValue - commissionAmount
      //    - + Doanh thu từ bán thẻ thành viên (membership_card_purchase đã thanh toán)
      const revenueResult = await Commission.findOne({
        attributes: [
          [
            Sequelize.fn(
              "COALESCE",
              Sequelize.fn(
                "SUM",
                Sequelize.literal("COALESCE(`Commission`.`sessionValue`, 0) - COALESCE(`Commission`.`commissionAmount`, 0)")
              ),
              0
            ),
            "total",
          ],
        ],
        where: {
          gymId: { [Sequelize.Op.in]: activeGymIds },
        },
        raw: true,
      });
      const trainerRevenueTotal = parseFloat(revenueResult?.total || 0);

      const membershipRevenueTotal = Number(
        (await Transaction.sum("amount", {
          where: {
            gymId: { [Sequelize.Op.in]: activeGymIds },
            transactionType: "membership_card_purchase",
            paymentStatus: "completed",
          },
        })) || 0
      );

      const todayRevenueResult = await Commission.findOne({
        attributes: [
          [
            Sequelize.fn(
              "COALESCE",
              Sequelize.fn(
                "SUM",
                Sequelize.literal("COALESCE(`Commission`.`sessionValue`, 0) - COALESCE(`Commission`.`commissionAmount`, 0)")
              ),
              0
            ),
            "total",
          ],
        ],
        where: {
          gymId: { [Sequelize.Op.in]: activeGymIds },
          [Sequelize.Op.and]: [
            Sequelize.where(
              Sequelize.fn(
                "DATE_FORMAT",
                revenueDateExpr,
                "%Y-%m-%d"
              ),
              todayKey
            ),
          ],
        },
        raw: true,
      });
      const trainerRevenueToday = parseFloat(todayRevenueResult?.total || 0);

      const membershipRevenueToday = Number(
        (await Transaction.sum("amount", {
          where: {
            gymId: { [Sequelize.Op.in]: activeGymIds },
            transactionType: "membership_card_purchase",
            paymentStatus: "completed",
            [Sequelize.Op.and]: [
              Sequelize.where(
                Sequelize.fn("DATE_FORMAT", Sequelize.col("transactionDate"), "%Y-%m-%d"),
                todayKey
              ),
            ],
          },
        })) || 0
      );

      const monthRevenueResult = await Commission.findOne({
        attributes: [
          [
            Sequelize.fn(
              "COALESCE",
              Sequelize.fn(
                "SUM",
                Sequelize.literal("COALESCE(`Commission`.`sessionValue`, 0) - COALESCE(`Commission`.`commissionAmount`, 0)")
              ),
              0
            ),
            "total",
          ],
        ],
        where: {
          gymId: { [Sequelize.Op.in]: activeGymIds },
          [Sequelize.Op.and]: [
            Sequelize.where(
              Sequelize.fn(
                "DATE_FORMAT",
                revenueDateExpr,
                "%Y-%m"
              ),
              monthKey
            ),
          ],
        },
        raw: true,
      });
      const trainerRevenueMonth = parseFloat(monthRevenueResult?.total || 0);

      const membershipRevenueMonth = Number(
        (await Transaction.sum("amount", {
          where: {
            gymId: { [Sequelize.Op.in]: activeGymIds },
            transactionType: "membership_card_purchase",
            paymentStatus: "completed",
            [Sequelize.Op.and]: [
              Sequelize.where(
                Sequelize.fn("DATE_FORMAT", Sequelize.col("transactionDate"), "%Y-%m"),
                monthKey
              ),
            ],
          },
        })) || 0
      );

      const todayCommissionRevenueRows = await Commission.findAll({
        attributes: ["id", "bookingId", "sessionDate", "createdAt", "sessionValue", "commissionAmount", "gymId"],
        where: {
          gymId: { [Sequelize.Op.in]: activeGymIds },
          [Sequelize.Op.and]: [
            Sequelize.where(
              Sequelize.fn(
                "DATE_FORMAT",
                revenueDateExpr,
                "%Y-%m-%d"
              ),
              todayKey
            ),
          ],
        },
        include: [{ model: Gym, attributes: ["id", "name"], required: false }],
        order: [["sessionDate", "DESC"], ["createdAt", "DESC"]],
        limit: 300,
      });

      const monthCommissionRevenueRows = await Commission.findAll({
        attributes: ["id", "bookingId", "sessionDate", "createdAt", "sessionValue", "commissionAmount", "gymId"],
        where: {
          gymId: { [Sequelize.Op.in]: activeGymIds },
          [Sequelize.Op.and]: [
            Sequelize.where(
              Sequelize.fn(
                "DATE_FORMAT",
                revenueDateExpr,
                "%Y-%m"
              ),
              monthKey
            ),
          ],
        },
        include: [{ model: Gym, attributes: ["id", "name"], required: false }],
        order: [["sessionDate", "DESC"], ["createdAt", "DESC"]],
        limit: 500,
      });

      const todayMembershipRevenueRows = await Transaction.findAll({
        attributes: ["id", "amount", "transactionCode", "transactionDate", "createdAt", "description", "gymId", "memberId"],
        where: {
          gymId: { [Sequelize.Op.in]: activeGymIds },
          transactionType: "membership_card_purchase",
          paymentStatus: "completed",
          [Sequelize.Op.and]: [
            Sequelize.where(
              Sequelize.fn("DATE_FORMAT", Sequelize.col("transactionDate"), "%Y-%m-%d"),
              todayKey
            ),
          ],
        },
        include: [
          { model: Gym, attributes: ["id", "name"], required: false },
          {
            model: Member,
            attributes: ["id"],
            required: false,
            include: [{ model: User, attributes: ["id", "username"], required: false }],
          },
        ],
        order: [["transactionDate", "DESC"], ["createdAt", "DESC"]],
        limit: 300,
      });

      const monthMembershipRevenueRows = await Transaction.findAll({
        attributes: ["id", "amount", "transactionCode", "transactionDate", "createdAt", "description", "gymId", "memberId"],
        where: {
          gymId: { [Sequelize.Op.in]: activeGymIds },
          transactionType: "membership_card_purchase",
          paymentStatus: "completed",
          [Sequelize.Op.and]: [
            Sequelize.where(
              Sequelize.fn("DATE_FORMAT", Sequelize.col("transactionDate"), "%Y-%m"),
              monthKey
            ),
          ],
        },
        include: [
          { model: Gym, attributes: ["id", "name"], required: false },
          {
            model: Member,
            attributes: ["id"],
            required: false,
            include: [{ model: User, attributes: ["id", "username"], required: false }],
          },
        ],
        order: [["transactionDate", "DESC"], ["createdAt", "DESC"]],
        limit: 500,
      });

      const mapCommissionRevenue = (row) => ({
        id: `commission-${row.id}`,
        source: "pt_session",
        sourceLabel: "Doanh thu buổi PT",
        amount: Math.max(0, Number(row.sessionValue || 0) - Number(row.commissionAmount || 0)),
        occurredAt: row.sessionDate || row.createdAt,
        gymName: row.Gym?.name || "—",
        reference: row.bookingId ? `Booking #${row.bookingId}` : `Commission #${row.id}`,
      });

      const mapMembershipRevenue = (row) => ({
        id: `membership-${row.id}`,
        source: "membership_card",
        sourceLabel: "Giao dịch thẻ thành viên",
        amount: Number(row.amount || 0),
        occurredAt: row.transactionDate || row.createdAt,
        gymName: row.Gym?.name || "—",
        reference: row.transactionCode || row.description || `Transaction #${row.id}`,
        memberName: row.Member?.User?.username || "—",
      });

      const todayRevenueDetails = [
        ...todayCommissionRevenueRows.map(mapCommissionRevenue),
        ...todayMembershipRevenueRows.map(mapMembershipRevenue),
      ].sort((a, b) => new Date(b.occurredAt || 0) - new Date(a.occurredAt || 0));

      const monthRevenueDetails = [
        ...monthCommissionRevenueRows.map(mapCommissionRevenue),
        ...monthMembershipRevenueRows.map(mapMembershipRevenue),
      ].sort((a, b) => new Date(b.occurredAt || 0) - new Date(a.occurredAt || 0));

      const totalRevenue = trainerRevenueTotal + membershipRevenueTotal;
      const todayRevenue = trainerRevenueToday + membershipRevenueToday;
      const monthRevenue = trainerRevenueMonth + membershipRevenueMonth;

      // ── 8. Gói bán chạy nhất (mua/gia hạn, giảm dần theo lượt bán) ─────────
      const bestSellingRows = await Transaction.findAll({
        attributes: [
          "packageId",
          [Sequelize.fn("COUNT", Sequelize.col("Transaction.id")), "soldCount"],
          [
            Sequelize.fn("COALESCE", Sequelize.fn("SUM", Sequelize.col("amount")), 0),
            "revenue",
          ],
        ],
        where: {
          gymId: { [Sequelize.Op.in]: activeGymIds },
          paymentStatus: "completed",
          packageId: { [Sequelize.Op.ne]: null },
          transactionType: { [Sequelize.Op.in]: ["package_purchase", "package_renewal"] },
        },
        include: [
          {
            model: Package,
            attributes: ["id", "name"],
          },
        ],
        group: ["Transaction.packageId", "Package.id", "Package.name"],
        order: [
          [Sequelize.literal("soldCount"), "DESC"],
          [Sequelize.literal("revenue"), "DESC"],
        ],
        limit: 10,
      });

      const bestSellingPackages = bestSellingRows.map((row) => ({
        packageId: row.packageId,
        packageName: row.Package?.name || "—",
        soldCount: Number(row.get("soldCount") || 0),
        revenue: Number(row.get("revenue") || 0),
      }));

      return res.status(200).json({
        gyms: myGyms,
        todayBookings,
        totalMembers,
        newMembersCount,
        newMembersToday,
        upcomingBookings,
        todayBookingsDetails,
        expiringMembers,
        activeMembers,
        lowStock,
        bestSellingPackages,
        totalRevenue,
        todayRevenue,
        monthRevenue,
        todayRevenueDetails,
        monthRevenueDetails,
        revenueBreakdown: {
          trainerShare: {
            total: trainerRevenueTotal,
            today: trainerRevenueToday,
            month: trainerRevenueMonth,
          },
          membershipCard: {
            total: membershipRevenueTotal,
            today: membershipRevenueToday,
            month: membershipRevenueMonth,
          },
        },
      });
    } catch (e) {
      console.error("[ownerDashboard] getSummary error:", e);
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  /**
   * GET /api/owner/dashboard/revenue-trend
   * Query:
   *  - period: day | month | year (default: day)
   *  - gymId: optional
   */
  async getRevenueTrend(req, res) {
    try {
      const userId = req.user.id;
      const Op = Sequelize.Op;

      const myGyms = await Gym.findAll({
        where: { ownerId: userId },
        attributes: ["id", "name"],
      });
      const myGymIds = myGyms.map((g) => g.id);

      const filterGymId = req.query.gymId ? parseInt(req.query.gymId, 10) : null;
      const activeGymIds =
        filterGymId && myGymIds.includes(filterGymId)
          ? [filterGymId]
          : myGymIds;

      const periodRaw = String(req.query.period || "day").toLowerCase();
      const period = ["day", "month", "year"].includes(periodRaw) ? periodRaw : "day";

      if (activeGymIds.length === 0) {
        return res.status(200).json({
          period,
          series: [],
        });
      }

      const now = new Date();
      const startDate = new Date(now);
      const dateSourceSql = "COALESCE(DATE(`Commission`.`sessionDate`), DATE(`Commission`.`createdAt`))";

      let bucketSql = `DATE_FORMAT(${dateSourceSql}, '%Y-%m-%d')`;

      if (period === "month") {
        startDate.setMonth(startDate.getMonth() - 11);
        startDate.setDate(1);
        startDate.setHours(0, 0, 0, 0);
        bucketSql = `DATE_FORMAT(${dateSourceSql}, '%Y-%m')`;
      } else if (period === "year") {
        startDate.setFullYear(startDate.getFullYear() - 4, 0, 1);
        startDate.setHours(0, 0, 0, 0);
        bucketSql = `DATE_FORMAT(${dateSourceSql}, '%Y')`;
      } else {
        startDate.setDate(startDate.getDate() - 29);
        startDate.setHours(0, 0, 0, 0);
      }

      const rows = await Commission.findAll({
        attributes: [
          [Sequelize.literal(bucketSql), "bucket"],
          [
            Sequelize.fn(
              "COALESCE",
              Sequelize.fn(
                "SUM",
                Sequelize.literal("COALESCE(`Commission`.`sessionValue`, 0) - COALESCE(`Commission`.`commissionAmount`, 0)")
              ),
              0
            ),
            "total",
          ],
        ],
        where: {
          gymId: { [Op.in]: activeGymIds },
          [Op.and]: [
            Sequelize.where(
              Sequelize.fn(
                "COALESCE",
                Sequelize.col("Commission.sessionDate"),
                Sequelize.col("Commission.createdAt")
              ),
              { [Op.gte]: startDate }
            ),
          ],
        },
        group: [Sequelize.literal(bucketSql)],
        order: [[Sequelize.literal(bucketSql), "ASC"]],
        raw: true,
      });

      const toYMD = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
      };
      const toYM = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        return `${y}-${m}`;
      };
      const toLabelDay = (d) => {
        const day = String(d.getDate()).padStart(2, "0");
        const m = String(d.getMonth() + 1).padStart(2, "0");
        return `${day}/${m}`;
      };
      const toLabelMonth = (d) => {
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const y = d.getFullYear();
        return `${m}/${y}`;
      };

      const mapTotalByBucket = new Map(
        rows.map((r) => [String(r.bucket), parseFloat(r.total || 0)])
      );

      // Doanh thu thẻ thành viên theo bucket cùng kỳ để cộng vào chart doanh thu owner
      let txBucketSql = "DATE_FORMAT(`transactionDate`, '%Y-%m-%d')";
      if (period === "month") txBucketSql = "DATE_FORMAT(`transactionDate`, '%Y-%m')";
      if (period === "year") txBucketSql = "DATE_FORMAT(`transactionDate`, '%Y')";

      const membershipRows = await Transaction.findAll({
        attributes: [
          [Sequelize.literal(txBucketSql), "bucket"],
          [
            Sequelize.fn(
              "COALESCE",
              Sequelize.fn("SUM", Sequelize.col("amount")),
              0
            ),
            "total",
          ],
        ],
        where: {
          gymId: { [Op.in]: activeGymIds },
          transactionType: "membership_card_purchase",
          paymentStatus: "completed",
          transactionDate: { [Op.gte]: startDate },
        },
        group: [Sequelize.literal(txBucketSql)],
        order: [[Sequelize.literal(txBucketSql), "ASC"]],
        raw: true,
      });

      const mapMembershipByBucket = new Map(
        membershipRows.map((r) => [String(r.bucket), parseFloat(r.total || 0)])
      );

      const series = [];
      if (period === "day") {
        for (let i = 29; i >= 0; i -= 1) {
          const d = new Date(now);
          d.setDate(now.getDate() - i);
          const bucket = toYMD(d);
          series.push({
            bucket,
            label: toLabelDay(d),
            total: Number(mapTotalByBucket.get(bucket) || 0) + Number(mapMembershipByBucket.get(bucket) || 0),
          });
        }
      } else if (period === "month") {
        for (let i = 11; i >= 0; i -= 1) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const bucket = toYM(d);
          series.push({
            bucket,
            label: toLabelMonth(d),
            total: Number(mapTotalByBucket.get(bucket) || 0) + Number(mapMembershipByBucket.get(bucket) || 0),
          });
        }
      } else {
        for (let i = 4; i >= 0; i -= 1) {
          const d = new Date(now.getFullYear() - i, 0, 1);
          const bucket = String(d.getFullYear());
          series.push({
            bucket,
            label: bucket,
            total: Number(mapTotalByBucket.get(bucket) || 0) + Number(mapMembershipByBucket.get(bucket) || 0),
          });
        }
      }

      return res.status(200).json({
        period,
        series,
      });
    } catch (e) {
      console.error("[ownerDashboard] getRevenueTrend error:", e);
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },
};

export default ownerDashboardController;
