export const formatRupiah = (amount: number): string => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(amount);
};

export const ReplyTemplates = {
  successMasuk: (amount: number, description: string, balance: number) => 
    `✅ Dicatat! Uang masuk ${formatRupiah(amount)} (${description})\nSaldo kas sekarang: ${formatRupiah(balance)}\n\nSalah? Balas "batal" dalam 5 menit.`,
    
  successKeluar: (amount: number, description: string, balance: number) => 
    `✅ Dicatat! Uang keluar ${formatRupiah(amount)} (${description})\nSaldo kas sekarang: ${formatRupiah(balance)}\n\nSalah? Balas "batal" dalam 5 menit.`,
    
  unrecognized: () => 
    `Maaf, saya tidak mengerti pesan tersebut.\n\nKetik "bantuan" untuk melihat format yang benar.`,
    
  help: () => 
    `🤖 *Bantuan Bot Kasir*\n\n` +
    `Cara mencatat transaksi:\n` +
    `• Masuk: \`masuk 500rb dari jual nasi\`\n` +
    `• Keluar: \`keluar 50ribu buat beli beras\`\n\n` +
    `Perintah lain:\n` +
    `• \`saldo\` : Cek saldo saat ini\n` +
    `• \`laporan\` : Laporan hari ini\n` +
    `• \`batal\` : Batalkan transaksi terakhir`,
    
  unregistered: () => 
    `Nomor Anda belum terdaftar. Silakan login ke aplikasi web dan hubungkan nomor WhatsApp Anda di menu Settings.`
};
