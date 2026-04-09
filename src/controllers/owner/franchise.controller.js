import ownerFranchiseService from "../../service/owner/franchise.service";

// CJS service (token / sửa liên kết ký demo)
const franchiseContractCore = require("../../service/adminFranchiseContractService");
const adminFranchiseContractController = require("../adminFranchiseContractController");

/** Origin FE thực tế của tab đang gọi API (axios gửi Origin; thiếu thì dùng Referer). */
function clientFeOrigin(req) {
  const o = req.headers?.origin;
  if (o && typeof o === "string" && /^https?:\/\//i.test(o)) return o.replace(/\/+$/, "");
  const ref = req.headers?.referer;
  if (ref) {
    try {
      return new URL(String(ref)).origin.replace(/\/+$/, "");
    } catch (_) {
      /* ignore */
    }
  }
  return String(process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/+$/, "");
}

/**
 * contractUrl trong DB lưu theo FRONTEND_URL lúc admin gửi invite — thường là http://localhost:3000.
 * Owner mở app bằng http://127.0.0.1:3000 → link cũ mở sai host / CORS / cookie khác → không vào được trang ký.
 * Admin hay mở đúng localhost nên không lộ lỗi.
 */
function rewriteContractUrlForOwner(contractUrl, feOrigin) {
  if (!contractUrl || !feOrigin) return contractUrl;
  try {
    const u = new URL(String(contractUrl));
    if (!u.pathname.toLowerCase().includes("sign-contract")) return contractUrl;
    const token = u.searchParams.get("token");
    if (!token) return contractUrl;
    return `${feOrigin}/sign-contract?token=${encodeURIComponent(token)}`;
  } catch (_) {
    return contractUrl;
  }
}

function mapFranchiseRowForOwner(fr, feOrigin) {
  const j = fr && typeof fr.toJSON === "function" ? fr.toJSON() : { ...fr };
  if (j.contractUrl) {
    j.contractUrl = rewriteContractUrlForOwner(j.contractUrl, feOrigin);
  }
  return j;
}

/** DB cũ có thể lưu mock-sign.local/contracts/:id — owner mở bị NXDOMAIN; admin vẫn mở link app thật. */
async function repairOwnerFranchiseRowIfNeeded(row) {
  if (!row || franchiseContractCore.needsSigningUrlRepair(row.contractUrl) !== true) return;
  await franchiseContractCore.repairOwnerSigningUrlIfStale(row.id);
  if (typeof row.reload === "function") await row.reload();
}

const ownerFranchiseController = {
  /**
   * POST /api/owner/franchise-requests
   * Tạo yêu cầu nhượng quyền mới
   */
  async createFranchiseRequest(req, res) {
    try {
      const userId = req.user.id;
      const data = req.body;

      const franchiseRequest = await ownerFranchiseService.createFranchiseRequest(userId, data);
      const feOrigin = clientFeOrigin(req);

      return res.status(201).json({
        message: "Tạo yêu cầu nhượng quyền thành công",
        data: mapFranchiseRowForOwner(franchiseRequest, feOrigin),
      });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  /**
   * GET /api/owner/franchise-requests
   * Lấy danh sách franchise requests của owner
   */
  async getMyFranchiseRequests(req, res) {
    try {
      const userId = req.user.id;
      const query = req.query;

      const result = await ownerFranchiseService.getMyFranchiseRequests(userId, query);
      const feOrigin = clientFeOrigin(req);
      for (const row of result.franchiseRequests) {
        await repairOwnerFranchiseRowIfNeeded(row);
      }
      const data = result.franchiseRequests.map((row) => mapFranchiseRowForOwner(row, feOrigin));

      return res.status(200).json({
        data,
        pagination: result.pagination,
      });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  /**
   * GET /api/owner/franchise-requests/:id
   * Lấy chi tiết một franchise request
   */
  async getMyFranchiseRequestDetail(req, res) {
    try {
      const userId = req.user.id;
      const requestId = req.params.id;

      const franchiseRequest = await ownerFranchiseService.getMyFranchiseRequestDetail(
        userId,
        requestId
      );
      await repairOwnerFranchiseRowIfNeeded(franchiseRequest);
      const feOrigin = clientFeOrigin(req);

      return res.status(200).json({
        data: mapFranchiseRowForOwner(franchiseRequest, feOrigin),
      });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  /**
   * PUT /api/owner/franchise-requests/:id
   * Cập nhật franchise request (chỉ khi pending)
   */
  async updateMyFranchiseRequest(req, res) {
    try {
      const userId = req.user.id;
      const requestId = req.params.id;
      const data = req.body;

      const franchiseRequest = await ownerFranchiseService.updateMyFranchiseRequest(
        userId,
        requestId,
        data
      );
      await repairOwnerFranchiseRowIfNeeded(franchiseRequest);
      const feOrigin = clientFeOrigin(req);

      return res.status(200).json({
        message: "Cập nhật yêu cầu nhượng quyền thành công",
        data: mapFranchiseRowForOwner(franchiseRequest, feOrigin),
      });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  /**
   * GET /api/owner/franchise-requests/:id/contract/document?type=original|owner_signed|final|certificate
   * Chỉ chủ yêu cầu (requester) — tái sử dụng luồng tải PDF như admin.
   */
  async downloadContractDocument(req, res) {
    try {
      const userId = req.user.id;
      const requestId = req.params.id;
      await ownerFranchiseService.getMyFranchiseRequestDetail(userId, requestId);
      const fakeReq = { ...req, params: { ...req.params, id: String(requestId) } };
      return adminFranchiseContractController.downloadDocument(fakeReq, res);
    } catch (e) {
      return res.status(e.statusCode || 403).json({
        ok: false,
        message: e.message || "Không có quyền tải tài liệu",
      });
    }
  },
};

export default ownerFranchiseController;
