"use strict";

const cloudinary = require("../config/cloudinary");
const streamifier = require("streamifier");

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

async function destroy(publicId, resourceType = "image") {
  if (!publicId) return null;
  return cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
}

module.exports = {
  uploadImageBuffer,
  uploadRawBuffer,
  destroy,
};

module.exports.default = module.exports;
