import activationMaterialService from "../service/activationMaterial.service";

exports.listEligibleActivations = async (req, res) => {
  try {
    const data = await activationMaterialService.listEligibleActivations(req.user.id);
    return res.status(200).json({ data });
  } catch (e) {
    return res.status(e.statusCode || 500).json({ message: e.message });
  }
};

exports.listForTrainer = async (req, res) => {
  try {
    const data = await activationMaterialService.listForTrainer(
      req.user.id,
      req.query.packageActivationId
    );
    return res.status(200).json({ data });
  } catch (e) {
    return res.status(e.statusCode || 500).json({ message: e.message });
  }
};

exports.sendMaterial = async (req, res) => {
  try {
    const row = await activationMaterialService.sendMaterial(req.user.id, req.body || {});
    return res.status(201).json({ data: row });
  } catch (e) {
    return res.status(e.statusCode || 500).json({ message: e.message });
  }
};

exports.deleteMaterial = async (req, res) => {
  try {
    const data = await activationMaterialService.deleteMaterial(req.user.id, req.params.id);
    return res.status(200).json(data);
  } catch (e) {
    return res.status(e.statusCode || 500).json({ message: e.message });
  }
};

exports.listForMember = async (req, res) => {
  try {
    const data = await activationMaterialService.listForMember(
      req.user.id,
      req.params.activationId
    );
    return res.status(200).json({ data });
  } catch (e) {
    return res.status(e.statusCode || 500).json({ message: e.message });
  }
};
