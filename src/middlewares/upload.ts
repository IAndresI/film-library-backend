import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Функция для создания папок если их нет
const ensureDir = (dirPath: string) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

// Настройка хранения файлов
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let uploadPath = '';

    // Определяем папку в зависимости от роута и типа файла
    if (req.baseUrl.includes('/films')) {
      if (file.fieldname === 'image') {
        uploadPath = 'uploads/films/images';
      } else if (file.fieldname === 'trailerFile') {
        uploadPath = 'uploads/films/trailers';
      } else if (file.fieldname === 'filmFile') {
        uploadPath = 'uploads/films/videos';
      }
    } else if (req.baseUrl.includes('/actors')) {
      if (file.fieldname === 'image') {
        uploadPath = 'uploads/actors/images';
      }
    }

    ensureDir(uploadPath);
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    // Генерируем уникальное имя файла
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

// Настройка multer
const upload = multer({
  storage,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB максимум для видео
  },
  fileFilter: (req, file, cb) => {
    // Проверяем типы файлов
    if (file.fieldname === 'image') {
      if (file.mimetype.startsWith('image/')) {
        cb(null, true);
      } else {
        cb(new Error('Только изображения разрешены для поля image'));
      }
    } else if (
      file.fieldname === 'trailerFile' ||
      file.fieldname === 'filmFile'
    ) {
      if (file.mimetype.startsWith('video/')) {
        cb(null, true);
      } else {
        cb(new Error('Только видео файлы разрешены'));
      }
    } else {
      cb(null, true);
    }
  },
});

// Middleware для обработки полей без файлов (только FormData)
export const parseFormData = upload.none();

// Middleware для фильмов - только изображение (для createFilm и updateFilmData)
export const uploadFilmImage = upload.single('image');

// Middleware для медиа фильмов - трейлер и видео (для updateFilmMedia)
export const uploadFilmMedia = upload.fields([
  { name: 'trailerFile', maxCount: 1 },
  { name: 'filmFile', maxCount: 1 },
]);

// Middleware для актёров - только изображение
export const uploadActorImage = upload.single('image');

export default upload;
