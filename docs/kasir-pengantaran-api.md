# API Docs - Kasir Pengantaran Pesanan

Dokumentasi ini menjelaskan request dari frontend kasir untuk menandai pesanan pengantaran sebagai selesai.
Backend menerima format payload FE pengantaran dan melakukan mapping ke status order internal.

## Endpoint

- **Method**: `PATCH`
- **URL**: `/api/orders/kasir/:id/status`
- **Auth**: Bearer token kasir/admin

Contoh:

`PATCH /api/orders/kasir/ORD-MNR2H6IR-51SY/status`

## Body Request (JSON)

Frontend mengirim payload berikut saat tombol **Tandai Selesai** diklik di tab *Siap Diantar*:

```json
{
  "delivery_status": "diantar",
  "status_pengantaran": "diantar",
  "is_delivered": true
}
```

## Mapping Payload FE -> Status Order Backend

Backend membaca field berikut (fallback):

- `status`
- `status_pengantaran`
- `delivery_status`
- `is_delivered`

Aturan mapping:

- `is_delivered = true` -> status order diset ke `selesai`
- `delivery_status/status_pengantaran` bernilai `diantar` -> status order `selesai`
- nilai seperti `pending` / `diproses` -> status order `proses`

Status internal yang dipakai endpoint ini: `proses`, `selesai`, `siap`, `lunas`.

## Aturan Tab Pengantaran (Penting)

Backend sekarang memisahkan status pembayaran/order dan status pengantaran:

- Pembayaran berhasil (tunai/online) boleh membuat order `status = selesai`, **tetapi belum otomatis `diantar`**.
- Setelah pembayaran sukses, order masuk tab **Siap Diantar** (`delivery_status = "siap"`).
- Order baru masuk tab **Sudah Diantar** jika kasir menekan tombol tandai selesai pengantaran (kirim `is_delivered=true` atau `delivery_status/status_pengantaran="diantar"`).

## Response Sukses (contoh)

Status: `200 OK`

```json
{
  "success": true,
  "message": "Status pesanan diupdate ke 'selesai'",
  "data": {
    "id": "ORD-MNR2H6IR-51SY",
    "status": "selesai",
    "delivery_status": "diantar",
    "status_pengantaran": "diantar",
    "is_delivered": true
  }
}
```

## Response Gagal (contoh)

### 401 Unauthorized

```json
{
  "status": 401,
  "message": "Unauthorized",
  "data": null,
  "success": false
}
```

### 404 Not Found

```json
{
  "status": 404,
  "message": "Pesanan tidak ditemukan",
  "data": null,
  "success": false
}
```

### 400 Bad Request

Jika payload tidak bisa dipetakan ke status valid.

```json
{
  "success": false,
  "message": "Status tidak valid. Pilihan: proses, selesai, siap, lunas"
}
```

### 500 Internal Server Error

```json
{
  "success": false,
  "message": "Gagal update status"
}
```

## Catatan untuk FE

1. Payload FE di bawah ini sudah valid dan kompatibel:

```json
{
  "delivery_status": "diantar",
  "status_pengantaran": "diantar",
  "is_delivered": true
}
```

2. FE tidak perlu kirim `status` bila sudah mengirim field pengantaran di atas.
3. Setelah sukses, refresh list order agar card berpindah tab sesuai status terbaru.
4. Backend sekarang juga menyimpan flag pengantaran di order (`delivery_status`, `is_delivered`) sehingga FE bisa memisahkan tab **Siap Diantar** vs **Sudah Diantar** langsung dari response order.
5. Jangan langsung memindahkan ke tab **Sudah Diantar** hanya karena `status` order sudah `selesai`; gunakan indikator pengantaran (`delivery_status` / `is_delivered`) sebagai sumber kebenaran tab.

