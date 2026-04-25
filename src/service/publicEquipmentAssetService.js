const { Op } = require("sequelize");
const db = require("../models");

const { EquipmentUnit, Equipment, Gym, EquipmentImage } = db;

function ensure(condition, message, statusCode = 400) {
  if (!condition) {
    const err = new Error(message);
    err.statusCode = statusCode;
    throw err;
  }
}

function pickPrimaryImageUrl(equipmentRow) {
  const eq = equipmentRow?.toJSON ? equipmentRow.toJSON() : equipmentRow;
  const images = Array.isArray(eq?.images) ? eq.images : [];
  const primary = images.find((x) => x?.isPrimary) || images.sort((a, b) => Number(a?.sortOrder || 0) - Number(b?.sortOrder || 0))[0];
  return primary?.url || eq?.primaryImageUrl || null;
}

function parseGuideImages(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  const raw = String(value || "").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter(Boolean);
  } catch (e) {}
  return raw.split(/[\n,]/).map((x) => x.trim()).filter(Boolean);
}

function buildGuide(equipment) {
  const eq = equipment?.toJSON ? equipment.toJSON() : equipment;
  const usageGuide = String(eq?.usageGuide || "").trim();
  const trainingInstructions = String(eq?.trainingInstructions || "").trim();
  const muscleGroups = String(eq?.muscleGroups || "").trim();
  const safetyNotes = String(eq?.safetyNotes || "").trim();
  const guideImages = parseGuideImages(eq?.guideImages);
  const guideVideoUrl = String(eq?.guideVideoUrl || "").trim();
  const parts = [usageGuide, trainingInstructions, safetyNotes].filter(Boolean);
  const merged = parts.join("\n\n");
  return {
    usageGuide: usageGuide || null,
    workoutInstructions: usageGuide || null,
    instructionText: usageGuide || null,
    guideText: usageGuide || null,
    trainingInstructions: trainingInstructions || null,
    workoutTips: trainingInstructions || null,
    tips: trainingInstructions || null,
    muscleGroups: muscleGroups || null,
    targetMuscles: muscleGroups || null,
    safetyNotes: safetyNotes || null,
    guideImages,
    guideVideoUrl: guideVideoUrl || null,
    videoUrl: guideVideoUrl || null,
    summary: merged ? (merged.length > 280 ? `${merged.slice(0, 280)}…` : merged) : null,
    hasGuide: Boolean(usageGuide || trainingInstructions || muscleGroups || safetyNotes || guideImages.length || guideVideoUrl),
  };
}

const publicEquipmentAssetService = {
  async scan(qrToken) {
    const token = String(qrToken || "").trim();
    ensure(token, "Missing qrToken", 400);
    ensure(/^[a-zA-Z0-9]+$/.test(token) && token.length >= 16 && token.length <= 64, "Invalid qrToken", 400);

    const unit = await EquipmentUnit.findOne({
      where: {
        publicToken: token,
      },
      include: [
        {
          model: Equipment,
          as: "equipment",
          attributes: [
            "id",
            "name",
            "code",
            "description",
            "usageGuide",
            "trainingInstructions",
            "muscleGroups",
            "safetyNotes",
            "guideImages",
            "guideVideoUrl",
          ],
          include: EquipmentImage ? [{ model: EquipmentImage, as: "images", required: false, attributes: ["id", "url", "isPrimary", "sortOrder", "altText"] }] : [],
          required: false,
        },
        {
          model: Gym,
          as: "gym",
          attributes: ["id", "name"],
          required: false,
        },
      ],
    });

    ensure(unit, "Equipment asset not found", 404);
    const json = unit.toJSON();
    const guide = buildGuide(json.equipment);

    // Public-safe payload only (no ownerId/email/notes/internal metadata)
    return {
      assetCode: json.assetCode,
      equipmentName: json.equipment?.name || null,
      equipmentCode: json.equipment?.code || null,
      code: json.equipment?.code || null,
      description: json.equipment?.description || null,
      imageUrl: json.equipment ? pickPrimaryImageUrl(json.equipment) : null,
      status: json.lifecycleStatus || "active",
      gymName: json.gym?.name || null,
      guideSummary: guide.summary,
      guide,
      actions: {
        maintenance: { enabled: true, reason: "Bảo trì từ QR yêu cầu đăng nhập owner" },
        guide: guide.hasGuide ? { enabled: true } : { enabled: false, reason: "Thiết bị chưa có hướng dẫn" },
      },
    };
  },
};

module.exports = publicEquipmentAssetService;

