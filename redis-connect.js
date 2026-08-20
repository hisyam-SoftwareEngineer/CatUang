require('dotenv').config();
const Redis = require('ioredis');

// Membaca koneksi langsung dari .env
const redis = new Redis(process.env.REDIS_URL);

redis.on('connect', () => {
  console.log('Berhasil terhubung ke Redis!');
});

redis.on('error', (err) => {
  console.error('Gagal terhubung ke Redis:', err);
});

// Contoh Penggunaan (Set & Get)
async function testRedis() {
  await redis.set('user:1', JSON.stringify({ name: 'Budi' }));
  const user = await redis.get('user:1');
  console.log('Data dari Redis:', JSON.parse(user));
}

testRedis();