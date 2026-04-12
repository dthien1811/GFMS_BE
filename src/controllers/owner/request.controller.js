
const requestService = require("../../service/owner/request.service");

const CLOG = "[GFMS_OWNER_REQUEST_CTRL]";

module.exports = {
  // Lấy danh sách yêu cầu
  async getRequests(req, res, next) {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 10;
      const gymId = Number(req.query.gymId) || undefined;
      const result = await requestService.getRequests({
        page,
        limit,
        gymId,
        actorUserId: req.user.id,
        actorGroupName: req.user.groupName,
      });
      res.status(200).json({ data: result.data, pagination: result.pagination });
    } catch (error) {
      console.error("Error fetching requests:", error);  // Log chi tiết lỗi
      next(error);  // Đảm bảo tiếp tục xử lý lỗi
    }
  },

  // Duyệt yêu cầu
  async approveRequest(req, res, next) {       
    try {
      console.log(CLOG, "PATCH approve", {
        paramId: req.params.id,
        userId: req.user?.id,
        groupName: req.user?.groupName ?? null,
        bodyKeys: req.body && typeof req.body === "object" ? Object.keys(req.body) : [],
      });
      const request = await requestService.approveRequest(
        req.params.id,
        req.user.id,  // Lấy id từ req.user đã được xác thực
        req.body.approveNote,
        {
          assignmentMode: req.body?.assignmentMode,
          selectedTrainerId: req.body?.selectedTrainerId,
          actorGroupName: req.user.groupName,
        }
      );
      res.status(200).json({ message: "Request approved successfully", request });
    } catch (e) {
      console.error(CLOG, "approveRequest catch", e?.message, {
        statusCode: e?.statusCode,
        sqlMessage: e?.parent?.sqlMessage,
        errno: e?.parent?.errno,
      });
      const code = Number(e?.statusCode) || 500;
      if (code >= 400 && code < 500) {
        return res.status(code).json({ message: e.message || "Không thể duyệt yêu cầu" });
      }
      next(e);
    }
  },

  // Từ chối yêu cầu
  async rejectRequest(req, res, next) {
    try {
      console.log(CLOG, "PATCH reject", {
        paramId: req.params.id,
        userId: req.user?.id,
        groupName: req.user?.groupName ?? null,
      });
      const request = await requestService.rejectRequest(
        req.params.id,
        req.user.id,  // Lấy id từ req.user đã được xác thực
        req.body.rejectNote,
        { actorGroupName: req.user.groupName }
      );
      res.status(200).json({ message: "Request rejected successfully", request });
    } catch (e) {
      console.error(CLOG, "rejectRequest catch", e?.message, {
        statusCode: e?.statusCode,
        sqlMessage: e?.parent?.sqlMessage,
        errno: e?.parent?.errno,
      });
      const code = Number(e?.statusCode) || 500;
      if (code >= 400 && code < 500) {
        return res.status(code).json({ message: e.message || "Không thể từ chối yêu cầu" });
      }
      next(e);
    }
  },
};