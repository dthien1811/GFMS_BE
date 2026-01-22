import ownerPurchaseService from "../../service/owner/purchase.service";

const ownerPurchaseController = {
  // Suppliers
  async getSuppliers(req, res) {
    try {
      const data = await ownerPurchaseService.getSuppliers(req.user.id, req.query);
      return res.status(200).json(data);
    } catch (e) {
      console.error("Get suppliers error:", e);
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  // Quotations
  async getQuotations(req, res) {
    try {
      const data = await ownerPurchaseService.getQuotations(req.user.id, req.query);
      return res.status(200).json(data);
    } catch (e) {
      console.error("Get quotations error:", e);
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  async getQuotationDetail(req, res) {
    try {
      const data = await ownerPurchaseService.getQuotationDetail(req.user.id, req.params.id);
      return res.status(200).json({ data });
    } catch (e) {
      console.error("Get quotation detail error:", e);
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  async createQuotation(req, res) {
    try {
      const data = await ownerPurchaseService.createQuotation(req.user.id, req.body);
      return res.status(201).json({ data });
    } catch (e) {
      console.error("Create quotation error:", e);
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  // Purchase Orders
  async getPurchaseOrders(req, res) {
    try {
      const data = await ownerPurchaseService.getPurchaseOrders(req.user.id, req.query);
      return res.status(200).json(data);
    } catch (e) {
      console.error("Get purchase orders error:", e);
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  async getPurchaseOrderDetail(req, res) {
    try {
      const data = await ownerPurchaseService.getPurchaseOrderDetail(req.user.id, req.params.id);
      return res.status(200).json({ data });
    } catch (e) {
      console.error("Get purchase order detail error:", e);
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  // Receipts
  async getReceipts(req, res) {
    try {
      const data = await ownerPurchaseService.getReceipts(req.user.id, req.query);
      return res.status(200).json(data);
    } catch (e) {
      console.error("Get receipts error:", e);
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  async getReceiptDetail(req, res) {
    try {
      const data = await ownerPurchaseService.getReceiptDetail(req.user.id, req.params.id);
      return res.status(200).json({ data });
    } catch (e) {
      console.error("Get receipt detail error:", e);
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },
};

export default ownerPurchaseController;
