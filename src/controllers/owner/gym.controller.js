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
};

export default ownerGymController;
