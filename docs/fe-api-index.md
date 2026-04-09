# FE API Index

Daftar dokumentasi endpoint untuk tim frontend.

## Orders & Pembayaran

- `docs/midtrans-checkout-api.md`  
  Checkout Midtrans (create transaction), payload fingerprint/visitor, dan alur return.

- `docs/riwayat-pembelian-api.md`  
  Riwayat pembelian pelanggan per perangkat (`visitor_id`/`fingerprint`).

- `docs/kasir-pengantaran-api.md`  
  Update status pengantaran kasir dengan payload FE (`delivery_status`, `status_pengantaran`, `is_delivered`).

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
