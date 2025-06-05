import fs from 'fs';
import path from 'path';

// Функция для удаления файла
export const deleteFile = (filePath: string): void => {
  if (filePath && filePath.startsWith('/uploads/')) {
    const fullPath = path.join(process.cwd(), filePath.substring(1)); // убираем первый слэш
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  }
};
