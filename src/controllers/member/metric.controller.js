// controllers/member/metric.controller.js
import db from "../../models";

const calcBMI = (heightCm, weightKg) => {
  const h = Number(heightCm) / 100;
  const w = Number(weightKg);
  if (!h || !w || h <= 0 || w <= 0) return null;
  return +(w / (h * h)).toFixed(2);
};

const bmiStatus = (bmi) => {
  if (bmi < 18.5) return "underweight";
  if (bmi < 25) return "normal";
  if (bmi < 30) return "overweight";
  return "obese";
};

const getMemberByUserId = async (userId) => {
  return await db.Member.findOne({ where: { userId } });
};

const metricController = {
  async getMyMetrics(req, res) {
    try {
      const userId = req.user.id;
      const member = await getMemberByUserId(userId);
      if (!member) {
        return res.status(404).json({ message: "Không tìm thấy member" });
      }

      const rows = await db.MemberMetric.findAll({
        where: { memberId: member.id },
        order: [["recordedAt", "ASC"]],
      });

      return res.json({
        message: "OK",
        data: rows,
      });
    } catch (e) {
      console.error("getMyMetrics error:", e);
      return res.status(500).json({ message: "Server error" });
    }
  },

  async getLatestMetric(req, res) {
    try {
      const userId = req.user.id;
      const member = await getMemberByUserId(userId);
      if (!member) {
        return res.status(404).json({ message: "Không tìm thấy member" });
      }

      const row = await db.MemberMetric.findOne({
        where: { memberId: member.id },
        order: [["recordedAt", "DESC"]],
      });

      return res.json({
        message: "OK",
        data: row,
      });
    } catch (e) {
      console.error("getLatestMetric error:", e);
      return res.status(500).json({ message: "Server error" });
    }
  },

  async createMetric(req, res) {
    const t = await db.sequelize.transaction();
    try {
      const userId = req.user.id;
      const { heightCm, weightKg, note } = req.body;

      const member = await getMemberByUserId(userId);
      if (!member) {
        await t.rollback();
        return res.status(404).json({ message: "Không tìm thấy member" });
      }

      const height = Number(heightCm);
      const weight = Number(weightKg);

      if (!height || !weight || height <= 0 || weight <= 0) {
        await t.rollback();
        return res.status(400).json({ message: "Chiều cao/cân nặng không hợp lệ" });
      }

      const bmi = calcBMI(height, weight);
      const status = bmiStatus(bmi);

      const created = await db.MemberMetric.create(
        {
          memberId: member.id,
          heightCm: height,
          weightKg: weight,
          bmi,
          status,
          note: note || null,
          recordedAt: new Date(),
        },
        { transaction: t }
      );

      await member.update(
        {
          height,
          weight,
          currentBmi: bmi,
          bmiUpdatedAt: new Date(),
        },
        { transaction: t }
      );

      await t.commit();

      return res.status(201).json({
        message: "Đã cập nhật BMI",
        data: created,
      });
    } catch (e) {
      await t.rollback();
      console.error("createMetric error:", e);
      return res.status(500).json({ message: "Server error" });
    }
  },
};

export default metricController;