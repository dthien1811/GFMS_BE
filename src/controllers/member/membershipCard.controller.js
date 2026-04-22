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
      const memberWhere = gymId > 0 ? { userId: req.user.id, gymId } : { userId: req.user.id };
      const member = await db.Member.findOne({
        where: memberWhere,
        order: [["createdAt", "DESC"], ["id", "DESC"]],
      });
      const data = member ? await membershipCardService.getMembershipCardSummary(member.id) : null;
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
};

export default membershipCardController;
