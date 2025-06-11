import dotenv from 'dotenv';

dotenv.config();

interface Config {
  port: number;
  nodeEnv: string;
  dbUrl: string;
  shopKey: string;
  shopId: string;
  redirectHost: string;
}

const config: Config = {
  port: Number(process.env.PORT) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  dbUrl: process.env.DATABASE_URL || '',
  shopKey: process.env.SHOP_KEY || '',
  shopId: process.env.SHOP_ID || '',
  redirectHost: process.env.REDIRECT_HOST || '',
};

export default config;
