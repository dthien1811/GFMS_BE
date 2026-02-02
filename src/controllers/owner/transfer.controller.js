import ownerTransferService from "../../service/owner/transfer.service";

const ownerTransferController = {
  async getTransfers(req, res) {
    try {
      const data = await ownerTransferService.getTransfers(req.user.id, req.query);
      return res.status(200).json(data);
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  async getTransferDetail(req, res) {
    try {
      const data = await ownerTransferService.getTransferDetail(req.user.id, req.params.id);
      return res.status(200).json({ data });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  async createTransfer(req, res) {
    try {
      const data = await ownerTransferService.createTransfer(req.user.id, req.body);
      return res.status(201).json({ data });
    } catch (e) {
      console.error("Create transfer error:", e);
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  async approveTransfer(req, res) {
    try {
      const data = await ownerTransferService.approveTransfer(req.user.id, req.params.id);
      return res.status(200).json({ data });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  async rejectTransfer(req, res) {
    try {
      const data = await ownerTransferService.rejectTransfer(
        req.user.id,
        req.params.id,
        req.body?.reason
      );
      return res.status(200).json({ data });
    } catch (e) {
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  async completeTransfer(req, res) {
    try {
      const data = await ownerTransferService.completeTransfer(req.user.id, req.params.id);
      return res.status(200).json({ data });
    } catch (e) {      console.error("Create transfer error:", e);      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },
};

export default ownerTransferController;
