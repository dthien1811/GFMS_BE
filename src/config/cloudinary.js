"use strict";

// Cloudinary SDK (CommonJS) – used by src/service/cloudinaryService.js
// Supports either:
//   - CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET
//   - CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name>

const { v2: cloudinary } = require("cloudinary");

function parseCloudinaryUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    // cloudinary://<api_key>:<api_secret>@<cloud_name>
    return {
      cloud_name: u.host,
      api_key: decodeURIComponent(u.username || ""),
      api_secret: decodeURIComponent(u.password || ""),
    };
  } catch (_e) {
    return null;
  }
}

const fromUrl = process.env.CLOUDINARY_URL
  ? parseCloudinaryUrl(process.env.CLOUDINARY_URL)
  : null;

const cloud_name = process.env.CLOUDINARY_CLOUD_NAME || (fromUrl && fromUrl.cloud_name);
const api_key = process.env.CLOUDINARY_API_KEY || (fromUrl && fromUrl.api_key);
const api_secret = process.env.CLOUDINARY_API_SECRET || (fromUrl && fromUrl.api_secret);

if (!cloud_name || !api_key || !api_secret) {
  // Do not hard-crash here: allow the app to boot for environments that don't need uploads.
  // Upload endpoints will throw a clear error if config is missing.
  // eslint-disable-next-line no-console
  console.warn(
    "[cloudinary] Missing config. Set CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET (or CLOUDINARY_URL)."
  );
}

cloudinary.config({
  cloud_name,
  api_key,
  api_secret,
  secure: true,
});

module.exports = cloudinary;
module.exports.default = cloudinary;
