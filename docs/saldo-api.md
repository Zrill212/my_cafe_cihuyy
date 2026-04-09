# API Docs - Saldo Cafe

Dokumentasi ini dipakai FE untuk mengambil data saldo cafe dari transaksi yang sudah berhasil dibayar.

## Endpoint

- **Method**: `GET`
- **URL**: `/api/orders/admin/saldo`
- **Auth**: Wajib login (Bearer token JWT `admin`/user yang punya `cafe_id`)

## Query Params

- `limit` (opsional)
  - Tipe: number
  - Default: `20`
  - Min: `1`
  - Max: `100`
  - Fungsi: jumlah data riwayat transaksi yang dikembalikan

Contoh:

`GET /api/orders/admin/saldo?limit=50`

## Response Sukses

Status: `200 OK`

```json
{
  "status": 200,
  "message": "Berhasil mengambil saldo cafe",
  "data": {
    "cafe_id": 1,
    "total_saldo": 275000,
    "total_transaksi": 4,
    "transaksi": [
      {
        "id": 12,
        "order_id": "ORD-ABC123",
        "amount": 75000,
        "payment_method": "online",
        "created_at": "2026-04-09T03:10:22.000Z"
      },
      {
        "id": 11,
        "order_id": "ORD-XYZ789",
        "amount": 200000,
        "payment_method": "tunai",
        "created_at": "2026-04-09T02:58:11.000Z"
      }
    ]
  },
  "success": true
}
```

## Response Gagal

### 401 Unauthorized

Jika token tidak ada / tidak valid / user tidak punya `cafe_id`.

```json
{
  "status": 401,
  "message": "Unauthorized",
  "data": null,
  "success": false
}
```

### 500 Internal Server Error

Jika terjadi error query database.

```json
{
  "status": 500,
  "message": "Gagal mengambil saldo cafe",
  "data": null,
  "success": false
}
```

## Catatan Untuk FE

- `total_saldo` adalah akumulasi semua `amount` pada tabel `cafe_saldo_transactions` untuk `cafe_id` user login.
- `transaksi` diurutkan dari terbaru (`created_at DESC`).
- Data saldo terisi otomatis saat pembayaran berhasil:
  - Midtrans status `paid` (`settlement`/`capture`)
  - Pembayaran kasir/offline yang sukses
