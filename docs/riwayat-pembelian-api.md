# API Docs - Riwayat Pembelian (Pelanggan)

Dokumentasi ini dipakai FE untuk menampilkan riwayat pesanan per perangkat/pengunjung di satu cafe.

## Endpoint

- **Method**: `GET`
- **URL**: `/api/client/riwayat-pembelian`
- **Auth**: Tidak wajib JWT; identitas perangkat lewat cookie / header / query (lihat di bawah)

Middleware **`clientIdentity`** aktif di route ini: server bisa mengisi `visitor_id` dari cookie `visitor_id` atau dari hash `fingerprint` (lihat juga `GET /api/client/init`).

## Query Params

| Param | Wajib | Keterangan |
|--------|--------|------------|
| `cafe_id` | Ya | ID cafe |
| `visitor_id` | Bersyarat | Dipakai bersama tabel `riwayat_pembelian` jika ada; bisa juga dari cookie setelah init |
| `fingerprint` | Bersyarat | ID unik perangkat/browser; bisa juga dari header `x-fingerprint` |
| `meja` atau `meja_id` | Tidak | Filter nomor meja |
| `status` | Tidak | Filter status order (mis. `proses`, `selesai`) |
| `limit` | Tidak | Default `20`, maksimal `100` |

**Catatan penting**

- Jika tabel **`riwayat_pembelian`** ada di database, **minimal salah satu** `visitor_id` atau `fingerprint` harus terkirim (atau tersedia lewat `req.clientMeta` dari middleware), kalau tidak server mengembalikan **400** dengan `reason: device_unverified`.
- Tanpa tabel `riwayat_pembelian`, API fallback ke daftar order berdasarkan `cafe_id` (dan `meja` jika ada) saja.

Contoh:

`GET /api/client/riwayat-pembelian?cafe_id=6&meja=3&limit=20`

Dengan header:

`x-fingerprint: <nilai-fingerprint>`

## Response Sukses

Status: `200 OK`

```json
{
  "status": 200,
  "message": "Berhasil mengambil riwayat pembelian",
  "data": [
    {
      "order_id": "ORD-MNQYRS7K-GH5S",
      "cafe_id": 6,
      "nama_pemesan": "Budi",
      "meja": 3,
      "status": "selesai",
      "total_semua_item": 45000,
      "waktu": "2026-04-09 14:30:00",
      "items": [
        {
          "nama_produk": "Kopi Susu",
          "gambar_produk": "/uploads/....jpg",
          "harga_produk": 22000,
          "jumlah": 2,
          "catatan": "Less sugar"
        }
      ]
    }
  ],
  "success": true
}
```

Field `waktu` diformat string WIB (timezone `Asia/Jakarta`).

## Response Gagal

### 400 Bad Request — `cafe_id` kosong

```json
{
  "status": 400,
  "message": "cafe_id wajib diisi",
  "data": null,
  "success": false
}
```

### 400 Bad Request — perangkat belum teridentifikasi

Terjadi bila tabel `riwayat_pembelian` ada tetapi tidak ada `visitor_id` maupun `fingerprint`.

```json
{
  "status": 400,
  "message": "Perangkat belum terverifikasi. Kirim fingerprint/visitor_id",
  "data": {
    "reason": "device_unverified",
    "required": "fingerprint"
  },
  "success": false
}
```

### 500 Internal Server Error

```json
{
  "status": 500,
  "message": "Gagal mengambil riwayat pembelian",
  "data": [],
  "success": false
}
```

## Catatan Untuk FE

- Agar pesanan **bayar Midtrans** ikut muncul di riwayat ini, backend menyimpan baris di **`riwayat_pembelian`** untuk `order_id` tersebut. Pastikan saat **buat transaksi Snap** (`POST /api/midtrans/create` atau `/create-payment`) FE mengirim **fingerprint** / **visitor_id** yang sama seperti saat memanggil endpoint ini (lihat `docs/midtrans-checkout-api.md`).
- Setelah pembayaran online sukses, redirect **`GET /api/midtrans/return`** juga dapat melengkapi `riwayat_pembelian` jika cookie `visitor_id` / header fingerprint tersedia di request tersebut.
