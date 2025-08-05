// export basePath to next.config.js
// same as the one exported from var.ts

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "/dnrai";
const assetPrefix = process.env.NEXT_PUBLIC_ASSET_PREFIX || "/dnrai";

module.exports = {
  basePath,
  assetPrefix,
};
