import ownerCommissionService from "../../service/owner/commission.service";

const ownerCommissionController = {
  async getCommissions(req, res) {
    try {
      const userId = req.user.id;
      const result = await ownerCommissionService.getCommissions(userId, req.query);
      return res.status(200).json({
        data: result.data,
        pagination: result.pagination,
      });
    } catch (e) {
      console.error("Error in getCommissions controller:", e);
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  async getPendingAttendanceWindow(req, res) {
    try {
      const userId = req.user.id;
      const result = await ownerCommissionService.getPendingAttendanceWindow(userId, req.query);
      return res.status(200).json({
        data: result.data,
        pagination: result.pagination,
      });
    } catch (e) {
      console.error("Error in getPendingAttendanceWindow controller:", e);
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  async remindPendingAttendance(req, res) {
    try {
      const userId = req.user.id;
      const { bookingId } = req.params;
      const result = await ownerCommissionService.remindPendingAttendance(userId, bookingId);
      return res.status(200).json({
        data: result,
        message: "Đã gửi nhắc nhở điểm danh cho PT.",
      });
    } catch (e) {
      const status = e.statusCode || 500;
      if (status < 500) {
        console.warn("Remind pending attendance rejected:", e?.message || e);
      } else {
        console.error("Error in remindPendingAttendance controller:", e);
      }
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  async getGymCommissionRate(req, res) {
    try {
      const userId = req.user.id;
      const { gymId } = req.params;
      const result = await ownerCommissionService.getGymCommissionRate(userId, gymId);
      return res.status(200).json({ data: result });
    } catch (e) {
      console.error("Error in getGymCommissionRate controller:", e);
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  async setGymCommissionRate(req, res) {
    try {
      const userId = req.user.id;
      const result = await ownerCommissionService.setGymCommissionRate(userId, req.body);
      return res.status(200).json({ data: result, message: "Cập nhật tỷ lệ hoa hồng thành công" });
    } catch (e) {
      console.error("Error in setGymCommissionRate controller:", e);
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  async closePayrollPeriod(req, res) {
    try {
      const userId = req.user.id;
      const result = await ownerCommissionService.closePayrollPeriod(userId, req.body);
      return res.status(200).json({
        data: result,
        message: "Chốt kỳ lương thành công",
      });
    } catch (e) {
      console.error("Error in closePayrollPeriod controller:", e);
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  async payByTrainer(req, res) {
    try {
      const userId = req.user.id;
      const result = await ownerCommissionService.payByTrainer(userId, req.body);
      return res.status(200).json({
        data: result,
        message: "Chi trả theo PT thành công",
      });
    } catch (e) {
      console.error("Error in payByTrainer controller:", e);
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  async exportCommissions(req, res) {
    try {
      const userId = req.user.id;
      const format = "xlsx";
      const result = await ownerCommissionService.exportCommissions(userId, req.query, format);

      res.setHeader("Content-Type", result.contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
      return res.status(200).send(result.buffer);
    } catch (e) {
      console.error("Error in exportCommissions controller:", e);
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  async previewClosePayrollPeriod(req, res) {
    try {
      const userId = req.user.id;
      const result = await ownerCommissionService.previewClosePayrollPeriod(userId, req.query);
      return res.status(200).json({ data: result });
    } catch (e) {
      console.error("Error in previewClosePayrollPeriod controller:", e);
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  async getPayrollPeriods(req, res) {
    try {
      const userId = req.user.id;
      const result = await ownerCommissionService.getPayrollPeriods(userId, req.query);
      return res.status(200).json({
        data: result.data,
        pagination: result.pagination,
      });
    } catch (e) {
      console.error("Error in getPayrollPeriods controller:", e);
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  async previewPayByTrainer(req, res) {
    try {
      const userId = req.user.id;
      const result = await ownerCommissionService.previewPayByTrainer(userId, req.query);
      return res.status(200).json({ data: result });
    } catch (e) {
      console.error("Error in previewPayByTrainer controller:", e);
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  async payPayrollPeriod(req, res) {
    try {
      const userId = req.user.id;
      const periodId = req.params.id;
      const result = await ownerCommissionService.payPayrollPeriod(userId, periodId);
      return res.status(200).json({
        data: result,
        message: "Chi trả kỳ lương thành công",
      });
    } catch (e) {
      console.error("Error in payPayrollPeriod controller:", e);
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },
};

export default ownerCommissionController;
