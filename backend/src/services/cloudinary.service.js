const { cloudinary } = require('../config/cloudinary');
const logger = require('../utils/logger');

const deleteImage = async (publicId) => {
  if (!publicId) return null;
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    logger.info(`Cloudinary image deleted: ${publicId}`);
    return result;
  } catch (error) {
    logger.error(`Failed to delete Cloudinary image ${publicId}: ${error.message}`);
    return null;
  }
};

const deleteMultipleImages = async (publicIds = []) => {
  const validIds = publicIds.filter(Boolean);
  if (!validIds.length) return [];
  try {
    const results = await Promise.allSettled(validIds.map((id) => deleteImage(id)));
    return results;
  } catch (error) {
    logger.error(`Failed to delete multiple Cloudinary images: ${error.message}`);
    return [];
  }
};

module.exports = { deleteImage, deleteMultipleImages };
