import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import jwtAction from '../middleware/JWTAction';
import { requireGroupName } from '../middleware/role';

const router = express.Router();

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const uploadDir = path.join(process.cwd(), 'uploads', 'gyms');
ensureDir(uploadDir);

// File filter - chỉ chấp nhận ảnh
const imageFilter = (req, file, cb) => {
  const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
  const allowedExts = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
  
  const ext = path.extname(file.originalname).toLowerCase();
  const mimeOk = allowedMimes.includes(file.mimetype);
  const extOk = allowedExts.includes(ext);
  
  if (mimeOk && extOk) {
    cb(null, true);
  } else {
    cb(new Error('Chỉ chấp nhận file ảnh (JPG, PNG, WEBP, GIF)'), false);
  }
};

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Tránh trùng lặp bằng cách thêm random string
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `${baseName}-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  fileFilter: imageFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB mỗi ảnh
  }
});

// ✅ Route upload với authentication và multer middleware
router.post('/gym-image', 
  jwtAction.checkUserJWT,
  requireGroupName(['owner', 'Owner', 'Gym Owner', 'Gym Owners', 'Owners']),
  (req, res) => {
    upload.single('file')(req, res, (err) => {
      // Xử lý lỗi multer
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: 'File quá lớn. Tối đa 5MB' });
        }
        return res.status(400).json({ error: `Lỗi upload: ${err.message}` });
      }
      if (err) {
        return res.status(400).json({ error: err.message });
      }
      
      // Kiểm tra file có tồn tại không
      if (!req.file) {
        return res.status(400).json({ error: 'Không có file' });
      }
      
      // Trả về URL
      const url = `${req.protocol}://${req.get('host')}/uploads/gyms/${req.file.filename}`;
      return res.status(200).json({ url });
    });
  }
);

export default (app) => app.use('/api/upload', router);

