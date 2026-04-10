# API Docs - Hapus Paket Langganan (FE)

Dokumentasi ini untuk halaman superadmin saat menghapus paket langganan.

## Endpoint

- **Method**: `DELETE`
- **URL**: `/api/subscriptions/superadmin/plans/:id`
- **Auth**: Bearer token superadmin

Contoh:

`DELETE /api/subscriptions/superadmin/plans/3`

## Perilaku Baru

Saat tombol hapus diklik, backend akan cek apakah paket masih dipakai:

- Jika **tidak dipakai** → paket dihapus permanen (`action: "deleted"`).
- Jika **masih dipakai** (dipakai di `cafe_subscriptions` / `subscription_transactions`) → paket **tidak dihapus**, tapi otomatis **dinonaktifkan** (`is_active = 0`) dengan `action: "deactivated"`.

## Response Sukses

### A) Paket berhasil dihapus permanen

Status: `200 OK`

```json
{
  "status": 200,
  "message": "Paket langganan berhasil dihapus",
  "data": {
    "id": 3,
    "action": "deleted"
  },
  "success": true
}
```

### B) Paket masih dipakai, jadi dinonaktifkan

Status: `200 OK`

```json
{
  "status": 200,
  "message": "Paket sedang dipakai, jadi dinonaktifkan (tidak dihapus)",
  "data": {
    "id": 3,
    "action": "deactivated",
    "usage": {
      "cafe_subscriptions": 2,
      "subscription_transactions": 10
    }
  },
  "success": true
}
```

## Response Gagal

### 400

```json
{
  "status": 400,
  "message": "id tidak valid",
  "data": null,
  "success": false
}
```

### 404

```json
{
  "status": 404,
  "message": "Paket tidak ditemukan",
  "data": null,
  "success": false
}
```

### 500

```json
{
  "status": 500,
  "message": "Gagal hapus paket langganan",
  "data": null,
  "success": false
}
```

## Catatan untuk FE

- Jangan anggap “hapus” selalu menghilangkan data. Cek `data.action`:
  - `deleted` -> hilang permanen dari list (setelah refetch).
  - `deactivated` -> tampilkan sebagai nonaktif (`is_active = 0`), bukan error.
- Setelah request sukses (`200`), lakukan refetch list plan agar status terbaru langsung tampil di UI.
