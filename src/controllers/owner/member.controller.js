import ownerMemberService from "../../service/owner/member.service";

const ownerMemberController = {
  /**
   * GET /api/owner/members/available-users
   * Lấy danh sách users chưa là member
   */
  async getAvailableUsers(req, res) {
    try {
      const users = await ownerMemberService.getAvailableUsers();

      return res.status(200).json({
        data: users,
      });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  /**
   * POST /api/owner/members
   * Tạo member mới từ user
   */
  async createMember(req, res) {
    try {
      const userId = req.user.id;
      const data = req.body;

      const member = await ownerMemberService.createMember(userId, data);

      return res.status(201).json({
        data: member,
        message: "Tạo hội viên thành công",
      });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  /**
   * GET /api/owner/members
   * Lấy danh sách members của owner
   */
  async getMyMembers(req, res) {
    try {
      const userId = req.user.id;
      const query = req.query;

      const result = await ownerMemberService.getMyMembers(userId, query);

      return res.status(200).json({
        data: result.members,
        pagination: result.pagination,
      });
    } catch (e) {
      console.error('Error in getMyMembers controller:', e);
      return res.status(e.statusCode || 500).json({ message: e.message, stack: e.stack });
    }
  },

  /**
   * GET /api/owner/members/:id
   * Lấy chi tiết member
   */
  async getMemberDetail(req, res) {
    try {
      const userId = req.user.id;
      const memberId = req.params.id;

      const member = await ownerMemberService.getMemberDetail(userId, memberId);

      return res.status(200).json({
        data: member,
      });
    } catch (e) {
      console.error('Error in getMemberDetail controller:', e);
      return res.status(e.statusCode || 500).json({ message: e.message, stack: e.stack });
    }
  },

  /**
   * PUT /api/owner/members/:id
   * Cập nhật thông tin member
   */
  async updateMember(req, res) {
    try {
      const userId = req.user.id;
      const memberId = req.params.id;
      const data = req.body;

      const member = await ownerMemberService.updateMember(userId, memberId, data);

      return res.status(200).json({
        data: member,
        message: "Cập nhật hội viên thành công",
      });
    } catch (e) {
      console.error('Error in updateMember controller:', e);
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  /**
   * DELETE /api/owner/members/:id
   * Xóa member
   */
  async deleteMember(req, res) {
    try {
      const userId = req.user.id;
      const memberId = req.params.id;

      const result = await ownerMemberService.deleteMember(userId, memberId);

      return res.status(200).json(result);
    } catch (e) {
      console.error('Error in deleteMember controller:', e);
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  /**
   * POST /api/owner/members/:id/renew-package
   * Gia hạn gói cho member
   */
  async renewMemberPackage(req, res) {
    try {
      const userId = req.user.id;
      const memberId = req.params.id;
      const { packageId } = req.body;

      if (!packageId) {
        return res.status(400).json({ message: "Vui lòng chọn gói cần gia hạn" });
      }

      const result = await ownerMemberService.renewMemberPackage(userId, memberId, packageId);

      return res.status(200).json({
        success: true,
        data: result,
        message: result.message,
      });
    } catch (e) {
      console.error('Error in renewMemberPackage controller:', e);
      return res.status(e.statusCode || 500).json({ 
        success: false,
        message: e.message 
      });
    }
  },
};

export default ownerMemberController;
