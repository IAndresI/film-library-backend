import app from './app';
import config from './config/config';
import { subscriptionCronService } from './services/subscriptionCronService';

app.listen(config.port, () => {
  console.log(`Server running on port ${config.port}`);

  // Запускаем cron задачи для автоматического обновления подписок
  subscriptionCronService.startCronJobs();
});
