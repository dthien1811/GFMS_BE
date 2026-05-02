import membershipCardService from "../../service/member/membershipCard.service";
import db from "../../models";

const membershipCardController = {
  async listPlans(req, res) {
    try {
      const gymId = Number(req.query?.gymId || 0);
      const data = await membershipCardService.listPlans({ gymId });
      return res.status(200).json({ data });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  async myCurrentCard(req, res) {
    try {
      const gymId = Number(req.query?.gymId || 0);
      if (gymId > 0) {
        const member = await db.Member.findOne({
          where: { userId: req.user.id, gymId },
          order: [["createdAt", "DESC"], ["id", "DESC"]],
        });
        const data = member ? await membershipCardService.getMembershipCardSummary(member.id) : null;
        return res.status(200).json({ data });
      }

      // Không truyền gymId: tìm thẻ active tốt nhất trên tất cả membership của user.
      const members = await db.Member.findAll({
        where: { userId: req.user.id },
        attributes: ["id"],
        raw: true,
      });
      const memberIds = members.map((m) => Number(m.id)).filter((id) => id > 0);
      if (memberIds.length === 0) return res.status(200).json({ data: null });

      const activeCard = await db.MembershipCard.findOne({
        where: {
          memberId: { [db.Sequelize.Op.in]: memberIds },
          status: "active",
          endDate: { [db.Sequelize.Op.gte]: new Date() },
        },
        order: [["endDate", "DESC"], ["id", "DESC"]],
      });
      if (!activeCard) return res.status(200).json({ data: null });

      const data = await membershipCardService.getMembershipCardSummary(activeCard.memberId);
      return res.status(200).json({ data });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  async purchase(req, res) {
    try {
      const data = await membershipCardService.purchaseMembershipCard(req.user.id, req.body || {});
      return res.status(201).json({ data });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  async purchaseHistory(req, res) {
    try {
      const data = await membershipCardService.listMyPurchaseHistory(req.user.id);
      return res.status(200).json({ data });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },
};

export default membershipCardController;
