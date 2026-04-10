# API Docs - Checkout / Bayar via Midtrans (Pelanggan)

Dokumentasi ini dipakai FE untuk membuat transaksi Snap Midtrans dan memastikan order tercatat di **`riwayat_pembelian`** (supaya tampil di halaman riwayat seperti pembayaran kasir).

## Endpoint

- **Method**: `POST`
- **URL**: `/api/midtrans/create` (alias: `/api/midtrans/create-payment`)
- **Auth**: Tidak wajib JWT
- **Middleware**: **`clientIdentity`** — baca cookie `visitor_id` dan/atau header **`x-fingerprint`** / body `fingerprint`

## Request Headers

| Header | Keterangan |
|--------|------------|
| `Content-Type` | `application/json` |
| `x-fingerprint` | String ID perangkat (wajib konsisten dengan pemanggilan `GET /api/client/riwayat-pembelian`) |

## Request Body (2 skenario)

### A. Snap untuk order yang sudah ada

Sudah punya `order_id` dari `POST /api/orders` (atau sumber lain).

| Field | Wajib | Keterangan |
|--------|--------|------------|
| `order_id` atau `orderId` | Ya | ID order di tabel `orders` |

Contoh:

```json
{
  "order_id": "ORD-MNQYRS7K-GH5S"
}
```

### B. Checkout sekaligus buat order baru + Snap

| Field | Wajib | Keterangan |
|--------|--------|------------|
| `cafe_id` | Ya | |
| `meja` atau `meja_id` | Ya | |
| `items` | Ya | Array item; minimal berisi `id` / `menu_id` menu dan `qty` / `quantity` |
| `nama` | Tidak | |
| `note` | Tidak | |
| `promo_code` | Tidak | |
| `visitor_id` | Disarankan | Bisa juga dari cookie setelah init |
| `fingerprint` | Disarankan | Bisa diganti header `x-fingerprint` |

Contoh minimal:

```json
{
  "cafe_id": 6,
  "meja": 3,
  "items": [
    { "id": 12, "qty": 2 }
  ],
  "fingerprint": "device-abc-123"
}
```

## Response Sukses

Status: `200 OK` (bentuk JSON dari controller)

```json
{
  "order_id": "ORD-XXXXXXXX-XXXX",
  "subtotal": 50000,
  "discount": 0,
  "total": 50000,
  "snap_token": "...",
  "redirect_url": "https://app.sandbox.midtrans.com/snap/v2/..."
}
```

Gunakan `snap_token` di frontend Snap.js atau buka `redirect_url` sesuai integrasi yang dipakai.

## Response Gagal (contoh)

### 403 — pembayaran online dinonaktifkan cafe

```json
{
  "error": "Pembayaran online sedang dinonaktifkan. Silakan pilih pembayaran tunai.",
  "reason": "online_payment_disabled"
}
```

### 404 — order tidak ada (mode `order_id`)

```json
{
  "error": "Terjadi masalah: order tidak ditemukan"
}
```

### 500

```json
{
  "error": "Terjadi masalah saat membuat transaksi"
}
```

> Catatan: beberapa endpoint Midtrans di backend ini masih mengembalikan format error ringkas (`error`, `reason`) dan belum selalu memakai wrapper `status/message/data/success`.

## Endpoint Terkait

| Method | URL | Keterangan |
|--------|-----|------------|
| `GET` | `/api/midtrans/return?order_id=...&result=finish` | Redirect setelah user selesai di Midtrans; dipakai juga untuk sinkron pembayaran + melengkapi riwayat jika cookie/header ada |
| `POST` | `/api/midtrans/notification` | Webhook Midtrans (server-to-server), bukan dipanggil FE |
| `GET` | `/api/midtrans/status/:orderId` | Cek status pembayaran |

## Catatan Untuk FE

- **Satu fingerprint per perangkat** untuk alur: buat order / checkout Midtrans → lihat **`GET /api/client/riwayat-pembelian`**. Tanpa fingerprint/visitor, baris **`riwayat_pembelian`** bisa kosong dan order online tidak muncul di riwayat (meskipun **`order_payments`** sudah `paid`).
- Setelah pembayaran sukses, user akan diarahkan ke **`FRONTEND_BASE_URL`** lewat `GET /api/midtrans/return`; pastikan domain API dan FE mengizinkan cookie **`visitor_id`** jika memakai flow cookie.
