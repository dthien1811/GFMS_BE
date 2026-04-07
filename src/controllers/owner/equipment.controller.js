import ownerEquipmentService from "../../service/owner/equipment.service";

const escapeCsvValue = (value) => {
  if (value === null || value === undefined) return "";
  return `"${String(value).replace(/"/g, '""')}"`;
};

const ownerEquipmentController = {
  async getEquipments(req, res) {
    try {
      const data = await ownerEquipmentService.getEquipments(req.user.id, req.query);
      return res.status(200).json(data);
    } catch (e) {
      console.error("Get equipments error:", e);
      return res.status(e.statusCode || 500).json({ message: e.message || "Internal server error" });
    }
  },

  async getEquipmentDetail(req, res) {
    try {
      const data = await ownerEquipmentService.getEquipmentDetail(req.user.id, req.params.id, req.query);
      return res.status(200).json({ data });
    } catch (e) {
      console.error("Get equipment detail error:", e);
      return res.status(e.statusCode || 500).json({ message: e.message || "Internal server error" });
    }
  },

  async markEquipmentUnitInUse(req, res) {
    try {
      const data = await ownerEquipmentService.markEquipmentUnitInUse(req.user.id, req.params.id, req.params.unitId);
      return res.status(200).json({ data });
    } catch (e) {
      console.error("Mark equipment unit in use error:", e);
      return res.status(e.statusCode || 500).json({ message: e.message || "Internal server error" });
    }
  },

  async markEquipmentUnitsInUse(req, res) {
    try {
      const data = await ownerEquipmentService.markEquipmentUnitsInUse(req.user.id, req.params.id, req.body?.unitIds);
      return res.status(200).json({ data });
    } catch (e) {
      console.error("Bulk mark equipment units in use error:", e);
      return res.status(e.statusCode || 500).json({ message: e.message || "Internal server error" });
    }
  },

  async markEquipmentUnitInStock(req, res) {
    try {
      const data = await ownerEquipmentService.markEquipmentUnitInStock(req.user.id, req.params.id, req.params.unitId);
      return res.status(200).json({ data });
    } catch (e) {
      console.error("Mark equipment unit in stock error:", e);
      return res.status(e.statusCode || 500).json({ message: e.message || "Internal server error" });
    }
  },

  async markEquipmentUnitsInStock(req, res) {
    try {
      const data = await ownerEquipmentService.markEquipmentUnitsInStock(req.user.id, req.params.id, req.body?.unitIds);
      return res.status(200).json({ data });
    } catch (e) {
      console.error("Bulk mark equipment units in stock error:", e);
      return res.status(e.statusCode || 500).json({ message: e.message || "Internal server error" });
    }
  },

  async getEquipmentUnitEvents(req, res) {
    try {
      const data = await ownerEquipmentService.getEquipmentUnitEvents(req.user.id, req.params.id, req.query);
      return res.status(200).json(data);
    } catch (e) {
      console.error("Get equipment unit events error:", e);
      return res.status(e.statusCode || 500).json({ message: e.message || "Internal server error" });
    }
  },

  async exportEquipmentUnitEvents(req, res) {
    try {
      const result = await ownerEquipmentService.getEquipmentUnitEvents(req.user.id, req.params.id, {
        ...req.query,
        fetchAll: "true",
      });

      const lines = [
        [
          "assetCode",
          "eventType",
          "eventGroup",
          "eventAt",
          "actor",
          "gym",
          "fromGym",
          "toGym",
          "referenceType",
          "referenceId",
          "referenceCode",
          "notes",
        ].join(","),
        ...result.data.map((row) => [
          escapeCsvValue(row.unit?.assetCode || ""),
          escapeCsvValue(row.eventType || ""),
          escapeCsvValue(row.eventGroup || ""),
          escapeCsvValue(row.eventAt || ""),
          escapeCsvValue(row.actor?.username || row.metadata?.technicianName || row.metadata?.requester?.username || ""),
          escapeCsvValue(row.gym?.name || ""),
          escapeCsvValue(row.fromGym?.name || ""),
          escapeCsvValue(row.toGym?.name || ""),
          escapeCsvValue(row.referenceType || ""),
          escapeCsvValue(row.referenceId || ""),
          escapeCsvValue(row.metadata?.transferCode || row.metadata?.receiptCode || row.metadata?.transactionCode || ""),
          escapeCsvValue(row.notes || ""),
        ].join(",")),
      ];

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="equipment-${req.params.id}-unit-events.csv"`);
      return res.status(200).send(lines.join("\n"));
    } catch (e) {
      console.error("Export equipment unit events error:", e);
      return res.status(e.statusCode || 500).json({ message: e.message || "Internal server error" });
    }
  },

  async getCategories(req, res) {
    try {
      const data = await ownerEquipmentService.getCategories();
      return res.status(200).json({ data });
    } catch (e) {
      console.error("Get categories error:", e);
      return res.status(e.statusCode || 500).json({ message: e.message || "Internal server error" });
    }
  },
};

export default ownerEquipmentController;
