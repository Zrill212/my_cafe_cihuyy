# FE API Index

Daftar dokumentasi endpoint untuk tim frontend.

## Orders & Pembayaran

- `docs/midtrans-checkout-api.md`  
  Checkout Midtrans (create transaction), payload fingerprint/visitor, dan alur return.

- `docs/riwayat-pembelian-api.md`  
  Riwayat pembelian pelanggan per perangkat (`visitor_id`/`fingerprint`).

- `docs/kasir-pengantaran-api.md`  
  Update status pengantaran kasir dengan payload FE (`delivery_status`, `status_pengantaran`, `is_delivered`).

- `docs/kasir-buat-pesanan-api.md`  
  Kontrak endpoint kasir untuk membuat pesanan langsung dari terminal kasir.

## Saldo & Pencairan

- `docs/saldo-api.md`  
  Saldo transaksi cafe (endpoint admin orders).

- `docs/pencairan-balance-api.md`  
  Saldo untuk halaman pencairan (`GET /api/withdrawals/balance`).

- `docs/pencairan-api.md`  
  Pengajuan pencairan admin cafe dan proses approve/reject oleh superadmin.

## Subscription

- `docs/subscription-plan-delete-api.md`  
  Hapus paket langganan dengan fallback auto-deactivate jika paket masih dipakai.

---

## Catatan Integrasi FE

- Untuk endpoint protected, kirim `Authorization: Bearer <token>`.
- Setelah aksi `PATCH/POST/DELETE`, selalu refetch list/summary agar UI sinkron dengan server.
- Untuk flow pelanggan (riwayat + checkout online), pastikan `fingerprint` konsisten antar request.

---

## Perintah ke BE (Ringkas)

### Orders & Pembayaran

- `POST /api/midtrans/create` (alias `/api/midtrans/create-payment`)  
  Buat transaksi Midtrans dari FE.
- `GET /api/client/riwayat-pembelian`  
  Ambil riwayat pembelian pelanggan per perangkat.
- `PATCH /api/orders/kasir/:id/status`  
  Update status pengantaran kasir (`delivery_status`, `status_pengantaran`, `is_delivered`).
- `POST /api/orders/kasir`  
  Buat pesanan baru dari terminal kasir.

Catatan: pembayaran sukses (tunai/online) **tidak otomatis** membuat order masuk tab **Sudah Diantar**. Gunakan indikator pengantaran (`delivery_status`/`is_delivered`) dan panggil endpoint patch saat kasir menekan tombol tandai selesai pengantaran.

### Saldo & Pencairan

- `GET /api/withdrawals/balance`  
  Ambil saldo tersedia + riwayat transaksi saldo untuk halaman pencairan.
- `POST /api/withdrawals`  
  Kirim pengajuan pencairan dari admin cafe.
- `GET /api/withdrawals`  
  Ambil riwayat pengajuan pencairan milik admin cafe.
- `GET /api/superadmin/withdrawals`  
  Ambil semua pengajuan pencairan untuk superadmin.
- `PATCH /api/superadmin/withdrawals/:id/complete`  
  Tandai pengajuan pencairan selesai oleh superadmin.
- `PATCH /api/superadmin/withdrawals/:id/reject`  
  Tolak pengajuan pencairan.

### Subscription

- `DELETE /api/subscriptions/superadmin/plans/:id`  
  Hapus paket langganan (atau auto nonaktif jika masih dipakai).
