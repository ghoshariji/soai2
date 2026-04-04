const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const createStorage = (folder) =>
  new CloudinaryStorage({
    cloudinary,
    params: {
      folder: `soai/${folder}`,
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
      transformation: [{ width: 1000, quality: 'auto' }],
    },
  });

const profileUpload = multer({
  storage: createStorage('profiles'),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

const feedUpload = multer({
  storage: createStorage('feed'),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

const announcementUpload = multer({
  storage: createStorage('announcements'),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const complaintUpload = multer({
  storage: createStorage('complaints'),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const excelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files are allowed'), false);
    }
  },
});

module.exports = {
  cloudinary,
  profileUpload,
  feedUpload,
  announcementUpload,
  complaintUpload,
  excelUpload,
};
