"use strict";

const cloudinary = require("../config/cloudinary");
const streamifier = require("streamifier");

function assertCloudinaryConfigured() {
  const cfg = typeof cloudinary?.config === "function" ? cloudinary.config() : null;
  const cloudName = cfg?.cloud_name;
  const apiKey = cfg?.api_key;
  const apiSecret = cfg?.api_secret;

  // Cloudinary SDK có thể trả "disabled" khi không config account
  if (!cloudName || cloudName === "disabled" || !apiKey || !apiSecret) {
    throw new Error(
      "Cloudinary chưa được cấu hình. Vui lòng thêm CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET (hoặc CLOUDINARY_URL) vào GFMS_BE/.env rồi restart backend."
    );
  }
}

function uploadStream(buffer, options = {}) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (err, result) => {
      if (err) return reject(err);
      return resolve(result);
    });
    streamifier.createReadStream(buffer).pipe(stream);
  });
}

async function uploadImageBuffer(buffer, { folder, filename } = {}) {
  if (!buffer) throw new Error("Missing buffer");
  assertCloudinaryConfigured();
  return uploadStream(buffer, {
    folder: folder || "gfms",
    resource_type: "image",
    filename_override: filename,
    use_filename: true,
    unique_filename: true,
    overwrite: false,
  });
}

async function uploadRawBuffer(buffer, { folder, filename, format } = {}) {
  if (!buffer) throw new Error("Missing buffer");
  assertCloudinaryConfigured();
  return uploadStream(buffer, {
    folder: folder || "gfms",
    resource_type: "raw",
    filename_override: filename,
    use_filename: true,
    unique_filename: true,
    overwrite: false,
    format,
  });
}

async function uploadVideoBuffer(buffer, { folder, filename } = {}) {
  if (!buffer) throw new Error("Missing buffer");
  assertCloudinaryConfigured();
  return uploadStream(buffer, {
    folder: folder || "gfms",
    resource_type: "video",
    filename_override: filename,
    use_filename: true,
    unique_filename: true,
    overwrite: false,
  });
}

async function destroy(publicId, resourceType = "image") {
  if (!publicId) return null;
  return cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
}

module.exports = {
  uploadImageBuffer,
  uploadRawBuffer,
  uploadVideoBuffer,
  destroy,
};

module.exports.default = module.exports;
