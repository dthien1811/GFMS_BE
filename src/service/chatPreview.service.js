function decodeChatPayload(raw) {
  if (!raw) return { type: "text", text: "" };
  if (typeof raw === "object" && raw.__gfmsChat) return raw;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.__gfmsChat) return parsed;
  } catch (_e) {}
  return { type: "text", text: String(raw || "") };
}

function previewTextFromContent(raw) {
  const p = decodeChatPayload(raw);
  if (p.type === "image") return p.text || "[Ảnh]";
  if (p.type === "file") return p.fileName ? `[File] ${p.fileName}` : "[Tệp đính kèm]";
  if (p.type === "audio") return p.text || "[Ghi âm]";
  if (p.type === "location") return p.text || "[Vị trí]";
  return p.text || String(raw || "");
}

module.exports = { decodeChatPayload, previewTextFromContent };
module.exports.default = module.exports;