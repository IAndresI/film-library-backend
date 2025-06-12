import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';

const router = Router();

// Стриминг файлов с поддержкой Range requests и подпапок
router.use('/', (req: Request, res: Response): void => {
  const requestPath = req.url.slice(1); // убираем ведущий слеш

  // Базовые проверки безопасности
  if (requestPath.includes('..') || requestPath.includes('~')) {
    res.status(403).json({ error: 'Недопустимый путь' });
    return;
  }

  // Блокируем прямой доступ к папке с видео
  if (requestPath.startsWith('films/videos/')) {
    res.status(403).json({ error: 'Доступ запрещен' });
    return;
  }

  const filePath = path.join(process.cwd(), 'uploads', requestPath);

  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Файл не найден' });
    return;
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  // MIME тип
  const mimeType = requestPath.endsWith('.mp4')
    ? 'video/mp4'
    : requestPath.endsWith('.jpg') || requestPath.endsWith('.jpeg')
      ? 'image/jpeg'
      : requestPath.endsWith('.png')
        ? 'image/png'
        : requestPath.endsWith('.webp')
          ? 'image/webp'
          : requestPath.endsWith('.vtt')
            ? 'text/vtt'
            : 'application/octet-stream';

  if (range) {
    // Поддержка Range requests для перематывания видео
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = end - start + 1;

    const file = fs.createReadStream(filePath, { start, end });

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': mimeType,
    });

    file.pipe(res);
  } else {
    // Обычная отдача файла
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': mimeType,
      'Accept-Ranges': 'bytes',
    });

    fs.createReadStream(filePath).pipe(res);
  }
});

export default router;
