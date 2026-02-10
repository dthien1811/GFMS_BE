import ownerGymService from "../../service/owner/gym.service";

const ownerGymController = {
  async getMyGyms(req, res) {
    try {
      const data = await ownerGymService.getMyGyms(req.user.id);
      return res.status(200).json({ data });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  async getAllGyms(req, res) {
    try {
      const data = await ownerGymService.getAllGyms();
      return res.status(200).json({ data });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  async getGymDetail(req, res) {
    try {
      const data = await ownerGymService.getGymDetail(req.user.id, req.params.id);
      return res.status(200).json({ data });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  async updateGym(req, res) {
    try {
      const data = await ownerGymService.updateGym(req.user.id, req.params.id, req.body);
      return res.status(200).json({ message: "Cập nhật gym thành công", data });
    } catch (e) {
      console.error('Update gym error:', e);
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },
};

export default ownerGymController;
