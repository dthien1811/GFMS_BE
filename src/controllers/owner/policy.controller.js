import ownerPolicyService from "../../service/owner/policy.service";

const ownerPolicyController = {
  // GET /api/owner/policies/trainer-share?gymId=1&includeInactive=true
  async listTrainerSharePolicies(req, res) {
    try {
      const ownerId = req.user.id;
      const { gymId, includeInactive } = req.query;

      const data = await ownerPolicyService.listTrainerSharePolicies(ownerId, {
        gymId: gymId != null ? Number(gymId) : undefined,
        includeInactive: includeInactive === "false" ? false : true,
      });

      return res.status(200).json({ data });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  // GET /api/owner/policies/trainer-share/effective?gymId=1
  async getEffectiveTrainerSharePolicy(req, res) {
    try {
      const ownerId = req.user.id;
      const gymId = Number(req.query.gymId);

      const data = await ownerPolicyService.getEffectiveTrainerSharePolicy(ownerId, gymId);
      return res.status(200).json({ data });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  // GET /api/owner/policies/:id
  async getPolicyById(req, res) {
    try {
      const ownerId = req.user.id;
      const data = await ownerPolicyService.getPolicyById(ownerId, req.params.id);
      return res.status(200).json({ data });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  // POST /api/owner/policies/trainer-share
  async createTrainerSharePolicy(req, res) {
    try {
      const ownerId = req.user.id;
      const data = await ownerPolicyService.createTrainerSharePolicy(ownerId, req.body);
      return res.status(201).json({ data });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  // PUT /api/owner/policies/:id
  async updateTrainerSharePolicy(req, res) {
    try {
      const ownerId = req.user.id;
      const data = await ownerPolicyService.updateTrainerSharePolicy(ownerId, req.params.id, req.body);
      return res.status(200).json({ data });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  // PATCH /api/owner/policies/:id/toggle
  async toggleActive(req, res) {
    try {
      const ownerId = req.user.id;
      const data = await ownerPolicyService.toggleActive(ownerId, req.params.id);
      return res.status(200).json({ data });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  // DELETE /api/owner/policies/:id
  async deletePolicy(req, res) {
    try {
      const ownerId = req.user.id;
      await ownerPolicyService.deletePolicy(ownerId, req.params.id);
      return res.status(200).json({ message: "Deleted" });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },
};

export default ownerPolicyController;
