import cron, { ScheduledTask } from 'node-cron';
import { paymentService } from './paymentService';

export class SubscriptionCronService {
  private isRunning = false;
  private dailyTask: ScheduledTask | null = null;

  // Запуск cron задачи для обновления истекших подписок каждый час
  startCronJobs() {
    if (this.isRunning) {
      console.log('Cron jobs уже запущены');
      return;
    }

    // Каждый день в 00:01 для более тщательной проверки
    this.dailyTask = cron.schedule('1 0 * * *', async () => {
      try {
        console.log('Ежедневное обновление истекших подписок...');
        const result = await paymentService.updateAllExpiredSubscriptions();
        console.log(`Ежедневно обновлено подписок: ${result.updated}`);
      } catch (error) {
        console.error('Ошибка при ежедневном обновлении подписок:', error);
      }
    });

    this.isRunning = true;
    console.log('Cron задачи для подписок запущены');
  }

  // Остановка cron задач
  stopCronJobs() {
    if (this.dailyTask) {
      this.dailyTask.destroy();
      this.dailyTask = null;
    }
    this.isRunning = false;
    console.log('Cron задачи остановлены');
  }

  // Ручное обновление (для админки или тестов)
  async manualUpdate() {
    try {
      console.log('Ручное обновление истекших подписок...');
      const result = await paymentService.updateAllExpiredSubscriptions();
      console.log(`Вручную обновлено подписок: ${result.updated}`);
      return result;
    } catch (error) {
      console.error('Ошибка при ручном обновлении:', error);
      throw error;
    }
  }
}

export const subscriptionCronService = new SubscriptionCronService();
