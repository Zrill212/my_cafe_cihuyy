# API Docs - Saldo untuk Pencairan (FE)

Dokumentasi ini dipakai FE untuk menampilkan **Saldo Tersedia** dan **Riwayat Transaksi Saldo** pada halaman pencairan.

## Endpoint

- **Method**: `GET`
- **URL**: `/api/withdrawals/balance`
- **Auth**: Wajib login admin cafe (Bearer token JWT)

> Endpoint ini mengambil `cafe_id` dari token JWT, jadi FE **tidak perlu** mengirim `cafe_id` atau `meja`.

## Query Params

- `limit` (opsional)
  - Tipe: number
  - Default: `20`
  - Min: `1`
  - Max: `100`
  - Fungsi: jumlah data riwayat transaksi saldo yang dikembalikan

Contoh:

`GET /api/withdrawals/balance?limit=50`

## Headers

- `Authorization: Bearer <token>`

## Response Sukses

Status: `200 OK`

```json
{
  "status": 200,
  "message": "Berhasil mengambil saldo cafe",
  "data": {
    "cafe_id": 6,
    "total_saldo": 225000,
    "total_income": 275000,
    "total_withdrawn": 50000,
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

Jika token tidak ada / tidak valid.

```json
{
  "status": 401,
  "message": "Unauthorized",
  "data": null,
  "success": false
}
```

### 403 Forbidden

Jika user login bukan role `admin`.

```json
{
  "status": 403,
  "message": "Hanya admin cafe",
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

- **Saldo tersedia**: pakai `data.total_saldo`.
- `data.total_saldo` = `total_income - total_withdrawn` (yang dihitung hanya pencairan dengan `status = completed`).
- **Riwayat transaksi saldo**: render list dari `data.transaksi` (urut terbaru).
- Jika FE sebelumnya memanggil endpoint orders user (yang butuh `cafe_id` + `meja`), ganti ke endpoint ini agar tidak kena error `cafe_id dan meja wajib diisi`.

