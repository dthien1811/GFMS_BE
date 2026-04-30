import ownerPurchaseService from "../../service/owner/purchase.service";

const ownerPurchaseController = {
  async getActiveCombos(req, res) {
    try {
      const data = await ownerPurchaseService.getActiveCombos(req.query);
      return res.status(200).json(data);
    } catch (e) {
      console.error("Get combos error:", e);
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  async getComboDetail(req, res) {
    try {
      const data = await ownerPurchaseService.getComboDetail(req.params.id);
      return res.status(200).json({ data });
    } catch (e) {
      console.error("Get combo detail error:", e);
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

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
  async getEquipmentsForPurchase(req, res) {
    try {
      const data = await ownerPurchaseService.getEquipmentsForPurchase(req.user.id, req.query);
      return res.status(200).json(data);
    } catch (e) {
      console.error("Get equipments for purchase error:", e);
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

  async getProcurementPayments(req, res) {
    try {
      const data = await ownerPurchaseService.getProcurementPayments(req.user.id, req.query);
      return res.status(200).json(data);
    } catch (e) {
      console.error("Get procurement payments error:", e);
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  async getPayablePurchaseOrders(req, res) {
    try {
      const data = await ownerPurchaseService.getPayablePurchaseOrders(req.user.id, req.query);
      return res.status(200).json(data);
    } catch (e) {
      console.error("Get payable purchase orders error:", e);
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  async createPurchaseOrderPayOSLink(req, res) {
    try {
      const data = await ownerPurchaseService.createPurchaseOrderPayOSLink(req.user.id, req.params.id, req.body || {});
      return res.status(200).json({ data });
    } catch (e) {
      console.error("Create purchase order payos link error:", e);
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  async previewPurchaseStock(req, res) {
    try {
      const result = await ownerPurchaseService.previewPurchaseStock(req.user.id, req.query);
      return res.status(200).json(result);
    } catch (e) {
      console.error("Preview purchase stock error:", e);
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  async createPurchaseRequest(req, res) {
    try {
      const data = await ownerPurchaseService.createPurchaseRequest(req.user.id, req.body);
      return res.status(201).json({ data });
    } catch (e) {
      if (Number(e?.statusCode || 500) < 500) {
        console.warn("Create purchase request warning:", e?.message || e);
      } else {
        console.error("Create purchase request error:", e);
      }
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  async exportPurchaseRequestsExcel(req, res) {
    try {
      const result = await ownerPurchaseService.exportPurchaseRequestsExcel(req.user.id, req.query);
      const filename = result?.filename || `lich-su-mua-combo-${new Date().toISOString().slice(0, 10)}.xlsx`;
      const buffer = result?.buffer;

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      return res.status(200).send(buffer);
    } catch (e) {
      console.error("Export purchase requests excel error:", e);
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  async getPurchaseRequests(req, res) {
    try {
      const data = await ownerPurchaseService.getPurchaseRequests(req.user.id, req.query);
      return res.status(200).json(data);
    } catch (e) {
      console.error("Get purchase requests error:", e);
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  async getPurchaseRequestDetail(req, res) {
    try {
      const data = await ownerPurchaseService.getPurchaseRequestDetail(req.user.id, req.params.id);
      return res.status(200).json({ data });
    } catch (e) {
      console.error("Get purchase request detail error:", e);
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  async createPurchaseRequestPayOSLink(req, res) {
    try {
      const data = await ownerPurchaseService.createPurchaseRequestPayOSLink(req.user.id, req.params.id, req.body || {});
      return res.status(200).json({ data });
    } catch (e) {
      console.error("Create purchase request payos link error:", e);
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },

  async confirmReceivePurchaseRequest(req, res) {
    try {
      const data = await ownerPurchaseService.confirmReceivePurchaseRequest(req.user.id, req.params.id, req);
      return res.status(200).json({ data });
    } catch (e) {
      console.error("Confirm receive purchase request error:", e);
      return res.status(e.statusCode || 500).json({ message: e.message });
    }
  },
};

export default ownerPurchaseController;
